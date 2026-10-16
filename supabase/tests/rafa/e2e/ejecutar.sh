#!/usr/bin/env bash
# Pruebas de punta a punta de Rafa en un entorno AISLADO:
#   PostgreSQL (migraciones del repo + semilla sintética) → PostgREST → proxy
#   (/rest/v1, /auth/v1/user) → Edge Function rafa-asistente en Deno → modelo
#   de IA SIMULADO con guion (no se usa el proveedor real ni datos reales).
# Requisitos: PGHOST/PGPORT/PGUSER de un PostgreSQL local de pruebas,
#             POSTGREST_BIN (PostgREST ≥ 12) y DENO_BIN (Deno ≥ 2), Node ≥ 22.
# Uso: PGHOST=/socket PGPORT=54329 PGUSER=postgres POSTGREST_BIN=... DENO_BIN=... ./ejecutar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../../.." && pwd)"
DB="${RAFA_E2E_DB:-rafa_e2e}"
SECRETO=$(node -e 'import("'"$AQUI"'/jwt.mjs").then(m=>console.log(m.SECRETO))')
ANON=$(node -e 'import("'"$AQUI"'/jwt.mjs").then(m=>console.log(m.ANON))')
SERVICIO=$(node -e 'import("'"$AQUI"'/jwt.mjs").then(m=>console.log(m.SERVICIO))')
REGISTROS="${TMPDIR:-/tmp}/rafa-e2e-logs"
mkdir -p "$REGISTROS"
PIDS=()
limpiar() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap limpiar EXIT

"$RAIZ/supabase/tests/rafa/preparar_base.sh" "$DB"

PGRST_DB_URI="postgres://authenticator@/${DB}?host=${PGHOST}&port=${PGPORT}" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$SECRETO" \
PGRST_SERVER_PORT=54330 PGRST_DB_POOL=10 \
  "$POSTGREST_BIN" > "$REGISTROS/postgrest.log" 2>&1 &
PIDS+=($!)

PROXY_PORT=54321 POSTGREST_PORT=54330 node "$AQUI/proxy.mjs" > "$REGISTROS/proxy.log" 2>&1 &
PIDS+=($!)

SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" SUPABASE_SERVICE_ROLE_KEY="$SERVICIO" \
LOVABLE_API_KEY=clave-de-pruebas RAFA_AI_URL=http://127.0.0.1:54322/v1/chat/completions \
  "$DENO_BIN" run --allow-net --allow-env --allow-read "$RAIZ/supabase/functions/rafa-asistente/index.ts" > "$REGISTROS/deno.log" 2>&1 &
PIDS+=($!)

for i in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:54330/ && curl -s -o /dev/null -X OPTIONS http://127.0.0.1:8000/; then break; fi
  sleep 1
done

RAFA_URL=http://127.0.0.1:8000 REST_URL=http://127.0.0.1:54321/rest/v1 SERVICIO="$SERVICIO" ANON="$ANON" \
  node --test --test-concurrency=1 "$AQUI/rafa.e2e.test.mjs"
