-- Reprogramación masiva de fechas desde Rafa: cientos de partidas con una sola
-- confirmación y una sola transacción (si algo falla no se aplica nada). La
-- última instrucción manda: reemplaza la programación vigente de cada partida.
--
-- - Partidas de Proyecto: reemplaza sus pagos (proyecto_programacion_pagos);
--   la barra del Gantt se alinea sola (trigger de 20261027120000).
-- - Resto de partidas: reemplaza sus flujos programados capturados a mano
--   (no toca IVA automático ni flujos ligados a un movimiento contable). Se
--   actualizan en su lugar (contador puede); borrar sobrantes requiere admin.
-- Todo en sentencias por lote (no partida por partida) para no rebasar el
-- tiempo máximo de la petición con 300–400 partidas.
-- SECURITY INVOKER: aplican las políticas RLS vigentes.
-- Idempotente: seguro de re-ejecutar.

-- 1. Los flujos capturados a mano siguen la dirección de su partida
-- (Ingreso → entrada, Egreso → salida). Corrige los que quedaron como egreso
-- por el valor por omisión del formulario.
UPDATE public.flujos_programados f
SET tipo = p.tipo_movimiento::text
FROM public.presupuestos p
WHERE f.presupuesto_id = p.id
  AND NOT p.es_project
  AND NOT f.auto_generado
  AND p.tipo_movimiento::text IN ('ingreso', 'egreso')
  AND f.tipo IS DISTINCT FROM p.tipo_movimiento::text;

