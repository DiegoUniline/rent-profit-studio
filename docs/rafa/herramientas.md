# Catálogo de herramientas de Rafa

ARCHIVO GENERADO por `scripts/rafa-herramientas.mjs` desde `supabase/functions/_shared/rafa/registro.ts`. No editar a mano: ejecuta `npm run rafa:conocimiento`.

Cada herramienta valida su entrada contra el esquema (rechaza parámetros no declarados), verifica el rol en el servidor y consulta con el JWT del usuario (RLS). Las acciones escriben solo mediante RPC transaccionales (`rafa_*`) y quedan en `rafa_acciones`.

| Herramienta | Módulo | Tipo | Roles | Confirmación |
|---|---|---|---|---|
| `buscar_conocimiento` | conocimiento | Conocimiento | admin, contador, usuario, arquitecto | No |
| `describir_entidad` | conocimiento | Conocimiento | admin, contador, usuario, arquitecto | No |
| `listar_empresas` | empresas | Consulta | admin, contador, usuario, arquitecto | No |
| `buscar_registros` | general | Consulta | admin, contador, usuario, arquitecto | No |
| `detalle_registro` | general | Consulta | admin, contador, usuario, arquitecto | No |
| `consultar_programaciones` | programaciones | Consulta | admin, contador | No |
| `comparar_programacion_presupuesto` | programaciones | Consulta | admin, contador | No |
| `excepciones_respaldo_presupuestal` | programaciones | Consulta | admin, contador | No |
| `resumen_presupuesto` | presupuestos | Consulta | admin, contador | No |
| `explicar_partida` | presupuestos | Consulta | admin, contador | No |
| `flujo_proyectado` | flujos_programados | Consulta | admin, contador | No |
| `sugerir_programacion_periodo` | programaciones | Consulta | admin, contador | No |
| `resumen_proyecto` | proyectos | Consulta | admin, contador, usuario, arquitecto | No |
| `consultar_tareas` | proyectos | Consulta | admin, contador, usuario, arquitecto | No |
| `auditoria_proyecto` | proyectos | Consulta | admin, contador, usuario, arquitecto | No |
| `consultar_asientos` | asientos | Consulta | admin, contador | No |
| `saldos_cuentas` | cuentas | Consulta | admin, contador | No |
| `simular_incremento_presupuesto` | presupuestos | Simulación | admin, contador | No |
| `simular_proyeccion_unidades` | presupuestos | Simulación | admin, contador | No |
| `proponer_programaciones` | programaciones | Acción | admin, contador | Sí, en la interfaz |
| `proponer_asientos_borrador` | asientos | Acción | admin, contador | Solo si es masiva (> 3) |
| `proponer_ajuste_presupuesto` | presupuestos | Acción | admin, contador | Sí, en la interfaz |
| `proponer_cambio_estado_programaciones` | programaciones | Acción | admin, contador | Sí, en la interfaz |
| `proponer_aplicar_asientos` | asientos | Acción | admin, contador | Sí, en la interfaz |
| `proponer_tarea` | proyectos | Acción | admin, contador | No |
| `proponer_plan_presupuesto` | presupuestos | Acción | admin, contador | Sí, en la interfaz |

## buscar_conocimiento

Busca en la documentación versionada del sistema (módulos, tablas, reglas, fórmulas, estados, permisos, acciones y origen de cifras). Úsala para explicar CÓMO funciona algo; no devuelve datos actuales.

- Módulo: conocimiento. Tipo: Conocimiento. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Consulta de texto obligatoria.
- Devuelve: Fragmentos relevantes con sus fuentes y la versión del conocimiento.

Parámetros (* obligatorio):
- `consulta` * — string: Pregunta o términos a buscar
- `modulo` — string: Opcional: limita a un módulo (por ejemplo presupuestos, programaciones, proyectos, cifras, esquema)

## describir_entidad

Describe una tabla del sistema según el esquema local versionado: columnas con tipo, obligatoriedad y valores predeterminados, llaves y relaciones físicas, triggers y políticas RLS. Complementa con buscar_conocimiento para el significado de negocio.

- Módulo: conocimiento. Tipo: Conocimiento. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: La tabla debe existir en el esquema versionado.
- Devuelve: Definición de la tabla y advertencia de que es SQL local (no certifica la base real).

