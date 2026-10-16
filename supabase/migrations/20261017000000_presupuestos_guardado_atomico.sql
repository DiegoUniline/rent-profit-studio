-- Guardado atómico e idempotente de una partida presupuestal y sus flujos.
--
-- Causa corregida: PresupuestoDialog actualizaba la partida, BORRABA todos sus
-- flujos_programados y los volvía a insertar en llamadas separadas, sin revisar
-- cuántas filas borraba. Para un contador, RLS (DELETE solo admin) hacía que el
-- borrado no afectara filas sin devolver error, y la reinserción duplicaba
-- todos los flujos en cada guardado. Dos guardados simultáneos también podían
-- duplicar o perder flujos.
--
-- Esta función (SECURITY INVOKER: aplican las políticas RLS vigentes):
-- * crea la partida si no recibe id, o la actualiza conservando su id;
-- * actualiza flujos existentes por su id, inserta solo los nuevos (sin id) y
--   elimina solo los que el usuario quitó; si el usuario no puede eliminarlos,
--   falla en vez de dejar copias;
-- * corre en una transacción: ante cualquier error no queda nada a medias;
-- * es idempotente por p_operacion: un reintento o doble clic con la misma
--   clave devuelve el mismo resultado sin repetir efectos;
-- * con p_version (updated_at leído al abrir) rechaza sobrescribir cambios
--   hechos por otra persona; cada guardado actualiza updated_at (la tabla no
--   tiene trigger que lo haga).
-- Idempotente: seguro de re-ejecutar.