-- 2. p_cambios:
-- {
--   "proyecto": [{ presupuesto_id, proyecto_id, empresa_id, modo, frecuencia,
--                  fecha_inicio, numero_pagos, anticipo_monto, anticipo_fecha,
--                  esperados, pagos: [{ fecha, monto, concepto, es_anticipo }] }],
--   "flujos":   [{ presupuesto_id, empresa_id, tipo, esperados,
--                  filas: [{ id?, fecha, monto, descripcion }], eliminar: [id] }]
--                  (fila con id = flujo vigente que se actualiza; sin id = nuevo)
-- }
-- `esperados` = pagos/flujos vigentes cuando se presentó la propuesta: si no
-- coinciden, alguien los cambió y no se aplica nada.
CREATE OR REPLACE FUNCTION public.rafa_reprogramar_masiva(p_accion_id uuid, p_cambios jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_proy jsonb := coalesce(p_cambios->'proyecto', '[]'::jsonb);
  v_flu jsonb := coalesce(p_cambios->'flujos', '[]'::jsonb);
  v_n integer;
  v_esperados integer;
  v_filas integer;
  v_pagos integer := 0;
  v_flujos integer := 0;
  v_excede text;
  v_resultado jsonb;
BEGIN
  IF jsonb_typeof(v_proy) <> 'array' OR jsonb_typeof(v_flu) <> 'array' THEN
    RAISE EXCEPTION 'Formato de cambios inválido';
  END IF;
  IF jsonb_array_length(v_proy) + jsonb_array_length(v_flu) = 0 THEN
    RAISE EXCEPTION 'No hay partidas que reprogramar';
  END IF;

  CREATE TEMP TABLE _rm_proy ON COMMIT DROP AS
  SELECT x.presupuesto_id, x.proyecto_id, x.empresa_id, coalesce(x.modo, 'manual') AS modo, x.frecuencia,
         x.fecha_inicio, x.numero_pagos, coalesce(x.anticipo_monto, 0) AS anticipo_monto, x.anticipo_fecha,
         coalesce(x.esperados, 0) AS esperados, coalesce(x.pagos, '[]'::jsonb) AS pagos, NULL::uuid AS programacion_id
  FROM jsonb_to_recordset(v_proy) AS x(
    presupuesto_id uuid, proyecto_id uuid, empresa_id uuid, modo text, frecuencia text, fecha_inicio date,
    numero_pagos integer, anticipo_monto numeric, anticipo_fecha date, esperados integer, pagos jsonb);

  CREATE TEMP TABLE _rm_pagos ON COMMIT DROP AS
  SELECT r.presupuesto_id, r.proyecto_id, (p->>'fecha')::date AS fecha, (p->>'monto')::numeric AS monto,
         nullif(p->>'concepto', '') AS concepto, coalesce((p->>'es_anticipo')::boolean, false) AS es_anticipo,
         (o - 1)::integer AS orden
  FROM _rm_proy r, jsonb_array_elements(r.pagos) WITH ORDINALITY AS t(p, o);

  CREATE TEMP TABLE _rm_flu ON COMMIT DROP AS
  SELECT x.presupuesto_id, x.empresa_id, x.tipo, coalesce(x.esperados, 0) AS esperados, coalesce(x.filas, '[]'::jsonb) AS filas,
         coalesce(x.eliminar, '[]'::jsonb) AS eliminar
  FROM jsonb_to_recordset(v_flu) AS x(presupuesto_id uuid, empresa_id uuid, tipo text, esperados integer, filas jsonb, eliminar jsonb);

  CREATE TEMP TABLE _rm_flu_filas ON COMMIT DROP AS
  SELECT r.presupuesto_id, r.empresa_id, r.tipo, nullif(e->>'id', '')::uuid AS id, (e->>'fecha')::date AS fecha,
         round((e->>'monto')::numeric, 2) AS monto, nullif(e->>'descripcion', '') AS descripcion
  FROM _rm_flu r, jsonb_array_elements(r.filas) e;

  IF EXISTS (SELECT 1 FROM (SELECT presupuesto_id FROM _rm_proy UNION ALL SELECT presupuesto_id FROM _rm_flu) t
             GROUP BY presupuesto_id HAVING count(*) > 1 OR presupuesto_id IS NULL) THEN
    RAISE EXCEPTION 'Partidas repetidas o sin identificar en la reprogramación';
  END IF;
  IF EXISTS (SELECT 1 FROM _rm_pagos WHERE fecha IS NULL OR coalesce(monto, 0) <= 0)
     OR EXISTS (SELECT 1 FROM _rm_flu_filas WHERE fecha IS NULL OR coalesce(monto, 0) <= 0) THEN
    RAISE EXCEPTION 'Cada pago requiere fecha y un monto mayor a cero';
  END IF;
  IF EXISTS (SELECT 1 FROM _rm_flu WHERE tipo NOT IN ('ingreso', 'egreso')) THEN
    RAISE EXCEPTION 'Tipo de flujo inválido';
  END IF;

  -- Lo programado no puede superar el presupuesto de la partida.
  SELECT string_agg(p.partida, ', ') INTO v_excede
  FROM public.presupuestos p
  JOIN (SELECT presupuesto_id, sum(monto) AS total FROM _rm_pagos GROUP BY presupuesto_id) t ON t.presupuesto_id = p.id
  WHERE t.total > p.cantidad * p.precio_unitario + 0.01;
  IF v_excede IS NOT NULL THEN
    RAISE EXCEPTION 'Lo programado supera el presupuesto en: %', v_excede;
  END IF;

  ---------------------------------------------------------------------------
  -- Partidas de Proyecto
  ---------------------------------------------------------------------------
  IF jsonb_array_length(v_proy) > 0 THEN
    UPDATE _rm_proy r SET programacion_id = f.id
    FROM public.proyecto_programacion_financiera f WHERE f.presupuesto_id = r.presupuesto_id;

    -- Bloquea las programaciones existentes y verifica que nadie las cambió.
    PERFORM 1 FROM public.proyecto_programacion_financiera f JOIN _rm_proy r ON r.programacion_id = f.id FOR UPDATE OF f;
    SELECT count(*) INTO v_n FROM public.proyecto_programacion_pagos pg JOIN _rm_proy r ON r.programacion_id = pg.programacion_id;
    SELECT coalesce(sum(esperados), 0) INTO v_esperados FROM _rm_proy;
    IF v_n <> v_esperados THEN
      RAISE EXCEPTION 'RAFA_DESACTUALIZADA: los pagos programados cambiaron desde la propuesta';
    END IF;

    UPDATE public.proyecto_programacion_financiera f SET
      proyecto_id = r.proyecto_id,
      empresa_id = r.empresa_id,
      modo = r.modo::programacion_proyecto_modo,
      frecuencia = nullif(r.frecuencia, '')::programacion_proyecto_frecuencia,
      fecha_inicio = r.fecha_inicio,
      numero_pagos = r.numero_pagos,
      tiene_anticipo = r.anticipo_monto > 0,
      anticipo_monto = r.anticipo_monto,
      anticipo_fecha = CASE WHEN r.anticipo_monto > 0 THEN r.anticipo_fecha END,
      updated_by = auth.uid()
    FROM _rm_proy r
    WHERE f.id = r.programacion_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    SELECT count(*) INTO v_n FROM _rm_proy WHERE programacion_id IS NOT NULL;
    IF v_filas <> v_n THEN
      RAISE EXCEPTION 'No tienes permiso para editar la programación financiera de alguno de los proyectos';
    END IF;

    INSERT INTO public.proyecto_programacion_financiera (
      presupuesto_id, proyecto_id, empresa_id, modo, tiene_anticipo, anticipo_monto, anticipo_fecha,
      frecuencia, fecha_inicio, numero_pagos, created_by, updated_by
    )
    SELECT r.presupuesto_id, r.proyecto_id, r.empresa_id, r.modo::programacion_proyecto_modo, r.anticipo_monto > 0,
           r.anticipo_monto, CASE WHEN r.anticipo_monto > 0 THEN r.anticipo_fecha END,
           nullif(r.frecuencia, '')::programacion_proyecto_frecuencia, r.fecha_inicio, r.numero_pagos, auth.uid(), auth.uid()
    FROM _rm_proy r WHERE r.programacion_id IS NULL;

    UPDATE _rm_proy r SET programacion_id = f.id
    FROM public.proyecto_programacion_financiera f WHERE r.programacion_id IS NULL AND f.presupuesto_id = r.presupuesto_id;

    DELETE FROM public.proyecto_programacion_pagos pg USING _rm_proy r WHERE pg.programacion_id = r.programacion_id;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> v_esperados THEN
      RAISE EXCEPTION 'No tienes permiso para reemplazar los pagos programados. No se guardó ningún cambio.';
    END IF;

    INSERT INTO public.proyecto_programacion_pagos (programacion_id, proyecto_id, fecha, monto, concepto, es_anticipo, orden)
    SELECT r.programacion_id, p.proyecto_id, p.fecha, round(p.monto, 2), p.concepto, p.es_anticipo,
           CASE WHEN p.es_anticipo THEN -1 ELSE p.orden END
    FROM _rm_pagos p JOIN _rm_proy r ON r.presupuesto_id = p.presupuesto_id;
    GET DIAGNOSTICS v_pagos = ROW_COUNT;

    -- Bitácora del proyecto: si el usuario no puede registrarla, no bloquea.
    BEGIN
      INSERT INTO public.proyecto_auditoria (proyecto_id, presupuesto_id, user_id, accion, entidad_id, valor_nuevo)
      SELECT r.proyecto_id, r.presupuesto_id, auth.uid(), 'programacion_financiera', r.presupuesto_id,
             format('Reprogramación masiva (Rafa) · %s pagos · %s a %s', jsonb_array_length(r.pagos),
                    (SELECT min(fecha) FROM _rm_pagos p WHERE p.presupuesto_id = r.presupuesto_id),
                    (SELECT max(fecha) FROM _rm_pagos p WHERE p.presupuesto_id = r.presupuesto_id))
      FROM _rm_proy r;
    EXCEPTION WHEN insufficient_privilege OR not_null_violation THEN
      NULL;
    END;
  END IF;

  ---------------------------------------------------------------------------
  -- Partidas que no son de Proyecto (flujos programados capturados a mano)
  ---------------------------------------------------------------------------
  IF jsonb_array_length(v_flu) > 0 THEN
    -- Nadie agregó ni quitó flujos desde la propuesta.
    SELECT coalesce(sum(esperados), 0) INTO v_esperados FROM _rm_flu;
    SELECT count(*) INTO v_n FROM public.flujos_programados f JOIN _rm_flu r ON r.presupuesto_id = f.presupuesto_id
    WHERE NOT f.auto_generado AND f.asiento_movimiento_id IS NULL;
    IF v_n <> v_esperados THEN
      RAISE EXCEPTION 'RAFA_DESACTUALIZADA: los flujos programados cambiaron desde la propuesta';
    END IF;

    UPDATE public.flujos_programados f
    SET fecha = x.fecha, monto = x.monto, tipo = x.tipo, descripcion = x.descripcion
    FROM _rm_flu_filas x
    WHERE x.id IS NOT NULL AND f.id = x.id AND f.presupuesto_id = x.presupuesto_id
      AND NOT f.auto_generado AND f.asiento_movimiento_id IS NULL;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    SELECT count(*) INTO v_n FROM _rm_flu_filas WHERE id IS NOT NULL;
    IF v_filas <> v_n THEN
      RAISE EXCEPTION 'RAFA_DESACTUALIZADA: algún flujo programado ya no existe o no tienes permiso para modificarlo';
    END IF;

    DELETE FROM public.flujos_programados f
    USING _rm_flu r, jsonb_array_elements_text(r.eliminar) e
    WHERE f.id = e::uuid AND f.presupuesto_id = r.presupuesto_id AND NOT f.auto_generado AND f.asiento_movimiento_id IS NULL;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    SELECT coalesce(sum(jsonb_array_length(eliminar)), 0) INTO v_n FROM _rm_flu;
    IF v_filas <> v_n THEN
      RAISE EXCEPTION 'Solo un administrador puede eliminar flujos programados sobrantes. No se guardó ningún cambio.';
    END IF;

    INSERT INTO public.flujos_programados (presupuesto_id, empresa_id, fecha, monto, tipo, descripcion)
    SELECT presupuesto_id, empresa_id, fecha, monto, tipo, descripcion FROM _rm_flu_filas WHERE id IS NULL;

    SELECT count(*) INTO v_flujos FROM _rm_flu_filas;
  END IF;

  v_resultado := jsonb_build_object(
    'partidas_proyecto', jsonb_array_length(v_proy),
    'partidas_flujo', jsonb_array_length(v_flu),
    'pagos', v_pagos,
    'flujos', v_flujos
  );
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.rafa_reprogramar_masiva(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rafa_reprogramar_masiva(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
