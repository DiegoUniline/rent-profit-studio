

# Mejoras al Modulo de Programacion Financiera

## Resumen
Se agregaran tres funcionalidades al modulo de Programacion:
1. **Mostrar saldos de cuentas de banco y cartera** en tarjetas KPI
2. **Vincular presupuestos** a las programaciones de ingreso/egreso
3. **Rastrear estado de pago** para saber que presupuesto se pago o no

## Funcionalidades Detalladas

### 1. Saldos de Banco y Cartera
Se agregaran tarjetas adicionales en la vista de Programacion mostrando:
- **Saldo de Bancos**: Suma de cuentas con codigo `100-001` o nombre contiene "banco"
- **Saldo de Cartera**: Cuentas de clientes (tipicamente `100-002` o nombre contiene "caja", "clientes")
- Ambos se calcularan desde asientos aplicados

```text
+--------------------------------------------------+
|  PROGRAMACION FINANCIERA                    [+]  |
+--------------------------------------------------+
| [Banco: $XX,XXX] [Cartera: $XX,XXX]              |
| [Ingresos Prog] [Egresos Prog] [Balance]         |
+--------------------------------------------------+
```

### 2. Vincular Presupuesto a Programacion
- Agregar columna `presupuesto_id` a la tabla `programaciones`
- En el dialogo de programacion, agregar SearchableSelect para seleccionar presupuesto
- Filtrar presupuestos por empresa seleccionada
- Mostrar el presupuesto vinculado en la tabla de programaciones

### 3. Rastrear Estado de Pago
El sistema ya tiene la logica para esto:
- Cuando `estado = 'ejecutado'` significa que se pago/cobro
- Cuando existe `asiento_id` hay referencia al movimiento contable
- Se mostrara visualmente que presupuestos tienen programaciones pagadas vs pendientes

## Seccion Tecnica

### Migracion de Base de Datos
```sql
-- Agregar columna presupuesto_id a programaciones
ALTER TABLE public.programaciones 
ADD COLUMN IF NOT EXISTS presupuesto_id UUID REFERENCES presupuestos(id);

-- Crear indice para consultas
CREATE INDEX IF NOT EXISTS idx_programaciones_presupuesto 
ON programaciones(presupuesto_id);
```

### Calculo de Saldos Bancarios
```typescript
// Identificar cuentas de banco y cartera
const cuentasBanco = cuentas.filter(c => 
  c.codigo.startsWith("100-001") || 
  c.nombre.toLowerCase().includes("banco")
);

const cuentasCartera = cuentas.filter(c =>
  c.codigo.startsWith("100-002") ||
  c.nombre.toLowerCase().includes("cliente") ||
  c.nombre.toLowerCase().includes("caja")
);
```

### Estructura Actualizada del Dialogo
El formulario de programacion incluira:
- SearchableSelect de Presupuesto (filtrado por empresa)
- Al seleccionar presupuesto: auto-llenar monto del presupuesto pendiente
- Mostrar badge de presupuesto en la tabla principal

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/migrations/xxx.sql` | Agregar `presupuesto_id` a programaciones |
| `src/pages/Programacion.tsx` | Agregar tarjetas de saldos bancarios, columna de presupuesto en tabla |
| `src/components/dialogs/ProgramacionDialog.tsx` | Agregar SearchableSelect para presupuesto |
| `src/integrations/supabase/types.ts` | Se actualizara automaticamente |

## Orden de Implementacion
1. Crear migracion para agregar `presupuesto_id`
2. Actualizar `ProgramacionDialog.tsx` con selector de presupuesto
3. Actualizar `Programacion.tsx`:
   - Agregar fetch de cuentas y movimientos para calcular saldos
   - Agregar tarjetas de Banco y Cartera
   - Agregar columna de presupuesto en la tabla
   - Mostrar indicador de pago en presupuestos relacionados

