
# Plan: Mejoras en Programación, Permisos de Presupuestos y Campo Tercero

## Resumen de Cambios Solicitados

1. **Programación Financiera**:
   - Agrupar programaciones por tipo (primero ingresos, luego egresos)
   - Agregar botón para agrupar por Centro de Negocio o Presupuesto
   - Guardar preferencia de agrupación por usuario (localStorage)
   - Las tarjetas KPI deben filtrarse según los filtros seleccionados

2. **Presupuestos - Permisos**:
   - Si el usuario no puede crear presupuestos, ocultar botones de crear y eliminar/desactivar

3. **Presupuestos - Campo Tercero**:
   - El campo "Tercero" ya no es requerido en el formulario de presupuestos

---

## Detalles Técnicos

### 1. Página de Programación (`src/pages/Programacion.tsx`)

**1.1 Agrupación por Tipo (Ingresos/Egresos)**
- Modificar la visualización de la tabla para mostrar primero los ingresos, luego los egresos
- Agregar secciones colapsables por tipo cuando no hay otro agrupamiento activo

**1.2 Selector de Agrupación con Persistencia**
- Agregar un `ToggleGroup` similar al de Presupuestos
- Opciones: "Sin agrupar" (por defecto muestra Ingresos/Egresos), "Centro de Negocio", "Presupuesto"
- Guardar selección en `localStorage` con clave `programacion_grouping`
- Recuperar preferencia al cargar la página

**1.3 Filtrado de Tarjetas KPI**
- Actualmente los KPIs calculan sobre todas las programaciones
- Cambiar para usar `filteredProgramaciones` en lugar de `programaciones`
- Esto afecta: Ingresos Programados, Egresos Programados, Balance Proyectado

### 2. Permisos en Presupuestos

**2.1 Archivo `src/pages/Presupuestos.tsx`**
- El botón "Nuevo Presupuesto" ya está condicionado a `role === "admin"`
- Agregar condición para el botón "Crear primer presupuesto" en la vista vacía

**2.2 Archivo `src/components/presupuestos/SortablePresupuestoRow.tsx`**
- Agregar prop `canDelete` separado de `canEdit`
- Ocultar botón de desactivar/activar para usuarios no-admin
- `canEdit` seguirá siendo para admin y contador (editar)
- `canDelete` será solo para admin (desactivar/activar)

**2.3 Actualización en Presupuestos.tsx**
- Pasar nueva prop `canDelete={role === "admin"}` al componente

### 3. Campo Tercero Opcional en Presupuestos

**3.1 Archivo `src/components/dialogs/PresupuestoDialog.tsx`**
- El campo tercero ya es opcional en el formulario (no hay validación requerida en el schema)
- Solo confirmar que no hay asterisco (*) junto a la etiqueta "Tercero"
- El campo ya permite valor vacío

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Programacion.tsx` | Agregar agrupación, persistencia, filtrar KPIs |
| `src/pages/Presupuestos.tsx` | Pasar prop `canDelete` al row component |
| `src/components/presupuestos/SortablePresupuestoRow.tsx` | Agregar prop `canDelete` y ocultar botón desactivar |
| `src/components/dialogs/PresupuestoDialog.tsx` | Verificar que Tercero no tenga asterisco de requerido |

---

## Lógica de Agrupación en Programación

```text
Estado inicial:
- grouping = "tipo" (por defecto)
- Muestra secciones: "Ingresos" -> lista, "Egresos" -> lista

Opciones de agrupación:
- "tipo": Agrupa por ingreso/egreso (default)
- "centro": Agrupa por Centro de Negocio
- "presupuesto": Agrupa por Presupuesto vinculado

Persistencia:
localStorage.getItem("programacion_grouping") || "tipo"
```

---

## Cambios en KPIs Filtrados

**Antes:**
```typescript
const kpis = useMemo(() => {
  const pendientes = programaciones.filter((p) => p.estado === "pendiente");
  // ...
}, [programaciones]);
```

**Después:**
```typescript
const kpis = useMemo(() => {
  const pendientes = filteredProgramaciones.filter((p) => p.estado === "pendiente");
  // ...
}, [filteredProgramaciones]);
```

Nota: Los KPIs de Ingresos/Egresos/Balance reflejarán los filtros activos. Las tarjetas de Saldo Bancos y Saldo Cartera ya se filtran por empresa.

---

## Resultado Esperado

1. **Programación**: Vista agrupada por tipo (ingresos primero, egresos después) con opción de cambiar agrupación. KPIs respetan filtros.

2. **Presupuestos**: Solo administradores ven botones de crear y desactivar. Contadores solo pueden editar.

3. **Formulario Presupuesto**: Campo Tercero claramente opcional sin asterisco.
