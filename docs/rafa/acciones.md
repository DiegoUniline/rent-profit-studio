# Acciones de negocio

Para cada acción: quién la inicia, validaciones, función responsable, tablas, efectos indirectos, repetición/reversión y límites transaccionales. "Cliente" = escrituras directas desde el navegador con RLS; no hay transacción que abarque varias llamadas.

## Crear o editar una partida presupuestal

Inicio: Presupuestos → Nueva/Editar (`PresupuestoDialog.handleSave`); también Rafa (plan de presupuesto, `aplicarPlanRafa`). Quién: INSERT solo admin, UPDATE admin/contador (RLS). Valida en cliente empresa, partida y números. Tablas: `presupuestos` y, si la partida no es de un proyecto activo, `flujos_programados` (por id: actualiza, inserta nuevos, elimina quitados). Efectos: cambio de cantidad/precio se audita (`trg_audit_presupuesto_change`); cambia presupuestado, por ejercer y "pendiente de ajustar" en Proyectos. Repetir: el mismo guardado (doble clic, reintento) no se repite (clave `p_operacion`, `presupuesto_guardados`); editar conserva el id; una nueva alta crea otra partida (no hay unicidad por nombre); Rafa evita duplicar con el rastro de la sesión. Revertir: editar de nuevo o desactivar. Desde el formulario: RPC `guardar_presupuesto`, atómica, con control de versión. Desde el editor de planes de Rafa: RPC `rafa_guardar_plan`, atómica e idempotente.

## Programar flujos de una partida

Inicio: formulario de partida (pestaña de flujos) o plan de Rafa. Quién: admin/contador. Tabla: `flujos_programados`. Bloqueado por trigger si la partida es de Proyecto. Efecto: proyectado de reportes. Formulario de partida: `guardar_presupuesto` en una transacción (actualiza por id, inserta nuevos, elimina quitados; el contador no puede quitar y recibe error sin cambios). Plan de Rafa: `rafa_guardar_plan` los regenera en la misma transacción (verifica filas borradas; omite partidas de Proyecto).

## Programar la financiera de una partida de proyecto

Inicio: Proyecto → Programación financiera (`ProgramacionPartidaDialog`), también desde la partida en Presupuestos. Quién: admin/contador o usuario con `editar_programacion_financiera` (RLS). Valida anticipo con fecha, al menos un pago, montos > 0; triggers validan empresa/centro/proyecto y borran flujos legacy. Tablas: `proyecto_programacion_financiera`, `proyecto_programacion_pagos`, `proyecto_auditoria`. Reemplaza todos los pagos en cada guardado con la RPC `guardar_programacion_partida` (migración `20261025000000`): una transacción, idempotente por clave de operación (`programacion_partida_guardados`), verifica que el borrado de pagos sí ocurrió y que lo programado no supere el presupuesto; la bitácora no bloquea el guardado. Rafa: `proponer_programacion_financiera` reparte lo que falta (presupuesto − ya pagado − anticipo) y, al confirmar, usa `rafa_guardar_programacion_partida` (la acción es la clave de operación).

## Crear, editar, copiar o eliminar una programación de tesorería

Inicio: Programación (`ProgramacionDialog.handleSave`, `handleDelete`). Quién: crear/editar admin/contador; eliminar solo admin. Valida empresa, monto > 0 y partida del centro (cliente). Tabla: `programaciones`. Efectos: KPIs y proyección de la pantalla; comparación contra presupuesto. Repetir crea duplicados (no hay clave natural). Rafa: `proponer_programaciones` crea en una transacción (`rafa_crear_programaciones`) con respaldo presupuestal obligatorio y confirmación.

## Ejecutar o cancelar una programación

Inicio: Programación → Ejecutar (`handleExecute`). Solo cambia `estado` a `ejecutado`; no crea asiento. Quién: admin/contador. Revertir: no hay botón; editar no cambia estado. Rafa: `proponer_cambio_estado_programaciones` (pendiente → ejecutado/cancelado) con confirmación y control optimista (`rafa_cambiar_estado_programaciones`).

## Capturar un asiento contable

