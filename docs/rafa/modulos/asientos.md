# Asientos contables y movimientos

Evidencia: código y SQL local. Fuentes: `src/pages/Asientos.tsx`, `src/pages/AsientoDetalle.tsx`, `src/components/dialogs/AsientoDialog.tsx`, `src/components/dialogs/AdminCodeDialog.tsx`, `supabase/functions/_shared/negocio/asientos.ts`.

## Póliza y renglones

`asientos_contables` es la cabecera de una póliza de partida doble: `empresa_id`, `fecha`, `tipo` (enum `ingreso`, `egreso`, `diario`), `tercero_id`, `centro_negocio_id`, `observaciones`, `estado`, `total_debe`, `total_haber`, `created_by`. `numero_asiento` es un folio global por secuencia (`asientos_contables_numero_asiento_seq`), no único ni por empresa, con huecos por borrados.

`asiento_movimientos` son los renglones (cargo/abono): `asiento_id` (FK cascada), `cuenta_id` (FK RESTRICT), `partida` (texto libre, a menudo vacío), `debe`, `haber`, `orden` y `presupuesto_id` (FK SET NULL): **este campo es el vínculo entre contabilidad y presupuesto** y la base de todo "ejercido".

`total_debe`/`total_haber` los calcula la aplicación al guardar (no hay trigger que los recalcule).

## Estados y transiciones

Enum `estado_asiento`: `borrador` (por defecto), `aplicado`, `cancelado`.
- En la lista: `borrador → aplicado` (Aplicar), `aplicado → cancelado` (Cancelar). Cambio directo de `estado` (`handleChangeEstado`).
- Solo los asientos **aplicados** cuentan en ejercido, saldos y reportes.
- Pasar a `aplicado` dispara `sync_iva_flujos` (crea flujos de IVA); dejar `aplicado` los borra.
- Eliminar: solo en `borrador` o `cancelado`. Admin directo; un contador necesita el **código de acceso** de un admin (`AdminCodeDialog`, compara contra `profiles.codigo_acceso` en el cliente). RLS de borrado: solo admin.

## Validaciones de captura

Regla compartida `validarAsiento`: empresa, fecha y tipo; al menos un renglón; cada renglón con cuenta y monto en Debe o Haber; cuadrado (|debe − haber| < 0.01); las pólizas `diario` requieren al menos un renglón con partida. `AsientoDialog` (y Rafa) además exigen que cada partida ligada sea de la misma empresa y del centro del asiento (o sin centro); la página `/asientos/:id` (`AsientoDetalle`) **no** lo exige (diferencia conservada y registrada en pendientes).

Guardar (`/asientos/:id`) usa la RPC `guardar_asiento` (migración `20261025000000`): una transacción, idempotente por clave de operación (`asiento_guardados`), totales y cuadre calculados en el servidor, renglones por id (actualiza, inserta nuevos y elimina solo los quitados, así los flujos de IVA ligados a renglones sin cambio se conservan) y control de versión con `updated_at`. Si algo falla no se guarda nada. Rafa crea borradores con la RPC `rafa_crear_asientos_borrador`, que hace todo en una transacción y nunca contabiliza.

## Permisos

Rutas admin/contador. RLS: SELECT de asientos y movimientos para **cualquier autenticado** (incluye roles usuario/arquitecto, aunque la interfaz no les muestra el módulo); INSERT/UPDATE admin o contador; DELETE de asientos solo admin, de movimientos admin o contador. Rafa aplica la regla de la interfaz: solo admin/contador consultan asientos.
