# Matriz de cobertura de Rafa

Estado al 2026-10-16. "E2E" = prueba de punta a punta en entorno aislado (`supabase/tests/rafa/e2e`, PostgreSQL con las migraciones del repositorio + PostgREST + Edge Function en Deno + modelo simulado). "SQL" = `supabase/tests/rafa/20_rpc_transaccionales.sql`. "Unit" = Vitest. Ninguna prueba se ejecutó contra la base real.

Estados de integración: **Integrado** (consulta + acción con datos reales y pruebas), **Consulta** (solo lectura con datos reales), **Conocimiento** (documentado, sin herramientas de datos), **No disponible**.

## Matriz por módulo

| Módulo | Conocimiento | Consultas | Acciones | Validaciones y permisos | Pruebas | Estado |
|---|---|---|---|---|---|---|
| Empresas | [empresas-centros](modulos/empresas-centros.md) | `listar_empresas`, `buscar_registros`, `detalle_registro` | Ninguna (alta/baja en la interfaz) | Empresa explícita; nunca se elige la primera si hay varias | E2E: pedir empresa, aislamiento | Consulta |
| Centros de negocio | [empresas-centros](modulos/empresas-centros.md) | `buscar_registros`, `detalle_registro` | Creación solo vía plan de presupuesto (existente) | admin/contador | E2E indirecto (filtros por centro/proyecto) | Consulta |
| Cuentas contables | [cuentas](modulos/cuentas.md) | `buscar_registros`, `detalle_registro`, `saldos_cuentas` | Ninguna | admin/contador; balanza con fórmula compartida | E2E: balanza de bancos; Unit: fórmulas | Consulta |
| Terceros | [terceros](modulos/terceros.md) | `buscar_registros`, `detalle_registro` | Creación solo vía plan (existente) | admin/contador; tercero de la misma empresa en acciones | E2E indirecto (validación de alcance) | Consulta |
| Presupuestos y unidades | [presupuestos](modulos/presupuestos.md), [cifras](cifras.md) | `resumen_presupuesto`, `explicar_partida`, `buscar_registros`, `detalle_registro` | `simular_incremento_presupuesto`, `proponer_ajuste_presupuesto`, `proponer_plan_presupuesto` | `aplicar_a` obligatorio; control optimista; auditoría por trigger existente; alta de partidas solo admin (RLS, editor existente) | E2E: totales por tipo, dos métodos de ejercido, simulación sin escritura, propuesta desactualizada y reejecución, auditoría; SQL: ajuste optimista | Integrado |
| Flujos programados | [flujos-programados](modulos/flujos-programados.md) | `flujo_proyectado`, `sugerir_programacion_periodo`, `explicar_partida` | Ninguna directa (el plan existente los genera) | Fuente única con proyectos; IVA y tesorería en capas separadas | E2E: capas por mes, fuente única, candidatos | Consulta |
| Programaciones (tesorería) | [programaciones](modulos/programaciones.md) | `consultar_programaciones`, `comparar_programacion_presupuesto`, `excepciones_respaldo_presupuestal`, `sugerir_programacion_periodo` | `proponer_programaciones` (con recurrencia), `proponer_cambio_estado_programaciones` | Respaldo presupuestal obligatorio para nuevas; tipo de partida; duplicados; confirmación con huella; revalidación de rol | E2E: semana con efecto acumulado, continuidad, recurrentes, confirmación, reintento, concurrencia, duplicados, revocación de rol; SQL: rollback, RLS, idempotencia; Unit: acumulado y excepciones | Integrado |
| Asientos y movimientos | [asientos](modulos/asientos.md) | `consultar_asientos`, `detalle_registro` | `proponer_asientos_borrador` (explícitos o desde programaciones), `proponer_aplicar_asientos` | Validador compartido; cuentas de saldo de la empresa; nunca contabiliza borradores; aplicar solo a petición y con confirmación | E2E: borrador ligado, rechazo de segundo asiento, cuenta de banco obligatoria, aplicar y no doble conteo; SQL: descuadre, vínculo único | Integrado |
| Proyectos y programación financiera | [proyectos](modulos/proyectos.md) | `resumen_proyecto`, `auditoria_proyecto`, `detalle_registro`, `buscar_registros` | Ninguna sobre programación financiera/cronograma (interfaz) | Acceso por rol y `proyecto_usuarios`; proyectado oculto sin permiso | E2E: usuario asignado, usuario ajeno, arquitecto con corte | Consulta |
| Tareas, cronograma, programación financiera y accesos de proyecto | [proyectos](modulos/proyectos.md) | `consultar_tareas`, `buscar_registros` | `proponer_tarea`, `proponer_cronograma_partida`, `proponer_programacion_financiera`, `proponer_reprogramacion_masiva`, `proponer_acceso_proyecto` | admin/contador (RLS); sin duplicar títulos abiertos | E2E: creación, duplicado, arquitecto rechazado | Integrado |
| Usuarios y roles | [usuarios](modulos/usuarios.md) | Ninguna (identidad y roles solo para autorización) | Ninguna | Roles leídos en el servidor | E2E: matriz de roles | Conocimiento |
| Auditoría y cronograma compartido | [proyectos](modulos/proyectos.md) | `auditoria_proyecto` | Ninguna | Acceso al proyecto | E2E: consulta | Consulta |
| Reportes | [reportes](modulos/reportes.md) | `saldos_cuentas`, `flujo_proyectado`, `resumen_presupuesto` (mismas fórmulas, no la presentación) | Ninguna | admin/contador | E2E | Consulta parcial |
| Rafa (sesiones, conversaciones, acciones) | [rafa](modulos/rafa.md) | Historial propio | Confirmar/cancelar desde la interfaz | Mensajes y acciones solo escritos por el servidor; lectura propia | E2E: conversación ajena rechazada, bitácora; SQL: bitácora protegida | Integrado |
| Terceros (alta con RFC) | [terceros](modulos/terceros.md) | `buscar_registros` | `proponer_tercero` | admin/contador; RFC válido y único por empresa | E2E: alta, duplicado, RFC inválido | Integrado |
| Bajas (centros en cascada, partidas, terceros, cuentas, proyectos) | [acciones](acciones.md) | `buscar_registros` (activos por defecto) | `proponer_baja` | admin/contador; reactivación restaura lo dado de baja en cascada | E2E: centro en cascada y reactivación, tercero, sin rol; Unit: charlas ocultas | Integrado |
| Archivos y centro de la conversación | [rafa](modulos/rafa.md) | `abrir_archivos`, resumen del centro, aviso semanal | — | Archivos propios de la charla o del mismo centro | E2E: abrir archivo de otra charla del centro, ajeno rechazado; resumen y aviso | Integrado |
| Conocimiento del sistema | [README](README.md) | `buscar_conocimiento`, `describir_entidad` | — | Versionado por hash | Unit: sincronía, recuperación; E2E: versión registrada | Integrado |

