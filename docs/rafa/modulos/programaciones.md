# Programaciones (tesorería)

Evidencia: código y SQL local. Fuentes: `src/pages/Programacion.tsx`, `src/components/dialogs/ProgramacionDialog.tsx`, `src/components/reportes/ProyeccionProgramacion.tsx`, `supabase/functions/_shared/negocio/programacion.ts`.

## Qué representa una programación

Cada fila de `programaciones` es un **cobro o pago programado de tesorería** en una fecha (`fecha_programada`), por un `monto`, de `tipo` `ingreso` o `egreso`, para una empresa. Opcionalmente indica centro, tercero, observaciones, la partida presupuestal que la respalda (`presupuesto_id`) y el asiento que la ejecutó (`asiento_id`). Pantalla `/programacion` ("Programación Financiera"), admin/contador.

No es lo mismo que `flujos_programados` (proyección de una partida) ni que la programación financiera de Proyectos (`proyecto_programacion_pagos`). Una misma salida de dinero puede estar proyectada en una de esas fuentes y además programada aquí: **no deben sumarse** como si fueran movimientos distintos.

## Estados y transiciones

Enum `estado_programacion`: `pendiente` (por defecto), `ejecutado`, `cancelado`.
- En la aplicación, **Ejecutar** (`handleExecute`) solo cambia `estado` a `ejecutado`; el comentario del código reconoce que no crea asiento ni llena `asiento_id`. Por eso una programación ejecutada no prueba que exista el asiento.
- La aplicación no ofrece un botón para `cancelado`; el estado existe en el enum y en filtros. Rafa permite pasar de `pendiente` a `ejecutado` o `cancelado` con confirmación.
- Eliminar (`handleDelete`) borra la fila (RLS: solo admin).
- `asiento_id` (FK a `asientos_contables`, sin cascada) solo lo llena Rafa al preparar un asiento en borrador desde la programación (`rafa_crear_asientos_borrador`). La aplicación no lo usa todavía.

## Validaciones de captura y respaldo presupuestal

`ProgramacionDialog.handleSave` exige empresa y monto > 0. La partida es **opcional**; si se elige, debe pertenecer al centro seleccionado (validación solo en cliente). El selector ofrece partidas activas de la empresa del centro o sin centro.

Regla de Rafa para NUEVAS programaciones definitivas (`validarRespaldoPresupuestal`): cada una requiere partida activa de la misma empresa (y centro si ambos lo indican) y, si es egreso, el acumulado de la partida (ejercido + programaciones pendientes existentes + nuevas) no puede exceder el presupuestado. La captura manual de la aplicación **no** se modificó: antes de exigirlo ahí deben revisarse las excepciones existentes (herramienta `excepciones_respaldo_presupuestal`). Ver [pendientes](../pendientes.md).

## KPIs y proyección de la pantalla

- Ingresos/Egresos de la pantalla = suma de programaciones **pendientes** filtradas.
- Balance = saldo de bancos + saldo de cartera + ingresos pendientes − egresos pendientes (ver [cuentas](cuentas.md)).
- La gráfica "Proyección" (`ProyeccionProgramacion`) suma por mes los próximos 12 meses excluyendo solo `cancelado`: incluye `pendiente` **y** `ejecutado`, a diferencia de los KPIs.

## Comparación contra presupuesto (efecto acumulado)

`compararProgramacionContraPresupuesto` (compartida): por partida, consumido = ejercido (asientos aplicados) + programaciones pendientes hasta el fin de la ventana; dentro de la ventana se acumulan en orden de fecha y se marca la primera que excede. No suma programaciones `ejecutado` (su efecto se mide en el ejercido) ni pendientes cuyo asiento ligado ya está `aplicado` (evita doble conteo). Programaciones sin partida, con partida inactiva o de otra empresa/centro se listan como excepciones.
