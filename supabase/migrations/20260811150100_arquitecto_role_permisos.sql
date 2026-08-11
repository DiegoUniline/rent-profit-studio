-- Permisos del rol "arquitecto":
-- - Ve todos los proyectos, sus tareas y la programación financiera, sin
--   necesidad de asignación individual vía proyecto_usuarios (igual que
--   admin/contador para efectos de SELECT).
-- - Solo puede editar el cronograma (fecha_inicio/fecha_fin/avance_manual) de
--   las partidas, mediante el mismo RPC actualizar_cronograma_partida que ya
--   usa el rol 'usuario' con el permiso editar_cronograma; nunca puede tocar
--   cantidad/precio_unitario/cuenta ni la programación financiera
--   (proyecto_programacion_financiera/proyecto_programacion_pagos), cuyas
--   políticas de escritura no se tocan aquí.

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

-- proyecto_programacion_financiera / proyecto_programacion_pagos: arquitecto
-- puede ver la programación financiera de cualquier proyecto (solo lectura;
-- las políticas de escritura siguen sin incluir a arquitecto).
DROP POLICY IF EXISTS "Ver programación financiera del proyecto" ON public.proyecto_programacion_financiera;
CREATE POLICY "Ver programación financiera del proyecto"
ON public.proyecto_programacion_financiera
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador') OR has_role(auth.uid(), 'arquitecto')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_financiera.proyecto_id
      AND pu.user_id = auth.uid() AND pu.ver_programacion_financiera
  )
);

DROP POLICY IF EXISTS "Ver pagos programados del proyecto" ON public.proyecto_programacion_pagos;
CREATE POLICY "Ver pagos programados del proyecto"
ON public.proyecto_programacion_pagos
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador') OR has_role(auth.uid(), 'arquitecto')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_pagos.proyecto_id
      AND pu.user_id = auth.uid() AND pu.ver_programacion_financiera
  )
);

-- RPC actualizar_cronograma_partida: arquitecto autorizado en cualquier
-- proyecto (sin depender de proyecto_usuarios.editar_cronograma). El RPC solo
-- escribe fecha_inicio/fecha_fin/avance_manual, nunca montos.
CREATE OR REPLACE FUNCTION public.actualizar_cronograma_partida(
  _presupuesto_id uuid,
  _fecha_inicio date,
  _fecha_fin date,
  _avance_manual numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _centro uuid;
  _autorizado boolean;
BEGIN
  SELECT centro_negocio_id INTO _centro FROM public.presupuestos WHERE id = _presupuesto_id;
  IF _centro IS NULL THEN
    RAISE EXCEPTION 'Partida no encontrada';
  END IF;

  SELECT
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador') OR has_role(auth.uid(), 'arquitecto')
    OR EXISTS (
      SELECT 1 FROM public.proyectos pr
      JOIN public.proyecto_usuarios pu ON pu.proyecto_id = pr.id
      WHERE pr.centro_negocio_id = _centro
        AND pu.user_id = auth.uid() AND pu.editar_cronograma
    )
  INTO _autorizado;

  IF NOT _autorizado THEN
    RAISE EXCEPTION 'No autorizado para editar el cronograma de esta partida';
  END IF;

  IF _avance_manual IS NOT NULL AND (_avance_manual < 0 OR _avance_manual > 100) THEN
    RAISE EXCEPTION 'El avance debe estar entre 0 y 100';
  END IF;

  UPDATE public.presupuestos
  SET fecha_inicio = _fecha_inicio, fecha_fin = _fecha_fin, avance_manual = _avance_manual
  WHERE id = _presupuesto_id;
END;
$$;
