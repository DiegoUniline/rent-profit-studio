-- Permisos del rol "arquitecto":
-- - Ve todos los proyectos y sus tareas (igual que admin/contador, sin necesidad
--   de asignación individual vía proyecto_usuarios).
-- - Puede actualizar presupuestos, pero un trigger restringe esa actualización
--   a únicamente fecha_inicio/fecha_fin (no puede tocar montos, cuenta, etc.).
-- - No se le otorga ningún permiso sobre asientos_contables, asiento_movimientos
--   ni flujos_programados (programación) más allá del SELECT abierto que ya
--   tienen todos los usuarios autenticados; sigue sin poder insertar/editar/borrar ahí.

-- proyectos: arquitecto ve todos los proyectos
DROP POLICY IF EXISTS "Admins, contadores y usuarios asignados pueden ver proyectos" ON public.proyectos;
CREATE POLICY "Admins, contadores, arquitectos y usuarios asignados pueden ver proyectos"
ON public.proyectos
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador') OR has_role(auth.uid(), 'arquitecto')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyectos.id AND pu.user_id = auth.uid()
  )
);

-- proyecto_tareas: arquitecto ve todas las tareas de todos los proyectos
DROP POLICY IF EXISTS "Admins, contadores y usuarios asignados pueden ver tareas" ON public.proyecto_tareas;
CREATE POLICY "Admins, contadores, arquitectos y usuarios asignados pueden ver tareas"
ON public.proyecto_tareas
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador') OR has_role(auth.uid(), 'arquitecto')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_tareas.proyecto_id AND pu.user_id = auth.uid()
  )
);

-- presupuestos: arquitecto puede actualizar (columnas restringidas por trigger)
CREATE POLICY "Arquitectos pueden actualizar fechas de presupuestos"
ON public.presupuestos
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'arquitecto'))
WITH CHECK (has_role(auth.uid(), 'arquitecto'));

CREATE OR REPLACE FUNCTION public.restrict_arquitecto_presupuestos_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'arquitecto')
     AND NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'))
  THEN
    IF NEW.cantidad IS DISTINCT FROM OLD.cantidad
       OR NEW.precio_unitario IS DISTINCT FROM OLD.precio_unitario
       OR NEW.partida IS DISTINCT FROM OLD.partida
       OR NEW.cuenta_id IS DISTINCT FROM OLD.cuenta_id
       OR NEW.tercero_id IS DISTINCT FROM OLD.tercero_id
       OR NEW.centro_negocio_id IS DISTINCT FROM OLD.centro_negocio_id
       OR NEW.unidad_medida_id IS DISTINCT FROM OLD.unidad_medida_id
       OR NEW.notas IS DISTINCT FROM OLD.notas
       OR NEW.activo IS DISTINCT FROM OLD.activo
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.es_project IS DISTINCT FROM OLD.es_project
       OR NEW.responsable_tercero_id IS DISTINCT FROM OLD.responsable_tercero_id
    THEN
      RAISE EXCEPTION 'El rol arquitecto solo puede modificar fecha_inicio y fecha_fin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_arquitecto_presupuestos_update ON public.presupuestos;
CREATE TRIGGER trg_restrict_arquitecto_presupuestos_update
  BEFORE UPDATE ON public.presupuestos
  FOR EACH ROW EXECUTE FUNCTION public.restrict_arquitecto_presupuestos_update();
