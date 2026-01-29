

# Plan: Agregar "Sin agrupar" en Presupuestos y Verificar Correcciones de Fechas

## Resumen de Cambios

1. **Presupuestos - Agregar opción "Sin agrupar"**: Agregar un botón para quitar el agrupamiento y mostrar una lista plana de presupuestos.

2. **Verificación de Fechas UTC**: Confirmar que todas las fechas del sistema están correctamente manejadas para evitar el problema de día incorrecto.

---

## Cambios Técnicos

### 1. Archivo: `src/pages/Presupuestos.tsx`

**Cambio 1.1: Actualizar el tipo GroupingType**

Agregar `"ninguno"` como opción de agrupación:

```typescript
// Línea 192 - Cambiar de:
type GroupingType = "partida" | "cuenta" | "centro" | "empresa";

// A:
type GroupingType = "partida" | "cuenta" | "centro" | "empresa" | "ninguno";
```

**Cambio 1.2: Actualizar el ToggleGroup en la UI**

Agregar botón "Sin agrupar" al `ToggleGroup` (después de línea 760):

```typescript
<ToggleGroupItem value="ninguno" aria-label="Sin agrupar" className="text-xs px-3">
  Sin agrupar
</ToggleGroupItem>
```

**Cambio 1.3: Modificar la lógica de agrupación**

Cuando `grouping === "ninguno"`, mostrar una tabla plana sin secciones colapsables. Se agregará una condición antes del mapeo de `groupedData` para renderizar una vista diferente.

**Cambio 1.4: Renderizar vista plana**

Cuando no hay agrupación activa:
- Mostrar todos los presupuestos filtrados en una sola tabla
- Mantener las columnas existentes
- Agregar columna de "Empresa" para identificar a qué empresa pertenece cada presupuesto
- Mantener el drag-and-drop funcional

---

## Estado Actual de las Correcciones de Fechas

He verificado los archivos y **las correcciones de fechas ya están implementadas**:

| Archivo | Estado | Corrección |
|---------|--------|------------|
| `src/components/dialogs/PresupuestoDialog.tsx` | ✅ Correcto | Usa `+ "T00:00:00"` en líneas 175-176 |
| `src/components/dialogs/ProgramacionDialog.tsx` | ✅ Correcto | Usa `+ "T00:00:00"` en línea 84 |
| `src/components/reportes/FlujoEfectivoPresupuesto.tsx` | ✅ Correcto | Usa `parseLocalDate()` en líneas 209-210 |
| `src/pages/Programacion.tsx` | ✅ Correcto | Usa `parseLocalDate()` y `formatDateNumeric()` |
| `src/lib/accounting-utils.ts` | ✅ Correcto | Usa `+ "T00:00:00"` en línea 116 |
| `src/components/reportes/ProyeccionProgramacion.tsx` | ✅ Correcto | Usa `parseLocalDate()` en línea 51 |

Los archivos que usan `toLocaleDateString` con fechas como `created_at` de usuarios están bien porque esas son timestamps completos (con hora), no fechas solo YYYY-MM-DD.

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Presupuestos.tsx` | Agregar opción "Sin agrupar" y lógica para vista plana |

---

## Resultado Esperado

1. **Presupuestos**: Nueva opción "Sin agrupar" en el selector de agrupación que muestra todos los presupuestos en una tabla plana (sin secciones colapsables), similar a como funciona en Programación.

2. **Fechas**: Ya están correctas en todo el sistema. Las fechas como "01/01/2026" se muestran correctamente sin el error de mostrar el día anterior.

