
# Plan: Botones de acción lado a lado en Cuentas Contables

## Problema identificado
Los botones de **Editar** y **Eliminar** en la tabla de cuentas contables se muestran apilados verticalmente (uno debajo del otro), lo que hace que cada fila ocupe más espacio vertical del necesario.

## Solución propuesta
Envolver los botones en un contenedor flex que los alinee horizontalmente, reduciendo la altura de las filas y haciendo la tabla más compacta.

---

## Cambio a realizar

### Archivo: `src/pages/Cuentas.tsx`

**Antes:**
```tsx
<TableCell className="text-right">
  <Button variant="ghost" size="icon" onClick={() => openEdit(cuenta)}>
    <Edit className="h-4 w-4" />
  </Button>
  {canDelete && (
    <Button variant="ghost" size="icon" onClick={() => handleDelete(cuenta)}>
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  )}
</TableCell>
```

**Después:**
```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-1">
    <Button variant="ghost" size="icon" onClick={() => openEdit(cuenta)}>
      <Edit className="h-4 w-4" />
    </Button>
    {canDelete && (
      <Button variant="ghost" size="icon" onClick={() => handleDelete(cuenta)}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    )}
  </div>
</TableCell>
```

---

## Resultado esperado
- Los botones Editar y Eliminar aparecerán lado a lado en la misma línea
- Las filas de la tabla serán más compactas
- El diseño será similar al sistema anterior que el usuario prefiere
