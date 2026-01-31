
# Plan: Filtro por Rango de Fechas en Asientos Contables

## Resumen
Agregar dos campos de fecha (Desde y Hasta) en la sección de filtros de la página de Asientos Contables para poder filtrar las pólizas por un rango de fechas específico.

## Cambios Visuales

La sección de filtros actual se ampliará para incluir:
- Campo "Desde" (fecha inicial del rango)
- Campo "Hasta" (fecha final del rango)
- Ambos campos opcionales - si solo se llena uno, filtra desde/hasta esa fecha
- Los campos aparecerán junto a los filtros existentes (empresa, tipo, estado)

## Comportamiento

1. **Sin fechas seleccionadas**: Muestra todos los asientos (comportamiento actual)
2. **Solo "Desde"**: Muestra asientos desde esa fecha en adelante
3. **Solo "Hasta"**: Muestra asientos hasta esa fecha
4. **Ambas fechas**: Muestra asientos dentro del rango (inclusive)
5. Los totales de las tarjetas (Debe, Haber, Conteo) se actualizarán automáticamente según el filtro

---

## Detalles Técnicos

### Archivo a modificar
`src/pages/Asientos.tsx`

### Cambios específicos

1. **Agregar importación del componente DateInput**
```typescript
import { DateInput } from "@/components/ui/date-input";
```

2. **Agregar estados para las fechas**
```typescript
const [filterFechaDesde, setFilterFechaDesde] = useState<Date | undefined>(undefined);
const [filterFechaHasta, setFilterFechaHasta] = useState<Date | undefined>(undefined);
```

3. **Actualizar lógica de filtrado en `filteredAsientos`**
- Convertir la fecha del asiento a objeto Date usando `parseLocalDate`
- Comparar con las fechas del filtro si están definidas

4. **Agregar campos de fecha en la UI de filtros**
- Dos componentes `DateInput` con etiquetas "Desde" y "Hasta"
- Ancho fijo para mantener consistencia visual
- Placeholder descriptivo para cada campo

### Validaciones
- La fecha "Hasta" no puede ser menor que "Desde" (validación visual opcional)
- Uso de `parseLocalDate` para evitar problemas de zona horaria
