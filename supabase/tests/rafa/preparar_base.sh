#!/usr/bin/env bash
# Crea desde cero una base AISLADA con el stub de Supabase, todas las
# migraciones del repositorio y la semilla sintética de Rafa.
# Uso: PGHOST=/ruta/socket PGPORT=54329 PGUSER=postgres supabase/tests/rafa/preparar_base.sh rafa_test
set -euo pipefail
DB="${1:-rafa_test}"
RAIZ="$(cd "$(dirname "$0")/../../.." && pwd)"
psql -X -q -d postgres -c "DROP DATABASE IF EXISTS ${DB}" -c "CREATE DATABASE ${DB}"
P="psql -X -q -v ON_ERROR_STOP=1 -d ${DB}"
$P -f "$RAIZ/supabase/tests/rafa/00_supabase_stub.sql" >/dev/null 2>&1
for f in "$RAIZ"/supabase/migrations/*.sql; do
  case "$f" in
    # Esta migración no es re-ejecutable en una base nueva: su bloque DO espera
    # duplicate_object pero PostgreSQL lanza duplicate_table (42P07) porque la
    # restricción ya existe. El resto del archivo sí se aplica.
    *20260810223000_fix_proyecto_programacion_financiera_columns.sql)
      psql -X -q -d "${DB}" -f "$f" >/dev/null 2>&1 || true ;;
    *) $P -f "$f" >/dev/null 2>&1 || { echo "Falló $f"; $P -f "$f"; exit 1; } ;;
  esac
done
$P -f "$RAIZ/supabase/tests/rafa/10_semilla.sql" >/dev/null
echo "Base ${DB} lista"
