-- Aviso semanal de Rafa por centro de negocio: una reserva por usuario,
-- centro y semana (lunes) para que el aviso se deje una sola vez, aunque se
-- abra Rafa en varias pestañas a la vez. Lo escribe la Edge Function.
-- Idempotente: seguro de re-ejecutar.

CREATE TABLE IF NOT EXISTS public.rafa_avisos (
  user_id uuid NOT NULL,
  centro_negocio_id uuid NOT NULL REFERENCES public.centros_negocio(id) ON DELETE CASCADE,
  semana date NOT NULL,
  conversacion_id uuid REFERENCES public.rafa_conversaciones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, centro_negocio_id, semana)
);

ALTER TABLE public.rafa_avisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leer avisos propios de Rafa" ON public.rafa_avisos;
CREATE POLICY "Leer avisos propios de Rafa"
ON public.rafa_avisos FOR SELECT TO authenticated
USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.rafa_avisos FROM anon, authenticated;
GRANT SELECT ON public.rafa_avisos TO authenticated;
GRANT ALL ON public.rafa_avisos TO service_role;

NOTIFY pgrst, 'reload schema';
