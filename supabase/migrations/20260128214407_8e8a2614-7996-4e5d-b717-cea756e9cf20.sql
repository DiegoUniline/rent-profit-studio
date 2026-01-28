-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Admins and contadores can insert presupuestos" ON public.presupuestos;

-- Create new policy: Only admins can insert presupuestos
CREATE POLICY "Only admins can insert presupuestos" 
ON public.presupuestos 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));