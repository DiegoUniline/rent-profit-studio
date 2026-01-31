
# Plan: Corregir Lógica de Ejercido para Cuentas de Balance

## Problema Identificado
La función `calcularEjercido` en `src/pages/Presupuestos.tsx` calcula incorrectamente el monto ejercido para cuentas de balance (Activo y Pasivo).

**Lógica actual (incorrecta para balance):**
- Activo (100): suma DEBE (cuando aumenta la cuenta)
- Pasivo (200): suma HABER (cuando aumenta la cuenta)

**Lógica correcta:**
- Activo (100): suma HABER (cuando disminuye la cuenta = cobro, uso de recurso)
- Pasivo (200): suma DEBE (cuando disminuye la cuenta = pago de deuda)
- Resultados (400, 500, 600): mantener lógica actual (correcta)

## Ejemplo Práctico
- **Cuenta por cobrar (Activo 100)**: Cuando cobras, la cuenta disminuye (haber) → ese es el ejercido
- **Cuenta por pagar (Pasivo 200)**: Cuando pagas, la cuenta disminuye (debe) → ese es el ejercido

## Cambios a Realizar

### Archivo: `src/pages/Presupuestos.tsx`

Modificar la función `calcularEjercido` (líneas 145-171):

**Antes:**
```typescript
const esDeudora = 
  codigoCuenta.startsWith("100") || 
  codigoCuenta.startsWith("500") || 
  codigoCuenta.startsWith("600") ||
  codigoCuenta.startsWith("1");

if (esDeudora) {
  return movimientosMatch.reduce((sum, m) => sum + Number(m.debe), 0);
} else {
  return movimientosMatch.reduce((sum, m) => sum + Number(m.haber), 0);
}
```

**Después:**
```typescript
// Determinar tipo de cuenta
const esActivo = codigoCuenta.startsWith("100") || codigoCuenta.startsWith("1");
const esPasivo = codigoCuenta.startsWith("200") || codigoCuenta.startsWith("2");
const esCapital = codigoCuenta.startsWith("300") || codigoCuenta.startsWith("3");

// Cuentas de Balance (Activo/Pasivo): el ejercido es cuando DISMINUYE la cuenta
// Cuentas de Resultados (Ingresos/Costos/Gastos): mantienen lógica original

if (esActivo) {
  // Activo disminuye con HABER (cobros, consumos)
  return movimientosMatch.reduce((sum, m) => sum + Number(m.haber), 0);
} else if (esPasivo) {
  // Pasivo disminuye con DEBE (pagos de deuda)
  return movimientosMatch.reduce((sum, m) => sum + Number(m.debe), 0);
} else if (esCapital) {
  // Capital: para presupuestos, también cuando disminuye (DEBE)
  return movimientosMatch.reduce((sum, m) => sum + Number(m.debe), 0);
} else {
  // Cuentas de resultados (400 Ingresos, 500 Costos, 600 Gastos)
  // Ingresos -> suma haber (naturaleza acreedora)
  // Costos/Gastos -> suma debe (naturaleza deudora)
  const esCostoGasto = 
    codigoCuenta.startsWith("500") || 
    codigoCuenta.startsWith("600") ||
    codigoCuenta.startsWith("5") ||
    codigoCuenta.startsWith("6");
  
  if (esCostoGasto) {
    return movimientosMatch.reduce((sum, m) => sum + Number(m.debe), 0);
  } else {
    // Ingresos (400)
    return movimientosMatch.reduce((sum, m) => sum + Number(m.haber), 0);
  }
}
```

## Resumen de Lógica Final

| Tipo Cuenta | Código | Naturaleza | Ejercido suma |
|-------------|--------|------------|---------------|
| Activo | 100, 1xx | Deudora | HABER (disminución) |
| Pasivo | 200, 2xx | Acreedora | DEBE (disminución) |
| Capital | 300, 3xx | Acreedora | DEBE (disminución) |
| Ingresos | 400, 4xx | Acreedora | HABER (aumento = correcto) |
| Costos | 500, 5xx | Deudora | DEBE (aumento = correcto) |
| Gastos | 600, 6xx | Deudora | DEBE (aumento = correcto) |

## Notas
- Las cuentas de resultados (Ingresos, Costos, Gastos) mantienen la lógica actual porque siempre parten de cero
- Solo se modifica la lógica para cuentas de balance (Activo, Pasivo, Capital)
