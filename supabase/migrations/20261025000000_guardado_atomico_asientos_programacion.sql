-- Guardado atómico e idempotente de asientos contables y de la programación
-- financiera de una partida de proyecto (mismo patrón que guardar_presupuesto).
--
-- Antes: AsientoDetalle actualizaba la cabecera, borraba los renglones y los
-- reinsertaba en llamadas separadas (un fallo a la mitad dejaba el asiento sin
-- renglones o descuadrado; reinsertar cambiaba los ids y, por cascada, borraba
-- los flujos de IVA ligados a esos renglones). ProgramacionPartidaDialog hacía
-- lo mismo con los pagos del proyecto, ignorando el error del borrado.
--
-- Ahora (SECURITY INVOKER: aplican las políticas RLS vigentes):
-- * una transacción por guardado: o se guarda todo o nada;
-- * idempotente por p_operacion (doble clic o reintento no repite efectos);
-- * asientos: renglones por id (actualiza, inserta nuevos, elimina quitados),
--   totales calculados en el servidor y cuadre obligatorio; control de versión
--   con updated_at (trigger existente);
-- * programación de proyecto: crea o actualiza la programación de la partida y
--   reemplaza sus pagos verificando que el borrado sí ocurrió.
-- Idempotente: seguro de re-ejecutar.

