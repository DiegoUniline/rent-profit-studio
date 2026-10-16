# Flujos programados

Evidencia: código y SQL local. Fuentes: `src/components/dialogs/PresupuestoDialog.tsx`, `src/lib/presupuesto-guardado.ts`, `src/pages/Reportes.tsx`, `src/components/reportes/FlujoEfectivoPresupuesto.tsx`, `src/lib/rafa-apply.ts`, migraciones `20260219013153_*.sql`, `20260220183755_*.sql`, `20260828120000_*.sql`, `20260829090000_*.sql`, `20261017000000_*.sql`.

## Qué representa un flujo programado

`flujos_programados` es la **proyección temporal** (calendario de entradas/salidas esperadas) de una partida presupuestal que NO es de Proyecto: fecha, monto y tipo (`ingreso`/`egreso`, CHECK). No registra pagos ni cobros reales y no es la programación de tesorería (`programaciones`).

Dos clases de filas:
1. **Manuales** (`auto_generado = false`, `presupuesto_id` lleno): capturadas en el formulario de la partida (`PresupuestoDialog`) o generadas por Rafa al aplicar un plan (`aplicarPlanRafa`, reparto con `distribuirSaldoEntrePeriodos`).
2. **IVA automáticas** (`auto_generado = true`, `presupuesto_id` NULL, `asiento_movimiento_id` y `empresa_id` llenos): las crea el trigger `sync_iva_flujos` cuando un asiento pasa a `aplicado` y las borra si deja de estarlo. Representan IVA de asientos reales, no una proyección de partida.

## Regla de fuente única con Proyectos

Desde `20260829090000`, el trigger `trg_block_flujos_legacy_proyecto` **rechaza** insertar o actualizar flujos de una partida con `es_project = true`. Al crear la programación propia de una partida (`proyecto_programacion_financiera`) el trigger `trg_cleanup_flujos_legacy` borra sus flujos legacy. Las consultas (`resolverFlujosEfectivos`) excluyen cualquier flujo legacy de partidas de Proyecto: su proyectado es la programación del proyecto, o $0 si no existe. Nunca se suman ambas fuentes.

## Permisos y efectos

RLS: lectura cualquier autenticado; alta/edición admin/contador; borrado admin. Desde el formulario de la partida se guardan con `guardar_presupuesto` (una transacción): se actualizan por id, se insertan solo los nuevos y se eliminan solo los quitados; un contador que quita un pago recibe error y no se guarda nada. Dos pagos con la misma fecha, importe y descripción son legítimos y se conservan. Borrar la partida o el movimiento de asiento borra sus flujos (cascada). Se usan en: Reporte de flujo de efectivo por presupuesto (proyectado y "ajustado": meses cerrados toman lo ejercido real y los futuros lo programado), y en los totales de programado por partida. No alimentan la pantalla Programación (tesorería) ni sus KPIs.