## Comprobaciones funcionales solicitadas

| Comprobación | Dónde |
|---|---|
| Respuestas respaldadas por registros y alcance correcto | E2E "compara la programación semanal…", "resto de consultas…" |
| Cálculos reproducibles sin doble conteo | E2E "al aplicar el asiento…"; Unit `rafa-programacion.test.ts` |
| Relaciones entre módulos (programación → partida → asiento) | E2E "reconstruye el origen…", "prepara el asiento borrador…" |
| Continuidad de conversación | E2E "continúa la conversación…" (contexto y memoria enviados al modelo) |
| Borradores y confirmaciones | E2E acciones; Unit `rafa-chat.test.tsx` |
| Reintentos, concurrencia y fallos | E2E "un reintento no duplica", "dos confirmaciones simultáneas", "informa fallos…"; SQL 2, 3, 4 |
| Restricciones por usuario, empresa y proyecto | E2E permisos y aislamiento; SQL 8, 9 |

## Lo que NO está cubierto

- Calidad de interpretación del modelo real (las pruebas usan un modelo simulado que decide las herramientas).
- Ejecución contra la base real y despliegue de la migración `20261016000000`.
- Acciones sobre catálogos distintos de terceros (cuentas, centros, unidades) y sobre usuarios/roles.
- Revisión visual (pendiente del responsable).

Herramientas registradas: `buscar_conocimiento`, `describir_entidad`, `listar_empresas`, `buscar_registros`, `detalle_registro`, `consultar_programaciones`, `comparar_programacion_presupuesto`, `excepciones_respaldo_presupuestal`, `resumen_presupuesto`, `explicar_partida`, `flujo_proyectado`, `sugerir_programacion_periodo`, `resumen_proyecto`, `consultar_tareas`, `auditoria_proyecto`, `consultar_asientos`, `saldos_cuentas`, `simular_incremento_presupuesto`, `simular_proyeccion_unidades`, `proponer_programaciones`, `proponer_asientos_borrador`, `proponer_ajuste_presupuesto`, `proponer_cambio_estado_programaciones`, `proponer_aplicar_asientos`, `proponer_tarea`, `proponer_plan_presupuesto`, `abrir_archivos`, `proponer_cronograma_partida`, `proponer_programacion_financiera`, `proponer_tercero`, `proponer_acceso_proyecto`, `proponer_baja`, `proponer_reprogramacion_masiva`.
