-- Conversaciones de Rafa por centro de negocio y archivos guardados por
-- conversación (docs/rafa/conversaciones-por-centro.md).
-- Idempotente: seguro de re-ejecutar.

-- 1. Ancla de la conversación: centro de negocio (y su empresa) -------------
ALTER TABLE public.rafa_conversaciones
  ADD COLUMN IF NOT EXISTS centro_negocio_id uuid REFERENCES public.centros_negocio(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rafa_conversaciones_centro
  ON public.rafa_conversaciones (user_id, centro_negocio_id, updated_at DESC);

-- La empresa siempre sale del centro (no se confía en el navegador).
CREATE OR REPLACE FUNCTION public.rafa_conversacion_empresa_del_centro()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.centro_negocio_id IS NOT NULL THEN
    SELECT empresa_id INTO NEW.empresa_id FROM public.centros_negocio WHERE id = NEW.centro_negocio_id;
    IF NEW.empresa_id IS NULL THEN
      RAISE EXCEPTION 'El centro de negocio no existe.';
    END IF;
  ELSE
    NEW.empresa_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rafa_conversacion_empresa ON public.rafa_conversaciones;
CREATE TRIGGER trg_rafa_conversacion_empresa
  BEFORE INSERT OR UPDATE OF centro_negocio_id ON public.rafa_conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.rafa_conversacion_empresa_del_centro();

-- 2. Archivos de la conversación --------------------------------------------
CREATE TABLE IF NOT EXISTS public.rafa_archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  conversacion_id uuid NOT NULL REFERENCES public.rafa_conversaciones(id) ON DELETE CASCADE,
  centro_negocio_id uuid REFERENCES public.centros_negocio(id) ON DELETE SET NULL,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  mime text NOT NULL,
  tamano bigint NOT NULL DEFAULT 0,
  ruta text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rafa_archivos_conversacion ON public.rafa_archivos (conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rafa_archivos_centro ON public.rafa_archivos (user_id, centro_negocio_id, created_at DESC);

ALTER TABLE public.rafa_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leer archivos propios de Rafa" ON public.rafa_archivos;
CREATE POLICY "Leer archivos propios de Rafa"
ON public.rafa_archivos FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Eliminar archivos propios de Rafa" ON public.rafa_archivos;
CREATE POLICY "Eliminar archivos propios de Rafa"
ON public.rafa_archivos FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Los registra la función rafa-asistente (servicio) al recibir el archivo.
REVOKE INSERT, UPDATE ON public.rafa_archivos FROM anon, authenticated;
GRANT SELECT, DELETE ON public.rafa_archivos TO authenticated;
GRANT ALL ON public.rafa_archivos TO service_role;

-- 3. Almacenamiento privado: rafa-archivos/{usuario}/{conversación}/{archivo}
INSERT INTO storage.buckets (id, name, public)
VALUES ('rafa-archivos', 'rafa-archivos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Rafa: leer archivos propios" ON storage.objects;
CREATE POLICY "Rafa: leer archivos propios"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rafa-archivos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Rafa: eliminar archivos propios" ON storage.objects;
CREATE POLICY "Rafa: eliminar archivos propios"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rafa-archivos' AND (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
