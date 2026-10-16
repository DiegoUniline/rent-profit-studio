-- Pruebas de las RPC transaccionales de Rafa sobre la semilla 10_semilla.sql.
-- Ejecutar SOLO en una base aislada: psql -X -v ON_ERROR_STOP=1 -f ...
-- Todo corre dentro de una transacción que termina en ROLLBACK.
BEGIN;

-- Acciones confirmadas (estado 'ejecutando') creadas como lo haría el servidor.
INSERT INTO public.rafa_acciones (id, user_id, herramienta, descripcion, estado, huella) VALUES
  ('aa000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'crear_programaciones', 'prueba', 'ejecutando', 'h1'),
  ('aa000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'crear_programaciones', 'prueba cruzada', 'ejecutando', 'h2'),
  ('aa000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b1', 'crear_programaciones', 'sin permiso', 'ejecutando', 'h3'),
  ('aa000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c1', 'crear_asientos_borrador', 'borrador', 'ejecutando', 'h4'),
  ('aa000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000c1', 'crear_asientos_borrador', 'duplicado', 'ejecutando', 'h5'),
  ('aa000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000c1', 'ajustar_presupuestos', 'ajuste', 'ejecutando', 'h6'),
  ('aa000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-0000000000c1', 'ajustar_presupuestos', 'desactualizado', 'ejecutando', 'h7'),
  ('aa000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-0000000000c1', 'crear_programaciones', 'no confirmada', 'propuesta', 'h8'),
  ('aa000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000c1', 'crear_asientos_borrador', 'descuadrado', 'ejecutando', 'h9');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

-- 1. Contador crea dos programaciones en una transacción.
DO $$
DECLARE r jsonb; n integer;
BEGIN
  r := public.rafa_crear_programaciones('aa000000-0000-0000-0000-000000000001', '[
    {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","centro_negocio_id":"a1000000-0000-0000-0000-000000000002","fecha_programada":"2026-10-20","monto":10000,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b","observaciones":"Rafa 1"},
    {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","centro_negocio_id":"a1000000-0000-0000-0000-000000000002","fecha_programada":"2026-10-27","monto":10000,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b","observaciones":"Rafa 2"}
  ]'::jsonb);
  SELECT count(*) INTO n FROM public.programaciones WHERE observaciones IN ('Rafa 1', 'Rafa 2');
  ASSERT n = 2, 'deben existir 2 programaciones nuevas';
  ASSERT jsonb_array_length(r->'programacion_ids') = 2;
  RAISE NOTICE 'OK 1: programaciones creadas %', r;
END $$;

-- 2. Reintento de la MISMA acción: falla y no duplica.
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    PERFORM public.rafa_crear_programaciones('aa000000-0000-0000-0000-000000000001', '[
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","fecha_programada":"2026-10-20","monto":10000,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b","observaciones":"Rafa 1"}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE 'RAFA_YA_EJECUTADA%', 'mensaje inesperado: ' || SQLERRM;
  END;
  SELECT count(*) INTO n FROM public.programaciones WHERE observaciones = 'Rafa 1';
  ASSERT n = 1, 'el reintento no debe duplicar';
  RAISE NOTICE 'OK 2: reintento rechazado sin duplicar';
END $$;

-- 3. Partida de otra empresa: todo el lote se revierte (incluida la primera fila válida).
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    PERFORM public.rafa_crear_programaciones('aa000000-0000-0000-0000-000000000002', '[
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","fecha_programada":"2026-10-21","monto":1,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b","observaciones":"Lote cruzado A"},
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","fecha_programada":"2026-10-21","monto":1,"presupuesto_id":"b2000000-0000-0000-0000-00000000000e","observaciones":"Lote cruzado B"}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%no es válida para la empresa%', SQLERRM;
  END;
  SELECT count(*) INTO n FROM public.programaciones WHERE observaciones LIKE 'Lote cruzado%';
  ASSERT n = 0, 'no debe quedar ninguna fila del lote';
  RAISE NOTICE 'OK 3: aislamiento entre empresas con rollback total';
END $$;

-- 4. Acción no confirmada (estado propuesta): la ejecución se rechaza y revierte.
DO $$
DECLARE n integer;
BEGIN
  BEGIN
    PERFORM public.rafa_crear_programaciones('aa000000-0000-0000-0000-000000000008', '[
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","fecha_programada":"2026-10-22","monto":5,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b","observaciones":"Sin confirmar"}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLSTATE = '42501', 'se esperaba violación de RLS, fue ' || SQLSTATE || ' ' || SQLERRM;
  END;
  SELECT count(*) INTO n FROM public.programaciones WHERE observaciones = 'Sin confirmar';
  ASSERT n = 0;
  RAISE NOTICE 'OK 4: acción sin confirmar no se ejecuta';
END $$;

-- 5. Asiento borrador ligado a programación; segundo asiento para la misma programación rechazado.
DO $$
DECLARE r jsonb; v_asiento uuid; v_estado text; v_link uuid;
BEGIN
  r := public.rafa_crear_asientos_borrador('aa000000-0000-0000-0000-000000000004', '[
    {"empresa_id":"e1000000-0000-0000-0000-000000000001","fecha":"2026-10-14","tipo":"egreso","centro_negocio_id":"a1000000-0000-0000-0000-000000000002","programacion_id":"70000000-0000-0000-0000-000000000003","observaciones":"Pago renta noviembre",
     "movimientos":[
       {"cuenta_id":"c1000000-0000-0000-0000-000000000601","partida":"Renta","debe":10000,"haber":0,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b"},
       {"cuenta_id":"c1000000-0000-0000-0000-000000000101","partida":"Pago","debe":0,"haber":10000}
     ]}
  ]'::jsonb);
  v_asiento := (r->'asientos'->0->>'asiento_id')::uuid;
  SELECT estado INTO v_estado FROM public.asientos_contables WHERE id = v_asiento;
  ASSERT v_estado = 'borrador', 'debe quedar en borrador, quedó ' || v_estado;
  SELECT asiento_id INTO v_link FROM public.programaciones WHERE id = '70000000-0000-0000-0000-000000000003';
  ASSERT v_link = v_asiento, 'la programación debe quedar ligada al asiento';
  BEGIN
    PERFORM public.rafa_crear_asientos_borrador('aa000000-0000-0000-0000-000000000005', '[
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","fecha":"2026-10-14","tipo":"egreso","centro_negocio_id":"a1000000-0000-0000-0000-000000000002","programacion_id":"70000000-0000-0000-0000-000000000003",
       "movimientos":[
         {"cuenta_id":"c1000000-0000-0000-0000-000000000601","debe":10000,"haber":0,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b"},
         {"cuenta_id":"c1000000-0000-0000-0000-000000000101","debe":0,"haber":10000}
       ]}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%ya tiene un asiento vigente%', SQLERRM;
  END;
  ASSERT (SELECT count(*) FROM public.asientos_contables WHERE observaciones = 'Pago renta noviembre') = 1;
  RAISE NOTICE 'OK 5: borrador ligado sin duplicar';
END $$;

-- 6. Asiento descuadrado rechazado.
DO $$
BEGIN
  BEGIN
    PERFORM public.rafa_crear_asientos_borrador('aa000000-0000-0000-0000-000000000009', '[
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","fecha":"2026-10-14","tipo":"egreso",
       "movimientos":[{"cuenta_id":"c1000000-0000-0000-0000-000000000601","debe":100,"haber":0},{"cuenta_id":"c1000000-0000-0000-0000-000000000101","debe":0,"haber":90}]}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%no está cuadrado%', SQLERRM;
  END;
  RAISE NOTICE 'OK 6: descuadre rechazado';
END $$;

-- 7. Ajuste de presupuesto con control optimista y auditoría automática.
DO $$
DECLARE v_precio numeric; n integer;
BEGIN
  PERFORM public.rafa_ajustar_presupuestos('aa000000-0000-0000-0000-000000000006', '[
    {"id":"b1000000-0000-0000-0000-00000000000a","cantidad_anterior":"1","precio_unitario_anterior":"100000","cantidad_nueva":"1","precio_unitario_nuevo":"105000"}
  ]'::jsonb);
  SELECT precio_unitario INTO v_precio FROM public.presupuestos WHERE id = 'b1000000-0000-0000-0000-00000000000a';
  ASSERT v_precio = 105000;
  SELECT count(*) INTO n FROM public.proyecto_auditoria WHERE presupuesto_id = 'b1000000-0000-0000-0000-00000000000a' AND accion = 'presupuesto.monto';
  ASSERT n = 1, 'el trigger de auditoría debe registrar el cambio';
  BEGIN
    PERFORM public.rafa_ajustar_presupuestos('aa000000-0000-0000-0000-000000000007', '[
      {"id":"b1000000-0000-0000-0000-00000000000a","cantidad_anterior":"1","precio_unitario_anterior":"100000","cantidad_nueva":"1","precio_unitario_nuevo":"110000"}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE 'RAFA_DESACTUALIZADA%', SQLERRM;
  END;
  RAISE NOTICE 'OK 7: ajuste aplicado y propuesta desactualizada rechazada';
END $$;

-- 8. Usuario sin rol contable: RLS impide crear programaciones aunque tenga acción confirmada.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.rafa_crear_programaciones('aa000000-0000-0000-0000-000000000003', '[
      {"empresa_id":"e1000000-0000-0000-0000-000000000001","tipo":"egreso","fecha_programada":"2026-10-22","monto":5,"presupuesto_id":"b1000000-0000-0000-0000-00000000000b","observaciones":"Usuario sin permiso"}
    ]'::jsonb);
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLSTATE = '42501', 'se esperaba RLS, fue ' || SQLSTATE || ' ' || SQLERRM;
  END;
  RAISE NOTICE 'OK 8: la confirmación no otorga permisos';
END $$;

-- 9. Un usuario no puede leer mensajes/acciones de otro ni escribir la bitácora.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.rafa_acciones WHERE user_id = '00000000-0000-0000-0000-0000000000c1';
  ASSERT n = 0, 'no debe ver acciones de otro usuario';
  BEGIN
    INSERT INTO public.rafa_acciones (user_id, herramienta, descripcion, huella)
    VALUES ('00000000-0000-0000-0000-0000000000b1', 'x', 'x', 'x');
    RAISE EXCEPTION 'debió fallar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK 9: bitácora protegida';
END $$;

ROLLBACK;
