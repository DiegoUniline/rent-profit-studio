-- Módulo Project: seguimiento financiero/operativo por Centro de Negocio
-- Reutiliza presupuestos (partidas), flujos_programados (programación) y terceros
-- (catálogo de responsables). No duplica ninguna entidad existente.

-- 1. presupuestos: marca explícita de partida incluida en Project + responsable
ALTER TABLE public.presupuestos
  ADD COLUMN es_project boolean NOT NULL DEFAULT false,
  ADD COLUMN responsable_tercero_id uuid REFERENCES public.terceros(id) ON DELETE SET NULL;

CREATE INDEX idx_presupuestos_es_project ON public.presupuestos (centro_negocio_id) WHERE es_project = true;

-- 2. proyectos: un Project = un Centro de Negocio
CREATE TABLE public.proyectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  centro_negocio_id uuid NOT NULL UNIQUE REFERENCES public.centros_negocio(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_proyectos_empresa ON public.proyectos (empresa_id);

CREATE TRIGGER update_proyectos_updated_at
  BEFORE UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;

-- 3. proyecto_usuarios: acceso exclusivo por Project para usuarios de solo lectura
CREATE TABLE public.proyecto_usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proyecto_id, user_id)
);

CREATE INDEX idx_proyecto_usuarios_user ON public.proyecto_usuarios (user_id);
CREATE INDEX idx_proyecto_usuarios_proyecto ON public.proyecto_usuarios (proyecto_id);

ALTER TABLE public.proyecto_usuarios ENABLE ROW LEVEL SECURITY;

-- RLS: proyectos
-- admin/contador ven y gestionan todo; un usuario con rol 'usuario' solo ve
-- los Projects a los que fue asignado explícitamente en proyecto_usuarios.
CREATE POLICY "Admins, contadores y usuarios asignados pueden ver proyectos"
ON public.proyectos
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyectos.id AND pu.user_id = auth.uid()
  )
);

CREATE POLICY "Admins y contadores pueden crear proyectos"
ON public.proyectos
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));

CREATE POLICY "Admins y contadores pueden actualizar proyectos"
ON public.proyectos
FOR UPDATE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));

CREATE POLICY "Admins pueden eliminar proyectos"
ON public.proyectos
FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- RLS: proyecto_usuarios
-- Gestionar accesos es una acción de administrador; cada usuario puede ver
-- únicamente sus propias asignaciones.
CREATE POLICY "Admins ven todas las asignaciones, usuarios ven las propias"
ON public.proyecto_usuarios
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR user_id = auth.uid()
);

CREATE POLICY "Solo admins gestionan accesos a proyectos"
ON public.proyecto_usuarios
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));