Parámetros (* obligatorio):
- `tabla` * — string: Nombre de la tabla, por ejemplo presupuestos o programaciones

## listar_empresas

Lista las empresas activas visibles para el usuario (id y nombre). Úsala para resolver a qué empresa se refiere el usuario.

- Módulo: empresas. Tipo: Consulta. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Solo empresas activas.
- Devuelve: Lista de empresas con id y nombre.

Parámetros (* obligatorio):
- (sin parámetros)

## buscar_registros

Busca registros de un módulo con filtros y paginación (centros, terceros, cuentas, partidas de presupuesto, proyectos, unidades, asientos, programaciones, tareas). Devuelve el total que cumple el filtro y si la página está truncada. Para cifras agregadas usa las herramientas de análisis.

- Módulo: general. Tipo: Consulta. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Catálogos contables, asientos y programaciones solo para admin/contador; Proyectos y tareas filtrados por RLS y acceso al proyecto; Texto saneado antes de construir el filtro.
- Devuelve: Página de registros con enlaces, total y bandera de truncado.

Parámetros (* obligatorio):
- `entidad` * — centros_negocio / terceros / cuentas_contables / presupuestos / proyectos / unidades_medida / asientos / programaciones / tareas: Módulo a buscar
- `empresa_id` — string (uuid): Empresa (obligatoria salvo unidades_medida; si falta y hay varias, se pedirá)
- `texto` — string: Texto a buscar (nombre, código, RFC, partida u observaciones)
- `activo` — boolean: Filtrar activos/inactivos (catálogos y partidas)
- `estado` — string: Estado (asientos: borrador/aplicado/cancelado; programaciones: pendiente/ejecutado/cancelado; tareas)
- `tipo` — string: Tipo (asientos: ingreso/egreso/diario; programaciones: ingreso/egreso; terceros: cliente/proveedor/ambos; partidas: tipo_movimiento)
- `centro_negocio_id` — string (uuid): Centro de negocio
- `proyecto_id` — string (uuid): Proyecto (para tareas)
- `codigo_prefijo` — string: Prefijo de código de cuenta, por ejemplo 600
- `desde` — string (date): Fecha inicial (asientos, programaciones, tareas)
- `hasta` — string (date): Fecha final
- `limite` — integer: Máximo de filas (1-50, por defecto 20)
- `desplazamiento` — integer: Filas a saltar para paginar

## detalle_registro

Devuelve un registro y sus relaciones directas para seguir la cadena entre módulos: partida → cuenta/centro/proyecto/programaciones/asientos; asiento → renglones/partidas/programación ligada/flujos IVA; programación → partida/asiento; proyecto → centro/partidas/tareas.

- Módulo: general. Tipo: Consulta. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Registros contables solo admin/contador; Proyectos y tareas según acceso al proyecto; El registro debe ser visible por RLS.
- Devuelve: Registro, relaciones y enlaces.

Parámetros (* obligatorio):
- `entidad` * — presupuesto / asiento / programacion / proyecto / cuenta / tercero / centro_negocio / empresa / tarea: Tipo de registro
- `id` * — string (uuid): Id del registro

## consultar_programaciones

Lista programaciones de tesorería (cobros/pagos agendados) de una empresa en un periodo, con totales por tipo y estado y los KPIs de la pantalla Programación (pendientes). Filtra por estado, tipo, centro, proyecto, partida o tercero.

