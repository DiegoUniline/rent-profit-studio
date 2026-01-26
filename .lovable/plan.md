
# Plan: Corrección de Fechas y Dropdowns con Buscador

## Problemas Identificados

### 1. Problema de Fechas
El calendario actual de `react-day-picker` no permite navegar fácilmente a años lejanos. Cuando se intenta seleccionar "1 de enero de 2016", el calendario no navega correctamente al año deseado porque solo tiene botones de mes anterior/siguiente. Además, la fecha seleccionada no se muestra correctamente.

### 2. Dropdowns sin Búsqueda
Muchos selectores en el sistema usan el componente `Select` estándar que no permite buscar/filtrar opciones, lo cual dificulta encontrar elementos cuando hay muchos registros.

---

## Solución Propuesta

### Parte 1: Crear Componente DateInput Editable

Crear un nuevo componente `DateInput` que combine:
- **Campo de texto editable** para escribir la fecha directamente (formato dd/MM/yyyy)
- **Botón de calendario** que abre un picker con dropdowns de mes/año
- **Validación** de formato y fechas válidas

```text
+--------------------------------------------------+
|  [  01/01/2016  ]  [📅]                          |
+--------------------------------------------------+
         ↓ Al hacer clic en el icono
+--------------------------------------------------+
|  < Enero ▼    2016 ▼ >                          |
|  Lu Ma Mi Ju Vi Sa Do                           |
|  ...calendario...                                |
+--------------------------------------------------+
```

### Parte 2: Mejorar Calendar con Navegación por Año

Modificar el componente `Calendar` para incluir:
- `captionLayout="dropdown-buttons"` - Permite seleccionar mes y año con dropdowns
- `fromYear={1990}` y `toYear={2050}` - Rango de años navegables

### Parte 3: Convertir Selects a Componentes con Búsqueda

Crear un nuevo componente `FilterSelect` para filtros de páginas que incluya búsqueda, y reemplazar todos los `Select` actuales en:

| Página/Componente | Uso Actual |
|-------------------|------------|
| Dashboard.tsx | Filtro de empresa |
| Reportes.tsx | Filtro de empresa |
| Terceros.tsx | Filtros de empresa y tipo |
| CentrosNegocio.tsx | Filtro de empresa |
| Cuentas.tsx | Filtro de empresa |
| Presupuestos.tsx | Filtro de empresa |

---

## Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `src/components/ui/date-input.tsx` | Componente DateInput editable con calendario mejorado |
| `src/components/ui/filter-select.tsx` | Componente Select con buscador para filtros de página |

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/ui/calendar.tsx` | Añadir props `captionLayout`, `fromYear`, `toYear` con estilos para dropdowns |
| `src/pages/Reportes.tsx` | Reemplazar date pickers y Select por nuevos componentes |
| `src/pages/Dashboard.tsx` | Reemplazar Select por FilterSelect |
| `src/pages/Terceros.tsx` | Reemplazar Selects por FilterSelect |
| `src/pages/CentrosNegocio.tsx` | Reemplazar Select por FilterSelect |
| `src/pages/Cuentas.tsx` | Reemplazar Select por FilterSelect |
| `src/pages/Presupuestos.tsx` | Reemplazar Select por FilterSelect |
| `src/pages/Programacion.tsx` | Reemplazar date pickers por DateInput |
| `src/components/dialogs/PresupuestoDialog.tsx` | Reemplazar date pickers por DateInput |
| `src/components/dialogs/ProgramacionDialog.tsx` | Reemplazar date picker por DateInput |

---

## Detalles Técnicos

### Componente DateInput

```typescript
interface DateInputProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}
```

**Características:**
- Input de texto que acepta formato "dd/MM/yyyy"
- Parseo automático al perder foco o presionar Enter
- Validación visual (borde rojo si fecha inválida)
- Botón para abrir calendario con dropdowns de mes/año
- El calendario navega automáticamente a la fecha seleccionada o actual

### Componente FilterSelect

```typescript
interface FilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  allOption?: { value: string; label: string };
  className?: string;
}
```

**Características:**
- Dropdown con campo de búsqueda integrado
- Opción "Todos" configurable
- Estilos consistentes con el resto del sistema
- Z-index alto para evitar problemas de superposición

### Mejoras al Calendar

Añadir estas clases CSS para los dropdowns de mes/año:

```typescript
classNames={{
  // ... clases existentes ...
  caption_dropdowns: "flex gap-2",
  dropdown_month: "...",
  dropdown_year: "...",
  dropdown: "...",
}}
```

---

## Resultado Esperado

1. **Fechas correctas**: Al escribir "01/01/2016" o seleccionar en el calendario, se mostrará exactamente esa fecha
2. **Navegación rápida**: Dropdowns de mes y año permiten saltar directamente a cualquier fecha entre 1990-2050
3. **Búsqueda en filtros**: Todos los selectores de empresa y tipo tendrán un campo de búsqueda para encontrar opciones rápidamente
4. **Consistencia**: Todos los date pickers y selectores del sistema funcionarán de manera uniforme
