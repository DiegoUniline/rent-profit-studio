
# Plan de Correcciones para Modulo Programacion

## Problemas Identificados

1. **Overflow en el dialogo**: El componente `SearchableSelect` no soporta refs correctamente, causando problemas de posicionamiento de los dropdowns
2. **Grafica sin colores**: Las variables CSS para colores de graficas (`--chart-1`, `--chart-2`, `--chart-3`) no estan definidas en el sistema de diseno
3. **Falta indicador de estado**: El usuario necesita diferenciar visualmente entre Programado y Ejecutado

---

## Solucion 1: Corregir Overflow del Dialogo

### Problema
El `SearchableSelect` usa un `Popover` que puede desbordarse fuera del dialogo cuando hay muchos elementos.

### Solucion
- Agregar `overflow-y-auto` y `max-h-[80vh]` al contenido del dialogo
- Ajustar el `PopoverContent` en `SearchableSelect` para posicionarse correctamente con `sideOffset` y limitar su altura

### Cambios
| Archivo | Modificacion |
|---------|--------------|
| `src/components/dialogs/ProgramacionDialog.tsx` | Agregar `className="max-h-[80vh] overflow-y-auto"` al contenedor de contenido |
| `src/components/ui/searchable-select.tsx` | Limitar altura del `CommandList` con `max-h-[200px]` y agregar `forwardRef` para compatibilidad |

---

## Solucion 2: Agregar Colores a la Grafica de Proyeccion

### Problema
La grafica usa variables CSS (`--chart-1`, `--chart-2`, `--chart-3`) que no existen en `index.css`.

### Solucion
Agregar variables de colores para graficas al sistema de diseno.

### Cambios
| Archivo | Modificacion |
|---------|--------------|
| `src/index.css` | Agregar variables `--chart-1` a `--chart-5` en `:root` y `.dark` |

### Paleta de colores propuesta
```text
chart-1: Rojo/Rosa (egresos)     → 0 84% 60%
chart-2: Verde esmeralda (ingresos) → 160 84% 45%
chart-3: Azul (balance)          → 199 89% 48%
chart-4: Ambar (advertencia)     → 38 92% 50%
chart-5: Morado (otros)          → 270 70% 60%
```

---

## Solucion 3: Pestanas de Estado Programado/Ejecutado

### Problema
El usuario quiere ver facilmente que items estan programados vs ejecutados.

### Solucion
Agregar pestanas secundarias dentro de "Programaciones" para filtrar por estado:
- **Pendientes** (default): Solo items con estado "pendiente"
- **Ejecutados**: Items con estado "ejecutado"  
- **Todos**: Sin filtro de estado

### Cambios
| Archivo | Modificacion |
|---------|--------------|
| `src/pages/Programacion.tsx` | Reemplazar el dropdown de filtro de estado por `Tabs` visuales mas prominentes |

### Estructura visual propuesta
```text
+----------------------------------------------------------+
|  PROGRAMACION FINANCIERA                            [+]  |
+----------------------------------------------------------+
| [Programaciones]  [Proyeccion]                           |
+----------------------------------------------------------+
| [Pendientes ●12] [Ejecutados ●5] [Cancelados ●2]         |
+----------------------------------------------------------+
| Filtros: [Empresa ▼] [Tipo ▼]                            |
+----------------------------------------------------------+
| Tabla...                                                  |
+----------------------------------------------------------+
```

---

## Seccion Tecnica

### Cambio en SearchableSelect (forwardRef)
```typescript
export const SearchableSelect = React.forwardRef<HTMLDivElement, SearchableSelectProps>(
  ({ value, onValueChange, options, ... }, ref) => {
    // ... existing code
    return (
      <div ref={ref} className={cn("flex gap-2", className)}>
        {/* existing JSX */}
      </div>
    );
  }
);
```

### Variables CSS para graficas
```css
:root {
  --chart-1: 0 84% 60%;      /* Rojo - egresos */
  --chart-2: 160 84% 45%;    /* Verde - ingresos */
  --chart-3: 199 89% 48%;    /* Azul - balance */
  --chart-4: 38 92% 50%;     /* Ambar */
  --chart-5: 270 70% 60%;    /* Morado */
}
```

### Tabs de estado (fragmento)
```typescript
<div className="flex gap-2 mb-4">
  <Button 
    variant={filterEstado === "pendiente" ? "default" : "outline"}
    onClick={() => setFilterEstado("pendiente")}
  >
    Pendientes
    <Badge variant="secondary" className="ml-2">{countPendientes}</Badge>
  </Button>
  <Button 
    variant={filterEstado === "ejecutado" ? "default" : "outline"}
    onClick={() => setFilterEstado("ejecutado")}
  >
    Ejecutados
    <Badge variant="secondary" className="ml-2">{countEjecutados}</Badge>
  </Button>
  <Button 
    variant={filterEstado === "all" ? "default" : "outline"}
    onClick={() => setFilterEstado("all")}
  >
    Todos
  </Button>
</div>
```

---

## Archivos a Modificar

| Archivo | Tipo de Cambio |
|---------|----------------|
| `src/index.css` | Agregar variables CSS para colores de graficas |
| `src/components/ui/searchable-select.tsx` | Agregar `forwardRef` y limitar altura de lista |
| `src/components/dialogs/ProgramacionDialog.tsx` | Agregar scroll al contenido del dialogo |
| `src/pages/Programacion.tsx` | Agregar botones de filtro por estado con contadores |

---

## Orden de Implementacion
1. Agregar variables de color CSS en `index.css`
2. Corregir `SearchableSelect` con `forwardRef` y limite de altura
3. Ajustar scroll en `ProgramacionDialog`
4. Implementar botones de filtro de estado en `Programacion.tsx`
