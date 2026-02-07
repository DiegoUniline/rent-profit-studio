
# Plan: Ocultar Nombre en Cuentas de Saldo en Vista Consolidada

## Problema Identificado
En la vista consolidada ("Todas las empresas"):
- Las cuentas de tipo **Saldo** (nivel 4) muestran el nombre de cuenta de una empresa específica
- Esto es incorrecto porque el saldo consolidado agrupa valores de múltiples empresas
- Cada empresa puede tener nombres diferentes para la misma cuenta

## Comportamiento Correcto
| Vista | Cuenta Titulo | Cuenta Saldo |
|-------|---------------|--------------|
| Empresa específica | Codigo + Nombre + Saldo acumulado | Codigo + Nombre + Saldo directo |
| Consolidada | Codigo + Nombre + Saldo acumulado | Codigo + **Sin nombre** + Saldo consolidado |

## Cambio a Realizar

### Archivo: `src/pages/Cuentas.tsx`

Modificar la celda del nombre en la renderización de la tabla (líneas 494-501):

**Antes:**
```tsx
<TableCell>
  <span 
    className="inline-block"
    style={{ paddingLeft: `${(level - 1) * 24}px` }}
  >
    {cuenta.nombre}
  </span>
</TableCell>
```

**Después:**
```tsx
<TableCell>
  <span 
    className="inline-block"
    style={{ paddingLeft: `${(level - 1) * 24}px` }}
  >
    {/* En vista consolidada, no mostrar nombre para cuentas de saldo */}
    {isConsolidated && cuenta.clasificacion === "saldo" 
      ? <span className="text-muted-foreground italic">—</span>
      : cuenta.nombre
    }
  </span>
</TableCell>
```

## Resultado Visual

**Vista consolidada:**
```
100-000-000-000  ACTIVO                    Titulo   $1,000,000
100-100-000-000  Activo Circulante         Titulo     $500,000
100-100-100-000  Caja y Bancos             Titulo     $200,000
100-100-100-001  —                         Saldo      $150,000
100-100-100-002  —                         Saldo       $50,000
```

**Vista empresa específica (sin cambios):**
```
100-000-000-000  ACTIVO                    Titulo   $1,000,000
100-100-000-000  Activo Circulante         Titulo     $500,000
100-100-100-000  Caja y Bancos             Titulo     $200,000
100-100-100-001  Banco Nacional MXN        Saldo      $150,000
100-100-100-002  Caja General              Saldo       $50,000
```

## Beneficios
- Se evita mostrar nombres incorrectos o parciales en vista consolidada
- Se mantiene coherencia visual con un guión (—) indicando que no aplica
- No genera confusión cuando varias empresas usan la misma cuenta contable
- Vista por empresa específica mantiene su comportamiento actual completo
