# Rafa: sesiones, conversaciones y acciones

Fuentes: `src/pages/Rafa.tsx`, `src/components/rafa/*`, `src/lib/rafa-apply.ts`, `src/lib/rafa-types.ts`, `supabase/functions/rafa-asistente/index.ts`, `supabase/functions/_shared/rafa/*`, migraciones `20260819142938_*.sql` y `20261016000000_rafa_asistente_conversacional.sql`.

## Interpretaciones de presupuesto (`rafa_sesiones`)

Capacidad original, conservada: el usuario da una instrucción (texto o audio) y adjunta catálogos (PDF, imagen); la IA devuelve un plan estructurado (`proponer_plan`) con centro, tercero, IVA, partidas y programación. El usuario edita la propuesta y al **Guardar** `aplicarPlanRafa` crea o actualiza centro, tercero, partidas y `flujos_programados` desde el navegador (con RLS del usuario). `rafa_sesiones` guarda el plan y la propuesta (`estado` texto: `borrador` / `aplicado`) y el rastro `aplicado.presupuestoIds` para que volver a guardar actualice en vez de duplicar. Escrituras no atómicas: si falla a la mitad, quedan las partidas creadas hasta ese punto.

## Conversaciones (`rafa_conversaciones` y `rafa_mensajes`)

Cada conversación pertenece a un usuario (RLS por `user_id`) y guarda un `contexto` (empresa, proyecto, periodo y últimas referencias) que permite continuar con "solo los de esta semana" o "ahora el proyecto seleccionado". Los mensajes los escribe solo la Edge Function con la llave de servicio; el usuario solo puede leerlos. Cada mensaje del asistente registra la `version_conocimiento` usada y los datos estructurados (tablas, alcance, referencias, acciones).

## Acciones con confirmación (`rafa_acciones` y `rafa_ejecuciones`)

Toda escritura de Rafa es una acción: se registra con la entrada, una vista previa concreta y una **huella** (hash de los registros y valores presentados). Estados: `propuesta`, `ejecutando`, `ejecutada`, `fallida`, `parcial`, `cancelada`, `desactualizada`, `expirada` (30 minutos). Las que requieren confirmación solo se ejecutan cuando el usuario pulsa Confirmar en la interfaz; el modelo no tiene una herramienta para confirmar. Al confirmar, el servidor vuelve a calcular la vista previa con datos actuales y verifica permisos: si la huella cambió, marca la acción `desactualizada` y presenta una nueva. La ejecución usa RPC `SECURITY INVOKER` (RLS del usuario) en una sola transacción, que registra `rafa_ejecuciones` (PK = acción): un reintento no duplica efectos. Lectura: el propio usuario; admin puede auditar todas.
