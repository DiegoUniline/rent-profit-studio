DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_movimiento_flujo') THEN
    CREATE TYPE public.tipo_movimiento_flujo AS ENUM ('ingreso', 'egreso', 'no_afecta');
  END IF;
END $$;

ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS tipo_movimiento public.tipo_movimiento_flujo;

COMMENT ON COLUMN public.presupuestos.tipo_movimiento IS
  'Fuente unica de verdad del tipo de movimiento de la partida. NULL = pendiente de clasificar (no afecta totales).';

CREATE INDEX IF NOT EXISTS idx_presupuestos_tipo_movimiento
  ON public.presupuestos (tipo_movimiento);

-- Backfill 1: partidas cuyos flujos programados son todos del mismo tipo
WITH tipos AS (
  SELECT presupuesto_id,
         MIN(tipo) AS tipo_unico,
         COUNT(DISTINCT tipo) AS n
  FROM public.flujos_programados
  WHERE presupuesto_id IS NOT NULL AND tipo IN ('ingreso','egreso')
  GROUP BY presupuesto_id
)
UPDATE public.presupuestos p
SET tipo_movimiento = t.tipo_unico::public.tipo_movimiento_flujo
FROM tipos t
WHERE p.id = t.presupuesto_id
  AND t.n = 1
  AND p.tipo_movimiento IS NULL;

-- Backfill 2: sin flujos, deducir por naturaleza de la cuenta contable
UPDATE public.presupuestos p
SET tipo_movimiento = CASE
    WHEN left(c.codigo, 1) = '4' THEN 'ingreso'::public.tipo_movimiento_flujo
    WHEN left(c.codigo, 1) IN ('5','6') THEN 'egreso'::public.tipo_movimiento_flujo
  END
FROM public.cuentas_contables c
WHERE c.id = p.cuenta_id
  AND p.tipo_movimiento IS NULL
  AND left(c.codigo, 1) IN ('4','5','6');