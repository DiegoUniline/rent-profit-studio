# Origen de cada cifra

Los términos financieros NO significan lo mismo en todos los módulos. Rafa siempre dice qué definición usó.

## Presupuestado

Importe autorizado de una partida = `cantidad × precio_unitario` de `presupuestos` (`calcularMontoPresupuestado`). Igual en Presupuestos, Proyectos, reportes y Rafa. Los totales de Presupuestos solo incluyen partidas activas con `tipo_movimiento` ingreso o egreso (pendientes de clasificar y `no_afecta` quedan fuera). Fuente: `supabase/functions/_shared/negocio/calculos.ts`.

## Ejercido (dos definiciones vigentes)

Siempre a partir de `asiento_movimientos.presupuesto_id` y solo asientos `aplicado`:
1. **Por naturaleza** (pantalla Presupuestos y vista Ejercido): suma un solo lado según la cuenta de la partida (gastos/costos/pasivo/capital → Debe; activo/ingresos → Haber).
2. **Debe + Haber** (Proyectos, Flujo por presupuesto, cronograma público): suma ambos lados de los renglones ligados.

Coinciden cuando cada asiento liga la partida solo en el renglón de su propia cuenta. Difieren si el renglón de contrapartida (por ejemplo, Bancos) también lleva la partida, o si la cuenta del renglón es de otra naturaleza. Rafa usa por defecto el método de la pantalla que se está comparando y puede mostrar ambos con `explicar_partida`.

## Proyectado

Calendario esperado de una partida (no dinero real):
- Partida normal: `flujos_programados` manuales (`auto_generado = false`).
- Partida de Proyecto (`es_project`): solo `proyecto_programacion_pagos`; sin programación propia = $0.
Nunca se suman ambas fuentes para la misma partida (`resolverFlujosEfectivos`). Los flujos de IVA automáticos (`auto_generado = true`) provienen de asientos aplicados: son reales y se reportan aparte.

## Programado (tesorería)

`programaciones` en estado `pendiente`: cobros y pagos agendados por tesorería. Es un compromiso operativo, independiente del proyectado. Los KPIs de la pantalla Programación suman solo pendientes; la gráfica de proyección incluye pendientes y ejecutadas. `ejecutado` solo indica que tesorería la marcó; no prueba un asiento.

## Pagado y saldo

- No existe una tabla de pagos reales: lo "pagado" o "cobrado" es lo registrado en asientos `aplicado` (ejercido). En Programación financiera de proyecto, "Ya pagado" = ejercido debe + haber.
- Por ejercer / disponible = presupuestado − ejercido (puede ser negativo).
- Disponible tras programación (Rafa) = presupuestado − ejercido − programaciones pendientes acumuladas, sin contar pendientes cuyo asiento ligado ya está aplicado.
- Saldo de cuenta = saldo inicial ± debe/haber según naturaleza (`calcularSaldosCuentas`). Bancos y cartera en Programación: debe − haber de cuentas por prefijo/nombre, cartera de todas las empresas.

## Reglas contra el doble conteo

1. Una partida tiene UNA fuente de proyectado (flujos legacy o programación de proyecto).
2. Proyectado, programado y ejercido son capas distintas: se comparan, no se suman entre sí.
3. Una programación pendiente cuyo asiento ligado ya está aplicado no cuenta como pendiente.
4. Programaciones ejecutadas no se suman al ejercido.
5. Los movimientos se filtran por la empresa de la partida y por asientos `aplicado`.
