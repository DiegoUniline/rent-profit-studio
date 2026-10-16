# Cuentas contables

Evidencia: código y SQL local. Fuentes: `src/pages/Cuentas.tsx`, `src/pages/CuentaDetalle.tsx`, `src/components/dialogs/CuentaDialog.tsx`, `src/lib/accounting-utils.ts`, `supabase/functions/_shared/negocio/contabilidad.ts`.

## Catálogo y jerarquía

`cuentas_contables` es el catálogo por empresa (UNIQUE `empresa_id, codigo`). Código de 12 dígitos en formato `XXX-XXX-XXX-XXX`. La jerarquía es física: `cuenta_padre_id` → `cuentas_contables.id` (auto-referencia, sin cascada). `nivel` lo calcula el formulario a partir del código (1 rubro, 2 grupo, 3 subgrupo, 4 cuenta, 5 subcuenta).

- `naturaleza`: `deudora` o `acreedora` (enum `naturaleza_cuenta`). Determina el signo del saldo.
- `clasificacion`: `titulo` (agrupadora, no recibe movimientos en la práctica) o `saldo` (recibe movimientos). Los selectores de asientos y de Rafa solo ofrecen cuentas `saldo` activas.
- El primer dígito define el rubro en reportes (`getRubroPrincipal`): 1 activo, 2 pasivo, 3 capital, 4 ingresos, 5 costos, 6 gastos, 7 otros.

Permisos: ruta admin/contador; RLS lectura a autenticados, escritura admin/contador, borrado admin. Eliminar una cuenta con movimientos falla por la FK `asiento_movimientos.cuenta_id ON DELETE RESTRICT`.

## Saldos de cuentas

`calcularSaldosCuentas` (compartida por Reportes y Rafa) solo considera asientos `aplicado`. Saldo inicial = movimientos anteriores a la fecha inicial; del periodo = movimientos entre fechas. Deudora: saldo = inicial + debe − haber; acreedora: saldo = inicial − debe + haber. Los totales por rubro suman solo cuentas de clasificación `saldo`. Utilidad = ingresos − costos − gastos.

La pantalla Programación calcula aparte un saldo de **Bancos** (cuentas que empiezan con `100-001-001`, excluyendo cartera) y de **Cartera** (cuentas `100-001-001-002` o con "cartera" en el nombre, SIEMPRE de todas las empresas) como debe − haber de asientos aplicados; el "Balance" de esa pantalla = bancos + cartera + ingresos pendientes − egresos pendientes. Es una regla de código, no de base de datos.

## Cuentas e IVA automático

El trigger `sync_iva_flujos_trigger` (tabla `asientos_contables`) reconoce cuentas de IVA **por nombre**: "IVA ... favor" o "IVA ... acreditable" con cargo (debe) generan un flujo `egreso`; "IVA ... trasladado/por pagar/por trasladar" con abono (haber) generan un flujo `ingreso`. Renombrar una cuenta cambia ese comportamiento para asientos futuros. Ver [flujos programados](flujos-programados.md).
