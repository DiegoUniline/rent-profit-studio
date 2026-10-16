# Reportes y tablero

Evidencia: código. Fuentes: `src/pages/Reportes.tsx`, `src/components/reportes/*`, `src/pages/Dashboard.tsx`, `src/lib/accounting-utils.ts`.

## Cómo se calculan los reportes

No hay vistas ni funciones SQL de reportes: todos se calculan en el navegador leyendo tablas con paginación de 1000 filas.
- Balanza de comprobación, Balance general, Estado de resultados y Estado financiero: `calcularSaldosCuentas` sobre asientos `aplicado` de la empresa y periodo; totales por rubro según el primer dígito del código; utilidad = ingresos − costos − gastos.
- Flujo de efectivo (contable): movimientos aplicados de cuentas de efectivo.
- Flujo de efectivo por presupuesto (`FlujoEfectivoPresupuesto`): por partida y mes, **proyectado** (flujos legacy o programación propia de proyecto según la regla de fuente única), **ejercido** (debe + haber de asientos aplicados) y **ajustado** (meses cerrados = ejercido; mes actual y futuros = proyectado). Los flujos de IVA automáticos aparecen como filas aparte y se tratan como reales.
- Proyección de programación (pantalla Programación): 12 meses de programaciones no canceladas.

Rafa reutiliza las mismas fórmulas (módulo compartido) a través de sus herramientas `saldos_cuentas`, `flujo_proyectado` y `resumen_presupuesto`; no replica la presentación de cada reporte.
