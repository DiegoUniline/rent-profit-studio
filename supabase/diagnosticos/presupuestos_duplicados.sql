-- Diagnóstico de SOLO LECTURA: posibles duplicados creados por el error de
-- guardado de Presupuestos (corregido en 20261017000000). No borra ni modifica.
--
-- Cómo se producía: al editar una partida, el diálogo borraba sus
-- flujos_programados y los reinsertaba TODOS en una sola inserción. Para un
-- contador el borrado no afectaba filas (RLS: DELETE solo admin), así que cada
-- guardado agregaba una copia completa; dos guardados simultáneos también
-- podían duplicar. La cabecera (presupuestos) se actualizaba por id: no se
-- duplicaba al editar.
--
-- Criterio (no basta compartir fecha, importe o descripción): una inserción
-- (filas con el mismo created_at = misma transacción) es "posible copia" si
-- tiene exactamente tantas filas como pagos manuales existían antes en la
-- partida. Si además coinciden fecha/importe/tipo/descripción una a una, es
-- "copia exacta"; si no, "copia con cambios" (el usuario editó al guardar).
-- Todo resultado requiere revisión humana antes de cualquier ajuste.

-- 1) Pagos programados: inserciones sospechosas por partida.
WITH manuales AS (
  SELECT f.*, md5(concat_ws('|', f.fecha, f.monto, f.tipo, coalesce(f.descripcion, ''))) AS firma
  FROM public.flujos_programados f
  WHERE f.presupuesto_id IS NOT NULL AND NOT f.auto_generado
),
lotes AS (
  SELECT presupuesto_id, created_at AS lote, count(*) AS filas,
         array_agg(firma ORDER BY firma) AS firmas, sum(monto) AS importe
  FROM manuales GROUP BY presupuesto_id, created_at
),
evaluados AS (
  SELECT l.*,
         (SELECT count(*) FROM manuales m WHERE m.presupuesto_id = l.presupuesto_id AND m.created_at < l.lote) AS previas,
         (SELECT array_agg(m.firma ORDER BY m.firma) FROM manuales m
           WHERE m.presupuesto_id = l.presupuesto_id AND m.created_at < l.lote) AS firmas_previas
  FROM lotes l
)
SELECT p.empresa_id, e.razon_social, p.id AS presupuesto_id, p.partida,
       e2.lote, e2.filas AS filas_del_lote, e2.previas AS pagos_previos, e2.importe AS importe_del_lote,
       CASE WHEN e2.firmas = e2.firmas_previas THEN 'copia exacta' ELSE 'copia con cambios' END AS clasificacion,
       (SELECT count(*) FROM manuales m WHERE m.presupuesto_id = p.id) AS pagos_actuales,
       round(p.cantidad * p.precio_unitario, 2) AS presupuestado,
       (SELECT sum(monto) FROM manuales m WHERE m.presupuesto_id = p.id) AS total_pagos_actuales,
       -- Los pagos programados no tienen tablas dependientes; se informan los
       -- movimientos reales de la partida para dimensionar el impacto.
       (SELECT count(*) FROM public.asiento_movimientos am WHERE am.presupuesto_id = p.id) AS movimientos_contables,
       (SELECT count(*) FROM public.programaciones pr WHERE pr.presupuesto_id = p.id) AS programaciones_tesoreria
FROM evaluados e2
JOIN public.presupuestos p ON p.id = e2.presupuesto_id
JOIN public.empresas e ON e.id = p.empresa_id
WHERE e2.previas > 0 AND e2.filas = e2.previas
ORDER BY e.razon_social, p.partida, e2.lote;

-- 2) Partidas: posibles altas repetidas (misma empresa, nombre, cuenta, centro,
--    cantidad y precio, creadas con menos de 2 minutos de diferencia). Solo
--    indicio: dos partidas legítimas pueden coincidir.
SELECT p1.empresa_id, p1.partida,
       p1.id AS presupuesto_a, p1.created_at AS creado_a,
       p2.id AS presupuesto_b, p2.created_at AS creado_b,
       p1.cantidad, p1.precio_unitario,
       (SELECT count(*) FROM public.asiento_movimientos am WHERE am.presupuesto_id = p1.id) AS movimientos_a,
       (SELECT count(*) FROM public.asiento_movimientos am WHERE am.presupuesto_id = p2.id) AS movimientos_b,
       (SELECT count(*) FROM public.programaciones pr WHERE pr.presupuesto_id = p1.id) AS programaciones_a,
       (SELECT count(*) FROM public.programaciones pr WHERE pr.presupuesto_id = p2.id) AS programaciones_b,
       (SELECT count(*) FROM public.flujos_programados f WHERE f.presupuesto_id = p1.id) AS pagos_a,
       (SELECT count(*) FROM public.flujos_programados f WHERE f.presupuesto_id = p2.id) AS pagos_b
FROM public.presupuestos p1
JOIN public.presupuestos p2
  ON p2.empresa_id = p1.empresa_id
 AND p2.partida = p1.partida
 AND p2.cuenta_id IS NOT DISTINCT FROM p1.cuenta_id
 AND p2.centro_negocio_id IS NOT DISTINCT FROM p1.centro_negocio_id
 AND p2.cantidad = p1.cantidad
 AND p2.precio_unitario = p1.precio_unitario
 AND p2.created_at > p1.created_at
 AND p2.created_at - p1.created_at < interval '2 minutes'
ORDER BY p1.empresa_id, p1.partida, p1.created_at;
