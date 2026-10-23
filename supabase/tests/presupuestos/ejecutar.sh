#!/usr/bin/env bash
# Pruebas funcionales del guardado de Presupuestos y del editor de planes de
# Rafa en un entorno AISLADO:
#   PostgreSQL (migraciones del repo + semilla sintética) → PostgREST → proxy.
# Requisitos: PGHOST/PGPORT/PGUSER de un PostgreSQL local de pruebas,
#             POSTGREST_BIN (PostgREST ≥ 12), Node ≥ 22.
# Uso: PGHOST=/socket PGPORT=54329 PGUSER=postgres POSTGREST_BIN=... ./ejecutar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
E2E="$RAIZ/supabase/tests/rafa/e2e"
DB="${PRESUPUESTOS_DB:-presupuestos_e2e}"
SECRETO=$(node -e 'import("'"$E2E"'/jwt.mjs").then(m=>console.log(m.SECRETO))')
ANON=$(node -e 'import("'"$E2E"'/jwt.mjs").then(m=>console.log(m.ANON))')
SERVICIO=$(node -e 'import("'"$E2E"'/jwt.mjs").then(m=>console.log(m.SERVICIO))')
REGISTROS="${TMPDIR:-/tmp}/presupuestos-e2e-logs"
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

PROXY_PORT=54321 POSTGREST_PORT=54330 node "$E2E/proxy.mjs" > "$REGISTROS/proxy.log" 2>&1 &
PIDS+=($!)

for i in $(seq 1 60); do
  if curl -s -o /dev/null http://127.0.0.1:54321/rest/v1/; then break; fi
  sleep 1
done

export REST_URL=http://127.0.0.1:54321/rest/v1 SERVICIO="$SERVICIO" ANON="$ANON"
node --test --test-concurrency=1 "$AQUI/guardado.e2e.test.mjs"
(cd "$RAIZ" && npx vitest run src/test/rafa-plan.integracion.test.ts src/test/rafa-centro.integracion.test.ts)