- Módulo: programaciones. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única; desde ≤ hasta; Proyecto de la misma empresa.
- Devuelve: Programaciones con enlaces, totales y alcance.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` * — string (date): Fecha inicial (incluida)
- `hasta` * — string (date): Fecha final (incluida)
- `estados` — array: Estados a incluir (por defecto todos)
- `tipo` — ingreso / egreso: Tipo
- `centro_negocio_id` — string (uuid): Centro de negocio
- `proyecto_id` — string (uuid): Proyecto (usa su centro de negocio)
- `presupuesto_id` — string (uuid): Partida presupuestal
- `tercero_id` — string (uuid): Tercero
- `sin_partida` — boolean: Solo programaciones sin partida presupuestal

## comparar_programacion_presupuesto

Compara las programaciones de tesorería de un periodo contra el presupuesto de cada partida con EFECTO ACUMULADO: ejercido + pendientes anteriores + programaciones del periodo en orden de fecha. Indica qué partidas exceden, desde qué programación, y las excepciones (sin partida, partida inactiva o de otro centro). No duplica: excluye pendientes cuyo asiento ligado ya está aplicado y no suma ejecutadas.

- Módulo: programaciones. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única; Lee todas las programaciones no canceladas hasta el fin del periodo de las partidas involucradas.
- Devuelve: Por partida: presupuestado, ejercido, pendiente previo, programado en el periodo, disponible final y filas con disponible tras cada programación; excepciones y avisos.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` * — string (date): Inicio del periodo
- `hasta` * — string (date): Fin del periodo
- `centro_negocio_id` — string (uuid): Centro de negocio
- `proyecto_id` — string (uuid): Proyecto (usa su centro)
- `metodo_ejercido` — naturaleza / debe_haber: Método de ejercido: naturaleza (pantalla Presupuestos, por defecto) o debe_haber (módulo Proyectos)

## excepciones_respaldo_presupuestal

Identifica programaciones PENDIENTES existentes que no cumplirían la regla de respaldo presupuestal: sin partida, con partida inactiva, de otra empresa/centro, o cuyas partidas de egreso ya exceden su presupuesto con lo pendiente. Úsala antes de proponer exigir respaldo en la captura.

- Módulo: programaciones. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única.
- Devuelve: Listado de excepciones por motivo con totales.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` — string (date): Desde (opcional)
- `hasta` — string (date): Hasta (opcional)

## resumen_presupuesto

Presupuestado, ejercido, por ejercer y % por partida y totales por tipo de movimiento, con la misma regla de la pantalla Presupuestos (totales solo de partidas activas con tipo ingreso/egreso). Responde '¿cuánto llevamos ejercido?'.

- Módulo: presupuestos. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única; Proyecto de la misma empresa.
- Devuelve: Totales por tipo y detalle por partida con enlaces al ejercido.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `centro_negocio_id` — string (uuid): Centro de negocio
- `proyecto_id` — string (uuid): Proyecto (usa su centro)
- `tipo_movimiento` — ingreso / egreso / no_afecta / pendiente: Filtrar por tipo de movimiento
- `incluir_inactivas` — boolean: Incluir partidas inactivas en el detalle (nunca en totales)
- `metodo_ejercido` — naturaleza / debe_haber: Método de ejercido: naturaleza (pantalla Presupuestos, por defecto) o debe_haber (módulo Proyectos)

## explicar_partida

Reconstruye de dónde sale cada cifra de UNA partida: presupuestado (cantidad × precio), ejercido renglón por renglón con ambos métodos y la diferencia entre ellos, proyectado con su fuente (flujos o programación del proyecto) y programaciones de tesorería por estado. Úsala para 'explícame de dónde sale este total' o 'por qué no coincide'.

- Módulo: presupuestos. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: La partida debe ser visible y, si se indica, de la empresa.
- Devuelve: Cálculo reproducible con cada renglón, asiento y enlace.

Parámetros (* obligatorio):
- `presupuesto_id` * — string (uuid): Partida
- `empresa_id` — string (uuid): Empresa (opcional; se valida)

## flujo_proyectado

Proyectado por mes de las partidas de una empresa en un periodo, aplicando la regla de fuente única (partidas de proyecto: programación del proyecto; resto: flujos programados). Muestra APARTE el IVA automático (real) y la programación de tesorería pendiente; no los suma al proyectado.

- Módulo: flujos_programados. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única; Rango válido.
- Devuelve: Serie mensual por capa (proyectado, IVA automático, programación pendiente) y detalle por partida.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` * — string (date): Inicio
- `hasta` * — string (date): Fin
- `centro_negocio_id` — string (uuid): Centro
- `proyecto_id` — string (uuid): Proyecto
- `tipo_movimiento` — ingreso / egreso: Solo partidas de este tipo

## sugerir_programacion_periodo

Prepara candidatos para la programación de tesorería de un periodo a partir de las operaciones recurrentes ya proyectadas (flujos programados y pagos de programación de proyecto) que aún no tienen una programación de tesorería de la misma partida en el periodo. No escribe nada: sirve de base para proponer_programaciones.

