-- Módulo Project: tareas de gestión/operación por Project.
-- Independientes de las partidas presupuestales (no se ligan a presupuestos).

CREATE TYPE tarea_estado AS ENUM ('pendiente', 'en_progreso', 'bloqueada', 'hecho');

CREATE TABLE public.proyecto_tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  notas text,
  responsable_tercero_id uuid REFERENCES public.terceros(id) ON DELETE SET NULL,
  fecha_vencimiento date,
  estado tarea_estado NOT NULL DEFAULT 'pendiente',
  color text,
  orden integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proyecto_tareas_proyecto ON public.proyecto_tareas (proyecto_id);
CREATE INDEX idx_proyecto_tareas_estado ON public.proyecto_tareas (proyecto_id, estado);

CREATE TRIGGER update_proyecto_tareas_updated_at
  BEFORE UPDATE ON public.proyecto_tareas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.proyecto_tareas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins, contadores y usuarios asignados pueden ver tareas"
ON public.proyecto_tareas
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_tareas.proyecto_id AND pu.user_id = auth.uid()
  )
);

CREATE POLICY "Admins y contadores pueden crear tareas"
ON public.proyecto_tareas
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));

CREATE POLICY "Admins y contadores pueden actualizar tareas"
ON public.proyecto_tareas
FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));

CREATE POLICY "Admins y contadores pueden eliminar tareas"
ON public.proyecto_tareas
FOR DELETE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));
