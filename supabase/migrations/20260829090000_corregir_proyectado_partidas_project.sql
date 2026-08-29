-- Corrige definitivamente el desfase de Proyectado entre Proyectos y Presupuestos.
--
-- Regla: desde que una partida está marcada es_project=true, su única fuente
-- temporal válida es proyecto_programacion_financiera/proyecto_programacion_pagos.
-- La ausencia de programación propia significa $0; nunca se reutilizan filas
-- históricas de flujos_programados. No se eliminan datos históricos existentes:
-- las consultas vigentes los excluyen y este trigger impide crear nuevos.

-- 1. Bloquear cualquier flujo legacy nuevo para partidas administradas por Project.
-- Conserva el nombre de la función anterior para reemplazar su lógica sin dejar
-- triggers duplicados en instalaciones que ya ejecutaron la migración previa.
CREATE OR REPLACE FUNCTION public.block_flujos_legacy_si_es_project_con_programacion_propia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_es_project boolean;
BEGIN
  -- Flujos automáticos (por ejemplo IVA) sin presupuesto_id no pertenecen a
  -- una partida y conservan su comportamiento actual.
  IF NEW.presupuesto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.es_project
  INTO v_es_project
  FROM public.presupuestos p
  WHERE p.id = NEW.presupuesto_id;

  IF v_es_project IS TRUE THEN
    RAISE EXCEPTION 'Esta partida pertenece a un Proyecto. Su programación se administra exclusivamente desde Proyectos.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_flujos_legacy_proyecto ON public.flujos_programados;
CREATE TRIGGER trg_block_flujos_legacy_proyecto
  BEFORE INSERT OR UPDATE ON public.flujos_programados
  FOR EACH ROW EXECUTE FUNCTION public.block_flujos_legacy_si_es_project_con_programacion_propia();

-- 2. Validar que la programación pertenezca exactamente a la misma empresa,
-- proyecto y centro de negocio de la partida, y que ambos sigan vigentes.
CREATE OR REPLACE FUNCTION public.validar_programacion_partida_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_presupuesto_empresa uuid;
  v_presupuesto_centro uuid;
  v_presupuesto_activo boolean;
  v_es_project boolean;
  v_proyecto_empresa uuid;
  v_proyecto_centro uuid;
  v_proyecto_activo boolean;
BEGIN
  SELECT p.empresa_id, p.centro_negocio_id, p.activo, p.es_project
  INTO v_presupuesto_empresa, v_presupuesto_centro, v_presupuesto_activo, v_es_project
  FROM public.presupuestos p
  WHERE p.id = NEW.presupuesto_id;

  SELECT pr.empresa_id, pr.centro_negocio_id, pr.activo
  INTO v_proyecto_empresa, v_proyecto_centro, v_proyecto_activo
  FROM public.proyectos pr
  WHERE pr.id = NEW.proyecto_id;

  IF v_presupuesto_empresa IS NULL OR v_proyecto_empresa IS NULL THEN
    RAISE EXCEPTION 'Presupuesto o proyecto inexistente';
  END IF;

  IF v_presupuesto_activo IS NOT TRUE OR v_es_project IS NOT TRUE OR v_proyecto_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'La partida y el proyecto deben estar activos y vigentes';
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM v_presupuesto_empresa
     OR NEW.empresa_id IS DISTINCT FROM v_proyecto_empresa
     OR v_presupuesto_centro IS DISTINCT FROM v_proyecto_centro THEN
    RAISE EXCEPTION 'La programación no corresponde a la misma empresa, proyecto y centro de negocio de la partida';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_programacion_partida_project ON public.proyecto_programacion_financiera;
CREATE TRIGGER trg_validar_programacion_partida_project
  BEFORE INSERT OR UPDATE ON public.proyecto_programacion_financiera
  FOR EACH ROW EXECUTE FUNCTION public.validar_programacion_partida_project();

-- 3. Un pago no puede apuntar a un proyecto distinto al de su programación.
CREATE OR REPLACE FUNCTION public.validar_pago_programacion_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proyecto_id uuid;
BEGIN
  SELECT ppf.proyecto_id
  INTO v_proyecto_id
  FROM public.proyecto_programacion_financiera ppf
  WHERE ppf.id = NEW.programacion_id;

  IF v_proyecto_id IS NULL OR NEW.proyecto_id IS DISTINCT FROM v_proyecto_id THEN
    RAISE EXCEPTION 'El pago no corresponde al proyecto de su programación financiera';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_pago_programacion_project ON public.proyecto_programacion_pagos;
CREATE TRIGGER trg_validar_pago_programacion_project
  BEFORE INSERT OR UPDATE ON public.proyecto_programacion_pagos
  FOR EACH ROW EXECUTE FUNCTION public.validar_pago_programacion_project();
