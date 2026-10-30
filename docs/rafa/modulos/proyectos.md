# Proyectos, tareas y programación financiera de proyecto

Evidencia: código y SQL local. Fuentes: `src/pages/Proyectos.tsx`, `src/pages/ProyectoDetalle.tsx`, `src/components/proyectos/*`, `src/components/dialogs/ProgramacionPartidaDialog.tsx`, `src/components/dialogs/ProyectoPartidaSeguimientoDialog.tsx`, `src/components/dialogs/CronogramaPartidaDialog.tsx`, `src/components/dialogs/TareaDialog.tsx`, `src/lib/project-permissions.ts`, `src/pages/CronogramaPublico.tsx`, migraciones `20260807151136`, `20260807194351`, `20260809120000`, `20260811150100`, `20260828120000`, `20260829090000`.

## Proyecto (Project)

`proyectos`: un proyecto **es** un centro de negocio (`centro_negocio_id` UNIQUE, FK cascada) de una empresa, con `nombre` y `activo`. Se crea desde Centros de negocio → Generar Project. Sus **partidas** no se ligan por FK al proyecto: son las filas de `presupuestos` de la misma empresa y centro; las que se gestionan en el módulo tienen `es_project = true` (casilla en el detalle del proyecto, `toggleEsProject`). Relación implementada en código y en las funciones SQL de validación, no por FK directa.

Lista `/proyectos`: por proyecto suma presupuesto y ejercido de partidas `es_project` activas (proyectado mostrado como 0 en la lista). Detalle `/proyectos/:id`: resumen, cronograma (Gantt), seguimiento por partida, programación financiera, tareas, accesos y auditoría.

## Cifras del proyecto

Por partida de proyecto (`ProyectoDetalle`, `project-utils`):
- Presupuesto = cantidad × precio_unitario.
- Ejercido = **debe + haber** de renglones de asientos `aplicado` ligados a la partida (`calcularEjercidoPorPartida`). Distinto del método por naturaleza de Presupuestos.
- Proyectado = suma de `proyecto_programacion_pagos` de su programación propia; sin programación = $0 (nunca se usan flujos legacy). Proyectado acumulado = pagos con fecha ≤ hoy.
- Disponible = presupuesto − ejercido; avance = ejercido / presupuesto × 100 (o `avance_manual` si existe, para cronograma); desviación = ejercido acumulado − proyectado acumulado. Se agregan sumando montos, nunca promediando porcentajes (`agregarFinanciero`).
- "Pendiente de ajustar": |programado − presupuesto| > 0.01.

## Programación financiera de proyecto

`proyecto_programacion_financiera`: UNA por partida (`presupuesto_id` UNIQUE), con `proyecto_id`, `empresa_id`, `modo` (`automatica`/`manual`), anticipo (`tiene_anticipo`, `anticipo_monto`, `anticipo_fecha`), `frecuencia` (semanal, quincenal, mensual, trimestral, semestral, anual, personalizada), `fecha_inicio`, `numero_pagos`.

`proyecto_programacion_pagos`: los pagos calendarizados (`fecha`, `monto` > 0 CHECK, `concepto`, `es_anticipo`, `orden`) de esa programación. Representan el **proyectado** del proyecto, no pagos reales ni programación de tesorería.

Guardar (`ProgramacionPartidaDialog.handleGuardar`) usa la RPC `guardar_programacion_partida` (migración `20261025000000`): en una transacción crea o actualiza la cabecera, **reemplaza todos los pagos** (verificando que el borrado sí ocurrió), valida que lo programado no supere el presupuesto y registra auditoría `programacion_financiera` (si la bitácora falla no bloquea). Idempotente por clave de operación (`programacion_partida_guardados`). Rafa propone la programación con `proponer_programacion_financiera` y el cronograma con `proponer_cronograma_partida`; para 2 o más partidas usa `proponer_reprogramacion_masiva` (hasta 1000 partidas por rango "de la X a la Y", texto o ids; mover a una fecha, recorrer N meses/días o reprogramar por frecuencia; reemplaza lo programado; una confirmación y una transacción con la RPC `rafa_reprogramar_masiva`, migración `20261030000000`, que reemplaza pagos por lote y falla si cambiaron desde la propuesta); los accesos (`proyecto_usuarios`) con `proponer_acceso_proyecto` (solo admin). Triggers: `trg_validar_programacion_partida_project` (misma empresa/centro, partida activa y `es_project`, proyecto activo), `trg_validar_pago_programacion_project` (el pago pertenece al proyecto de su programación), `trg_cleanup_flujos_legacy` (al crear, borra flujos legacy de la partida).

## Tareas

`proyecto_tareas`: título, notas, responsable (tercero), `fecha_vencimiento`, `estado` (enum `tarea_estado`: `pendiente`, `en_progreso`, `bloqueada`, `hecho`), color y orden. Independientes de las partidas. Vencida = tiene fecha anterior a hoy y no está `hecho` (`isTareaVencida`). El tablero kanban actualiza estado y orden con varias llamadas no atómicas. RLS: ver admin/contador/arquitecto o asignados; crear, editar y borrar admin/contador.

## Accesos, cronograma y auditoría

- `proyecto_usuarios`: asigna un usuario a un proyecto con banderas `editar_cronograma`, `ver_programacion_financiera`, `editar_programacion_financiera`. Gestionan solo admin (RLS). Acceso efectivo (`useProyectoAcceso`, replicado por Rafa en el servidor): admin/contador todo; arquitecto ve todo y solo edita cronograma; usuario según sus banderas; editar presupuesto solo admin/contador.
- Cronograma: `actualizar_cronograma_partida` (RPC SECURITY DEFINER) es el único camino para editar `fecha_inicio`, `fecha_fin` y `avance_manual` sin rol contable; valida permiso. El cliente además inserta auditoría `cronograma.fecha`.
- El flujo de efectivo manda sobre el Gantt (migración `20261027120000`): cada vez que cambian los pagos de la programación financiera de una partida `es_project` (desde Proyectos, Presupuestos o Rafa), sus `fecha_inicio`/`fecha_fin` se alinean solas al primer y último pago (triggers `trg_cronograma_sigue_pagos_*`, función `alinear_cronograma_con_pagos`). Mover la barra del Gantt no toca los pagos; el siguiente cambio de pagos vuelve a alinear la barra. Sin pagos, la barra se queda como está.
- `proyecto_auditoria`: bitácora (acción, valor anterior/nuevo, usuario). Fuentes: cliente (`cronograma.fecha`, `programacion_financiera`) y trigger (`presupuesto.monto`, `presupuesto.es_project`).
- `proyecto_cronograma_shares`: token público por proyecto; `get_cronograma_publico` (SECURITY DEFINER, ejecutable por anónimos) expone solo partidas, cuentas, fechas y avance, nunca montos. Ruta pública `/cronograma/:token`.
- Acceso a la ruta: además del rol, existe una lista de correos temporal para Proyectos (`src/lib/feature-access.ts`) no usada por la ruta actual (`ProtectedRoute` acepta `allowedEmails` pero las rutas de proyectos no lo pasan).
