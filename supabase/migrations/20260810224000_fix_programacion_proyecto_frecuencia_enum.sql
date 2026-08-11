-- El enum programacion_proyecto_frecuencia también quedó de una versión
-- anterior (sin 'quincenal' ni 'personalizada'). Se agregan los valores que
-- falten; no se puede usar el nuevo valor en la misma transacción en que se
-- agrega, así que va en un archivo propio.
ALTER TYPE public.programacion_proyecto_frecuencia ADD VALUE IF NOT EXISTS 'quincenal';
ALTER TYPE public.programacion_proyecto_frecuencia ADD VALUE IF NOT EXISTS 'personalizada';

NOTIFY pgrst, 'reload schema';
