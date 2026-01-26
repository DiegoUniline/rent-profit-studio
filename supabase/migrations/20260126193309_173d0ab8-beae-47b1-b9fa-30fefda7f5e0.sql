-- Add orden column for manual sorting
ALTER TABLE public.presupuestos ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;

-- Set initial orden based on created_at
UPDATE public.presupuestos 
SET orden = subq.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY empresa_id ORDER BY created_at) as row_num
  FROM public.presupuestos
) as subq
WHERE public.presupuestos.id = subq.id;