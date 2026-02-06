
# Plan: Consolidar Cuentas Contables en Vista "Todas las Empresas"

## Problema Actual
Cuando el usuario selecciona "Todas las empresas":
- Las cuentas se repiten (una por cada empresa que tenga ese código)
- Por ejemplo, si 3 empresas tienen la cuenta `100-000-000-000`, aparece 3 veces
- Los saldos no se consolidan

## Solución
Cuando `filterEmpresa === "all"`:
1. Agrupar las cuentas por código
2. Mostrar cada código una sola vez
3. Sumar los saldos de todas las empresas para ese código
4. Ocultar botones de editar/eliminar (ya que sería ambiguo cuál cuenta editar)

## Cambios a Realizar

### Archivo: `src/pages/Cuentas.tsx`

**Modificar el `useMemo` de `filteredCuentas`** para incluir lógica de consolidación:

```typescript
const { filteredCuentas, stats, isConsolidated } = useMemo(() => {
  let filtered = cuentas;
  
  // Filter by estado primero
  filtered = filtered.filter(c => filterEstado === "activos" ? c.activa : !c.activa);
  
  // Si es una empresa específica, filtrar normalmente
  if (filterEmpresa !== "all") {
    filtered = filtered.filter(c => c.empresa_id === filterEmpresa);
    
    // Aplicar búsqueda
    if (search) {
      filtered = filtered.filter(c => 
        c.codigo.toLowerCase().includes(search.toLowerCase()) ||
        c.nombre.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return { filteredCuentas: filtered, stats: {...}, isConsolidated: false };
  }
  
  // CONSOLIDACIÓN: Agrupar por código cuando es "Todas"
  const cuentasAgrupadas = new Map<string, CuentaContable & { saldoConsolidado: number }>();
  
  filtered.forEach(cuenta => {
    const existing = cuentasAgrupadas.get(cuenta.codigo);
    const saldoCuenta = saldos.get(cuenta.id) || 0;
    
    if (existing) {
      // Sumar el saldo al existente
      existing.saldoConsolidado += saldoCuenta;
    } else {
      // Primera vez que vemos este código
      cuentasAgrupadas.set(cuenta.codigo, {
        ...cuenta,
        saldoConsolidado: saldoCuenta
      });
    }
  });
  
  // Convertir a array y ordenar
  let consolidadas = Array.from(cuentasAgrupadas.values())
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  
  // Aplicar búsqueda
  if (search) {
    consolidadas = consolidadas.filter(c => 
      c.codigo.toLowerCase().includes(search.toLowerCase()) ||
      c.nombre.toLowerCase().includes(search.toLowerCase())
    );
  }
  
  return { 
    filteredCuentas: consolidadas, 
    stats: {...},
    isConsolidated: true 
  };
}, [cuentas, filterEmpresa, filterEstado, search, saldos]);
```

**Modificar la renderización de la tabla:**
- Usar `saldoConsolidado` cuando `isConsolidated === true`
- Ocultar botones de editar/eliminar en modo consolidado
- Agregar indicador visual de que es vista consolidada

## Comportamiento Final

| Filtro | Cuentas mostradas | Saldo | Acciones |
|--------|-------------------|-------|----------|
| Empresa específica | Solo de esa empresa | Saldo individual | Editar/Eliminar visible |
| Todas las empresas | Una por código (consolidado) | Suma de todas las empresas | Sin acciones (solo lectura) |

## Indicador Visual
- Agregar un badge o texto pequeño indicando "Vista consolidada" cuando `filterEmpresa === "all"`
- Esto ayuda al usuario a entender que está viendo datos agregados
