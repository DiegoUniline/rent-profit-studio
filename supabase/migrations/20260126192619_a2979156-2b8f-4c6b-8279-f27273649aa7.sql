-- Create enums for programaciones
CREATE TYPE estado_programacion AS ENUM ('pendiente', 'ejecutado', 'cancelado');
CREATE TYPE tipo_programacion AS ENUM ('ingreso', 'egreso');

-- Create programaciones table
CREATE TABLE public.programaciones (
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

-- Enable RLS
ALTER TABLE public.programaciones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view programaciones" 
ON public.programaciones 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and contadores can insert programaciones" 
ON public.programaciones 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));

CREATE POLICY "Admins and contadores can update programaciones" 
ON public.programaciones 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador'));

CREATE POLICY "Admins can delete programaciones" 
ON public.programaciones 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'));