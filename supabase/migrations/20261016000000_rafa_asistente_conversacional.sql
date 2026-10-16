-- Rafa conversacional: conversaciones, mensajes, acciones con confirmación y
-- operaciones transaccionales.
--
-- Principios:
-- * Las operaciones de negocio se ejecutan con funciones SECURITY INVOKER: RLS
--   y las políticas vigentes del usuario siguen aplicando. Una confirmación
--   nunca concede permisos que el usuario no tenga.
-- * Cada operación corre en UNA transacción (todo o nada) y registra su
--   ejecución en rafa_ejecuciones (PK = acción): un reintento de la misma
--   acción falla por unicidad y no duplica efectos.
-- * Mensajes y acciones los escribe únicamente la Edge Function (service
--   role); el usuario solo puede leer los suyos. Así la bitácora no se puede
--   alterar desde el navegador.
-- Idempotente: seguro de re-ejecutar.

-- 1. Conversaciones ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rafa_conversaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT 'Conversación con Rafa',
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rafa_conversaciones_user ON public.rafa_conversaciones (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_rafa_conversaciones_updated_at ON public.rafa_conversaciones;
CREATE TRIGGER update_rafa_conversaciones_updated_at
  BEFORE UPDATE ON public.rafa_conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rafa_conversaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada usuario gestiona sus conversaciones con Rafa" ON public.rafa_conversaciones;
CREATE POLICY "Cada usuario gestiona sus conversaciones con Rafa"
ON public.rafa_conversaciones FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 2. Mensajes ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rafa_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.rafa_conversaciones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol text NOT NULL CHECK (rol IN ('usuario', 'asistente')),
  contenido text NOT NULL DEFAULT '',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version_conocimiento text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rafa_mensajes_conversacion ON public.rafa_mensajes (conversacion_id, created_at);

ALTER TABLE public.rafa_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada usuario lee sus mensajes con Rafa" ON public.rafa_mensajes;
CREATE POLICY "Cada usuario lee sus mensajes con Rafa"
ON public.rafa_mensajes FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.rafa_mensajes FROM anon, authenticated;
GRANT SELECT ON public.rafa_mensajes TO authenticated;
GRANT ALL ON public.rafa_mensajes TO service_role;

-- 3. Acciones (propuesta → confirmación → ejecución) -------------------------
CREATE TABLE IF NOT EXISTS public.rafa_acciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversacion_id uuid REFERENCES public.rafa_conversaciones(id) ON DELETE SET NULL,
  herramienta text NOT NULL,
  descripcion text NOT NULL,
  estado text NOT NULL DEFAULT 'propuesta'
    CHECK (estado IN ('propuesta', 'ejecutando', 'ejecutada', 'fallida', 'parcial', 'cancelada', 'desactualizada', 'expirada')),
  requiere_confirmacion boolean NOT NULL DEFAULT true,
  entrada jsonb NOT NULL DEFAULT '{}'::jsonb,
  vista_previa jsonb NOT NULL DEFAULT '{}'::jsonb,
  huella text NOT NULL,
  registros_afectados jsonb NOT NULL DEFAULT '[]'::jsonb,
  resultado jsonb,
  error text,
  version_conocimiento text,
  reemplazada_por uuid REFERENCES public.rafa_acciones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expira_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  confirmada_at timestamptz,
  finalizada_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rafa_acciones_user ON public.rafa_acciones (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rafa_acciones_conversacion ON public.rafa_acciones (conversacion_id, created_at DESC);

DROP TRIGGER IF EXISTS update_rafa_acciones_updated_at ON public.rafa_acciones;
CREATE TRIGGER update_rafa_acciones_updated_at
  BEFORE UPDATE ON public.rafa_acciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rafa_acciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada usuario lee sus acciones de Rafa; admin audita todas" ON public.rafa_acciones;
CREATE POLICY "Cada usuario lee sus acciones de Rafa; admin audita todas"
ON public.rafa_acciones FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

REVOKE INSERT, UPDATE, DELETE ON public.rafa_acciones FROM anon, authenticated;
GRANT SELECT ON public.rafa_acciones TO authenticated;
GRANT ALL ON public.rafa_acciones TO service_role;

-- 4. Ejecuciones: candado de idempotencia dentro de la misma transacción ----
CREATE TABLE IF NOT EXISTS public.rafa_ejecuciones (
  accion_id uuid PRIMARY KEY REFERENCES public.rafa_acciones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rafa_ejecuciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leer ejecuciones propias" ON public.rafa_ejecuciones;
CREATE POLICY "Leer ejecuciones propias"
ON public.rafa_ejecuciones FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Solo se puede registrar la ejecución de una acción propia que el servidor
-- ya marcó como confirmada ('ejecutando'). Se admite también 'ejecutada' para
-- que un reintento concurrente llegue a la violación de unicidad (y se
-- reconozca como "ya ejecutada") en vez de fallar por RLS.
DROP POLICY IF EXISTS "Registrar ejecución de acción confirmada" ON public.rafa_ejecuciones;
CREATE POLICY "Registrar ejecución de acción confirmada"
ON public.rafa_ejecuciones FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.rafa_acciones a
    WHERE a.id = rafa_ejecuciones.accion_id AND a.user_id = auth.uid() AND a.estado IN ('ejecutando', 'ejecutada')
  )
);

REVOKE UPDATE, DELETE ON public.rafa_ejecuciones FROM anon, authenticated;
GRANT SELECT, INSERT ON public.rafa_ejecuciones TO authenticated;
GRANT ALL ON public.rafa_ejecuciones TO service_role;

-- 5. Operaciones de negocio (SECURITY INVOKER, una transacción cada una) -----

CREATE OR REPLACE FUNCTION public.rafa_registrar_ejecucion(p_accion_id uuid, p_resultado jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.rafa_ejecuciones (accion_id, user_id, resultado)
    VALUES (p_accion_id, auth.uid(), p_resultado);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'RAFA_YA_EJECUTADA: la acción % ya se ejecutó', p_accion_id;
  END;
END;
$$;

-- 5.1 Programaciones nuevas (estado pendiente) con validación de alcance.
CREATE OR REPLACE FUNCTION public.rafa_crear_programaciones(p_accion_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_pres record;
  v_empresa uuid;
  v_centro uuid;
  v_tercero uuid;
  v_presupuesto uuid;
  v_monto numeric;
  v_resultado jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay programaciones que crear';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_empresa := (v_item->>'empresa_id')::uuid;
    v_centro := nullif(v_item->>'centro_negocio_id', '')::uuid;
    v_tercero := nullif(v_item->>'tercero_id', '')::uuid;
    v_presupuesto := nullif(v_item->>'presupuesto_id', '')::uuid;
    v_monto := (v_item->>'monto')::numeric;

    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'El monto debe ser mayor a cero';
    END IF;
    IF (v_item->>'tipo') NOT IN ('ingreso', 'egreso') THEN
      RAISE EXCEPTION 'Tipo de programación inválido';
    END IF;
    IF v_centro IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.centros_negocio WHERE id = v_centro AND empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'El centro de negocio no pertenece a la empresa';
    END IF;
    IF v_tercero IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.terceros WHERE id = v_tercero AND empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'El tercero no pertenece a la empresa';
    END IF;
    IF v_presupuesto IS NOT NULL THEN
      SELECT empresa_id, centro_negocio_id, activo INTO v_pres FROM public.presupuestos WHERE id = v_presupuesto;
      IF NOT FOUND OR v_pres.empresa_id <> v_empresa OR NOT v_pres.activo THEN
        RAISE EXCEPTION 'La partida presupuestal no es válida para la empresa';
      END IF;
      IF v_pres.centro_negocio_id IS NOT NULL AND v_centro IS NOT NULL AND v_pres.centro_negocio_id <> v_centro THEN
        RAISE EXCEPTION 'La partida presupuestal no pertenece al centro de negocio seleccionado';
      END IF;
    END IF;

    INSERT INTO public.programaciones (
      empresa_id, tipo, centro_negocio_id, fecha_programada, tercero_id, monto,
      observaciones, presupuesto_id, estado, created_by
    ) VALUES (
      v_empresa, (v_item->>'tipo')::tipo_programacion, v_centro, (v_item->>'fecha_programada')::date,
      v_tercero, v_monto, nullif(v_item->>'observaciones', ''), v_presupuesto, 'pendiente', auth.uid()
    ) RETURNING id INTO v_id;
    v_ids := v_ids || v_id;
  END LOOP;

  v_resultado := jsonb_build_object('programacion_ids', to_jsonb(v_ids));
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

-- 5.2 Asientos en BORRADOR (nunca contabiliza). Opcionalmente liga la
-- programación que los origina para no duplicar efectos.
CREATE OR REPLACE FUNCTION public.rafa_crear_asientos_borrador(p_accion_id uuid, p_asientos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_asiento jsonb;
  v_mov jsonb;
  v_id uuid;
  v_numero integer;
  v_ids jsonb := '[]'::jsonb;
  v_empresa uuid;
  v_centro uuid;
  v_debe numeric;
  v_haber numeric;
  v_orden integer;
  v_programacion uuid;
  v_tiene_presupuesto boolean;
  v_pres record;
  v_filas integer;
  v_resultado jsonb;
BEGIN
  IF p_asientos IS NULL OR jsonb_typeof(p_asientos) <> 'array' OR jsonb_array_length(p_asientos) = 0 THEN
    RAISE EXCEPTION 'No hay asientos que crear';
  END IF;

  FOR v_asiento IN SELECT * FROM jsonb_array_elements(p_asientos) LOOP
    v_empresa := (v_asiento->>'empresa_id')::uuid;
    v_centro := nullif(v_asiento->>'centro_negocio_id', '')::uuid;
    v_programacion := nullif(v_asiento->>'programacion_id', '')::uuid;

    IF (v_asiento->>'tipo') NOT IN ('ingreso', 'egreso', 'diario') THEN
      RAISE EXCEPTION 'Tipo de asiento inválido';
    END IF;
    IF jsonb_array_length(coalesce(v_asiento->'movimientos', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'Debe agregar al menos un movimiento';
    END IF;

    SELECT coalesce(sum((m->>'debe')::numeric), 0), coalesce(sum((m->>'haber')::numeric), 0),
           bool_or(nullif(m->>'presupuesto_id', '') IS NOT NULL)
      INTO v_debe, v_haber, v_tiene_presupuesto
      FROM jsonb_array_elements(v_asiento->'movimientos') m;

    IF abs(v_debe - v_haber) >= 0.01 THEN
      RAISE EXCEPTION 'El asiento no está cuadrado. Total Debe debe ser igual a Total Haber';
    END IF;
    IF (v_asiento->>'tipo') = 'diario' AND NOT coalesce(v_tiene_presupuesto, false) THEN
      RAISE EXCEPTION 'Las pólizas de diario requieren al menos un movimiento con presupuesto asignado';
    END IF;
    IF v_centro IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.centros_negocio WHERE id = v_centro AND empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'El centro de negocio no pertenece a la empresa';
    END IF;
    IF nullif(v_asiento->>'tercero_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.terceros WHERE id = (v_asiento->>'tercero_id')::uuid AND empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'El tercero no pertenece a la empresa';
    END IF;

    INSERT INTO public.asientos_contables (
      empresa_id, fecha, tipo, tercero_id, centro_negocio_id, observaciones,
      estado, total_debe, total_haber, created_by
    ) VALUES (
      v_empresa, (v_asiento->>'fecha')::date, (v_asiento->>'tipo')::tipo_asiento,
      nullif(v_asiento->>'tercero_id', '')::uuid, v_centro, nullif(v_asiento->>'observaciones', ''),
      'borrador', v_debe, v_haber, auth.uid()
    ) RETURNING id, numero_asiento INTO v_id, v_numero;

    v_orden := 0;
    FOR v_mov IN SELECT * FROM jsonb_array_elements(v_asiento->'movimientos') LOOP
      IF coalesce((v_mov->>'debe')::numeric, 0) < 0 OR coalesce((v_mov->>'haber')::numeric, 0) < 0
         OR (coalesce((v_mov->>'debe')::numeric, 0) = 0 AND coalesce((v_mov->>'haber')::numeric, 0) = 0) THEN
        RAISE EXCEPTION 'Todos los movimientos deben tener cuenta y un monto en Debe o Haber';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.cuentas_contables
        WHERE id = (v_mov->>'cuenta_id')::uuid AND empresa_id = v_empresa AND clasificacion = 'saldo' AND activa
      ) THEN
        RAISE EXCEPTION 'La cuenta % no es una cuenta de saldo activa de la empresa', v_mov->>'cuenta_id';
      END IF;
      IF nullif(v_mov->>'presupuesto_id', '') IS NOT NULL THEN
        SELECT empresa_id, centro_negocio_id INTO v_pres FROM public.presupuestos WHERE id = (v_mov->>'presupuesto_id')::uuid;
        IF NOT FOUND OR v_pres.empresa_id <> v_empresa
           OR (v_pres.centro_negocio_id IS NOT NULL AND v_pres.centro_negocio_id IS DISTINCT FROM v_centro) THEN
          RAISE EXCEPTION 'Hay partidas presupuestales que no pertenecen al centro de negocios seleccionado.';
        END IF;
      END IF;
      INSERT INTO public.asiento_movimientos (asiento_id, cuenta_id, partida, debe, haber, orden, presupuesto_id)
      VALUES (
        v_id, (v_mov->>'cuenta_id')::uuid, coalesce(v_mov->>'partida', ''),
        coalesce((v_mov->>'debe')::numeric, 0), coalesce((v_mov->>'haber')::numeric, 0), v_orden,
        nullif(v_mov->>'presupuesto_id', '')::uuid
      );
      v_orden := v_orden + 1;
    END LOOP;

    IF v_programacion IS NOT NULL THEN
      UPDATE public.programaciones p
      SET asiento_id = v_id
      WHERE p.id = v_programacion
        AND p.empresa_id = v_empresa
        AND p.estado = 'pendiente'
        AND (p.asiento_id IS NULL OR EXISTS (
          SELECT 1 FROM public.asientos_contables a WHERE a.id = p.asiento_id AND a.estado = 'cancelado'
        ));
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> 1 THEN
        RAISE EXCEPTION 'La programación % no está pendiente o ya tiene un asiento vigente ligado', v_programacion;
      END IF;
    END IF;

    v_ids := v_ids || jsonb_build_object('asiento_id', v_id, 'numero_asiento', v_numero, 'programacion_id', v_programacion);
  END LOOP;

  v_resultado := jsonb_build_object('asientos', v_ids);
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

-- 5.3 Ajuste de partidas presupuestales con control optimista.
CREATE OR REPLACE FUNCTION public.rafa_ajustar_presupuestos(p_accion_id uuid, p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_c jsonb;
  v_filas integer;
  v_ids uuid[] := '{}';
  v_resultado jsonb;
BEGIN
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'array' OR jsonb_array_length(p_cambios) = 0 THEN
    RAISE EXCEPTION 'No hay cambios que aplicar';
  END IF;
  FOR v_c IN SELECT * FROM jsonb_array_elements(p_cambios) LOOP
    IF (v_c->>'cantidad_nueva')::numeric < 0 OR (v_c->>'precio_unitario_nuevo')::numeric < 0 THEN
      RAISE EXCEPTION 'Cantidad y precio no pueden ser negativos';
    END IF;
    UPDATE public.presupuestos
    SET cantidad = (v_c->>'cantidad_nueva')::numeric,
        precio_unitario = (v_c->>'precio_unitario_nuevo')::numeric
    WHERE id = (v_c->>'id')::uuid
      AND activo
      AND cantidad = (v_c->>'cantidad_anterior')::numeric
      AND precio_unitario = (v_c->>'precio_unitario_anterior')::numeric;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'RAFA_DESACTUALIZADA: la partida % cambió, está inactiva o no es editable', v_c->>'id';
    END IF;
    v_ids := v_ids || (v_c->>'id')::uuid;
  END LOOP;
  v_resultado := jsonb_build_object('presupuesto_ids', to_jsonb(v_ids));
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

-- 5.4 Cambio de estado de programaciones: pendiente → ejecutado | cancelado.
CREATE OR REPLACE FUNCTION public.rafa_cambiar_estado_programaciones(p_accion_id uuid, p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_c jsonb;
  v_filas integer;
  v_ids uuid[] := '{}';
  v_resultado jsonb;
BEGIN
  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'array' OR jsonb_array_length(p_cambios) = 0 THEN
    RAISE EXCEPTION 'No hay cambios que aplicar';
  END IF;
  FOR v_c IN SELECT * FROM jsonb_array_elements(p_cambios) LOOP
    IF (v_c->>'estado_nuevo') NOT IN ('ejecutado', 'cancelado') THEN
      RAISE EXCEPTION 'Transición no permitida';
    END IF;
    UPDATE public.programaciones
    SET estado = (v_c->>'estado_nuevo')::estado_programacion
    WHERE id = (v_c->>'id')::uuid
      AND estado = 'pendiente'
      AND monto = (v_c->>'monto_anterior')::numeric
      AND fecha_programada = (v_c->>'fecha_anterior')::date;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'RAFA_DESACTUALIZADA: la programación % ya no está pendiente con los mismos datos', v_c->>'id';
    END IF;
    v_ids := v_ids || (v_c->>'id')::uuid;
  END LOOP;
  v_resultado := jsonb_build_object('programacion_ids', to_jsonb(v_ids));
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

-- 5.5 Contabilizar asientos en borrador (borrador → aplicado).
CREATE OR REPLACE FUNCTION public.rafa_aplicar_asientos(p_accion_id uuid, p_asientos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_a jsonb;
  v_debe numeric;
  v_haber numeric;
  v_n integer;
  v_filas integer;
  v_ids uuid[] := '{}';
  v_resultado jsonb;
BEGIN
  IF p_asientos IS NULL OR jsonb_typeof(p_asientos) <> 'array' OR jsonb_array_length(p_asientos) = 0 THEN
    RAISE EXCEPTION 'No hay asientos que aplicar';
  END IF;
  FOR v_a IN SELECT * FROM jsonb_array_elements(p_asientos) LOOP
    SELECT coalesce(sum(debe), 0), coalesce(sum(haber), 0), count(*)
      INTO v_debe, v_haber, v_n
      FROM public.asiento_movimientos WHERE asiento_id = (v_a->>'id')::uuid;
    IF v_n = 0 OR abs(v_debe - v_haber) >= 0.01 THEN
      RAISE EXCEPTION 'El asiento % no está cuadrado o no tiene movimientos', v_a->>'id';
    END IF;
    UPDATE public.asientos_contables
    SET estado = 'aplicado', total_debe = v_debe, total_haber = v_haber
    WHERE id = (v_a->>'id')::uuid
      AND estado = 'borrador'
      AND updated_at = (v_a->>'updated_at')::timestamptz;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'RAFA_DESACTUALIZADA: el asiento % ya no está en borrador o cambió', v_a->>'id';
    END IF;
    v_ids := v_ids || (v_a->>'id')::uuid;
  END LOOP;
  v_resultado := jsonb_build_object('asiento_ids', to_jsonb(v_ids));
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

-- 5.6 Tarea de proyecto.
CREATE OR REPLACE FUNCTION public.rafa_crear_tarea(p_accion_id uuid, p_tarea jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_id uuid;
  v_resultado jsonb;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.proyectos WHERE id = (p_tarea->>'proyecto_id')::uuid AND activo;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Proyecto no encontrado o inactivo';
  END IF;
  IF coalesce(trim(p_tarea->>'titulo'), '') = '' THEN
    RAISE EXCEPTION 'La tarea requiere título';
  END IF;
  IF nullif(p_tarea->>'responsable_tercero_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.terceros WHERE id = (p_tarea->>'responsable_tercero_id')::uuid AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'El responsable no pertenece a la empresa del proyecto';
  END IF;
  INSERT INTO public.proyecto_tareas (proyecto_id, empresa_id, titulo, notas, responsable_tercero_id, fecha_vencimiento, estado, created_by, updated_by)
  VALUES (
    (p_tarea->>'proyecto_id')::uuid, v_empresa, trim(p_tarea->>'titulo'), nullif(p_tarea->>'notas', ''),
    nullif(p_tarea->>'responsable_tercero_id', '')::uuid, nullif(p_tarea->>'fecha_vencimiento', '')::date,
    'pendiente', auth.uid(), auth.uid()
  ) RETURNING id INTO v_id;
  v_resultado := jsonb_build_object('tarea_id', v_id);
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.rafa_registrar_ejecucion(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_crear_programaciones(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_crear_asientos_borrador(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_ajustar_presupuestos(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_cambiar_estado_programaciones(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_aplicar_asientos(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_crear_tarea(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rafa_registrar_ejecucion(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_crear_programaciones(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_crear_asientos_borrador(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_ajustar_presupuestos(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_cambiar_estado_programaciones(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_aplicar_asientos(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_crear_tarea(uuid, jsonb) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rafa_conversaciones TO authenticated;
GRANT ALL ON public.rafa_conversaciones TO service_role;

NOTIFY pgrst, 'reload schema';
