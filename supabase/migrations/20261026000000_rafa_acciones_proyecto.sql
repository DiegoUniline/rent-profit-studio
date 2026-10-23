-- Acciones nuevas de Rafa (siempre tras confirmación del usuario): cronograma de
-- partida, programación financiera de partida de proyecto, alta de terceros con
-- RFC y accesos a proyectos. Mismo patrón que las demás rafa_*: SECURITY
-- INVOKER (RLS del usuario), una transacción y rafa_registrar_ejecucion para que
-- un reintento no repita efectos. Requiere 20261025000000 (guardar_programacion_partida).
-- Idempotente: seguro de re-ejecutar.

CREATE OR REPLACE FUNCTION public.rafa_actualizar_cronograma(p_accion_id uuid, p_cambio jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  PERFORM public.actualizar_cronograma_partida(
    (p_cambio->>'presupuesto_id')::uuid,
    nullif(p_cambio->>'fecha_inicio', '')::date,
    nullif(p_cambio->>'fecha_fin', '')::date,
    nullif(p_cambio->>'avance_manual', '')::numeric
  );
  v_resultado := jsonb_build_object('presupuesto_id', p_cambio->>'presupuesto_id');
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.rafa_guardar_programacion_partida(p_accion_id uuid, p_datos jsonb, p_pagos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  -- La acción confirmada es la clave de operación del guardado atómico.
  v_resultado := public.guardar_programacion_partida(p_accion_id, p_datos, p_pagos);
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.rafa_crear_tercero(p_accion_id uuid, p_tercero jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid := (p_tercero->>'empresa_id')::uuid;
  v_rfc text := upper(regexp_replace(coalesce(p_tercero->>'rfc', ''), '\s', '', 'g'));
  v_id uuid;
  v_resultado jsonb;
BEGIN
  IF v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
    RAISE EXCEPTION 'RFC con formato inválido: %', v_rfc;
  END IF;
  IF coalesce(trim(p_tercero->>'razon_social'), '') = '' THEN
    RAISE EXCEPTION 'La razón social es requerida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.terceros WHERE empresa_id = v_empresa AND rfc = v_rfc) THEN
    RAISE EXCEPTION 'Ya existe un tercero con RFC % en la empresa', v_rfc;
  END IF;
  INSERT INTO public.terceros (empresa_id, tipo, rfc, razon_social, nombre_comercial, email, telefono)
  VALUES (v_empresa, p_tercero->>'tipo', v_rfc, trim(p_tercero->>'razon_social'), nullif(p_tercero->>'nombre_comercial', ''),
          nullif(p_tercero->>'email', ''), nullif(p_tercero->>'telefono', ''))
  RETURNING id INTO v_id;
  v_resultado := jsonb_build_object('tercero_id', v_id, 'rfc', v_rfc);
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.rafa_asignar_acceso_proyecto(p_accion_id uuid, p_acceso jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_proyecto uuid := (p_acceso->>'proyecto_id')::uuid;
  v_usuario uuid := (p_acceso->>'user_id')::uuid;
  v_empresa uuid;
  v_filas integer;
  v_resultado jsonb;
BEGIN
  SELECT empresa_id INTO v_empresa FROM public.proyectos WHERE id = v_proyecto;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'El proyecto no existe';
  END IF;
  IF coalesce((p_acceso->>'quitar')::boolean, false) THEN
    DELETE FROM public.proyecto_usuarios WHERE proyecto_id = v_proyecto AND user_id = v_usuario;
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'No se pudo quitar el acceso (no existe o no tienes permiso)';
    END IF;
    v_resultado := jsonb_build_object('proyecto_id', v_proyecto, 'user_id', v_usuario, 'quitado', true);
  ELSE
    INSERT INTO public.proyecto_usuarios (proyecto_id, user_id, empresa_id, created_by, ver_programacion_financiera, editar_cronograma, editar_programacion_financiera)
    VALUES (v_proyecto, v_usuario, v_empresa, auth.uid(),
            coalesce((p_acceso->>'ver_programacion_financiera')::boolean, false),
            coalesce((p_acceso->>'editar_cronograma')::boolean, false),
            coalesce((p_acceso->>'editar_programacion_financiera')::boolean, false))
    ON CONFLICT (proyecto_id, user_id) DO UPDATE SET
      ver_programacion_financiera = EXCLUDED.ver_programacion_financiera,
      editar_cronograma = EXCLUDED.editar_cronograma,
      editar_programacion_financiera = EXCLUDED.editar_programacion_financiera;
    v_resultado := jsonb_build_object('proyecto_id', v_proyecto, 'user_id', v_usuario, 'quitado', false);
  END IF;
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.rafa_actualizar_cronograma(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_guardar_programacion_partida(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_crear_tercero(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rafa_asignar_acceso_proyecto(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rafa_actualizar_cronograma(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_guardar_programacion_partida(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_crear_tercero(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rafa_asignar_acceso_proyecto(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
