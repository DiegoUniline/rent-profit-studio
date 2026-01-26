
# Plan: Visualización de Nivel por Indentación

## Objetivo
Cambiar la visualización del catálogo de cuentas para que el nivel jerárquico se muestre a través de la **indentación visual** del nombre, eliminando la columna separada de "Nivel" con badges. Esto hará la tabla más compacta y similar al sistema anterior.

## Referencia Visual
Basado en la imagen proporcionada:
```text
100-000-000  activo
100-001-000     fijo
100-001-001        maquinaria                    20,000
```

---

## Cambios a Realizar

### Archivo: `src/pages/Cuentas.tsx`

#### 1. Eliminar columna "Nivel" del encabezado

**Antes (línea 376):**
```tsx
<TableHead className="w-[100px]">Nivel</TableHead>
```

**Después:** Eliminar esta línea completamente.

#### 2. Eliminar celda de Nivel del cuerpo de la tabla

**Antes (líneas 421-425):**
```tsx
<TableCell>
  <Badge variant="outline" className="text-xs">
    {level} - {levelLabels[level]}
  </Badge>
</TableCell>
```

**Después:** Eliminar este bloque completamente.

#### 3. Mejorar la indentación visual del nombre

**Antes (líneas 416-420):**
```tsx
<TableCell>
  <span style={{ paddingLeft: `${(level - 1) * 16}px` }}>
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
    {cuenta.nombre}
  </span>
</TableCell>
```

- Aumentar la indentación de 16px a 24px por nivel para que sea más visible
- Agregar `inline-block` para mejor control del espaciado

---

## Resultado Final

La tabla tendrá las siguientes columnas:
| Código | Nombre | Naturaleza | Tipo | Acciones |

Y la jerarquía se verá así:
```
100-000-000  Activo
100-001-000    Activo Fijo
100-001-001      Maquinaria
```

El nivel será claramente visible por la indentación del nombre, similar al sistema anterior que el usuario prefiere.
