-- Rafa: rafa_guardar_plan guarda tipo_movimiento (ingreso/egreso) de la programación.
CREATE OR REPLACE FUNCTION public.rafa_guardar_plan(p_operacion uuid, p_plan jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_previo jsonb;
  v_empresa uuid := nullif(p_plan->>'empresa_id', '')::uuid;
  v_centro jsonb := coalesce(p_plan->'centro', '{}'::jsonb);
  v_tercero jsonb := coalesce(p_plan->'tercero', '{}'::jsonb);
  v_centro_id uuid := nullif(v_centro->>'id', '')::uuid;
  v_tercero_id uuid;
  v_modo_tercero text := coalesce(v_tercero->>'modo', 'ninguno');
  v_rfc text;
  v_nombre text;
  v_p jsonb;
  v_f jsonb;
  v_id uuid;
  v_es_project boolean;
  v_orden integer;
  v_filas integer;
  v_esperadas integer;
  v_ids uuid[] := '{}';
  v_previos uuid[];
  v_sobrantes uuid[];
  v_creadas integer := 0;
  v_actualizadas integer := 0;
  v_bajas integer := 0;
  v_flujos integer := 0;
  v_omitidas integer := 0;
  v_resultado jsonb;
BEGIN
  IF p_operacion IS NULL THEN
    RAISE EXCEPTION 'Falta la clave de operación del guardado';
  END IF;

  -- Doble clic o reintento con la misma clave: espera al primero y devuelve su resultado.
  PERFORM pg_advisory_xact_lock(hashtextextended('rafa_guardar_plan:' || p_operacion::text, 0));
  SELECT resultado INTO v_previo FROM public.rafa_plan_guardados WHERE operacion_id = p_operacion;
  IF FOUND THEN
    RETURN v_previo || jsonb_build_object('repetido', true);
  END IF;

  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Selecciona la empresa.';
  END IF;
  IF jsonb_typeof(p_plan->'partidas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'partidas') = 0 THEN
    RAISE EXCEPTION 'No hay partidas que guardar.';
  END IF;

  -- 1. Centro de negocio
  IF v_centro_id IS NULL THEN
    v_nombre := trim(coalesce(v_centro->>'nombre', ''));
    IF v_nombre = '' THEN
      RAISE EXCEPTION 'Escribe el nombre del centro de negocio.';
    END IF;
    INSERT INTO public.centros_negocio (empresa_id, codigo, nombre, tipo_actividad)
    VALUES (
      v_empresa,
      lpad((coalesce((
        SELECT max(nullif(regexp_replace(codigo, '\D', '', 'g'), '')::bigint)
        FROM public.centros_negocio WHERE empresa_id = v_empresa
      ), 0) + 1)::text, 3, '0'),
      v_nombre,
      nullif(v_centro->>'tipo_actividad', '')
    ) RETURNING id INTO v_centro_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.centros_negocio WHERE id = v_centro_id AND empresa_id = v_empresa) THEN
      RAISE EXCEPTION 'El centro de negocio no existe en la empresa seleccionada.';
    END IF;
    -- Centro creado por esta misma interpretación: se actualiza su nombre.
    IF coalesce((v_centro->>'actualizar')::boolean, false) AND trim(coalesce(v_centro->>'nombre', '')) <> '' THEN
      UPDATE public.centros_negocio
      SET nombre = trim(v_centro->>'nombre'), tipo_actividad = nullif(v_centro->>'tipo_actividad', '')
      WHERE id = v_centro_id;
    END IF;
  END IF;

  -- 2. Tercero
  IF v_modo_tercero = 'existente' THEN
    v_tercero_id := nullif(v_tercero->>'id', '')::uuid;
    IF v_tercero_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.terceros WHERE id = v_tercero_id AND empresa_id = v_empresa) THEN
      RAISE EXCEPTION 'Selecciona un tercero existente de la empresa.';
    END IF;
  ELSIF v_modo_tercero = 'nuevo' THEN
    v_nombre := trim(coalesce(v_tercero->>'nombre', ''));
    IF v_nombre = '' THEN
      RAISE EXCEPTION 'Escribe el nombre del tercero.';
    END IF;
    v_tercero_id := nullif(v_tercero->>'id', '')::uuid;
    IF v_tercero_id IS NOT NULL THEN
      -- Creado por esta misma interpretación en un guardado anterior.
      UPDATE public.terceros SET razon_social = v_nombre WHERE id = v_tercero_id AND empresa_id = v_empresa;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas = 0 THEN
        v_tercero_id := NULL;
      END IF;
    END IF;
    IF v_tercero_id IS NULL THEN
      -- Mismo nombre en la empresa: se reutiliza, no se duplica.
      SELECT id INTO v_tercero_id FROM public.terceros
      WHERE empresa_id = v_empresa AND lower(trim(razon_social)) = lower(v_nombre)
      ORDER BY activo DESC, created_at LIMIT 1;
    END IF;
    IF v_tercero_id IS NULL THEN
      v_rfc := upper(trim(coalesce(nullif(v_tercero->>'rfc', ''), 'XAXX010101000')));
      IF EXISTS (SELECT 1 FROM public.terceros WHERE empresa_id = v_empresa AND rfc = v_rfc) THEN
        RAISE EXCEPTION 'Ya existe un tercero con RFC % en esta empresa (%). Escribe el RFC del tercero nuevo, elige uno existente o guarda sin tercero. No se guardó ningún cambio.',
          v_rfc, (SELECT razon_social FROM public.terceros WHERE empresa_id = v_empresa AND rfc = v_rfc LIMIT 1);
      END IF;
      INSERT INTO public.terceros (empresa_id, tipo, rfc, razon_social)
      VALUES (v_empresa, CASE WHEN v_tercero->>'tipo' = 'cliente' THEN 'cliente' ELSE 'proveedor' END, v_rfc, v_nombre)
      RETURNING id INTO v_tercero_id;
    END IF;
  END IF;

  -- 3. Partidas: con id se actualizan en sitio; sin id se crean.
  SELECT coalesce(max(orden), 0) INTO v_orden FROM public.presupuestos WHERE empresa_id = v_empresa;
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_plan->'partidas') LOOP
    IF trim(coalesce(v_p->>'partida', '')) = '' THEN
      RAISE EXCEPTION 'Hay una partida sin descripción.';
    END IF;
    IF (v_p->>'cantidad')::numeric IS NULL OR (v_p->>'cantidad')::numeric <= 0 THEN
      RAISE EXCEPTION 'La cantidad de "%" debe ser mayor a 0.', v_p->>'partida';
    END IF;
    IF (v_p->>'precio_unitario')::numeric IS NULL OR (v_p->>'precio_unitario')::numeric < 0 THEN
      RAISE EXCEPTION 'El precio de "%" no puede ser negativo.', v_p->>'partida';
    END IF;

    v_id := nullif(v_p->>'id', '')::uuid;
    IF v_id IS NOT NULL THEN
      IF v_id = ANY (v_ids) THEN
        RAISE EXCEPTION 'Una partida viene repetida en el guardado.';
      END IF;
      UPDATE public.presupuestos SET
        partida = left(trim(v_p->>'partida'), 500),
        cuenta_id = nullif(v_p->>'cuenta_id', '')::uuid,
        tercero_id = v_tercero_id,
        cantidad = (v_p->>'cantidad')::numeric,
        precio_unitario = (v_p->>'precio_unitario')::numeric,
        notas = nullif(v_p->>'notas', ''),
        tipo_movimiento = coalesce(nullif(v_p->>'tipo_movimiento', '')::public.tipo_movimiento_flujo, tipo_movimiento),
        centro_negocio_id = v_centro_id,
        activo = true,
        updated_at = now()
      WHERE id = v_id AND empresa_id = v_empresa;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> 1 THEN
        RAISE EXCEPTION 'La partida "%" ya no existe o no tienes permiso para modificarla. No se guardó ningún cambio.', v_p->>'partida';
      END IF;
      v_actualizadas := v_actualizadas + 1;
    ELSE
      v_orden := v_orden + 1;
      BEGIN
        INSERT INTO public.presupuestos (
          empresa_id, centro_negocio_id, cuenta_id, tercero_id, partida, cantidad, precio_unitario, notas, orden, activo, tipo_movimiento
        ) VALUES (
          v_empresa, v_centro_id, nullif(v_p->>'cuenta_id', '')::uuid, v_tercero_id,
          left(trim(v_p->>'partida'), 500), (v_p->>'cantidad')::numeric, (v_p->>'precio_unitario')::numeric,
          nullif(v_p->>'notas', ''), v_orden, true,
          nullif(v_p->>'tipo_movimiento', '')::public.tipo_movimiento_flujo
        ) RETURNING id INTO v_id;
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE EXCEPTION 'Solo un administrador puede crear partidas de presupuesto. No se guardó ningún cambio.';
      END;
      v_creadas := v_creadas + 1;
    END IF;
    v_ids := v_ids || v_id;
  END LOOP;

  -- 4. Partidas que esta interpretación había guardado y el usuario quitó: baja.
  SELECT coalesce(array_agg(x::uuid), '{}') INTO v_previos
  FROM jsonb_array_elements_text(coalesce(p_plan->'previos', '[]'::jsonb)) AS t(x)
  WHERE x <> '';
  SELECT coalesce(array_agg(id), '{}') INTO v_sobrantes
  FROM public.presupuestos
  WHERE id = ANY (v_previos) AND NOT (id = ANY (v_ids)) AND empresa_id = v_empresa AND activo;

  IF array_length(v_sobrantes, 1) > 0 THEN
    SELECT count(*) INTO v_esperadas FROM public.flujos_programados
    WHERE presupuesto_id = ANY (v_sobrantes) AND NOT auto_generado;
    DELETE FROM public.flujos_programados WHERE presupuesto_id = ANY (v_sobrantes) AND NOT auto_generado;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> v_esperadas THEN
      RAISE EXCEPTION 'No tienes permiso para quitar pagos programados (solo administradores). No se guardó ningún cambio.';
    END IF;
    UPDATE public.presupuestos SET activo = false, updated_at = now() WHERE id = ANY (v_sobrantes);
    GET DIAGNOSTICS v_bajas = ROW_COUNT;
  END IF;

  -- 5. Flujos: se regeneran los de cada partida vigente. Las partidas de
  -- Proyecto se omiten: su programación vive en Proyectos.
  FOR i IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    v_id := v_ids[i];
    v_p := p_plan->'partidas'->(i - 1);
    SELECT es_project INTO v_es_project FROM public.presupuestos WHERE id = v_id;
    IF v_es_project THEN
      v_omitidas := v_omitidas + 1;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_esperadas FROM public.flujos_programados WHERE presupuesto_id = v_id AND NOT auto_generado;
    IF v_esperadas > 0 THEN
      DELETE FROM public.flujos_programados WHERE presupuesto_id = v_id AND NOT auto_generado;
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> v_esperadas THEN
        RAISE EXCEPTION 'No tienes permiso para reemplazar pagos programados (solo administradores). No se guardó ningún cambio.';
      END IF;
    END IF;

    FOR v_f IN SELECT * FROM jsonb_array_elements(coalesce(v_p->'flujos', '[]'::jsonb)) LOOP
      IF (v_f->>'monto')::numeric > 0 THEN
        INSERT INTO public.flujos_programados (presupuesto_id, empresa_id, fecha, monto, tipo, descripcion)
        VALUES (v_id, v_empresa, (v_f->>'fecha')::date, (v_f->>'monto')::numeric, v_f->>'tipo', nullif(v_f->>'descripcion', ''));
        v_flujos := v_flujos + 1;
      END IF;
    END LOOP;
  END LOOP;

  v_resultado := jsonb_build_object(
    'centro_id', v_centro_id,
    'tercero_id', v_tercero_id,
    'presupuesto_ids', to_jsonb(v_ids),
    'creadas', v_creadas,
    'actualizadas', v_actualizadas,
    'bajas', v_bajas,
    'flujos', v_flujos,
    'omitidas_proyecto', v_omitidas
  );

  INSERT INTO public.rafa_plan_guardados (operacion_id, user_id, resultado)
  VALUES (p_operacion, auth.uid(), v_resultado);

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.rafa_guardar_plan(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rafa_guardar_plan(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
