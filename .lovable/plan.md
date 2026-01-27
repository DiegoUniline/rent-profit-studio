
# Plan: Agrupación y Reordenamiento en Flujo de Efectivo + Corrección de Bug en Presupuestos

## Problemas Identificados

### 1. Bug en Presupuestos: Orden se Descuadra al Agregar Nuevos Items
Al crear un nuevo presupuesto, se inserta con `orden: 0` (valor por defecto), lo que causa que los nuevos elementos aparezcan mezclados con los existentes. La base de datos muestra múltiples registros con el mismo valor de `orden` (ej: varios con orden=1, varios con orden=2), rompiendo el orden establecido por el usuario.

**Causa raíz:** El diálogo `PresupuestoDialog` no calcula el orden correcto al insertar. Debería:
1. Determinar el grupo al que pertenece el nuevo presupuesto (basado en la agrupación activa)
2. Asignar `orden = max(orden) + 1` de ese grupo

### 2. Flujo de Efectivo Presupuesto: Sin Agrupación ni Reordenamiento
El componente `FlujoEfectivoPresupuesto` actualmente:
- Muestra entradas/salidas sin posibilidad de agrupar por cuenta
- No permite reordenar las filas
- No persiste ninguna preferencia

---

## Solución Propuesta

### Parte 1: Corregir Bug de Orden en Presupuestos

**Archivo: `src/components/dialogs/PresupuestoDialog.tsx`**

Al crear un nuevo presupuesto:
1. Consultar el máximo orden actual para la empresa seleccionada
2. Asignar `orden = maxOrden + 1` en el insert

```text
Flujo actual:
  Usuario crea presupuesto → Insert con orden=0 → Se descuadra todo

Flujo corregido:
  Usuario crea presupuesto → Consultar MAX(orden) de empresa → Insert con orden=max+1 → Nuevo item al final
```

### Parte 2: Agrupación en Flujo de Efectivo Presupuesto

**Archivo: `src/components/reportes/FlujoEfectivoPresupuesto.tsx`**

Añadir botones de agrupación similar a Presupuestos:
- Por Partida (actual, sin agrupar visualmente)
- Por Cuenta (nuevo - agrupa por código de cuenta contable)
- Por Centro de Negocio (nuevo)

Persistir la preferencia en `localStorage` con key `flujo_efectivo_grouping`.

### Parte 3: Reordenamiento Manual en Flujo de Efectivo

Para el reordenamiento necesitamos una tabla en base de datos que almacene las preferencias del usuario. Las opciones son:

**Opción A: Nueva tabla `flujo_orden_preferencias`**
- Almacena el orden personalizado por usuario/empresa
- Requiere migración de base de datos

**Opción B: Usar campo `orden` existente en `presupuestos`**
- Ya existe el campo `orden` en presupuestos
- El reordenamiento en Flujo de Efectivo actualizaría ese mismo campo
- Ventaja: Sin cambios a la base de datos
- Desventaja: El orden sería compartido entre Presupuestos y Flujo de Efectivo

**Recomendación:** Usar la **Opción B** para simplicidad. El orden de los presupuestos se refleja igual en ambas vistas.

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/dialogs/PresupuestoDialog.tsx` | Calcular y asignar orden correcto al insertar |
| `src/components/reportes/FlujoEfectivoPresupuesto.tsx` | Añadir agrupación por cuenta/centro + reordenamiento drag-and-drop |
| `src/pages/Reportes.tsx` | Pasar función de actualización de orden al componente |

---

## Detalles Técnicos

### Corrección del Orden al Crear Presupuesto

En `PresupuestoDialog.tsx`, antes del insert:

```typescript
// Obtener el máximo orden actual para la empresa
const { data: maxData } = await supabase
  .from("presupuestos")
  .select("orden")
  .eq("empresa_id", form.empresa_id)
  .order("orden", { ascending: false })
  .limit(1);

const nuevoOrden = maxData && maxData.length > 0 ? (maxData[0].orden || 0) + 1 : 1;

// Insertar con el orden calculado
const { error } = await supabase
  .from("presupuestos")
  .insert({ ...data, orden: nuevoOrden });
```

### Agrupación en Flujo de Efectivo

```typescript
type GroupingType = "ninguno" | "cuenta" | "centro";

const [grouping, setGrouping] = useState<GroupingType>(() => {
  const saved = localStorage.getItem("flujo_efectivo_grouping");
  return (saved as GroupingType) || "ninguno";
});

// Agrupar flujos por cuenta
const flujosPorCuenta = useMemo(() => {
  const grupos: Record<string, FlujoMensual[]> = {};
  flujosMensuales.forEach(flujo => {
    const key = flujo.codigoCuenta || "sin-cuenta";
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(flujo);
  });
  return Object.entries(grupos).map(([key, flujos]) => ({
    codigo: key,
    nombre: flujos[0]?.nombreCuenta || "Sin cuenta",
    flujos,
    totalMeses: flujos.reduce((acc, f) => {
      return acc.map((v, i) => v + f.meses[i]);
    }, new Array(numMeses).fill(0))
  }));
}, [flujosMensuales, numMeses]);
```

### Drag-and-Drop en Flujo de Efectivo

Reutilizar el mismo patrón de dnd-kit usado en Presupuestos:

```typescript
// Importar componentes de dnd-kit
import { DndContext, closestCenter, ... } from "@dnd-kit/core";
import { SortableContext, arrayMove, ... } from "@dnd-kit/sortable";

// Actualizar orden en base de datos al soltar
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  
  // Reordenar localmente
  const reordered = arrayMove(flujos, oldIndex, newIndex);
  
  // Actualizar orden en presupuestos
  await Promise.all(
    reordered.map((flujo, index) =>
      supabase.from("presupuestos").update({ orden: index + 1 }).eq("id", flujo.presupuestoId)
    )
  );
};
```

---

## Resultado Esperado

1. **Presupuestos**: Los nuevos items se agregan al final del grupo correspondiente, manteniendo el orden existente intacto

2. **Flujo de Efectivo**:
   - Botones para agrupar por "Ninguno", "Cuenta", "Centro de Negocio"
   - La agrupación se persiste entre sesiones
   - Se pueden arrastrar filas para reordenar dentro de cada sección (Entradas/Salidas)
   - El orden se guarda en la base de datos y se refleja también en la página de Presupuestos

3. **Interfaz visual** del Flujo de Efectivo con agrupación:

```text
┌──────────────────────────────────────────────────────┐
│ Agrupar por: [Ninguno] [Cuenta] [Centro]             │
├──────────────────────────────────────────────────────┤
│ ▼ ENTRADAS DE EFECTIVO                               │
│   ▼ 100-001-002 Clientes                             │
│     ⋮ Venta Terreno Lote 1         $500,000  ...     │
│     ⋮ Venta Terreno Lote 2         $450,000  ...     │
│   ▼ 400-001 Ingresos por Servicios                   │
│     ⋮ Cuota de Mantenimiento       $10,000   ...     │
├──────────────────────────────────────────────────────┤
│ ▼ SALIDAS DE EFECTIVO                                │
│   ...                                                │
└──────────────────────────────────────────────────────┘
```
