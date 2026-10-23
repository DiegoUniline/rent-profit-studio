-- Dar de baja / reactivar registros (baja lógica: activo/activa = false) desde
-- la aplicación y desde Rafa, con una sola función transaccional.
--
-- Centros de negocio: la baja puede ir "en cascada" a sus partidas activas y a
-- su proyecto; bajas_en_cascada recuerda exactamente qué se dio de baja con el
-- centro para que reactivarlo restaure eso mismo (y no partidas que ya estaban
-- dadas de baja antes por otro motivo).
-- SECURITY INVOKER: aplican las políticas RLS vigentes (admin/contador).
-- Idempotente: seguro de re-ejecutar.

CREATE TABLE IF NOT EXISTS public.bajas_en_cascada (
  centro_negocio_id uuid NOT NULL REFERENCES public.centros_negocio(id) ON DELETE CASCADE,
  entidad text NOT NULL CHECK (entidad IN ('presupuesto', 'proyecto')),
  registro_id uuid NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (centro_negocio_id, entidad, registro_id)
);
ALTER TABLE public.bajas_en_cascada ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Contables gestionan bajas en cascada" ON public.bajas_en_cascada;
CREATE POLICY "Contables gestionan bajas en cascada" ON public.bajas_en_cascada FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));
GRANT SELECT, INSERT, DELETE ON public.bajas_en_cascada TO authenticated;
GRANT ALL ON public.bajas_en_cascada TO service_role;

-- p_entidad: centro_negocio | presupuesto | tercero | cuenta | proyecto | empresa | unidad
CREATE OR REPLACE FUNCTION public.cambiar_activo(p_entidad text, p_id uuid, p_activo boolean, p_en_cascada boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tabla text;
  v_columna text := 'activo';
  v_filas integer;
  v_partidas integer := 0;
  v_proyectos integer := 0;
BEGIN
  CASE p_entidad
    WHEN 'centro_negocio' THEN v_tabla := 'centros_negocio';
    WHEN 'presupuesto' THEN v_tabla := 'presupuestos';
    WHEN 'tercero' THEN v_tabla := 'terceros';
    WHEN 'proyecto' THEN v_tabla := 'proyectos';
    WHEN 'cuenta' THEN v_tabla := 'cuentas_contables'; v_columna := 'activa';
    WHEN 'empresa' THEN v_tabla := 'empresas'; v_columna := 'activa';
    WHEN 'unidad' THEN v_tabla := 'unidades_medida'; v_columna := 'activa';
    ELSE RAISE EXCEPTION 'No se puede dar de baja: tipo de registro desconocido (%)', p_entidad;
  END CASE;

  EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', v_tabla, v_columna) USING p_activo, p_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'El registro no existe o no tienes permiso para darlo de baja o reactivarlo';
  END IF;

  IF p_entidad = 'centro_negocio' AND p_en_cascada THEN
    IF NOT p_activo THEN
      -- Baja: partidas activas y proyecto del centro, recordando cuáles fueron.
      INSERT INTO public.bajas_en_cascada (centro_negocio_id, entidad, registro_id)
      SELECT p_id, 'presupuesto', id FROM public.presupuestos WHERE centro_negocio_id = p_id AND activo
      ON CONFLICT DO NOTHING;
      UPDATE public.presupuestos SET activo = false WHERE centro_negocio_id = p_id AND activo;
      GET DIAGNOSTICS v_partidas = ROW_COUNT;
      INSERT INTO public.bajas_en_cascada (centro_negocio_id, entidad, registro_id)
      SELECT p_id, 'proyecto', id FROM public.proyectos WHERE centro_negocio_id = p_id AND activo
      ON CONFLICT DO NOTHING;
      UPDATE public.proyectos SET activo = false WHERE centro_negocio_id = p_id AND activo;
      GET DIAGNOSTICS v_proyectos = ROW_COUNT;
    ELSE
      -- Reactivación: solo lo que se dio de baja junto con el centro.
      UPDATE public.presupuestos SET activo = true
      WHERE id IN (SELECT registro_id FROM public.bajas_en_cascada WHERE centro_negocio_id = p_id AND entidad = 'presupuesto') AND NOT activo;
      GET DIAGNOSTICS v_partidas = ROW_COUNT;
      UPDATE public.proyectos SET activo = true
      WHERE id IN (SELECT registro_id FROM public.bajas_en_cascada WHERE centro_negocio_id = p_id AND entidad = 'proyecto') AND NOT activo;
      GET DIAGNOSTICS v_proyectos = ROW_COUNT;
      DELETE FROM public.bajas_en_cascada WHERE centro_negocio_id = p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('entidad', p_entidad, 'id', p_id, 'activo', p_activo, 'partidas', v_partidas, 'proyectos', v_proyectos);
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_activo(text, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_activo(text, uuid, boolean, boolean) TO authenticated;

-- Acción de Rafa (tras confirmación del usuario).
CREATE OR REPLACE FUNCTION public.rafa_cambiar_activo(p_accion_id uuid, p_cambio jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb;
BEGIN
  v_resultado := public.cambiar_activo(
    p_cambio->>'entidad',
    (p_cambio->>'id')::uuid,
    (p_cambio->>'activo')::boolean,
    coalesce((p_cambio->>'en_cascada')::boolean, false)
  );
  PERFORM public.rafa_registrar_ejecucion(p_accion_id, v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.rafa_cambiar_activo(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rafa_cambiar_activo(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
