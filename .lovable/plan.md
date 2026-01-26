
# Corrección de Overflow en Filtros de Flujo de Efectivo

## Problema Identificado
El área de filtros en el componente `FlujoEfectivoPresupuesto` se desborda cuando los elementos (botones de años + filtros de tipo + botones de exportar) exceden el ancho disponible del contenedor.

**Causa raíz**: El contenedor usa `flex-wrap` pero los grupos de botones internos no permiten que se ajusten correctamente en pantallas pequeñas o cuando hay muchos elementos.

## Solución Propuesta
Reorganizar el layout de filtros para que:
1. Los filtros se apilen verticalmente en pantallas pequeñas
2. Los grupos de botones tengan `flex-wrap` para ajustarse al espacio disponible
3. Agregar `overflow-hidden` al contenedor padre para prevenir desbordamiento visual

## Cambios Específicos

### Archivo: `src/components/reportes/FlujoEfectivoPresupuesto.tsx`

| Ubicación | Cambio |
|-----------|--------|
| Línea 381 | Agregar `overflow-hidden` al contenedor principal de filtros |
| Línea 382 | Agregar `flex-wrap` y `min-w-0` al grupo de filtros izquierdo |
| Líneas 384-412 | Envolver el grupo de años en un contenedor con `flex-wrap` |
| Líneas 418-444 | Envolver el grupo de tipo en un contenedor con `flex-wrap` |

### Código Actual vs Propuesto

**Actual (líneas 378-458):**
```html
<Card>
  <CardContent className="pt-4">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <!-- Filtros sin restricción de overflow -->
      </div>
    </div>
  </CardContent>
</Card>
```

**Propuesto:**
```html
<Card>
  <CardContent className="pt-4">
    <div className="flex flex-col gap-4">
      {/* Fila de filtros */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Filtro de años */}
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays />
          <span>Años:</span>
          <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-lg">
            {/* Botones de años */}
          </div>
        </div>

        <div className="h-8 w-px bg-border hidden sm:block" />

        {/* Filtro de tipo */}
        <div className="flex flex-wrap gap-1 bg-muted p-1 rounded-lg">
          {/* Botones de tipo */}
        </div>
      </div>

      {/* Fila de acciones (exportar) */}
      <div className="flex flex-wrap gap-2">
        <Button>PDF</Button>
        <Button>Excel</Button>
      </div>
    </div>
  </CardContent>
</Card>
```

## Mejoras Adicionales

1. **Separador responsivo**: Ocultar el separador vertical en pantallas pequeñas (`hidden sm:block`)
2. **Botones más compactos**: Reducir `min-w-[60px]` a `min-w-[50px]` para los botones de años
3. **Layout vertical**: Usar `flex-col` en el contenedor principal para separar filtros de acciones

## Archivos a Modificar

| Archivo | Tipo de Cambio |
|---------|----------------|
| `src/components/reportes/FlujoEfectivoPresupuesto.tsx` | Ajustar clases CSS en la sección de filtros (líneas 378-458) |

## Resultado Esperado

```text
En pantallas amplias:
+--------------------------------------------------------+
| [Años: 2026 2027 2028] | [Todos] [Entradas] [Salidas]  |
| [PDF] [Excel]                                           |
+--------------------------------------------------------+

En pantallas reducidas:
+--------------------------------+
| [Años: 2026 2027 2028]         |
| [Todos] [Entradas] [Salidas]   |
| [PDF] [Excel]                  |
+--------------------------------+
```
