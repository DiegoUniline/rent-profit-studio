-- Create unidades_medida table
CREATE TABLE public.unidades_medida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.unidades_medida ENABLE ROW LEVEL SECURITY;

-- RLS policies for unidades_medida
CREATE POLICY "Authenticated users can view unidades_medida"
  ON public.unidades_medida FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and contadores can insert unidades_medida"
  ON public.unidades_medida FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can update unidades_medida"
  ON public.unidades_medida FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

-- Insert default units
INSERT INTO public.unidades_medida (codigo, nombre) VALUES
  ('PZA', 'Pieza'),
  ('KG', 'Kilogramo'),
  ('LT', 'Litro'),
  ('M', 'Metro'),
  ('M2', 'Metro Cuadrado'),
  ('M3', 'Metro Cúbico'),
  ('HR', 'Hora'),
  ('DIA', 'Día'),
  ('SERV', 'Servicio'),
  ('LOTE', 'Lote');

-- Create presupuestos table
CREATE TABLE public.presupuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cuenta_id uuid REFERENCES public.cuentas_contables(id) ON DELETE SET NULL,
  tercero_id uuid REFERENCES public.terceros(id) ON DELETE SET NULL,
  centro_negocio_id uuid REFERENCES public.centros_negocio(id) ON DELETE SET NULL,
  unidad_medida_id uuid REFERENCES public.unidades_medida(id) ON DELETE SET NULL,
  partida text NOT NULL,
  cantidad numeric(15,4) NOT NULL DEFAULT 1,
  precio_unitario numeric(15,4) NOT NULL DEFAULT 0,
  notas text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.presupuestos ENABLE ROW LEVEL SECURITY;

-- RLS policies for presupuestos
CREATE POLICY "Authenticated users can view presupuestos"
  ON public.presupuestos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and contadores can insert presupuestos"
  ON public.presupuestos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can update presupuestos"
  ON public.presupuestos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins can delete presupuestos"
  ON public.presupuestos FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_presupuestos_updated_at
  BEFORE UPDATE ON public.presupuestos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();