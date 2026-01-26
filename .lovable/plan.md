
# Plan: Agregar Foreign Key para Proteger Cuentas con Movimientos

## Problema Actual
La tabla `asiento_movimientos` tiene una columna `cuenta_id` que debería referenciar a `cuentas_contables`, pero **no existe una foreign key** que impida eliminar cuentas que tienen movimientos asociados.

Esto significa que actualmente se puede eliminar una cuenta y los movimientos quedarían huérfanos, causando errores en reportes.

---

## Solución Propuesta

### 1. Migración de Base de Datos

Agregar una foreign key constraint con `ON DELETE RESTRICT`:

```sql
-- Add foreign key from asiento_movimientos to cuentas_contables
ALTER TABLE public.asiento_movimientos
ADD CONSTRAINT asiento_movimientos_cuenta_id_fkey
FOREIGN KEY (cuenta_id) 
REFERENCES public.cuentas_contables(id)
ON DELETE RESTRICT;
```

La opcion `ON DELETE RESTRICT` significa:
- Si intentas borrar una cuenta que tiene movimientos, la base de datos rechazara la operacion
- El codigo existente ya maneja este error y muestra el mensaje: "No se puede eliminar: la cuenta tiene movimientos asociados"

---

## Verificacion Previa Necesaria

Antes de aplicar la migracion, debemos verificar que no existan movimientos con `cuenta_id` huerfanos:

```sql
SELECT am.id, am.cuenta_id 
FROM asiento_movimientos am
LEFT JOIN cuentas_contables cc ON am.cuenta_id = cc.id
WHERE cc.id IS NULL;
```

Si hay registros huerfanos, habra que limpiarlos primero.

---

## Resultado Esperado

- Las cuentas con movimientos estaran protegidas contra eliminacion accidental
- El mensaje de error ya existente se mostrara correctamente
- Los reportes financieros mantendran integridad de datos
