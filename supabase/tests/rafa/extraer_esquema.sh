#!/usr/bin/env bash
# Extrae el esquema `public` de la base AISLADA construida con
# preparar_base.sh (migraciones del repositorio) y lo guarda en
# docs/rafa/esquema-local.json. Es evidencia de "SQL local", no del estado de
# la base real. Uso: PGHOST=... PGPORT=... PGUSER=... extraer_esquema.sh rafa_test
set -euo pipefail
DB="${1:-rafa_test}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
SALIDA="$RAIZ/docs/rafa/esquema-local.json"
MIG_SHA=$(cat "$RAIZ"/supabase/migrations/*.sql | sha256sum | cut -d' ' -f1)

psql -X -q -At -d "$DB" -v mig_sha="$MIG_SHA" <<'SQL' > "$SALIDA.tmp"
WITH tablas AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),
columnas AS (
  SELECT t.relname, jsonb_agg(jsonb_build_object(
    'nombre', a.attname,
    'tipo', format_type(a.atttypid, a.atttypmod),
    'nulo', NOT a.attnotnull,
    'defecto', pg_get_expr(d.adbin, d.adrelid)
  ) ORDER BY a.attnum) AS cols
  FROM tablas t
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
  GROUP BY t.relname
),
restr AS (
  SELECT t.relname, jsonb_agg(jsonb_build_object(
    'nombre', con.conname,
    'tipo', CASE con.contype WHEN 'p' THEN 'PK' WHEN 'f' THEN 'FK' WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE con.contype::text END,
    'definicion', pg_get_constraintdef(con.oid)
  ) ORDER BY con.contype, con.conname) AS r
  FROM tablas t JOIN pg_constraint con ON con.conrelid = t.oid
  GROUP BY t.relname
),
idx AS (
  SELECT t.relname, jsonb_agg(jsonb_build_object('nombre', i.relname, 'tipo', 'INDICE', 'definicion', pg_get_indexdef(i.oid)) ORDER BY i.relname) AS r
  FROM tablas t JOIN pg_index x ON x.indrelid = t.oid JOIN pg_class i ON i.oid = x.indexrelid
  WHERE NOT x.indisprimary AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.oid)
  GROUP BY t.relname
),
trg AS (
  SELECT t.relname, jsonb_agg(jsonb_build_object('nombre', tg.tgname, 'definicion', pg_get_triggerdef(tg.oid)) ORDER BY tg.tgname) AS r
  FROM tablas t JOIN pg_trigger tg ON tg.tgrelid = t.oid AND NOT tg.tgisinternal
  GROUP BY t.relname
),
pol AS (
  SELECT p.tablename AS relname, jsonb_agg(jsonb_build_object(
    'nombre', p.policyname, 'comando', p.cmd, 'roles', array_to_string(p.roles, ','),
    'using', p.qual, 'check', p.with_check
  ) ORDER BY p.policyname) AS r
  FROM pg_policies p WHERE p.schemaname = 'public'
  GROUP BY p.tablename
),
fun AS (
  SELECT jsonb_agg(jsonb_build_object(
    'nombre', p.proname,
    'argumentos', pg_get_function_identity_arguments(p.oid),
    'seguridad', CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END
  ) ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)) AS r
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
),
enums AS (
  SELECT jsonb_object_agg(typname, vals) AS r FROM (
    SELECT t.typname, jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS vals
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' GROUP BY t.typname
  ) x
)
SELECT jsonb_pretty(jsonb_build_object(
  'origen', 'Base aislada construida con supabase/migrations/*.sql (SQL local; no certifica la base real)',
  'migraciones_sha256', :'mig_sha',
  'tablas', (SELECT jsonb_object_agg(t.relname, jsonb_build_object(
      'rls', t.relrowsecurity,
      'columnas', c.cols,
      'restricciones', coalesce(r.r, '[]'::jsonb) || coalesce(i.r, '[]'::jsonb),
      'triggers', coalesce(g.r, '[]'::jsonb),
      'politicas', coalesce(p.r, '[]'::jsonb)
    ) ORDER BY t.relname)
    FROM tablas t JOIN columnas c ON c.relname = t.relname
    LEFT JOIN restr r ON r.relname = t.relname
    LEFT JOIN idx i ON i.relname = t.relname
    LEFT JOIN trg g ON g.relname = t.relname
    LEFT JOIN pol p ON p.relname = t.relname),
  'funciones', (SELECT r FROM fun),
  'enums', (SELECT r FROM enums)
));
SQL
mv "$SALIDA.tmp" "$SALIDA"
echo "Esquema guardado en $SALIDA"
