-- Módulo Project: cronograma editable + programación financiera propia del proyecto
-- + permisos granulares por proyecto + auditoría + cronograma compartible sin login.
-- No modifica ni elimina la programación de flujo existente en Presupuestos
-- (flujos_programados, PresupuestoDialog, ProyectoPartidaSeguimientoDialog).
--
-- Idempotente: seguro de re-ejecutar completo aunque un run previo haya
-- quedado a medias (usa IF NOT EXISTS / DROP POLICY IF EXISTS en todo lo
-- que Postgres no soporta nativamente como "crear si no existe").

-- 1. Cronograma: avance manual, independiente del cálculo financiero (ejercido/presupuesto).
-- NULL = sigue usando el cálculo financiero actual (comportamiento sin cambios).
ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS avance_manual numeric
    CHECK (avance_manual IS NULL OR (avance_manual >= 0 AND avance_manual <= 100));

-- 2. Permisos granulares por proyecto: extiende proyecto_usuarios (acceso por-recurso ya existente).
-- Admin/contador siguen teniendo acceso total sin depender de estas columnas.
ALTER TABLE public.proyecto_usuarios
  ADD COLUMN IF NOT EXISTS editar_cronograma boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ver_programacion_financiera boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editar_programacion_financiera boolean NOT NULL DEFAULT false;

-- 3. Programación financiera POR PARTIDA (una por presupuesto/partida del proyecto,
-- nunca a nivel proyecto agregado): todos los presupuestos son por partida, según
-- confirmó el ingeniero del proyecto. Independiente de la programación de flujo
-- que ya existe en Presupuestos (flujos_programados).
DO $$ BEGIN
  CREATE TYPE programacion_proyecto_modo AS ENUM ('automatica', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE programacion_proyecto_frecuencia AS ENUM ('semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual', 'personalizada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.proyecto_programacion_financiera (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presupuesto_id uuid NOT NULL UNIQUE REFERENCES public.presupuestos(id) ON DELETE CASCADE,
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  modo programacion_proyecto_modo NOT NULL,
  tiene_anticipo boolean NOT NULL DEFAULT false,
  anticipo_monto numeric NOT NULL DEFAULT 0,
  anticipo_fecha date,
  frecuencia programacion_proyecto_frecuencia,
  fecha_inicio date,
  numero_pagos integer,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppf_proyecto ON public.proyecto_programacion_financiera (proyecto_id);

CREATE OR REPLACE TRIGGER update_proyecto_programacion_financiera_updated_at
  BEFORE UPDATE ON public.proyecto_programacion_financiera
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.proyecto_programacion_pagos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programacion_id uuid NOT NULL REFERENCES public.proyecto_programacion_financiera(id) ON DELETE CASCADE,
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  monto numeric NOT NULL CHECK (monto > 0),
  concepto text,
  es_anticipo boolean NOT NULL DEFAULT false,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppp_programacion ON public.proyecto_programacion_pagos (programacion_id);
CREATE INDEX IF NOT EXISTS idx_ppp_proyecto ON public.proyecto_programacion_pagos (proyecto_id);

ALTER TABLE public.proyecto_programacion_financiera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyecto_programacion_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver programación financiera del proyecto" ON public.proyecto_programacion_financiera;
CREATE POLICY "Ver programación financiera del proyecto"
ON public.proyecto_programacion_financiera
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_financiera.proyecto_id
      AND pu.user_id = auth.uid() AND pu.ver_programacion_financiera
  )
);

DROP POLICY IF EXISTS "Editar programación financiera del proyecto" ON public.proyecto_programacion_financiera;
CREATE POLICY "Editar programación financiera del proyecto"
ON public.proyecto_programacion_financiera
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_financiera.proyecto_id
      AND pu.user_id = auth.uid() AND pu.editar_programacion_financiera
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_financiera.proyecto_id
      AND pu.user_id = auth.uid() AND pu.editar_programacion_financiera
  )
);

DROP POLICY IF EXISTS "Ver pagos programados del proyecto" ON public.proyecto_programacion_pagos;
CREATE POLICY "Ver pagos programados del proyecto"
ON public.proyecto_programacion_pagos
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_pagos.proyecto_id
      AND pu.user_id = auth.uid() AND pu.ver_programacion_financiera
  )
);

DROP POLICY IF EXISTS "Editar pagos programados del proyecto" ON public.proyecto_programacion_pagos;
CREATE POLICY "Editar pagos programados del proyecto"
ON public.proyecto_programacion_pagos
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_pagos.proyecto_id
      AND pu.user_id = auth.uid() AND pu.editar_programacion_financiera
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_programacion_pagos.proyecto_id
      AND pu.user_id = auth.uid() AND pu.editar_programacion_financiera
  )
);

