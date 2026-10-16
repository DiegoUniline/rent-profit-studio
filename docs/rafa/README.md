# Rafa: índice del conocimiento del sistema

Rafa es el asistente conversacional del sistema. Esta carpeta es su base de conocimiento y la referencia para desarrolladores. Empieza aquí; consulta solo el documento del módulo afectado.

## Qué conoce Rafa y de dónde

| Tipo de conocimiento | Fuente | Cómo lo usa |
|---|---|---|
| Estructura y reglas (módulos, relaciones, estados, fórmulas, permisos, acciones) | `docs/rafa/modulos/*.md`, `docs/rafa/cifras.md`, `docs/rafa/acciones.md` | Herramienta `buscar_conocimiento` y recuperación automática de 3 fragmentos por pregunta |
| Esquema campo por campo | `docs/rafa/esquema-local.json` (extraído de una base aislada construida con `supabase/migrations`) y `docs/rafa/esquema.md` | Herramienta `describir_entidad` |
| Inventario de la base real (2026-08-07) | `docs/DATABASE.md` | Fragmentos del módulo `inventario-base-real` |
| Catálogo de herramientas | `docs/rafa/herramientas.md` (generado del registro real) | Definiciones enviadas al modelo y documentación |
| Datos actuales | Base de datos, mediante herramientas con el JWT del usuario | Nunca desde la documentación |

## Documentos

- Módulos: [empresas y centros](modulos/empresas-centros.md), [cuentas](modulos/cuentas.md), [terceros](modulos/terceros.md), [presupuestos y unidades](modulos/presupuestos.md), [flujos programados](modulos/flujos-programados.md), [programaciones](modulos/programaciones.md), [asientos](modulos/asientos.md), [proyectos](modulos/proyectos.md), [usuarios y roles](modulos/usuarios.md), [reportes](modulos/reportes.md), [Rafa](modulos/rafa.md).
- [Origen de cada cifra](cifras.md) · [Acciones de negocio](acciones.md) · [Herramientas](herramientas.md) · [Matriz de cobertura](cobertura.md) · [Pendientes y contradicciones](pendientes.md) · [Esquema](esquema.md).

## Versión y actualización del conocimiento

La versión (`k-` + hash) se calcula sobre todas las fuentes: documentos de esta carpeta, `docs/DATABASE.md` y el esquema extraído. Rafa registra la versión usada en cada mensaje (`rafa_mensajes.version_conocimiento`) y en cada acción.

Después de cambiar documentación, migraciones o herramientas:
1. Si cambiaron migraciones: `PGHOST=… PGPORT=… PGUSER=… supabase/tests/rafa/preparar_base.sh rafa_esquema && supabase/tests/rafa/extraer_esquema.sh rafa_esquema` (base aislada; nunca contra producción).
2. `npm run rafa:conocimiento` (regenera `herramientas.md`, `esquema.md` y `supabase/functions/_shared/rafa/conocimiento.generado.ts`).
3. `npm test`: `src/test/rafa-conocimiento.test.ts` falla si las fuentes cambiaron sin regenerar, si hay migraciones nuevas sin extraer el esquema, si una tabla de `src/integrations/supabase/types.ts` no está documentada o si una herramienta no está en el catálogo.
4. Desplegar la Edge Function `rafa-asistente` (el conocimiento viaja dentro de su código).

No es necesario volver a cargar nada manualmente en el asistente: el conocimiento forma parte del despliegue.

## Arquitectura (resumen)

`src/pages/Rafa.tsx` (chat y editor de planes) → Edge Function `rafa-asistente` (modos `chat`, `confirmar`, `cancelar`, `plan`) → `supabase/functions/_shared/rafa/` (motor, registro de herramientas, permisos, acciones) → `supabase/functions/_shared/negocio/` (fórmulas compartidas con la aplicación) → base de datos con el JWT del usuario (RLS) y RPC transaccionales `rafa_*`. Conectar un módulo nuevo = escribir sus herramientas y agregarlas en `registro.ts`.

## Pruebas

| Suite | Comando | Requiere |
|---|---|---|
| Unitarias (fórmulas, validaciones, sincronía del conocimiento, chat) | `npm test` | Node |
| RPC transaccionales (SQL) | `supabase/tests/rafa/preparar_base.sh rafa_test && psql -d rafa_test -f supabase/tests/rafa/20_rpc_transaccionales.sql` | PostgreSQL local de pruebas |
| De punta a punta (Edge Function + PostgREST + modelo simulado) | `POSTGREST_BIN=… DENO_BIN=… supabase/tests/rafa/e2e/ejecutar.sh` | PostgreSQL, PostgREST ≥ 12, Deno ≥ 2 |

Las bases de prueba usan `supabase/tests/rafa/00_supabase_stub.sql` (roles y `auth` mínimos) y la semilla sintética `10_semilla.sql`. Nunca ejecutar estos scripts contra la base real.
