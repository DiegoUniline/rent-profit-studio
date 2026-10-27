-- El flujo de efectivo manda: la barra del Gantt de una partida de Proyecto se
-- ajusta sola a su programación financiera (inicio = primer pago, fin = último
-- pago), la cambie quien la cambie: Proyectos → Programación financiera,
-- Presupuestos (misma ventana para partidas de Proyecto) o Rafa.
--
-- Mover la barra del Gantt NO toca los pagos (actualizar_cronograma_partida
-- sigue igual); el siguiente cambio de pagos vuelve a alinear la barra.
-- No se recalculan partidas existentes: aplica a partir del próximo cambio de pagos.
-- Idempotente: seguro de re-ejecutar.

CREATE OR REPLACE FUNCTION public.alinear_cronograma_con_pagos(p_programaciones uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.presupuestos p
  SET fecha_inicio = r.inicio, fecha_fin = r.fin
  FROM (
    SELECT f.presupuesto_id, min(pg.fecha) AS inicio, max(pg.fecha) AS fin
    FROM public.proyecto_programacion_financiera f
    JOIN public.proyecto_programacion_pagos pg ON pg.programacion_id = f.id AND pg.monto > 0
    WHERE f.id = ANY (p_programaciones)
    GROUP BY f.presupuesto_id
  ) r
  WHERE p.id = r.presupuesto_id
    AND p.es_project
    AND (p.fecha_inicio IS DISTINCT FROM r.inicio OR p.fecha_fin IS DISTINCT FROM r.fin);
  -- Sin pagos (programación vaciada o borrada) la barra se queda como está.
END;
$$;

REVOKE ALL ON FUNCTION public.alinear_cronograma_con_pagos(uuid[]) FROM PUBLIC, anon, authenticated;

-- Disparadores por sentencia: guardar_programacion_partida borra y vuelve a
-- insertar todos los pagos; se alinea una sola vez por partida.
CREATE OR REPLACE FUNCTION public.trg_cronograma_sigue_pagos_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.alinear_cronograma_con_pagos(ARRAY(SELECT DISTINCT programacion_id FROM nuevos));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_cronograma_sigue_pagos_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.alinear_cronograma_con_pagos(ARRAY(
    SELECT programacion_id FROM nuevos UNION SELECT programacion_id FROM viejos
  ));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_cronograma_sigue_pagos_del()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.alinear_cronograma_con_pagos(ARRAY(SELECT DISTINCT programacion_id FROM viejos));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cronograma_sigue_pagos_ins ON public.proyecto_programacion_pagos;
CREATE TRIGGER trg_cronograma_sigue_pagos_ins
  AFTER INSERT ON public.proyecto_programacion_pagos
  REFERENCING NEW TABLE AS nuevos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_cronograma_sigue_pagos_ins();

DROP TRIGGER IF EXISTS trg_cronograma_sigue_pagos_upd ON public.proyecto_programacion_pagos;
CREATE TRIGGER trg_cronograma_sigue_pagos_upd
  AFTER UPDATE ON public.proyecto_programacion_pagos
  REFERENCING OLD TABLE AS viejos NEW TABLE AS nuevos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_cronograma_sigue_pagos_upd();

DROP TRIGGER IF EXISTS trg_cronograma_sigue_pagos_del ON public.proyecto_programacion_pagos;
CREATE TRIGGER trg_cronograma_sigue_pagos_del
  AFTER DELETE ON public.proyecto_programacion_pagos
  REFERENCING OLD TABLE AS viejos
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_cronograma_sigue_pagos_del();

NOTIFY pgrst, 'reload schema';
