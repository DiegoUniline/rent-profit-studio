
# Plan: Corregir Cálculo Proporcional del Flujo de Efectivo por Frecuencia

## Problema Identificado

El flujo de efectivo actualmente coloca el **monto total del presupuesto** en cada ocurrencia de la frecuencia, en lugar de **dividirlo proporcionalmente** según el número de ocurrencias en el periodo.

### Código Actual (líneas 227-237)

```typescript
if (frecuencia === "semanal") {
  const semanasEnMes = 4;
  mesesMonto[index] = montoTotal * semanasEnMes;  // Multiplica!
} else if (frecuencia === "mensual") {
  mesesMonto[index] = montoTotal;  // Monto completo cada mes
} else {
  // Para trimestral, semestral, anual...
  if (mesesDesdeInicio % frecuenciaEnMeses === 0) {
    mesesMonto[index] = montoTotal;  // ERROR: Monto completo cada ocurrencia
  }
}
```

### Ejemplo del Problema

| Configuración | Actual | Esperado |
|--------------|--------|----------|
| $30,000 mensual (12 meses) | $30,000 x 12 = $360,000 | $30,000 / 12 = $2,500/mes = $30,000 |
| $30,000 trimestral (12 meses) | $30,000 x 4 = $120,000 | $30,000 / 4 = $7,500/trim = $30,000 |
| $60,000 semestral (12 meses) | $60,000 x 2 = $120,000 | $60,000 / 2 = $30,000/sem = $60,000 |

## Solución Propuesta

### Lógica de Cálculo Corregida

1. **Calcular número de ocurrencias** en el periodo del presupuesto
2. **Dividir el monto total** entre las ocurrencias
3. **Asignar el monto proporcional** en cada ocurrencia

### Archivo a Modificar

`src/components/reportes/FlujoEfectivoPresupuesto.tsx`

### Cambios Específicos

**Antes del loop de meses, calcular:**

```typescript
// Calcular cuántas ocurrencias hay en el periodo del presupuesto
const mesesEnPeriodo = differenceInMonths(fechaFin, fechaInicio) + 1;
let numOcurrencias: number;

if (frecuencia === "semanal") {
  numOcurrencias = mesesEnPeriodo * 4; // 4 semanas por mes
} else {
  numOcurrencias = Math.ceil(mesesEnPeriodo / frecuenciaEnMeses);
}

// Monto por cada ocurrencia
const montoPorOcurrencia = numOcurrencias > 0 ? montoTotal / numOcurrencias : montoTotal;
```

**Dentro del loop, usar el monto proporcional:**

```typescript
if (frecuencia === "semanal") {
  // Para semanal: monto semanal * 4 semanas del mes
  const montoSemanal = montoTotal / (mesesEnPeriodo * 4);
  mesesMonto[index] = montoSemanal * 4;
} else if (frecuencia === "mensual") {
  mesesMonto[index] = montoPorOcurrencia;
} else {
  // Trimestral, semestral, anual
  if (mesesDesdeInicio % frecuenciaEnMeses === 0) {
    mesesMonto[index] = montoPorOcurrencia;
  }
}
```

## Casos de Prueba

| Presupuesto | Periodo | Frecuencia | Ocurrencias | Monto/Ocurrencia | Total |
|-------------|---------|------------|-------------|------------------|-------|
| $12,000 | Ene-Dic | Mensual | 12 | $1,000 | $12,000 |
| $40,000 | Ene-Dic | Trimestral | 4 | $10,000 | $40,000 |
| $60,000 | Ene-Dic | Semestral | 2 | $30,000 | $60,000 |
| $100,000 | Ene-Dic | Anual | 1 | $100,000 | $100,000 |
| $52,000 | Ene-Dic | Semanal | 48 | $1,083.33/sem (~$4,333/mes) | $52,000 |

## Resultado Esperado

El flujo de efectivo mostrará los montos **proporcionalmente distribuidos** según la frecuencia, asegurando que la suma total de todas las ocurrencias sea igual al presupuesto original (cantidad × precio unitario).
