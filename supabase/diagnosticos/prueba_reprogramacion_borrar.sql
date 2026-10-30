-- Borra TODO lo creado por prueba_reprogramacion_crear.sql (centro PRUEBA-RAFA):
-- pagos, programaciones, flujos, partidas, proyecto, charlas de Rafa y avisos.
-- Solo toca ese centro.
DO $$
DECLARE
  v_centro uuid := (SELECT id FROM public.centros_negocio WHERE codigo = 'PRUEBA-RAFA');
  v_partidas integer;
BEGIN
  IF v_centro IS NULL THEN
    RAISE NOTICE 'No existe el centro PRUEBA-RAFA: nada que borrar';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.asiento_movimientos m JOIN public.presupuestos p ON p.id = m.presupuesto_id WHERE p.centro_negocio_id = v_centro)
     OR EXISTS (SELECT 1 FROM public.asientos_contables WHERE centro_negocio_id = v_centro) THEN
    RAISE EXCEPTION 'El centro PRUEBA-RAFA tiene asientos contables: no se borra nada';
  END IF;

  DELETE FROM public.programaciones WHERE centro_negocio_id = v_centro
     OR presupuesto_id IN (SELECT id FROM public.presupuestos WHERE centro_negocio_id = v_centro);
  DELETE FROM public.rafa_conversaciones WHERE centro_negocio_id = v_centro;
  DELETE FROM public.rafa_archivos WHERE centro_negocio_id = v_centro;
  -- Pagos, programaciones, flujos y bitácora caen en cascada con la partida y el proyecto.
  DELETE FROM public.presupuestos WHERE centro_negocio_id = v_centro;
  GET DIAGNOSTICS v_partidas = ROW_COUNT;
  DELETE FROM public.centros_negocio WHERE id = v_centro; -- proyecto, tareas, accesos y avisos en cascada
  RAISE NOTICE 'Borrado: centro PRUEBA-RAFA y % partidas', v_partidas;
END;
$$;