-- 4. RPC: único camino de escritura de cronograma (fecha/avance) para usuarios sin
-- rol admin/contador — valida el permiso editar_cronograma server-side antes de tocar
-- presupuestos, que sigue vetado a UPDATE directo salvo admin/contador (RLS sin cambios).
CREATE OR REPLACE FUNCTION public.actualizar_cronograma_partida(
  _presupuesto_id uuid,
  _fecha_inicio date,
  _fecha_fin date,
  _avance_manual numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _centro uuid;
  _autorizado boolean;
BEGIN
  SELECT centro_negocio_id INTO _centro FROM public.presupuestos WHERE id = _presupuesto_id;
  IF _centro IS NULL THEN
    RAISE EXCEPTION 'Partida no encontrada';
  END IF;

  SELECT
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
    OR EXISTS (
      SELECT 1 FROM public.proyectos pr
      JOIN public.proyecto_usuarios pu ON pu.proyecto_id = pr.id
      WHERE pr.centro_negocio_id = _centro
        AND pu.user_id = auth.uid() AND pu.editar_cronograma
    )
  INTO _autorizado;

  IF NOT _autorizado THEN
    RAISE EXCEPTION 'No autorizado para editar el cronograma de esta partida';
  END IF;

  IF _avance_manual IS NOT NULL AND (_avance_manual < 0 OR _avance_manual > 100) THEN
    RAISE EXCEPTION 'El avance debe estar entre 0 y 100';
  END IF;

  UPDATE public.presupuestos
  SET fecha_inicio = _fecha_inicio, fecha_fin = _fecha_fin, avance_manual = _avance_manual
  WHERE id = _presupuesto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.actualizar_cronograma_partida(uuid, date, date, numeric) TO authenticated;

-- 5. Auditoría de cambios de cronograma / programación financiera.
CREATE TABLE IF NOT EXISTS public.proyecto_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  accion text NOT NULL,
  entidad_id uuid,
  valor_anterior text,
  valor_nuevo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proyecto_auditoria_proyecto ON public.proyecto_auditoria (proyecto_id, created_at DESC);

ALTER TABLE public.proyecto_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ver auditoría del proyecto" ON public.proyecto_auditoria;
CREATE POLICY "Ver auditoría del proyecto"
ON public.proyecto_auditoria
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_auditoria.proyecto_id AND pu.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Registrar auditoría del proyecto" ON public.proyecto_auditoria;
CREATE POLICY "Registrar auditoría del proyecto"
ON public.proyecto_auditoria
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
    OR EXISTS (
      SELECT 1 FROM public.proyecto_usuarios pu
      WHERE pu.proyecto_id = proyecto_auditoria.proyecto_id AND pu.user_id = auth.uid()
        AND (pu.editar_cronograma OR pu.editar_programacion_financiera)
    )
  )
);

-- 6. Compartir cronograma con terceros sin login: link público por token.
CREATE TABLE IF NOT EXISTS public.proyecto_cronograma_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proyecto_shares_proyecto ON public.proyecto_cronograma_shares (proyecto_id);

ALTER TABLE public.proyecto_cronograma_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestionar links de cronograma" ON public.proyecto_cronograma_shares;
CREATE POLICY "Gestionar links de cronograma"
ON public.proyecto_cronograma_shares
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_cronograma_shares.proyecto_id
      AND pu.user_id = auth.uid() AND pu.editar_cronograma
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'contador')
  OR EXISTS (
    SELECT 1 FROM public.proyecto_usuarios pu
    WHERE pu.proyecto_id = proyecto_cronograma_shares.proyecto_id
      AND pu.user_id = auth.uid() AND pu.editar_cronograma
  )
);

-- Función pública (SECURITY DEFINER): expone SOLO datos de cronograma
-- (nunca cantidad, precio_unitario, montos ni programación financiera).
CREATE OR REPLACE FUNCTION public.get_cronograma_publico(_token text)
RETURNS TABLE (
  proyecto_nombre text,
  partida text,
  cuenta_codigo text,
  cuenta_nombre text,
  fecha_inicio date,
  fecha_fin date,
  avance numeric,
  vencida boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proyecto_cronograma_shares WHERE token = _token AND activo
  ) THEN
    RAISE EXCEPTION 'Link inválido o revocado';
  END IF;

  RETURN QUERY
  SELECT
    pr.nombre,
    p.partida,
    c.codigo,
    c.nombre,
    p.fecha_inicio,
    p.fecha_fin,
    COALESCE(
      p.avance_manual,
      CASE WHEN (p.cantidad * p.precio_unitario) = 0 THEN 0
        ELSE LEAST(999, (COALESCE(ej.total, 0) / (p.cantidad * p.precio_unitario)) * 100)
      END
    ),
    (p.fecha_fin IS NOT NULL AND p.fecha_fin < CURRENT_DATE)
  FROM public.proyecto_cronograma_shares s
  JOIN public.proyectos pr ON pr.id = s.proyecto_id
  JOIN public.presupuestos p ON p.centro_negocio_id = pr.centro_negocio_id
  LEFT JOIN public.cuentas_contables c ON c.id = p.cuenta_id
  LEFT JOIN LATERAL (
    SELECT SUM(am.debe + am.haber) AS total
    FROM public.asiento_movimientos am
    JOIN public.asientos_contables ac ON ac.id = am.asiento_id
    WHERE am.presupuesto_id = p.id AND ac.estado = 'aplicado'
  ) ej ON true
  WHERE s.token = _token AND p.es_project = true AND p.activo = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cronograma_publico(text) TO anon, authenticated;
