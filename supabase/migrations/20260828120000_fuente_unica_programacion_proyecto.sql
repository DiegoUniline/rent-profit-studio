-- Fuente única de verdad para la programación temporal de partidas de Proyecto.
--
-- Contexto: existían dos mecanismos de programación temporal por partida
-- (flujos_programados, el legacy de Presupuestos; y
-- proyecto_programacion_financiera/proyecto_programacion_pagos, el propio del
-- módulo Proyectos). Una vez que una partida tiene programación propia de
-- Proyecto, esa debe ser su ÚNICA fuente. Esta migración:
--
-- 1. Limpia flujos_programados huérfanos en el momento en que se crea la
--    programación propia de una partida (evita que sobrevivan indefinidamente).
-- 2. Bloquea a nivel de base de datos (no solo de UI) escribir en
--    flujos_programados para una partida que ya tiene programación propia
--    activa — no permite que existan dos proyecciones simultáneas.
-- 3. Registra auditoría automática de cambios al presupuesto autorizado
--    (cantidad/precio_unitario) y al toggle es_project (que es el mecanismo
--    real de "convertir en Proyecto"), hoy sin ningún rastro.
--
-- Idempotente: seguro de re-ejecutar completo.

-- 1. Limpieza de flujos_programados huérfanos al crear programación propia -----

CREATE OR REPLACE FUNCTION public.cleanup_flujos_legacy_al_crear_programacion_propia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.flujos_programados WHERE presupuesto_id = NEW.presupuesto_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_flujos_legacy ON public.proyecto_programacion_financiera;
CREATE TRIGGER trg_cleanup_flujos_legacy
  AFTER INSERT ON public.proyecto_programacion_financiera
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_flujos_legacy_al_crear_programacion_propia();

-- 2. Bloqueo de escritura en flujos_programados para partidas ya administradas
--    exclusivamente desde Proyectos -------------------------------------------

CREATE OR REPLACE FUNCTION public.block_flujos_legacy_si_es_project_con_programacion_propia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_es_project boolean;
  v_tiene_programacion_propia boolean;
BEGIN
  -- Flujos auto-generados de IVA (sync_iva_flujos_trigger) no llevan
  -- presupuesto_id: no aplica esta regla, no se tocan.
  IF NEW.presupuesto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT es_project INTO v_es_project FROM public.presupuestos WHERE id = NEW.presupuesto_id;

  -- Partida que no es de un Proyecto: sigue la lógica actual, sin cambios.
  IF v_es_project IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.proyecto_programacion_financiera WHERE presupuesto_id = NEW.presupuesto_id
  ) INTO v_tiene_programacion_propia;

  IF v_tiene_programacion_propia THEN
    RAISE EXCEPTION 'Esta partida es de un Proyecto con programación financiera propia. La programación se administra desde Proyectos.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_flujos_legacy_proyecto ON public.flujos_programados;
CREATE TRIGGER trg_block_flujos_legacy_proyecto
  BEFORE INSERT OR UPDATE ON public.flujos_programados
  FOR EACH ROW EXECUTE FUNCTION public.block_flujos_legacy_si_es_project_con_programacion_propia();

-- 3. Auditoría automática de presupuesto autorizado y del toggle es_project ----

ALTER TABLE public.proyecto_auditoria ALTER COLUMN proyecto_id DROP NOT NULL;
ALTER TABLE public.proyecto_auditoria
  ADD COLUMN IF NOT EXISTS presupuesto_id uuid REFERENCES public.presupuestos(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.audit_presupuesto_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_proyecto_id uuid;
BEGIN
  -- Sin usuario autenticado en el contexto (p. ej. migraciones o scripts de
  -- servicio) no hay a quién atribuir el cambio: no se audita, no se bloquea.
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pr.id INTO v_proyecto_id
  FROM public.proyectos pr
  WHERE pr.centro_negocio_id = NEW.centro_negocio_id
  LIMIT 1;

  IF NEW.cantidad IS DISTINCT FROM OLD.cantidad OR NEW.precio_unitario IS DISTINCT FROM OLD.precio_unitario THEN
    INSERT INTO public.proyecto_auditoria (proyecto_id, presupuesto_id, user_id, accion, entidad_id, valor_anterior, valor_nuevo)
    VALUES (
      v_proyecto_id, NEW.id, v_user_id, 'presupuesto.monto', NEW.id,
      format('cantidad=%s · precio_unitario=%s · importe=%s', OLD.cantidad, OLD.precio_unitario, OLD.cantidad * OLD.precio_unitario),
      format('cantidad=%s · precio_unitario=%s · importe=%s', NEW.cantidad, NEW.precio_unitario, NEW.cantidad * NEW.precio_unitario)
    );
  END IF;

  IF NEW.es_project IS DISTINCT FROM OLD.es_project THEN
    INSERT INTO public.proyecto_auditoria (proyecto_id, presupuesto_id, user_id, accion, entidad_id, valor_anterior, valor_nuevo)
    VALUES (
      v_proyecto_id, NEW.id, v_user_id, 'presupuesto.es_project', NEW.id,
      OLD.es_project::text, NEW.es_project::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_presupuesto_change ON public.presupuestos;
CREATE TRIGGER trg_audit_presupuesto_change
  AFTER UPDATE ON public.presupuestos
  FOR EACH ROW EXECUTE FUNCTION public.audit_presupuesto_change();
