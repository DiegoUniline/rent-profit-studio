
-- Make presupuesto_id nullable for auto-generated IVA flujos
ALTER TABLE public.flujos_programados ALTER COLUMN presupuesto_id DROP NOT NULL;

-- Add columns for auto-generated tracking
ALTER TABLE public.flujos_programados ADD COLUMN auto_generado boolean NOT NULL DEFAULT false;
ALTER TABLE public.flujos_programados ADD COLUMN asiento_movimiento_id uuid REFERENCES public.asiento_movimientos(id) ON DELETE CASCADE;
ALTER TABLE public.flujos_programados ADD COLUMN empresa_id uuid REFERENCES public.empresas(id);

-- Indexes
CREATE INDEX idx_flujos_auto_generado ON public.flujos_programados (auto_generado) WHERE auto_generado = true;
CREATE INDEX idx_flujos_empresa_id ON public.flujos_programados (empresa_id);
CREATE INDEX idx_flujos_asiento_mov ON public.flujos_programados (asiento_movimiento_id);

-- RLS: allow contadores to insert auto-generated flujos
DROP POLICY IF EXISTS "Admins can insert flujos_programados" ON public.flujos_programados;
CREATE POLICY "Admins and contadores can insert flujos_programados"
ON public.flujos_programados
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'contador'::app_role));

-- Trigger function: sync IVA movements to flujos_programados
CREATE OR REPLACE FUNCTION public.sync_iva_flujos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When asiento becomes 'aplicado', create IVA flujos
  IF NEW.estado = 'aplicado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'aplicado') THEN
    INSERT INTO public.flujos_programados (fecha, monto, tipo, descripcion, auto_generado, asiento_movimiento_id, empresa_id)
    SELECT
      NEW.fecha,
      CASE
        WHEN cc.nombre ILIKE '%iva%favor%' OR cc.nombre ILIKE '%iva%acreditable%' THEN am.debe
        WHEN cc.nombre ILIKE '%iva%trasladado%' OR cc.nombre ILIKE '%iva%pagar%' OR cc.nombre ILIKE '%iva%trasladar%' THEN am.haber
        ELSE 0
      END,
      CASE
        WHEN cc.nombre ILIKE '%iva%favor%' OR cc.nombre ILIKE '%iva%acreditable%' THEN 'egreso'
        ELSE 'ingreso'
      END,
      'IVA - ' || cc.nombre || ' (Asiento #' || NEW.numero_asiento || ')',
      true,
      am.id,
      NEW.empresa_id
    FROM public.asiento_movimientos am
    JOIN public.cuentas_contables cc ON cc.id = am.cuenta_id
    WHERE am.asiento_id = NEW.id
      AND cc.nombre ILIKE '%iva%'
      AND (
        (cc.nombre ILIKE '%iva%favor%' AND am.debe > 0) OR
        (cc.nombre ILIKE '%iva%acreditable%' AND am.debe > 0) OR
        (cc.nombre ILIKE '%iva%trasladado%' AND am.haber > 0) OR
        (cc.nombre ILIKE '%iva%pagar%' AND am.haber > 0) OR
        (cc.nombre ILIKE '%iva%trasladar%' AND am.haber > 0)
      );
  END IF;

  -- When asiento loses 'aplicado' status, remove auto-generated flujos
  IF TG_OP = 'UPDATE' AND OLD.estado = 'aplicado' AND NEW.estado != 'aplicado' THEN
    DELETE FROM public.flujos_programados
    WHERE auto_generado = true
      AND asiento_movimiento_id IN (
        SELECT id FROM public.asiento_movimientos WHERE asiento_id = NEW.id
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on asientos_contables
CREATE TRIGGER sync_iva_flujos_trigger
AFTER INSERT OR UPDATE ON public.asientos_contables
FOR EACH ROW
EXECUTE FUNCTION public.sync_iva_flujos();
