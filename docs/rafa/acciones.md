# Acciones de negocio

Para cada acción: quién la inicia, validaciones, función responsable, tablas, efectos indirectos, repetición/reversión y límites transaccionales. "Cliente" = escrituras directas desde el navegador con RLS; no hay transacción que abarque varias llamadas.

## Crear o editar una partida presupuestal

Inicio: Presupuestos → Nueva/Editar (`PresupuestoDialog.handleSave`); también Rafa (plan de presupuesto, `aplicarPlanRafa`). Quién: INSERT solo admin, UPDATE admin/contador (RLS). Valida en cliente empresa, partida y números. Tablas: `presupuestos` y, si la partida no es de un proyecto activo, `flujos_programados` (por id: actualiza, inserta nuevos, elimina quitados). Efectos: cambio de cantidad/precio se audita (`trg_audit_presupuesto_change`); cambia presupuestado, por ejercer y "pendiente de ajustar" en Proyectos. Repetir: el mismo guardado (doble clic, reintento) no se repite (clave `p_operacion`, `presupuesto_guardados`); editar conserva el id; una nueva alta crea otra partida (no hay unicidad por nombre); Rafa evita duplicar con el rastro de la sesión. Revertir: editar de nuevo o desactivar. Desde el formulario: RPC `guardar_presupuesto`, atómica, con control de versión. El plan de Rafa (`aplicarPlanRafa`) sigue escribiendo desde el cliente, no atómico.

## Programar flujos de una partida

Inicio: formulario de partida (pestaña de flujos) o plan de Rafa. Quién: admin/contador. Tabla: `flujos_programados`. Bloqueado por trigger si la partida es de Proyecto. Efecto: proyectado de reportes. Formulario de partida: `guardar_presupuesto` en una transacción (actualiza por id, inserta nuevos, elimina quitados; el contador no puede quitar y recibe error sin cambios). Plan de Rafa: borra y reinserta desde el cliente, no atómico.

## Programar la financiera de una partida de proyecto

Inicio: Proyecto → Programación financiera (`ProgramacionPartidaDialog`), también desde la partida en Presupuestos. Quién: admin/contador o usuario con `editar_programacion_financiera` (RLS). Valida anticipo con fecha, al menos un pago, montos > 0; triggers validan empresa/centro/proyecto y borran flujos legacy. Tablas: `proyecto_programacion_financiera`, `proyecto_programacion_pagos`, `proyecto_auditoria`. Reemplaza todos los pagos en cada guardado; no atómico.

## Crear, editar, copiar o eliminar una programación de tesorería

Inicio: Programación (`ProgramacionDialog.handleSave`, `handleDelete`). Quién: crear/editar admin/contador; eliminar solo admin. Valida empresa, monto > 0 y partida del centro (cliente). Tabla: `programaciones`. Efectos: KPIs y proyección de la pantalla; comparación contra presupuesto. Repetir crea duplicados (no hay clave natural). Rafa: `proponer_programaciones` crea en una transacción (`rafa_crear_programaciones`) con respaldo presupuestal obligatorio y confirmación.

## Ejecutar o cancelar una programación

Inicio: Programación → Ejecutar (`handleExecute`). Solo cambia `estado` a `ejecutado`; no crea asiento. Quién: admin/contador. Revertir: no hay botón; editar no cambia estado. Rafa: `proponer_cambio_estado_programaciones` (pendiente → ejecutado/cancelado) con confirmación y control optimista (`rafa_cambiar_estado_programaciones`).

## Capturar un asiento contable

Inicio: Asientos → Nuevo/Editar/Copiar (`AsientoDialog`) o página `/asientos/:id`. Quién: admin/contador. Valida `validarAsiento` (cuadre, diario con partida, alcance de partidas en el diálogo). Tablas: `asientos_contables`, `asiento_movimientos`. Estado inicial `borrador`: no afecta ejercido ni saldos. Cliente, no atómico (editar borra y reinserta renglones). Rafa: `proponer_asientos_borrador` usa `rafa_crear_asientos_borrador` (una transacción, siempre borrador) y puede ligar la programación de origen (`programaciones.asiento_id`), rechazando un segundo asiento vigente para la misma programación.

## Aplicar, cancelar o eliminar un asiento

Aplicar (`borrador → aplicado`): afecta ejercido, saldos, reportes y genera flujos de IVA (trigger). Cancelar (`aplicado → cancelado`): revierte esos efectos (borra flujos IVA). Eliminar: solo borrador o cancelado; admin, o contador con código de admin; cascada a renglones. Rafa: solo aplica asientos si el usuario lo pide expresamente, con confirmación (`proponer_aplicar_asientos`, `rafa_aplicar_asientos`, verifica cuadre y que no hayan cambiado). Rafa no cancela ni elimina asientos.

## Ajustar presupuesto por porcentaje

Rafa: `simular_incremento_presupuesto` (no escribe) y `proponer_ajuste_presupuesto` (escribe con confirmación). Requiere decidir si el incremento se aplica a `precio_unitario` o a `cantidad`; no se asume. `rafa_ajustar_presupuestos` actualiza con control optimista (falla si la partida cambió) en una transacción; la auditoría la registra el trigger existente. No modifica flujos ni programación de proyecto: la diferencia queda "por programar" y se reporta.

## Gestión de proyecto

Generar proyecto desde un centro; marcar partidas como de proyecto (`es_project`, auditado); editar cronograma (`actualizar_cronograma_partida`); tareas (crear/editar/mover/borrar, admin/contador); accesos (`proyecto_usuarios`, admin); compartir cronograma (token). Rafa puede crear tareas (`proponer_tarea`, `rafa_crear_tarea`) y consultar todo lo anterior según el acceso del usuario; las demás acciones de proyecto siguen en la interfaz.

## Catálogos

Empresas, cuentas, terceros, centros y unidades: alta/edición admin/contador, borrado admin, baja lógica con `activa`/`activo`. Borrar una empresa es destructivo (cascada). Rafa los consulta; solo crea centros/terceros como parte del plan de presupuesto existente.
