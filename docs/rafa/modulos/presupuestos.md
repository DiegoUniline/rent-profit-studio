# Presupuestos y unidades de medida

Evidencia: código y SQL local. Fuentes: `src/pages/Presupuestos.tsx`, `src/components/dialogs/PresupuestoDialog.tsx`, `src/lib/presupuesto-guardado.ts`, `src/pages/EjercidoDetalle.tsx`, `src/lib/tipo-movimiento.ts`, `supabase/functions/_shared/negocio/calculos.ts`, migraciones `20260807151136_modulo_project.sql`, `20260809120000_proyecto_programacion_financiera.sql`, `20260828120000_fuente_unica_programacion_proyecto.sql`, `20260831195734_*.sql`, `20261017000000_presupuestos_guardado_atomico.sql`.

## Partida presupuestal: significado del registro

Cada fila de `presupuestos` es una **partida**: un concepto autorizado de una empresa, normalmente ligado a un centro de negocio, una cuenta contable y opcionalmente un tercero. No hay tabla de "presupuesto" cabecera: un presupuesto es el conjunto de partidas filtradas por empresa/centro/cuenta.

Campos capturados: `partida` (texto), `cantidad` y `precio_unitario` (numeric), `cuenta_id`, `centro_negocio_id`, `tercero_id`, `unidad_medida_id`, `notas`, `tipo_movimiento`, `activo`. Orden manual `orden` (arrastrar y soltar en la pantalla). Campos administrados por Proyectos: `es_project`, `responsable_tercero_id`, `fecha_inicio`, `fecha_fin`, `avance_manual` (0–100, CHECK). `frecuencia` (enum) existe pero el formulario actual no la escribe.

**Presupuestado (importe autorizado) = cantidad × precio_unitario** (`calcularMontoPresupuestado`). No es un campo: se calcula siempre. Valores nulos o inválidos cuentan como 0.

## Tipo de movimiento de la partida

`tipo_movimiento` (enum `tipo_movimiento_flujo`: `ingreso`, `egreso`, `no_afecta`) es la fuente única del tipo. `NULL` = **pendiente de clasificar**: la partida se muestra pero NO entra en los totales de flujo. La migración `20260831195734` lo rellenó: primero con el tipo único de sus flujos programados; si no, por el primer dígito de la cuenta (4 → ingreso; 5 o 6 → egreso).

Los totales de la pantalla Presupuestos solo suman partidas **activas** con tipo `ingreso` o `egreso`, separadas por tipo; `no_afecta` y pendientes se excluyen.

## Ejercido de una partida en Presupuestos

La pantalla Presupuestos y la vista `/presupuestos/:id/ejercido` usan el **método por naturaleza** (`calcularEjercidoPorNaturaleza` / `ladoEjercidoPorCodigo`): de los renglones de asientos `aplicado` ligados a la partida (`asiento_movimientos.presupuesto_id`) se suma un solo lado según el código de la cuenta de la partida: 1 (activo) → haber; 2 (pasivo) y 3 (capital) → debe; 5 y 6 (costos/gastos) → debe; 4 (ingresos) y otros → haber. Si la partida no tiene cuenta, Presupuestos toma la del primer movimiento; la vista de Ejercido toma la de cada renglón.

Por ejercer = presupuestado − ejercido. Porcentaje = ejercido / presupuestado × 100 (0 si el presupuestado es 0). El módulo Proyectos usa otro método (debe + haber): ver [cifras](../cifras.md).

## Acciones sobre partidas

- **Crear/editar** (`PresupuestoDialog.handleSave` → RPC `guardar_presupuesto`, migración `20261017000000`): INSERT solo admin (RLS); UPDATE admin/contador. Una sola transacción, SECURITY INVOKER. Sin id crea una partida (también "Copiar"); con id la actualiza en sitio (solo los campos del formulario; fechas, frecuencia, `es_project`, avance, activo y orden se conservan) y renueva `updated_at`. Pagos (`flujos_programados`) si la partida NO pertenece a un proyecto activo de su centro: los que traen id se actualizan (solo si cambiaron), los nuevos se insertan y solo los quitados se eliminan; si el usuario no puede eliminar (contador) falla todo, sin cambios. Si pertenece a un proyecto, no toca pagos (`p_flujos = null`): su programación vive en Proyectos. Idempotente por `p_operacion` (tabla `presupuesto_guardados`; el cliente reutiliza la clave en un reintento idéntico) y con control de versión (`p_version` = `updated_at` leído al abrir → `PRESUPUESTO_DESACTUALIZADO`). Pruebas: `supabase/tests/presupuestos/`. Antes de esta corrección se borraban y reinsertaban todos los pagos en llamadas separadas; para un contador el borrado no afectaba filas (RLS) y cada guardado duplicaba los pagos. Diagnóstico de solo lectura de lo afectado: `supabase/diagnosticos/presupuestos_duplicados.sql`.
- **Copiar**: abre el formulario con los datos y "Copia de …" como nuevo registro.
- **Activar/Desactivar** (`handleToggleActivo`): baja lógica; las partidas inactivas no se ofrecen en asientos/programaciones y no suman en totales activos.
- **Reordenar**: actualiza `orden`.
- **Cambiar cantidad o precio** dispara `trg_audit_presupuesto_change`, que registra en `proyecto_auditoria` (`presupuesto.monto`) el valor anterior y nuevo; cambiar `es_project` registra `presupuesto.es_project`. Solo se audita si hay usuario autenticado en el contexto.
- **Eliminar**: borra en cascada `flujos_programados` y la programación de proyecto de la partida; los movimientos de asientos quedan con `presupuesto_id = NULL` (SET NULL) y las programaciones de tesorería impiden el borrado (FK sin acción).

## Unidades de medida

`unidades_medida` es un catálogo GLOBAL (no tiene `empresa_id`): `codigo` único, `nombre`, `activa`. Se usa en `presupuestos.unidad_medida_id`. RLS: lectura autenticados; alta/edición admin/contador; no hay política de borrado. Pantalla: `UnidadMedidaDialog` desde el formulario de partida. El plan de Rafa guarda la unidad como texto en `notas` ("Unidad: …"), no en `unidad_medida_id`.