-- 1. Asientos ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asiento_guardados (
  operacion_id uuid PRIMARY KEY,
  asiento_id uuid NOT NULL REFERENCES public.asientos_contables(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asiento_guardados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leer guardados de asiento propios" ON public.asiento_guardados;
CREATE POLICY "Leer guardados de asiento propios" ON public.asiento_guardados FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Registrar guardados de asiento propios" ON public.asiento_guardados;
CREATE POLICY "Registrar guardados de asiento propios" ON public.asiento_guardados FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
REVOKE UPDATE, DELETE ON public.asiento_guardados FROM anon, authenticated;
GRANT SELECT, INSERT ON public.asiento_guardados TO authenticated;
GRANT ALL ON public.asiento_guardados TO service_role;

CREATE OR REPLACE FUNCTION public.guardar_asiento(
  p_operacion uuid,
  p_id uuid,
  p_datos jsonb,
  p_movimientos jsonb,
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
  v_m jsonb;
  v_mov_id uuid;
  v_ids uuid[] := '{}';
  v_debe numeric := 0;
  v_haber numeric := 0;
  v_filas integer;
  v_esperadas integer;
  v_orden integer := 0;
  v_ins integer := 0;
  v_act integer := 0;
  v_eli integer := 0;
  v_resultado jsonb;
BEGIN
  IF p_operacion IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de operación del guardado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('guardar_asiento:' || p_operacion::text, 0));
  SELECT resultado INTO v_previo FROM public.asiento_guardados WHERE operacion_id = p_operacion;
  IF FOUND THEN
    RETURN v_previo || jsonb_build_object('repetido', true);
  END IF;

  IF nullif(p_datos->>'empresa_id', '') IS NULL THEN
    RAISE EXCEPTION 'La empresa es requerida';
  END IF;
  IF jsonb_typeof(p_movimientos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_movimientos) = 0 THEN
    RAISE EXCEPTION 'El asiento necesita al menos un movimiento';
  END IF;
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_movimientos) LOOP
    IF nullif(v_m->>'cuenta_id', '') IS NULL THEN
      RAISE EXCEPTION 'Cada movimiento requiere una cuenta';
    END IF;
    IF coalesce((v_m->>'debe')::numeric, 0) < 0 OR coalesce((v_m->>'haber')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Los importes no pueden ser negativos';
    END IF;
    v_debe := v_debe + round(coalesce((v_m->>'debe')::numeric, 0), 2);
    v_haber := v_haber + round(coalesce((v_m->>'haber')::numeric, 0), 2);
  END LOOP;
  IF v_debe <> v_haber THEN
    RAISE EXCEPTION 'El asiento no cuadra: debe % y haber %', v_debe, v_haber;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.asientos_contables (empresa_id, fecha, tipo, tercero_id, centro_negocio_id, observaciones, total_debe, total_haber, created_by)
    VALUES (
      (p_datos->>'empresa_id')::uuid,
      coalesce(nullif(p_datos->>'fecha', '')::date, CURRENT_DATE),
      coalesce(nullif(p_datos->>'tipo', ''), 'diario')::tipo_asiento,
      nullif(p_datos->>'tercero_id', '')::uuid,
      nullif(p_datos->>'centro_negocio_id', '')::uuid,
      nullif(p_datos->>'observaciones', ''),
      v_debe, v_haber, auth.uid()
    ) RETURNING id INTO v_id;
    v_creado := true;
  ELSE
    SELECT id, updated_at INTO v_actual FROM public.asientos_contables WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El asiento no existe o no tienes permiso para modificarlo';
    END IF;
    IF p_version IS NOT NULL AND v_actual.updated_at IS DISTINCT FROM p_version THEN
      RAISE EXCEPTION 'ASIENTO_DESACTUALIZADO: el asiento cambió desde que lo abriste; vuelve a abrirlo';
    END IF;
    UPDATE public.asientos_contables SET
      empresa_id = (p_datos->>'empresa_id')::uuid,
      fecha = coalesce(nullif(p_datos->>'fecha', '')::date, fecha),
      tipo = coalesce(nullif(p_datos->>'tipo', ''), tipo::text)::tipo_asiento,
      tercero_id = nullif(p_datos->>'tercero_id', '')::uuid,
      centro_negocio_id = nullif(p_datos->>'centro_negocio_id', '')::uuid,
      observaciones = nullif(p_datos->>'observaciones', ''),
      total_debe = v_debe,
      total_haber = v_haber
    WHERE id = v_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No tienes permiso para modificar este asiento';
    END IF;
  END IF;

  PERFORM 1 FROM public.asiento_movimientos WHERE asiento_id = v_id FOR UPDATE;
  FOR v_m IN SELECT * FROM jsonb_array_elements(p_movimientos) LOOP
    v_mov_id := nullif(v_m->>'id', '')::uuid;
    IF v_mov_id IS NOT NULL AND NOT v_creado THEN
      IF v_mov_id = ANY (v_ids) THEN
        RAISE EXCEPTION 'Un movimiento viene repetido en la solicitud';
      END IF;
      UPDATE public.asiento_movimientos SET
        cuenta_id = (v_m->>'cuenta_id')::uuid,
        partida = coalesce(v_m->>'partida', ''),
        debe = round(coalesce((v_m->>'debe')::numeric, 0), 2),
        haber = round(coalesce((v_m->>'haber')::numeric, 0), 2),
        orden = v_orden,
        presupuesto_id = nullif(v_m->>'presupuesto_id', '')::uuid
      WHERE id = v_mov_id AND asiento_id = v_id;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> 1 THEN
        RAISE EXCEPTION 'Un movimiento ya no existe o no pertenece a este asiento; vuelve a abrirlo';
      END IF;
      v_act := v_act + 1;
    ELSE
      INSERT INTO public.asiento_movimientos (asiento_id, cuenta_id, partida, debe, haber, orden, presupuesto_id)
      VALUES (v_id, (v_m->>'cuenta_id')::uuid, coalesce(v_m->>'partida', ''), round(coalesce((v_m->>'debe')::numeric, 0), 2),
              round(coalesce((v_m->>'haber')::numeric, 0), 2), v_orden, nullif(v_m->>'presupuesto_id', '')::uuid)
      RETURNING id INTO v_mov_id;
      v_ins := v_ins + 1;
    END IF;
    v_ids := v_ids || v_mov_id;
    v_orden := v_orden + 1;
  END LOOP;

  SELECT count(*) INTO v_esperadas FROM public.asiento_movimientos WHERE asiento_id = v_id AND NOT (id = ANY (v_ids));
  IF v_esperadas > 0 THEN
    DELETE FROM public.asiento_movimientos WHERE asiento_id = v_id AND NOT (id = ANY (v_ids));
    GET DIAGNOSTICS v_eli = ROW_COUNT;
    IF v_eli <> v_esperadas THEN
      RAISE EXCEPTION 'No tienes permiso para quitar movimientos. No se guardó ningún cambio.';
    END IF;
  END IF;

  v_resultado := jsonb_build_object('asiento_id', v_id, 'creado', v_creado,
    'movimientos', jsonb_build_object('insertados', v_ins, 'actualizados', v_act, 'eliminados', v_eli));
  INSERT INTO public.asiento_guardados (operacion_id, asiento_id, user_id, resultado) VALUES (p_operacion, v_id, auth.uid(), v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_asiento(uuid, uuid, jsonb, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_asiento(uuid, uuid, jsonb, jsonb, timestamptz) TO authenticated;

-- 2. Programación financiera de una partida de proyecto ----------------------
CREATE TABLE IF NOT EXISTS public.programacion_partida_guardados (
  operacion_id uuid PRIMARY KEY,
  programacion_id uuid NOT NULL REFERENCES public.proyecto_programacion_financiera(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.programacion_partida_guardados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leer guardados de programación propios" ON public.programacion_partida_guardados;
CREATE POLICY "Leer guardados de programación propios" ON public.programacion_partida_guardados FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Registrar guardados de programación propios" ON public.programacion_partida_guardados;
CREATE POLICY "Registrar guardados de programación propios" ON public.programacion_partida_guardados FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
REVOKE UPDATE, DELETE ON public.programacion_partida_guardados FROM anon, authenticated;
GRANT SELECT, INSERT ON public.programacion_partida_guardados TO authenticated;
GRANT ALL ON public.programacion_partida_guardados TO service_role;

-- p_datos: { presupuesto_id, proyecto_id, empresa_id, modo, frecuencia, fecha_inicio, numero_pagos,
--            tiene_anticipo, anticipo_monto, anticipo_fecha }
-- p_pagos: [ { fecha, monto, concepto } ]  (sin el anticipo; el anticipo sale de p_datos)
CREATE OR REPLACE FUNCTION public.guardar_programacion_partida(p_operacion uuid, p_datos jsonb, p_pagos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_previo jsonb;
  v_presupuesto uuid := nullif(p_datos->>'presupuesto_id', '')::uuid;
  v_proyecto uuid := nullif(p_datos->>'proyecto_id', '')::uuid;
  v_empresa uuid := nullif(p_datos->>'empresa_id', '')::uuid;
  v_prog_id uuid;
  v_creada boolean := false;
  v_partida record;
  v_anticipo numeric := CASE WHEN coalesce((p_datos->>'tiene_anticipo')::boolean, false) THEN coalesce((p_datos->>'anticipo_monto')::numeric, 0) ELSE 0 END;
  v_total numeric;
  v_p jsonb;
  v_esperadas integer;
  v_filas integer;
  v_insertados integer := 0;
  v_orden integer := 0;
  v_resultado jsonb;
BEGIN
  IF p_operacion IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de operación del guardado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('guardar_programacion_partida:' || p_operacion::text, 0));
  SELECT resultado INTO v_previo FROM public.programacion_partida_guardados WHERE operacion_id = p_operacion;
  IF FOUND THEN
    RETURN v_previo || jsonb_build_object('repetido', true);
  END IF;

  IF v_presupuesto IS NULL OR v_proyecto IS NULL OR v_empresa IS NULL THEN
    RAISE EXCEPTION 'Faltan la partida, el proyecto o la empresa';
  END IF;
  IF jsonb_typeof(p_pagos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Formato de pagos inválido';
  END IF;
  IF v_anticipo < 0 THEN
    RAISE EXCEPTION 'El anticipo no puede ser negativo';
  END IF;
  IF v_anticipo > 0 AND nullif(p_datos->>'anticipo_fecha', '') IS NULL THEN
    RAISE EXCEPTION 'Define la fecha del anticipo';
  END IF;
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_pagos) LOOP
    IF nullif(v_p->>'fecha', '') IS NULL OR coalesce((v_p->>'monto')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Cada pago requiere fecha y un monto mayor a cero';
    END IF;
  END LOOP;
  IF jsonb_array_length(p_pagos) = 0 AND v_anticipo <= 0 THEN
    RAISE EXCEPTION 'Genera o captura al menos un pago';
  END IF;

  SELECT cantidad * precio_unitario AS presupuestado, partida INTO v_partida FROM public.presupuestos WHERE id = v_presupuesto;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La partida no existe';
  END IF;
  SELECT v_anticipo + coalesce(sum((x->>'monto')::numeric), 0) INTO v_total FROM jsonb_array_elements(p_pagos) x;
  IF v_total > v_partida.presupuestado + 0.01 THEN
    RAISE EXCEPTION 'Lo programado (%) supera el presupuesto de la partida (%)', v_total, v_partida.presupuestado;
  END IF;

  SELECT id INTO v_prog_id FROM public.proyecto_programacion_financiera WHERE presupuesto_id = v_presupuesto FOR UPDATE;
  IF v_prog_id IS NULL THEN
    INSERT INTO public.proyecto_programacion_financiera (
      presupuesto_id, proyecto_id, empresa_id, modo, tiene_anticipo, anticipo_monto, anticipo_fecha, frecuencia, fecha_inicio, numero_pagos, created_by, updated_by
    ) VALUES (
      v_presupuesto, v_proyecto, v_empresa,
      coalesce(nullif(p_datos->>'modo', ''), 'manual')::programacion_proyecto_modo,
      v_anticipo > 0, v_anticipo, nullif(p_datos->>'anticipo_fecha', '')::date,
      nullif(p_datos->>'frecuencia', '')::programacion_proyecto_frecuencia,
      nullif(p_datos->>'fecha_inicio', '')::date,
      nullif(p_datos->>'numero_pagos', '')::integer,
      auth.uid(), auth.uid()
    ) RETURNING id INTO v_prog_id;
    v_creada := true;
  ELSE
    UPDATE public.proyecto_programacion_financiera SET
      proyecto_id = v_proyecto,
      empresa_id = v_empresa,
      modo = coalesce(nullif(p_datos->>'modo', ''), 'manual')::programacion_proyecto_modo,
      tiene_anticipo = v_anticipo > 0,
      anticipo_monto = v_anticipo,
      anticipo_fecha = nullif(p_datos->>'anticipo_fecha', '')::date,
      frecuencia = nullif(p_datos->>'frecuencia', '')::programacion_proyecto_frecuencia,
      fecha_inicio = nullif(p_datos->>'fecha_inicio', '')::date,
      numero_pagos = nullif(p_datos->>'numero_pagos', '')::integer,
      updated_by = auth.uid()
    WHERE id = v_prog_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No tienes permiso para editar la programación financiera de este proyecto';
    END IF;
    SELECT count(*) INTO v_esperadas FROM public.proyecto_programacion_pagos WHERE programacion_id = v_prog_id;
    DELETE FROM public.proyecto_programacion_pagos WHERE programacion_id = v_prog_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> v_esperadas THEN
      RAISE EXCEPTION 'No tienes permiso para reemplazar los pagos programados. No se guardó ningún cambio.';
    END IF;
  END IF;

  IF v_anticipo > 0 THEN
    INSERT INTO public.proyecto_programacion_pagos (programacion_id, proyecto_id, fecha, monto, concepto, es_anticipo, orden)
    VALUES (v_prog_id, v_proyecto, (p_datos->>'anticipo_fecha')::date, v_anticipo, 'Anticipo', true, -1);
    v_insertados := v_insertados + 1;
  END IF;
  FOR v_p IN SELECT x FROM jsonb_array_elements(p_pagos) x ORDER BY (x->>'fecha')::date LOOP
    INSERT INTO public.proyecto_programacion_pagos (programacion_id, proyecto_id, fecha, monto, concepto, es_anticipo, orden)
    VALUES (v_prog_id, v_proyecto, (v_p->>'fecha')::date, (v_p->>'monto')::numeric, nullif(v_p->>'concepto', ''), false, v_orden);
    v_orden := v_orden + 1;
    v_insertados := v_insertados + 1;
  END LOOP;

  -- Bitácora del proyecto: si el usuario no puede registrarla, no bloquea el guardado.
  BEGIN
    INSERT INTO public.proyecto_auditoria (proyecto_id, presupuesto_id, user_id, accion, entidad_id, valor_nuevo)
    VALUES (v_proyecto, v_presupuesto, auth.uid(), 'programacion_financiera', v_presupuesto,
            format('%s · %s · %s movimientos · %s', v_partida.partida, coalesce(p_datos->>'frecuencia', 'manual'), v_insertados, round(v_total, 2)));
  EXCEPTION WHEN insufficient_privilege OR not_null_violation THEN
    NULL;
  END;

  v_resultado := jsonb_build_object('programacion_id', v_prog_id, 'creada', v_creada, 'pagos', v_insertados, 'total', round(v_total, 2));
  INSERT INTO public.programacion_partida_guardados (operacion_id, programacion_id, user_id, resultado) VALUES (p_operacion, v_prog_id, auth.uid(), v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_programacion_partida(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_programacion_partida(uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
