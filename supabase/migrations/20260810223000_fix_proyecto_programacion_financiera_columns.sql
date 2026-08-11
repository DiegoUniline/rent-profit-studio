-- Repara proyecto_programacion_financiera / proyecto_programacion_pagos en bases
-- donde ya se había aplicado una versión anterior de estas tablas (antes de que
-- se agregara presupuesto_id/anticipo_fecha/concepto/es_anticipo). Idempotente:
-- solo agrega lo que falte, no toca lo que ya exista.

ALTER TABLE public.proyecto_programacion_financiera
  ADD COLUMN IF NOT EXISTS presupuesto_id uuid REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS anticipo_fecha date,
  ADD COLUMN IF NOT EXISTS tiene_anticipo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anticipo_monto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS numero_pagos integer,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- La versión anterior tenía proyecto_id como UNIQUE (una programación por
-- proyecto). Ahora es por partida: se quita esa restricción y se pone en
-- presupuesto_id en su lugar.
ALTER TABLE public.proyecto_programacion_financiera
  DROP CONSTRAINT IF EXISTS proyecto_programacion_financiera_proyecto_id_key;

DO $$ BEGIN
  ALTER TABLE public.proyecto_programacion_financiera
    ADD CONSTRAINT proyecto_programacion_financiera_presupuesto_id_key UNIQUE (presupuesto_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.proyecto_programacion_pagos
  ADD COLUMN IF NOT EXISTS concepto text,
  ADD COLUMN IF NOT EXISTS es_anticipo boolean NOT NULL DEFAULT false;

-- Fuerza a PostgREST a refrescar su caché de esquema; sin esto, columnas
-- recién agregadas pueden seguir dando "column ... not found in schema cache"
-- aunque ya existan en la base.
NOTIFY pgrst, 'reload schema';
