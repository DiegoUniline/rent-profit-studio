-- Add access_code column to profiles for admin authorization
ALTER TABLE public.profiles 
ADD COLUMN codigo_acceso TEXT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.codigo_acceso IS 'Código de acceso del administrador para autorizar acciones sensibles';