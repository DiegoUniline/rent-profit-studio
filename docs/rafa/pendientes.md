# Pendientes, contradicciones y riesgos detectados

Detectados durante el levantamiento de Rafa (2026-10-16). Ninguno se corrigió fuera del alcance indicado.

## Verificación contra la base real

No hubo acceso de lectura al proyecto de Lovable Cloud (`supabase/config.toml`): el conector disponible no lista ese proyecto. El esquema de `docs/rafa/esquema-local.json` proviene de una base aislada construida con las migraciones del repositorio; `docs/DATABASE.md` (2026-08-07) es el último inventario de la base real y coincide en las 12 tablas base. Pendiente: confirmar en la base real las migraciones posteriores a agosto (Proyectos, tipo de movimiento) y aplicar `20261016000000_rafa_asistente_conversacional.sql`.

## Contradicciones de reglas

- **Dos definiciones de ejercido**: Presupuestos usa naturaleza de la cuenta; Proyectos, Flujo por presupuesto y el cronograma público usan debe + haber. Pueden diferir para la misma partida. Decidir cuál es la oficial antes de unificar.
- **Programación "ejecutada" sin asiento**: Ejecutar no crea asiento ni llena `asiento_id`; el estado no prueba el registro contable.
- **KPIs vs. gráfica de Programación**: KPIs suman solo pendientes; la proyección suma pendientes y ejecutadas.
- **Validación de alcance en asientos**: `AsientoDialog` exige que las partidas sean del centro del asiento; `/asientos/:id` no. Se conservó la diferencia con una opción explícita del validador compartido.
- **Respaldo presupuestal**: la captura manual de programaciones permite no ligar partida. Rafa lo exige en programaciones nuevas; extenderlo a la interfaz requiere decidir qué hacer con las programaciones existentes sin partida (`excepciones_respaldo_presupuestal`) y si aplica también a ingresos.
- **Cartera de todas las empresas**: el saldo de cartera de Programación ignora el filtro de empresa a propósito (comentario en código); confirmar que es intencional.

## Riesgos técnicos

- Escrituras no atómicas en la aplicación: guardar asiento, partida con flujos, programación financiera de proyecto, plan de Rafa y tablero de tareas.
- La migración `20260810223000_fix_proyecto_programacion_financiera_columns.sql` falla al reaplicarse en una base nueva (su bloque espera `duplicate_object` y PostgreSQL lanza `duplicate_table`). El arnés de pruebas la ejecuta tolerando ese error.
- RLS de lectura sin segmentación por empresa ni por rol en tablas contables; no hay asignación usuario→empresa. Rafa compensa en el servidor con la matriz de la interfaz, pero un cliente con la llave pública puede leer directamente.
- `AdminCodeDialog` valida el código de admin en el navegador leyendo `profiles.codigo_acceso`.
- Plan de Rafa: los terceros nuevos usan RFC genérico `XAXX010101000`, único por empresa, por lo que el segundo alta en la misma empresa falla.
- `PresupuestoDialog`/`Programacion` cargan catálogos completos en el cliente; `fetch` de Programación lee TODAS las programaciones.

## Capacidades de Rafa pendientes

- La ruta `/rafa` y el botón flotante siguen limitados a admin/contador (como antes). El servidor ya atiende a usuario/arquitecto con herramientas de proyecto filtradas por acceso; abrirles el chat es una decisión pendiente.
- Editar cronograma, programación financiera de proyecto, accesos y catálogos desde la conversación (hoy: consulta; se hacen en la interfaz).
- Cancelar o eliminar asientos (excluido a propósito por ser destructivo).
- Pruebas con el modelo de IA real: el arnés usa un modelo simulado; la calidad de interpretación depende del proveedor configurado (`LOVABLE_API_KEY`).
- Embeddings: la recuperación usa BM25 sobre fragmentos; suficiente para el tamaño actual.
