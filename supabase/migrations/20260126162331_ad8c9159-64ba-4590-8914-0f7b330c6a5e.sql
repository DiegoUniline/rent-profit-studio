-- Crear enum para frecuencia de presupuesto
CREATE TYPE public.frecuencia_presupuesto AS ENUM ('semanal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual');

-- Agregar columnas de fecha y frecuencia a presupuestos
ALTER TABLE public.presupuestos 
ADD COLUMN fecha_inicio DATE,
ADD COLUMN fecha_fin DATE,
ADD COLUMN frecuencia public.frecuencia_presupuesto DEFAULT 'mensual';

-- Crear índice para mejorar consultas por fecha
CREATE INDEX idx_presupuestos_fechas ON public.presupuestos (fecha_inicio, fecha_fin);