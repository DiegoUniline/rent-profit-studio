-- Drop the existing unique constraint
ALTER TABLE public.centros_negocio DROP CONSTRAINT IF EXISTS centros_negocio_empresa_id_codigo_key;

-- Create a partial unique index that only applies to active records
CREATE UNIQUE INDEX centros_negocio_empresa_codigo_activo_idx 
ON public.centros_negocio (empresa_id, codigo) 
WHERE activo = true;