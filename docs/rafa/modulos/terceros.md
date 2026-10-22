# Terceros

Evidencia: código y SQL local. Fuentes: `src/pages/Terceros.tsx`, `src/components/dialogs/TerceroDialog.tsx`, `src/components/dialogs/TerceroViewDialog.tsx`.

## Clientes, proveedores y responsables

`terceros` es el catálogo de clientes y proveedores por empresa (UNIQUE `empresa_id, rfc`). `tipo` es texto con CHECK `cliente`, `proveedor` o `ambos`. Incluye domicilio, contacto y datos bancarios; `activo` controla si aparece en selectores.

Se usa en: `presupuestos.tercero_id` (contraparte de la partida), `presupuestos.responsable_tercero_id` (responsable de la partida en Proyectos), `asientos_contables.tercero_id`, `programaciones.tercero_id` y `proyecto_tareas.responsable_tercero_id`. Todas son FK físicas; las de presupuestos/asientos/tareas usan `ON DELETE SET NULL`, la de programaciones no tiene acción (impide borrar un tercero con programaciones).

Permisos: ruta admin/contador; RLS lectura a autenticados, escritura admin/contador, borrado admin. Baja lógica con `activo`.

Rafa (flujo de plan de presupuesto): un tercero "nuevo" con el mismo nombre que uno de la empresa se reutiliza; si no existe, se crea con el RFC capturado en el editor o, sin RFC, con el genérico `XAXX010101000`. Como el RFC es único por empresa, si el genérico ya está usado el guardado se rechaza completo con un mensaje que pide el RFC, elegir un tercero existente o guardar sin tercero.
