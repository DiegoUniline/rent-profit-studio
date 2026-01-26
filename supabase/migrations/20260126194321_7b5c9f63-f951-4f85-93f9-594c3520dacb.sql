-- Agregar columna presupuesto_id a programaciones
ALTER TABLE public.programaciones 
ADD COLUMN IF NOT EXISTS presupuesto_id UUID REFERENCES presupuestos(id);

-- Crear indice para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_programaciones_presupuesto 
ON programaciones(presupuesto_id);