CREATE OR REPLACE FUNCTION public.get_cronograma_publico(_token text)
 RETURNS TABLE(proyecto_nombre text, partida text, cuenta_codigo text, cuenta_nombre text, fecha_inicio date, fecha_fin date, avance numeric, vencida boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.proyecto_cronograma_shares WHERE token = _token AND activo
  ) THEN
    RAISE EXCEPTION 'Link inválido o revocado';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      pr.nombre AS proyecto_nombre,
      p.partida,
      c.codigo AS cuenta_codigo,
      c.nombre AS cuenta_nombre,
      p.fecha_inicio,
      p.fecha_fin,
      COALESCE(
        p.avance_manual,
        CASE WHEN (p.cantidad * p.precio_unitario) = 0 THEN 0
          ELSE LEAST(999, (COALESCE(ej.total, 0) / (p.cantidad * p.precio_unitario)) * 100)
        END
      ) AS avance
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
    WHERE s.token = _token AND p.es_project = true AND p.activo = true
  )
  SELECT
    b.proyecto_nombre, b.partida, b.cuenta_codigo, b.cuenta_nombre,
    b.fecha_inicio, b.fecha_fin, b.avance,
    (b.fecha_fin IS NOT NULL AND b.fecha_fin < CURRENT_DATE AND b.avance < 100)
  FROM base b;
END;
$function$;