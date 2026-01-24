-- Agregar columna presupuesto_id a asiento_movimientos para vincular con presupuestos
ALTER TABLE asiento_movimientos 
ADD COLUMN presupuesto_id uuid REFERENCES presupuestos(id) ON DELETE SET NULL;

-- Crear índice para mejor rendimiento en consultas
CREATE INDEX idx_asiento_movimientos_presupuesto ON asiento_movimientos(presupuesto_id);