- Módulo: programaciones. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única; Solo partidas activas con tipo ingreso/egreso.
- Devuelve: Candidatos (partida, fecha, monto, tipo, fuente) y los ya programados que se omitieron.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` * — string (date): Inicio
- `hasta` * — string (date): Fin
- `centro_negocio_id` — string (uuid): Centro
- `proyecto_id` — string (uuid): Proyecto

## resumen_proyecto

Cifras del módulo Proyectos para un proyecto: por partida de proyecto, presupuesto, proyectado (programación propia; sin ella $0), proyectado acumulado a la fecha de corte, ejercido (debe + haber de asientos aplicados), disponible, avance, desviación y si la programación está pendiente de ajustar.

- Módulo: proyectos. Tipo: Consulta. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Acceso al proyecto (admin/contador/arquitecto o asignado); Proyectado solo si puede ver la programación financiera.
- Devuelve: Totales y detalle por partida con la misma fórmula de la pantalla del proyecto.

Parámetros (* obligatorio):
- `proyecto_id` * — string (uuid): Proyecto
- `fecha_corte` — string (date): Fecha de corte para el proyectado acumulado (por defecto hoy)

## consultar_tareas

Tareas de un proyecto con estado, responsable y vencimiento; puede filtrar por estado o solo vencidas (fecha anterior a hoy y no hechas).

- Módulo: proyectos. Tipo: Consulta. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Acceso al proyecto.
- Devuelve: Tareas y conteo por estado.

Parámetros (* obligatorio):
- `proyecto_id` * — string (uuid): Proyecto
- `estado` — pendiente / en_progreso / bloqueada / hecho: Estado
- `solo_vencidas` — boolean: Solo vencidas

## auditoria_proyecto

Bitácora de cambios de un proyecto (presupuesto autorizado, marca de proyecto, cronograma y programación financiera) con usuario, fecha y valores anterior/nuevo.

- Módulo: proyectos. Tipo: Consulta. Roles: admin, contador, usuario, arquitecto. Confirmación: No.
- Validaciones: Acceso al proyecto.
- Devuelve: Eventos de auditoría ordenados del más reciente al más antiguo.

Parámetros (* obligatorio):
- `proyecto_id` * — string (uuid): Proyecto
- `limite` — integer: Máximo de eventos (1-100)

## consultar_asientos

Lista asientos contables (pólizas) de una empresa en un periodo con totales por estado; filtra por estado, tipo, centro, tercero, partida ligada u observaciones.

- Módulo: asientos. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única.
- Devuelve: Asientos con enlaces, totales y alcance.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` * — string (date): Desde
- `hasta` * — string (date): Hasta
- `estado` — borrador / aplicado / cancelado: Estado
- `tipo` — ingreso / egreso / diario: Tipo
- `centro_negocio_id` — string (uuid): Centro
- `tercero_id` — string (uuid): Tercero
- `presupuesto_id` — string (uuid): Solo asientos con renglones ligados a esta partida
- `texto` — string: Texto en observaciones

## saldos_cuentas

Balanza de comprobación de una empresa (saldo inicial, debe, haber, saldo final por cuenta) con la misma fórmula de los reportes: solo asientos aplicados; saldo según naturaleza. Puede filtrar por prefijo de código (por ejemplo 100-001 para bancos).

- Módulo: cuentas. Tipo: Consulta. Roles: admin, contador. Confirmación: No.
- Validaciones: Empresa explícita o única; Lectura paginada de todos los movimientos aplicados de la empresa hasta la fecha de corte.
- Devuelve: Saldos por cuenta y totales por rubro.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `desde` — string (date): Inicio del periodo (sin él, todo es periodo)
- `hasta` * — string (date): Fecha de corte
- `codigo_prefijo` — string: Prefijo de código de cuenta
- `solo_con_movimiento` — boolean: Omitir cuentas sin saldo ni movimiento

## simular_incremento_presupuesto

SIMULA (no guarda) un incremento o reducción porcentual de partidas: presupuesto antes/después, disponible, y cómo cambia la proyección (proyectado actual vs nuevo presupuesto: lo que quedaría por programar). Requiere que el usuario diga si se ajusta el precio unitario o la cantidad.

