-- Crear tabla centros_negocio
CREATE TABLE public.centros_negocio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  tipo_actividad TEXT,
  responsable TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, codigo)
);

-- Crear tabla terceros
CREATE TABLE public.terceros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('cliente', 'proveedor', 'ambos')),
  rfc TEXT NOT NULL,
  razon_social TEXT NOT NULL,
  nombre_comercial TEXT,
  calle TEXT,
  numero_exterior TEXT,
  numero_interior TEXT,
  colonia TEXT,
  codigo_postal TEXT,
  ciudad TEXT,
  estado TEXT,
  telefono TEXT,
  email TEXT,
  contacto_nombre TEXT,
  banco TEXT,
  numero_cuenta TEXT,
  clabe TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, rfc)
);

-- Habilitar RLS para centros_negocio
ALTER TABLE public.centros_negocio ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para centros_negocio
CREATE POLICY "Authenticated users can view centros_negocio"
ON public.centros_negocio
FOR SELECT
USING (true);

CREATE POLICY "Admins and contadores can insert centros_negocio"
ON public.centros_negocio
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can update centros_negocio"
ON public.centros_negocio
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins can delete centros_negocio"
ON public.centros_negocio
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Habilitar RLS para terceros
ALTER TABLE public.terceros ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para terceros
CREATE POLICY "Authenticated users can view terceros"
ON public.terceros
FOR SELECT
USING (true);

CREATE POLICY "Admins and contadores can insert terceros"
ON public.terceros
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins and contadores can update terceros"
ON public.terceros
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

CREATE POLICY "Admins can delete terceros"
ON public.terceros
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers para updated_at
CREATE TRIGGER update_centros_negocio_updated_at
BEFORE UPDATE ON public.centros_negocio
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_terceros_updated_at
BEFORE UPDATE ON public.terceros
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();