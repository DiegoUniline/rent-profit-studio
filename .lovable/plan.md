

# Consolidar Columna PARTIDA en Asientos Contables

## Resumen
Simplificar la tabla de movimientos eliminando la columna redundante del botón "+" e integrando la selección de presupuesto directamente en la columna PARTIDA.

## Cambios a Realizar

### Estructura Actual vs Nueva

```text
ACTUAL:
| Cuenta | [+] | Partida / Presupuesto | Debe | Haber | Acciones |

NUEVA:
| Cuenta | PARTIDA | Debe | Haber | Acciones |
```

### Modificaciones en AsientoDialog.tsx

**1. Encabezado de tabla (líneas 660-667)**
- Eliminar la columna vacía `<TableHead className="w-8"></TableHead>`
- Renombrar "Partida / Presupuesto" a solo "PARTIDA"

**2. Celdas de cada fila (líneas 684-702)**
- Eliminar la celda con el SearchableSelect del botón "+" 
- Convertir la celda de PARTIDA en un SearchableSelect que muestre los presupuestos disponibles
- Agregar botón "+" para crear nuevo presupuesto
- Cuando se selecciona un presupuesto, se llena automáticamente la partida (esta lógica ya existe)

### Comportamiento Esperado
1. La columna PARTIDA mostrará un selector desplegable con los presupuestos filtrados por cuenta
2. Al seleccionar un presupuesto, la descripción de la partida se llena automáticamente
3. El botón "+" al lado permitirá crear un nuevo presupuesto si es necesario
4. La interfaz será más limpia y sin columnas cortadas o confusas

## Sección Técnica

### Código del SearchableSelect para PARTIDA
```tsx
<SearchableSelect
  value={mov.presupuesto_id || ""}
  onValueChange={(value) => updateMovimiento(idx, "presupuesto_id", value)}
  options={getPresupuestoOptionsForMovimiento(mov.cuenta_id)}
  placeholder="Seleccionar partida..."
  searchPlaceholder="Buscar presupuesto..."
  emptyMessage="No hay presupuestos"
  onCreateNew={() => setPresupuestoDialogOpen(true)}
  createLabel="Nuevo presupuesto"
/>
```

### Archivo a Modificar
- `src/components/dialogs/AsientoDialog.tsx`