- Módulo: presupuestos. Tipo: Simulación. Roles: admin, contador. Confirmación: No.
- Validaciones: admin/contador; Partidas de la empresa; aplicar_a obligatorio.
- Devuelve: Tabla antes/después y efecto en la proyección; no modifica nada.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `presupuesto_ids` — array: Partidas a ajustar
- `centro_negocio_id` — string (uuid): Todas las partidas activas del centro
- `proyecto_id` — string (uuid): Todas las partidas de proyecto activas
- `porcentaje` * — number: Porcentaje (5 = +5%, -10 = -10%)
- `aplicar_a` * — precio_unitario / cantidad: Qué se incrementa: precio unitario o cantidad (decisión del usuario; no asumir)

## simular_proyeccion_unidades

SIMULA (no guarda) una proyección por unidades: reparte un total en periodos de N unidades hasta completarlo (550 en lotes de 15 = 36 periodos de 15 y uno de 10), con fechas según la frecuencia. Si se da un precio unitario o una partida (toma su precio), calcula importes; si no, solo unidades. No contabiliza ingresos ni modifica presupuestos.

- Módulo: presupuestos. Tipo: Simulación. Roles: admin, contador. Confirmación: No.
- Validaciones: Máximo 600 periodos; Precio solo del usuario o de la partida indicada (nunca supuesto).
- Devuelve: Periodos con fecha, unidades, acumulado e importe si hay precio.

Parámetros (* obligatorio):
- `total_unidades` * — number: Total de unidades a completar
- `unidades_por_periodo` * — number: Unidades por periodo
- `frecuencia` * — semanal / quincenal / mensual / trimestral / semestral / anual: Frecuencia
- `fecha_inicio` * — string (date): Fecha del primer periodo
- `precio_unitario` — number: Precio por unidad (solo si el usuario lo indicó)
- `presupuesto_id` — string (uuid): Partida de la que se toma el precio unitario
- `empresa_id` — string (uuid): Empresa de la partida
- `unidad` — string: Nombre de la unidad (lotes, piezas, m2…)

## proponer_programaciones

Prepara nuevas programaciones de tesorería (pendientes) — explícitas o recurrentes (frecuencia, número de periodos, monto por periodo o total) — con respaldo presupuestal obligatorio. NO las crea: registra una propuesta que el usuario debe confirmar en la interfaz. Rechaza posibles duplicados salvo indicación expresa.

- Módulo: programaciones. Tipo: Acción. Roles: admin, contador. Confirmación: Sí, en la interfaz.
- Validaciones: admin/contador (RLS de programaciones); Partida activa de la misma empresa y centro; Tipo coincide con el tipo de movimiento de la partida; Egresos: ejercido + pendientes + nuevas ≤ presupuestado; Sin duplicados por partida/fecha/monto salvo autorización.
- Devuelve: Propuesta con vista previa y huella; se ejecuta solo al confirmar (rafa_crear_programaciones, transaccional).

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `items` — array: Programaciones explícitas
- `recurrencia` — object
- `permitir_posibles_duplicados` — boolean: Solo si el usuario confirmó que las coincidencias son intencionales

## proponer_asientos_borrador

Prepara asientos contables en BORRADOR (nunca los contabiliza), explícitos o a partir de programaciones pendientes (cargo/abono entre la cuenta de la partida y la cuenta de banco indicada). Hasta 3 borradores se guardan directamente; más requieren confirmación. Requiere la cuenta de banco: no la supongas.

- Módulo: asientos. Tipo: Acción. Roles: admin, contador. Confirmación: Solo si es masiva (> 3).
- Validaciones: Validación compartida validarAsiento (cuadre, diario con partida, alcance de partidas) y sin importes negativos; Cuentas de saldo activas de la empresa; Programaciones pendientes, de la empresa, sin asiento vigente, con partida y cuenta.
- Devuelve: Borradores creados (o propuesta si son más de 3); nunca aplica asientos.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `asientos` — array: Asientos explícitos
- `desde_programaciones` — object

## proponer_ajuste_presupuesto

Prepara la modificación REAL de partidas por un porcentaje (después de que el usuario vio la simulación y lo pidió). Requiere confirmación en la interfaz y falla si alguna partida cambió desde la propuesta.