Inicio: Asientos → Nuevo/Editar/Copiar (`AsientoDialog`) o página `/asientos/:id`. Quién: admin/contador. Valida `validarAsiento` (cuadre, diario con partida, alcance de partidas en el diálogo). Tablas: `asientos_contables`, `asiento_movimientos`. Estado inicial `borrador`: no afecta ejercido ni saldos. Desde `/asientos/:id` se guarda con la RPC `guardar_asiento` (migración `20261025000000`): una transacción, idempotente (`asiento_guardados`), totales y cuadre calculados en el servidor, renglones por id (actualiza, inserta nuevos, elimina quitados: los flujos de IVA ligados a renglones que no cambian se conservan) y control de versión (`updated_at`). `AsientoDialog` no se usa en la aplicación. Rafa: `proponer_asientos_borrador` usa `rafa_crear_asientos_borrador` (una transacción, siempre borrador) y puede ligar la programación de origen (`programaciones.asiento_id`), rechazando un segundo asiento vigente para la misma programación.

## Aplicar, cancelar o eliminar un asiento

Aplicar (`borrador → aplicado`): afecta ejercido, saldos, reportes y genera flujos de IVA (trigger). Cancelar (`aplicado → cancelado`): revierte esos efectos (borra flujos IVA). Eliminar: solo borrador o cancelado; admin, o contador con código de admin; cascada a renglones. Rafa: solo aplica asientos si el usuario lo pide expresamente, con confirmación (`proponer_aplicar_asientos`, `rafa_aplicar_asientos`, verifica cuadre y que no hayan cambiado). Rafa no cancela ni elimina asientos.

## Ajustar presupuesto por porcentaje

Rafa: `simular_incremento_presupuesto` (no escribe) y `proponer_ajuste_presupuesto` (escribe con confirmación). Requiere decidir si el incremento se aplica a `precio_unitario` o a `cantidad`; no se asume. `rafa_ajustar_presupuestos` actualiza con control optimista (falla si la partida cambió) en una transacción; la auditoría la registra el trigger existente. No modifica flujos ni programación de proyecto: la diferencia queda "por programar" y se reporta.

## Gestión de proyecto

Generar proyecto desde un centro; marcar partidas como de proyecto (`es_project`, auditado); editar cronograma (`actualizar_cronograma_partida`); tareas (crear/editar/mover/borrar, admin/contador); accesos (`proyecto_usuarios`, admin); compartir cronograma (token). Rafa puede crear tareas (`proponer_tarea`, `rafa_crear_tarea`) y consultar todo lo anterior según el acceso del usuario; las demás acciones de proyecto siguen en la interfaz.

Acciones de Rafa con confirmación (migración `20261026000000`): `proponer_cronograma_partida` (fechas y avance; solo cambia lo indicado; permiso de editar cronograma; `rafa_actualizar_cronograma` → `actualizar_cronograma_partida`), `proponer_programacion_financiera` (ver arriba) y `proponer_acceso_proyecto` (dar, cambiar o quitar accesos; solo admin; busca al usuario por nombre en `profiles`; `rafa_asignar_acceso_proyecto`). Todas muestran antes/después, se recalculan al confirmar y no se repiten en un reintento.

## Catálogos

Empresas, cuentas, terceros, centros y unidades: alta/edición admin/contador, borrado admin, baja lógica con `activa`/`activo`. Borrar una empresa es destructivo (cascada). Baja lógica y reactivación con la función `cambiar_activo` (migración `20261027000000`), desde los botones de baja (centros, cuentas, empresas, proyectos; partidas y terceros con sus botones existentes) o desde Rafa con `proponer_baja` (con confirmación). Un centro se da de baja en cascada con sus partidas activas y su proyecto; `bajas_en_cascada` recuerda cuáles para que reactivarlo restaure exactamente esos. Lo dado de baja deja de aparecer en Rafa (búsquedas, carpetas de centros, avisos) salvo que se pida verlo. Rafa los consulta; crea centros/terceros como parte del plan de presupuesto y da de alta terceros con `proponer_tercero` (RFC con formato válido y único en la empresa; `rafa_crear_tercero`; con confirmación).
