# Empresas y centros de negocio

Evidencia: código del repositorio y SQL local (migraciones). Inventario de la base real: `docs/DATABASE.md` (2026-08-07). Esquema campo por campo: [esquema](../esquema.md).

## Empresas: propósito y registro

`empresas` es la raíz del modelo multi-empresa: cada fila es una entidad fiscal (persona moral o física) sobre la que se lleva contabilidad, presupuesto, programación y proyectos. Casi todas las tablas de negocio tienen `empresa_id`.

Campos capturados en la pantalla Empresas (`src/pages/Empresas.tsx`, `src/components/dialogs/EmpresaDialog.tsx`): `tipo_persona` (enum `fisica`/`moral`), `rfc` (único global), `razon_social`, `nombre_comercial`, datos fiscales (`regimen_fiscal`, `uso_cfdi`), domicilio, contacto, datos bancarios (`banco`, `numero_cuenta`, `clabe`) y `activa`. Automáticos: `id`, `created_at`, `updated_at` (trigger `update_empresas_updated_at`), `created_by`.

Rafa muestra el nombre comercial (o la razón social si no hay). No expone datos bancarios en respuestas salvo que se pidan explícitamente al consultar el detalle.

## Empresas: permisos, acciones y efectos

- Ruta `/empresas`: admin y contador (`src/App.tsx`).
- RLS: SELECT cualquier autenticado; INSERT/UPDATE admin o contador; DELETE solo admin. **No hay políticas que filtren por empresa**: un usuario autenticado puede leer datos de todas las empresas; la segmentación es de interfaz. No existe tabla de asignación usuario→empresa.
- Eliminar empresa (`handleDelete`) borra en cascada centros, cuentas, terceros, presupuestos, asientos, proyectos y tareas (FK `ON DELETE CASCADE`). `programaciones.empresa_id` y `flujos_programados.empresa_id` no tienen cascada: si existen, la eliminación falla. Es una acción destructiva que Rafa no ejecuta.
- Las listas de selección de la aplicación solo muestran empresas `activa = true`.

Regla de Rafa: toda consulta de datos se hace dentro de una empresa explícita. Si no se indicó y hay más de una empresa activa, Rafa pregunta; nunca elige la primera. El editor de planes (`construirPropuesta` en `src/pages/Rafa.tsx`) tampoco: si la IA no detecta la empresa y hay varias, deja el selector vacío para que el usuario la elija (antes tomaba la primera).

## Centros de negocio: propósito y registro

`centros_negocio` agrupa la operación por centro de costos/negocio/proyecto dentro de una empresa (obra, oficina, gestoría). Campos: `empresa_id` (FK, cascada), `codigo` (único por empresa solo entre activos: índice parcial `centros_negocio_empresa_codigo_activo_idx`), `nombre`, `tipo_actividad`, `responsable` (texto libre), `activo`.

Relaciones físicas (FK): presupuestos, asientos, programaciones y proyectos apuntan al centro. Un **proyecto es exactamente un centro de negocio** (`proyectos.centro_negocio_id` es UNIQUE).

Pantalla `/centros-negocio` (`src/pages/CentrosNegocio.tsx`): alta/edición (`CentroNegocioDialog`), baja/reactivación (`activo`), y **Generar Project** (`handleGenerarProject`): si el centro no tiene proyecto, inserta `proyectos` con el mismo nombre y empresa; si ya existe, abre el existente. RLS de centros: lectura para todos los autenticados, escritura admin/contador, borrado admin.

Rafa (`src/lib/rafa-apply.ts`) también puede crear un centro al aplicar un plan de presupuesto: calcula el siguiente código numérico de la empresa (máximo + 1 con relleno a 3 dígitos).


## Baja de centros

Dar de baja un centro (`cambiar_activo('centro_negocio', id, false, true)`) da de baja también sus partidas activas y su proyecto; `bajas_en_cascada` guarda cuáles para que reactivarlo restaure exactamente esos y no partidas que ya estaban dadas de baja por otro motivo. Las programaciones pendientes ligadas no se cancelan (Rafa lo advierte).