- Módulo: presupuestos. Tipo: Acción. Roles: admin, contador. Confirmación: Sí, en la interfaz.
- Validaciones: admin/contador (RLS de UPDATE); Control optimista de cantidad y precio; Máximo 200 partidas.
- Devuelve: Propuesta con antes/después; ejecuta rafa_ajustar_presupuestos al confirmar.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `presupuesto_ids` — array: Partidas a ajustar
- `centro_negocio_id` — string (uuid): Todas las partidas activas del centro
- `proyecto_id` — string (uuid): Todas las partidas de proyecto activas
- `porcentaje` * — number: Porcentaje (5 = +5%, -10 = -10%)
- `aplicar_a` * — precio_unitario / cantidad: Qué se incrementa: precio unitario o cantidad (decisión del usuario; no asumir)

## proponer_cambio_estado_programaciones

Prepara marcar programaciones pendientes como ejecutadas o canceladas. Requiere confirmación; advierte si no tienen asiento aplicado.

- Módulo: programaciones. Tipo: Acción. Roles: admin, contador. Confirmación: Sí, en la interfaz.
- Validaciones: Solo desde pendiente; Control optimista de monto y fecha.
- Devuelve: Propuesta; ejecuta rafa_cambiar_estado_programaciones al confirmar.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `programacion_ids` * — array: Programaciones
- `estado_nuevo` * — ejecutado / cancelado: Nuevo estado

## proponer_aplicar_asientos

Prepara CONTABILIZAR asientos en borrador (borrador → aplicado). Úsala SOLO si el usuario pide expresamente aplicar/contabilizar; nunca para borradores recién solicitados. Requiere confirmación.

- Módulo: asientos. Tipo: Acción. Roles: admin, contador. Confirmación: Sí, en la interfaz.
- Validaciones: Solo borradores cuadrados de la empresa; Control optimista por updated_at.
- Devuelve: Propuesta; ejecuta rafa_aplicar_asientos al confirmar.

Parámetros (* obligatorio):
- `empresa_id` — string (uuid): Empresa
- `asiento_ids` * — array: Asientos en borrador

## proponer_tarea

Crea una tarea pendiente en un proyecto (operación no financiera: se ejecuta sin confirmación adicional y queda registrada). Evita duplicar títulos abiertos.

- Módulo: proyectos. Tipo: Acción. Roles: admin, contador. Confirmación: No.
- Validaciones: admin/contador (RLS de tareas); Proyecto activo; Responsable de la empresa.
- Devuelve: Tarea creada (rafa_crear_tarea).

Parámetros (* obligatorio):
- `proyecto_id` * — string (uuid): Proyecto
- `titulo` * — string: Título
- `notas` — string: Notas
- `fecha_vencimiento` — string (date): Vencimiento
- `responsable_tercero_id` — string (uuid): Responsable (tercero de la empresa)
- `permitir_duplicado` — boolean: Permitir aunque exista una tarea abierta con el mismo título

## proponer_plan_presupuesto

Convierte un catálogo de conceptos adjunto (PDF/imagen/texto) en un PLAN de presupuesto editable (centro, tercero, IVA, partidas y flujo de pagos). No guarda nada: la interfaz abre el editor y el usuario guarda. Usa exactamente las partidas del archivo; no inventes conceptos, precios ni cuentas.

- Módulo: presupuestos. Tipo: Acción. Roles: admin, contador. Confirmación: Sí, en la interfaz.
- Validaciones: admin/contador; Al guardar, la interfaz aplica RLS (alta de partidas solo admin).
- Devuelve: Plan estructurado para el editor existente de propuestas de Rafa.

Parámetros (* obligatorio):
- `transcripcion` — string: Transcripción literal del audio, vacío si no hubo audio.
- `resumen` * — string: Resumen en español de lo que se va a hacer, en 1-3 frases.
- `empresa_detectada` — string: Nombre de la empresa mencionada; vacío si no se menciona.
- `centro_negocio` * — object
- `tercero` * — object
- `iva` * — object
- `total_objetivo` — number: Total del presupuesto mencionado por el usuario o del archivo. 0 si no aplica.
- `partidas` * — array: Una entrada por concepto del archivo, en el mismo orden.
- `programacion` * — object
