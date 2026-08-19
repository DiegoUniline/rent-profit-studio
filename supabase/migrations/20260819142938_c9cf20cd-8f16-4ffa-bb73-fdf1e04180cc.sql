CREATE TABLE public.rafa_sesiones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL DEFAULT 'Interpretación de Rafa',
  resumen text,
  transcripcion text,
  plan jsonb,
  propuesta jsonb,
  estado text NOT NULL DEFAULT 'borrador',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rafa_sesiones_user ON public.rafa_sesiones(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rafa_sesiones TO authenticated;
GRANT ALL ON public.rafa_sesiones TO service_role;

ALTER TABLE public.rafa_sesiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gestionan sus sesiones de Rafa"
ON public.rafa_sesiones FOR ALL TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_rafa_sesiones_updated_at
BEFORE UPDATE ON public.rafa_sesiones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();