
# Plan: Corregir Cálculo de Saldos en Programación Financiera

## Resumen del Problema

Actualmente en la página de Programación:

1. **Saldo de Cartera**: Se calcula solo para la empresa filtrada. Debería ser el saldo de **todas las cuentas de cartera de TODAS las empresas** (valor global).

2. **Balance Proyectado**: Solo calcula `Ingresos - Egresos`. Debería ser:
   - **Saldo Banco + Saldo Cartera + Ingresos Programados - Egresos Programados**

---

## Cambios Técnicos

### Archivo: `src/pages/Programacion.tsx`

**Cambio 1: Calcular Saldo de Cartera Global**

Modificar el cálculo de `saldosBancarios` para que el saldo de cartera siempre sea de todas las empresas, sin importar el filtro de empresa activo.

Líneas 254-284 - Cambiar de:
```typescript
const saldosBancarios = useMemo(() => {
  // Filtrar por empresa si hay filtro activo
  const cuentasFiltradas = filterEmpresa === "all" 
    ? cuentas 
    : cuentas.filter(c => c.empresa_id === filterEmpresa);

  // Cuentas de cartera filtradas por empresa...
  const cuentasCartera = cuentasFiltradas.filter(...);
```

A:
```typescript
const saldosBancarios = useMemo(() => {
  // Banco: filtrar por empresa si hay filtro activo
  const cuentasFiltradas = filterEmpresa === "all" 
    ? cuentas 
    : cuentas.filter(c => c.empresa_id === filterEmpresa);

  // Cartera: SIEMPRE de todas las empresas (saldo global)
  const cuentasCartera = cuentas.filter(c =>
    c.codigo.startsWith("100-001-002") ||
    c.nombre.toLowerCase().includes("cartera")
  );
```

**Cambio 2: Calcular Balance Proyectado Correctamente**

Modificar el cálculo de `kpis` para incluir los saldos de banco y cartera.

Líneas 287-296 - Cambiar de:
```typescript
const kpis = useMemo(() => {
  const pendientes = filteredProgramaciones.filter((p) => p.estado === "pendiente");
  const ingresos = pendientes.filter((p) => p.tipo === "ingreso")...;
  const egresos = pendientes.filter((p) => p.tipo === "egreso")...;
  return { ingresos, egresos, balance: ingresos - egresos };
}, [filteredProgramaciones]);
```

A:
```typescript
const kpis = useMemo(() => {
  const pendientes = filteredProgramaciones.filter((p) => p.estado === "pendiente");
  const ingresos = pendientes.filter((p) => p.tipo === "ingreso")...;
  const egresos = pendientes.filter((p) => p.tipo === "egreso")...;
  
  // Balance = Saldo Banco + Saldo Cartera + Ingresos - Egresos
  const balance = saldosBancarios.banco + saldosBancarios.cartera + ingresos - egresos;
  
  return { ingresos, egresos, balance };
}, [filteredProgramaciones, saldosBancarios]);
```

**Cambio 3: Actualizar descripción del KPI**

Actualizar el texto descriptivo del Balance Proyectado para reflejar la nueva fórmula.

Línea 516 - Cambiar de:
```typescript
<p className="text-xs text-muted-foreground">Diferencia neta</p>
```

A:
```typescript
<p className="text-xs text-muted-foreground">Banco + Cartera + Ingresos - Egresos</p>
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Programacion.tsx` | Corregir cálculo de cartera global y fórmula de balance proyectado |

---

## Resultado Esperado

1. **Saldo de Cartera**: Mostrará el saldo total de todas las cuentas de cartera de todas las empresas, independientemente del filtro de empresa.

2. **Balance Proyectado**: Mostrará la fórmula correcta:
   - Saldo Banco + Saldo Cartera + Ingresos Programados - Egresos Programados
