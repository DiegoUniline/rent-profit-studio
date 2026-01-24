-- Create enum for asiento type
CREATE TYPE public.tipo_asiento AS ENUM ('ingreso', 'egreso', 'diario');

-- Create enum for asiento status
CREATE TYPE public.estado_asiento AS ENUM ('borrador', 'aplicado', 'cancelado');

-- Create asientos_contables table (header)
CREATE TABLE public.asientos_contables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo tipo_asiento NOT NULL DEFAULT 'diario',
  tercero_id uuid REFERENCES public.terceros(id) ON DELETE SET NULL,
  centro_negocio_id uuid REFERENCES public.centros_negocio(id) ON DELETE SET NULL,
  numero_asiento serial,
  observaciones text,
  estado estado_asiento NOT NULL DEFAULT 'borrador',
  total_debe numeric(15,2) NOT NULL DEFAULT 0,
  total_haber numeric(15,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create asiento_movimientos table (line items)
CREATE TABLE public.asiento_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asiento_id uuid NOT NULL REFERENCES public.asientos_contables(id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_contables(id) ON DELETE RESTRICT,
  partida text NOT NULL,
  debe numeric(15,2) NOT NULL DEFAULT 0,
  haber numeric(15,2) NOT NULL DEFAULT 0,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.asientos_contables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asiento_movimientos ENABLE ROW LEVEL SECURITY;

-- RLS policies for asientos_contables
CREATE POLICY "Authenticated users can view asientos"
  ON public.asientos_contables FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and contadores can insert asientos"
  ON public.asientos_contables FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can update asientos"
  ON public.asientos_contables FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins can delete asientos"
  ON public.asientos_contables FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for asiento_movimientos
CREATE POLICY "Authenticated users can view movimientos"
  ON public.asiento_movimientos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and contadores can insert movimientos"
  ON public.asiento_movimientos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can update movimientos"
  ON public.asiento_movimientos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can delete movimientos"
  ON public.asiento_movimientos FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_asientos_contables_updated_at
  BEFORE UPDATE ON public.asientos_contables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_asientos_empresa ON public.asientos_contables(empresa_id);
CREATE INDEX idx_asientos_fecha ON public.asientos_contables(fecha);
CREATE INDEX idx_movimientos_asiento ON public.asiento_movimientos(asiento_id);
CREATE INDEX idx_movimientos_cuenta ON public.asiento_movimientos(cuenta_id);