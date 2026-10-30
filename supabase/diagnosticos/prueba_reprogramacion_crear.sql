-- Datos de PRUEBA para Rafa (reprogramación masiva e ingreso/egreso en flujo).
-- Crea el centro "PRUEBA RAFA" con su proyecto, 400 partidas "Lote 1..400"
-- (399 ya programadas con 2 pagos), un ingreso de proyecto y un ingreso sin
-- proyecto con flujos capturados como egreso. Se borra todo con
-- prueba_reprogramacion_borrar.sql.
DO $$
DECLARE
  v_empresa uuid := (SELECT id FROM public.empresas WHERE activa ORDER BY razon_social LIMIT 1);
  v_cuenta_ingreso uuid := (SELECT id FROM public.cuentas_contables WHERE empresa_id = v_empresa AND codigo LIKE '4%' AND activa ORDER BY codigo LIMIT 1);
  v_centro uuid;
  v_proyecto uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.centros_negocio WHERE codigo = 'PRUEBA-RAFA') THEN
    RAISE EXCEPTION 'Ya existe el centro PRUEBA-RAFA: bórralo primero con prueba_reprogramacion_borrar.sql';
  END IF;

  INSERT INTO public.centros_negocio (empresa_id, codigo, nombre)
  VALUES (v_empresa, 'PRUEBA-RAFA', 'PRUEBA RAFA (borrar)') RETURNING id INTO v_centro;
  INSERT INTO public.proyectos (empresa_id, centro_negocio_id, nombre)
  VALUES (v_empresa, v_centro, 'PRUEBA RAFA') RETURNING id INTO v_proyecto;

  -- 400 partidas de proyecto (egreso) de $10,000.
  INSERT INTO public.presupuestos (empresa_id, centro_negocio_id, partida, cantidad, precio_unitario, activo, es_project, tipo_movimiento, orden)
  SELECT v_empresa, v_centro, 'Lote ' || i, 1, 10000, true, true, 'egreso', i FROM generate_series(1, 400) i;

  -- Ingreso de proyecto (cuenta 4xx) e ingreso sin proyecto.
  INSERT INTO public.presupuestos (empresa_id, centro_negocio_id, cuenta_id, partida, cantidad, precio_unitario, activo, es_project, tipo_movimiento, orden)
  VALUES (v_empresa, v_centro, v_cuenta_ingreso, 'Cobranza prueba', 1, 300000, true, true, 'ingreso', 401),
         (v_empresa, v_centro, v_cuenta_ingreso, 'Venta prueba', 1, 90000, true, false, 'ingreso', 402);

  -- Programación de los lotes 1..399 y de la cobranza (2 pagos con fechas distintas).
  INSERT INTO public.proyecto_programacion_financiera (presupuesto_id, proyecto_id, empresa_id, modo, frecuencia, fecha_inicio, numero_pagos)
  SELECT id, v_proyecto, v_empresa, 'automatica', 'mensual', DATE '2026-11-10', 2
  FROM public.presupuestos WHERE centro_negocio_id = v_centro AND es_project AND partida <> 'Lote 400';
  INSERT INTO public.proyecto_programacion_pagos (programacion_id, proyecto_id, fecha, monto, concepto, orden)
  SELECT f.id, v_proyecto, d.fecha, p.cantidad * p.precio_unitario * d.parte, d.concepto, d.orden
  FROM public.proyecto_programacion_financiera f
  JOIN public.presupuestos p ON p.id = f.presupuesto_id
  CROSS JOIN (VALUES (DATE '2026-11-10', 0.4, 'Pago 1', 0), (DATE '2027-01-10', 0.6, 'Pago 2', 1)) d(fecha, parte, concepto, orden)
  WHERE f.proyecto_id = v_proyecto;

  -- Flujos del ingreso sin proyecto capturados (mal) como egreso: el reporte debe mostrarlos como Entrada.
  INSERT INTO public.flujos_programados (presupuesto_id, empresa_id, fecha, monto, tipo, descripcion)
  SELECT id, v_empresa, d, 30000, 'egreso', 'Prueba' FROM public.presupuestos,
         unnest(ARRAY[DATE '2026-11-15', DATE '2026-12-15', DATE '2027-01-15']) d
  WHERE centro_negocio_id = v_centro AND partida = 'Venta prueba';

  RAISE NOTICE 'Centro PRUEBA-RAFA creado en %', (SELECT razon_social FROM public.empresas WHERE id = v_empresa);
END;
$$;

SELECT e.razon_social AS empresa, c.codigo, c.nombre AS centro,
       (SELECT count(*) FROM public.presupuestos p WHERE p.centro_negocio_id = c.id) AS partidas
FROM public.centros_negocio c JOIN public.empresas e ON e.id = c.empresa_id
WHERE c.codigo = 'PRUEBA-RAFA';
