
# Plan: Agregar "Limpiar Agrupación" en Programación y Corregir Fechas UTC

## Resumen de Cambios Solicitados

1. **Programación Financiera**:
   - Agregar opción para limpiar/quitar el agrupamiento actual (mostrar lista plana)

2. **Corrección de Fechas UTC**:
   - Corregir todos los lugares donde las fechas se muestran con un día de diferencia por conversión UTC

---

## Cambios en Programación

### Archivo: `src/pages/Programacion.tsx`

**Cambio 1: Agregar opción "Sin agrupar" al ToggleGroup**

Actualmente el `ToggleGroup` tiene opciones: "Tipo", "Centro", "Presupuesto"

Se agregará:
- Nueva opción "Sin agrupar" que muestra todas las programaciones en una lista plana sin secciones colapsables
- Valor: `"ninguno"` o `null`

**Cambio 2: Actualizar lógica de agrupación**

Cuando `grouping === "ninguno"`:
- No crear grupos
- Mostrar directamente la tabla sin secciones colapsables
- Ordenar por fecha programada (ingresos y egresos mezclados)

**Cambio 3: Actualizar el tipo GroupingType**

```typescript
type GroupingType = "tipo" | "centro" | "presupuesto" | "ninguno";
```

---

## Corrección de Fechas UTC

El problema ocurre cuando se usa `new Date("2026-01-01")` - JavaScript lo interpreta como UTC medianoche, lo que en zonas horarias como UTC-6 se convierte en "2025-12-31 18:00:00" mostrando el día anterior.

### Archivos a Corregir

| Archivo | Línea | Problema | Solución |
|---------|-------|----------|----------|
| `src/components/dialogs/PresupuestoDialog.tsx` | 175-176 | `new Date(presupuesto.fecha_inicio)` | Agregar `+ "T00:00:00"` |
| `src/components/reportes/FlujoEfectivoPresupuesto.tsx` | 208-209 | `new Date(p.fecha_inicio)` | Usar `parseLocalDate()` |

### Corrección en PresupuestoDialog.tsx

**Antes:**
```typescript
fecha_inicio: presupuesto.fecha_inicio ? new Date(presupuesto.fecha_inicio) : undefined,
fecha_fin: presupuesto.fecha_fin ? new Date(presupuesto.fecha_fin) : undefined,
```

**Después:**
```typescript
fecha_inicio: presupuesto.fecha_inicio ? new Date(presupuesto.fecha_inicio + "T00:00:00") : undefined,
fecha_fin: presupuesto.fecha_fin ? new Date(presupuesto.fecha_fin + "T00:00:00") : undefined,
```

### Corrección en FlujoEfectivoPresupuesto.tsx

**Antes:**
```typescript
const fechaInicio = new Date(p.fecha_inicio);
const fechaFin = new Date(p.fecha_fin);
```

**Después:**
```typescript
import { parseLocalDate } from "@/lib/date-utils";
// ...
const fechaInicio = parseLocalDate(p.fecha_inicio);
const fechaFin = parseLocalDate(p.fecha_fin);
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/pages/Programacion.tsx` | Agregar opción "Sin agrupar" y lógica para vista plana |
| `src/components/dialogs/PresupuestoDialog.tsx` | Corregir parsing de fechas con `T00:00:00` |
| `src/components/reportes/FlujoEfectivoPresupuesto.tsx` | Usar `parseLocalDate()` para fechas de presupuestos |

---

## Resultado Esperado

1. **Programación**: Nueva opción "Sin agrupar" que muestra todas las programaciones en una sola tabla sin secciones, ordenadas por fecha.

2. **Fechas**: Las fechas como "01/01/2026" se mostrarán correctamente en todos los componentes, sin importar la zona horaria del usuario.
