
# Modulo de Programacion Financiera

## Resumen
Crear un nuevo modulo de "Programacion" que permite planificar ingresos y egresos futuros, con funciones para ejecutar (convertir a asiento contable), copiar y editar movimientos. Incluye un dashboard con tarjetas de resumen y visualizacion de proyecciones.

## Estructura de la Solucion

### Vista Principal con dos Pestanas

```text
+--------------------------------------------------+
|  PROGRAMACION FINANCIERA                    [+]  |
+--------------------------------------------------+
|  [Programaciones]  [Proyeccion]                  |
+--------------------------------------------------+

Tab 1 - Programaciones:
- Tarjetas KPI: Total Ingresos | Total Egresos | Balance
- Tabla de movimientos programados
- Acciones: Ejecutar, Copiar, Editar, Eliminar

Tab 2 - Proyeccion:
- Grafico de barras mensual (6-12 meses)
- Ingresos vs Egresos por mes
- Linea de balance acumulado
```

### Campos del Modulo
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| empresa_id | UUID | Empresa asociada |
| tipo | ENUM | 'ingreso' o 'egreso' |
| centro_negocio_id | UUID | Centro de costos (opcional) |
| fecha_programada | DATE | Fecha esperada |
| tercero_id | UUID | Proveedor o cliente (opcional) |
| monto | NUMERIC | Cantidad del movimiento |
| observaciones | TEXT | Notas adicionales |
| estado | ENUM | 'pendiente', 'ejecutado', 'cancelado' |
| asiento_id | UUID | Referencia al asiento si fue ejecutado |

## Componentes a Crear

### 1. Base de Datos
- Tabla `programaciones` con los campos mencionados
- Estado por defecto 'pendiente'
- RLS para admin y contador (insertar/actualizar), todos (ver)

### 2. Pagina Principal
- `src/pages/Programacion.tsx`
- Dos tabs: Programaciones y Proyeccion
- Tarjetas KPI con totales de ingresos/egresos programados
- Filtros por empresa, tipo y estado

### 3. Dialog de Creacion/Edicion
- `src/components/dialogs/ProgramacionDialog.tsx`
- Formulario con SearchableSelect para empresa, centro y tercero
- DatePicker para fecha programada
- Select para tipo (ingreso/egreso)
- Input numerico para monto
- Textarea para observaciones

### 4. Componente de Proyeccion
- `src/components/reportes/ProyeccionProgramacion.tsx`
- Grafico de barras con Recharts
- Agrupa programaciones por mes
- Muestra ingresos (verde) vs egresos (rojo)
- Linea de balance acumulado

### 5. Navegacion
- Agregar enlace en AppSidebar bajo "Operaciones"
- Icono: Calendar (de lucide-react)

## Funcionalidades

### Ejecutar Programacion
1. Usuario hace clic en "Ejecutar"
2. Se abre AsientoDialog precargado con:
   - Empresa de la programacion
   - Tipo: 'ingreso' si es ingreso, 'egreso' si es egreso
   - Fecha: fecha programada
   - Tercero (si existe)
   - Un movimiento inicial con el monto
3. Al guardar el asiento, actualizar programacion:
   - estado = 'ejecutado'
   - asiento_id = id del nuevo asiento

### Copiar Programacion
- Abre el dialogo con datos precargados
- Fecha se establece a hoy
- Observaciones con prefijo "Copia de..."

### Editar
- Solo si estado = 'pendiente'
- Abre dialogo en modo edicion

## Seccion Tecnica

### Migracion SQL
```sql
CREATE TYPE estado_programacion AS ENUM ('pendiente', 'ejecutado', 'cancelado');
CREATE TYPE tipo_programacion AS ENUM ('ingreso', 'egreso');

CREATE TABLE programaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id),
  tipo tipo_programacion NOT NULL,
  centro_negocio_id UUID REFERENCES centros_negocio(id),
  fecha_programada DATE NOT NULL,
  tercero_id UUID REFERENCES terceros(id),
  monto NUMERIC NOT NULL DEFAULT 0,
  observaciones TEXT,
  estado estado_programacion NOT NULL DEFAULT 'pendiente',
  asiento_id UUID REFERENCES asientos_contables(id),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER update_programaciones_updated_at
  BEFORE UPDATE ON programaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE programaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view programaciones" ON programaciones
  FOR SELECT USING (true);

CREATE POLICY "Admins and contadores can insert programaciones" ON programaciones
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  );

CREATE POLICY "Admins and contadores can update programaciones" ON programaciones
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  );

CREATE POLICY "Admins can delete programaciones" ON programaciones
  FOR DELETE USING (has_role(auth.uid(), 'admin'));
```

### Estructura de la Pagina
```tsx
// Tabs con dos vistas
<Tabs defaultValue="programaciones">
  <TabsList>
    <TabsTrigger value="programaciones">Programaciones</TabsTrigger>
    <TabsTrigger value="proyeccion">Proyeccion</TabsTrigger>
  </TabsList>
  
  <TabsContent value="programaciones">
    {/* KPI Cards + Filters + Table */}
  </TabsContent>
  
  <TabsContent value="proyeccion">
    <ProyeccionProgramacion programaciones={filtered} />
  </TabsContent>
</Tabs>
```

### Grafico de Proyeccion
```tsx
// Usando Recharts BarChart
<BarChart data={datosMensuales}>
  <XAxis dataKey="mes" />
  <YAxis />
  <Tooltip />
  <Legend />
  <Bar dataKey="ingresos" fill="#22c55e" name="Ingresos" />
  <Bar dataKey="egresos" fill="#ef4444" name="Egresos" />
  <Line type="monotone" dataKey="balance" stroke="#3b82f6" />
</BarChart>
```

## Archivos a Crear/Modificar

| Archivo | Accion |
|---------|--------|
| `supabase/migrations/xxx_create_programaciones.sql` | Crear |
| `src/pages/Programacion.tsx` | Crear |
| `src/components/dialogs/ProgramacionDialog.tsx` | Crear |
| `src/components/reportes/ProyeccionProgramacion.tsx` | Crear |
| `src/components/layout/AppSidebar.tsx` | Modificar |
| `src/App.tsx` | Modificar |

## Orden de Implementacion
1. Crear migracion de base de datos
2. Crear ProgramacionDialog.tsx
3. Crear ProyeccionProgramacion.tsx
4. Crear Programacion.tsx (pagina principal)
5. Agregar ruta en App.tsx
6. Agregar enlace en AppSidebar.tsx
