
-- Create the flujos_programados table for manual flow scheduling
CREATE TABLE public.flujos_programados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  presupuesto_id UUID NOT NULL REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  monto NUMERIC NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flujos_programados ENABLE ROW LEVEL SECURITY;

-- RLS policies matching presupuestos access patterns
CREATE POLICY "Authenticated users can view flujos_programados"
ON public.flujos_programados
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert flujos_programados"
ON public.flujos_programados
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins and contadores can update flujos_programados"
ON public.flujos_programados
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins can delete flujos_programados"
ON public.flujos_programados
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for performance
CREATE INDEX idx_flujos_programados_presupuesto ON public.flujos_programados(presupuesto_id);
CREATE INDEX idx_flujos_programados_fecha ON public.flujos_programados(fecha);