CREATE TABLE IF NOT EXISTS public.presupuesto_guardados (
  operacion_id uuid PRIMARY KEY,
  presupuesto_id uuid NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presupuesto_guardados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leer guardados propios" ON public.presupuesto_guardados;
CREATE POLICY "Leer guardados propios"
ON public.presupuesto_guardados FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Registrar guardados propios" ON public.presupuesto_guardados;
CREATE POLICY "Registrar guardados propios"
ON public.presupuesto_guardados FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

REVOKE UPDATE, DELETE ON public.presupuesto_guardados FROM anon, authenticated;
GRANT SELECT, INSERT ON public.presupuesto_guardados TO authenticated;
GRANT ALL ON public.presupuesto_guardados TO service_role;

CREATE OR REPLACE FUNCTION public.guardar_presupuesto(
  p_operacion uuid,
  p_id uuid,
  p_datos jsonb,
  p_flujos jsonb,
  p_version timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_previo jsonb;
  v_id uuid := p_id;
  v_creado boolean := false;
  v_actual record;
  v_filas integer;
  v_f jsonb;
  v_flujo_id uuid;
  v_ids_enviados uuid[] := '{}';
  v_por_eliminar uuid[];
  v_insertados integer := 0;
  v_actualizados integer := 0;
  v_eliminados integer := 0;
  v_resultado jsonb;
BEGIN
  IF p_operacion IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de operación del guardado';
  END IF;

  -- Serializa las peticiones con la misma clave (doble clic, reintento de red):
  -- la segunda espera a que termine la primera y devuelve su resultado.
  PERFORM pg_advisory_xact_lock(hashtextextended('guardar_presupuesto:' || p_operacion::text, 0));

  -- Reintento de una operación ya aplicada: mismo resultado, sin efectos.
  SELECT resultado INTO v_previo FROM public.presupuesto_guardados WHERE operacion_id = p_operacion;
  IF FOUND THEN
    RETURN v_previo || jsonb_build_object('repetido', true);
  END IF;

  IF coalesce(trim(p_datos->>'partida'), '') = '' THEN
    RAISE EXCEPTION 'La partida es requerida';
  END IF;
  IF (p_datos->>'cantidad')::numeric IS NULL OR (p_datos->>'cantidad')::numeric <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;
  IF (p_datos->>'precio_unitario')::numeric IS NULL OR (p_datos->>'precio_unitario')::numeric < 0 THEN
    RAISE EXCEPTION 'El precio no puede ser negativo';
  END IF;

  IF v_id IS NULL THEN
    -- Creación: un único registro, con el siguiente orden de la empresa.
    INSERT INTO public.presupuestos (
      empresa_id, cuenta_id, centro_negocio_id, unidad_medida_id, partida, cantidad,
      precio_unitario, notas, tipo_movimiento, orden
    ) VALUES (
      (p_datos->>'empresa_id')::uuid,
      nullif(p_datos->>'cuenta_id', '')::uuid,
      nullif(p_datos->>'centro_negocio_id', '')::uuid,
      nullif(p_datos->>'unidad_medida_id', '')::uuid,
      p_datos->>'partida',
      (p_datos->>'cantidad')::numeric,
      (p_datos->>'precio_unitario')::numeric,
      nullif(p_datos->>'notas', ''),
      nullif(p_datos->>'tipo_movimiento', '')::tipo_movimiento_flujo,
      coalesce((SELECT max(orden) FROM public.presupuestos WHERE empresa_id = (p_datos->>'empresa_id')::uuid), 0) + 1
    ) RETURNING id INTO v_id;
    v_creado := true;
  ELSE
    -- Edición: se bloquea la partida para serializar guardados simultáneos.
    SELECT id, updated_at INTO v_actual FROM public.presupuestos WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El presupuesto no existe o no tienes permiso para modificarlo';
    END IF;
    IF p_version IS NOT NULL AND v_actual.updated_at IS DISTINCT FROM p_version THEN
      RAISE EXCEPTION 'PRESUPUESTO_DESACTUALIZADO: el presupuesto cambió desde que lo abriste; ciérralo y vuelve a abrirlo';
    END IF;
    -- Solo los campos que captura el formulario; fechas, frecuencia, marca de
    -- proyecto, responsable, avance, activo y orden se conservan.
    UPDATE public.presupuestos SET
      empresa_id = (p_datos->>'empresa_id')::uuid,
      cuenta_id = nullif(p_datos->>'cuenta_id', '')::uuid,
      centro_negocio_id = nullif(p_datos->>'centro_negocio_id', '')::uuid,
      unidad_medida_id = nullif(p_datos->>'unidad_medida_id', '')::uuid,
      partida = p_datos->>'partida',
      cantidad = (p_datos->>'cantidad')::numeric,
      precio_unitario = (p_datos->>'precio_unitario')::numeric,
      notas = nullif(p_datos->>'notas', ''),
      tipo_movimiento = nullif(p_datos->>'tipo_movimiento', '')::tipo_movimiento_flujo,
      updated_at = now()
    WHERE id = v_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No tienes permiso para modificar este presupuesto';
    END IF;
  END IF;

  -- p_flujos NULL = no tocar los flujos (partidas administradas por Proyectos).
  IF p_flujos IS NOT NULL THEN
    IF jsonb_typeof(p_flujos) <> 'array' THEN
      RAISE EXCEPTION 'Formato de flujos inválido';
    END IF;
    PERFORM 1 FROM public.flujos_programados WHERE presupuesto_id = v_id FOR UPDATE;

    FOR v_f IN SELECT * FROM jsonb_array_elements(p_flujos) LOOP
      IF (v_f->>'monto')::numeric IS NULL OR (v_f->>'monto')::numeric <= 0 THEN
        RAISE EXCEPTION 'Cada pago programado requiere un monto mayor a cero';
      END IF;
      IF (v_f->>'fecha') IS NULL THEN
        RAISE EXCEPTION 'Cada pago programado requiere fecha';
      END IF;
      v_flujo_id := nullif(v_f->>'id', '')::uuid;
      IF v_flujo_id IS NOT NULL THEN
        IF v_flujo_id = ANY (v_ids_enviados) THEN
          RAISE EXCEPTION 'Un pago programado viene repetido en la solicitud';
        END IF;
        v_ids_enviados := v_ids_enviados || v_flujo_id;
        UPDATE public.flujos_programados SET
          fecha = (v_f->>'fecha')::date,
          monto = (v_f->>'monto')::numeric,
          tipo = v_f->>'tipo',
          descripcion = nullif(v_f->>'descripcion', '')
        WHERE id = v_flujo_id AND presupuesto_id = v_id AND NOT auto_generado
          AND (fecha, monto, tipo, descripcion) IS DISTINCT FROM
              ((v_f->>'fecha')::date, (v_f->>'monto')::numeric, v_f->>'tipo', nullif(v_f->>'descripcion', ''));
        GET DIAGNOSTICS v_filas = ROW_COUNT;
        IF v_filas = 0 AND NOT EXISTS (
          SELECT 1 FROM public.flujos_programados WHERE id = v_flujo_id AND presupuesto_id = v_id AND NOT auto_generado
        ) THEN
          RAISE EXCEPTION 'Un pago programado ya no existe o no pertenece a esta partida; vuelve a abrir el presupuesto';
        END IF;
        v_actualizados := v_actualizados + v_filas;
      ELSE
        INSERT INTO public.flujos_programados (presupuesto_id, empresa_id, fecha, monto, tipo, descripcion)
        VALUES (v_id, (p_datos->>'empresa_id')::uuid, (v_f->>'fecha')::date, (v_f->>'monto')::numeric,
                v_f->>'tipo', nullif(v_f->>'descripcion', ''))
        RETURNING id INTO v_flujo_id;
        -- Se conserva: no es candidato a eliminación más abajo.
        v_ids_enviados := v_ids_enviados || v_flujo_id;
        v_insertados := v_insertados + 1;
      END IF;
    END LOOP;

    SELECT coalesce(array_agg(id), '{}') INTO v_por_eliminar
    FROM public.flujos_programados
    WHERE presupuesto_id = v_id AND NOT auto_generado AND NOT (id = ANY (v_ids_enviados));

    IF array_length(v_por_eliminar, 1) > 0 THEN
      DELETE FROM public.flujos_programados WHERE id = ANY (v_por_eliminar);
      GET DIAGNOSTICS v_eliminados = ROW_COUNT;
      IF v_eliminados <> array_length(v_por_eliminar, 1) THEN
        RAISE EXCEPTION 'No tienes permiso para eliminar pagos programados (solo administradores). No se guardó ningún cambio.';
      END IF;
    END IF;
  END IF;

  v_resultado := jsonb_build_object(
    'presupuesto_id', v_id,
    'creado', v_creado,
    'flujos', jsonb_build_object('insertados', v_insertados, 'actualizados', v_actualizados, 'eliminados', v_eliminados)
  );

  BEGIN
    INSERT INTO public.presupuesto_guardados (operacion_id, presupuesto_id, user_id, resultado)
    VALUES (p_operacion, v_id, auth.uid(), v_resultado);
  EXCEPTION WHEN unique_violation THEN
    -- Otra petición con la misma clave terminó primero: se descarta este
    -- intento completo (rollback) y se informa como repetido.
    RAISE EXCEPTION 'PRESUPUESTO_OPERACION_REPETIDA';
  END;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_presupuesto(uuid, uuid, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_presupuesto(uuid, uuid, jsonb, jsonb, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';
