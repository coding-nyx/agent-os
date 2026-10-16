#!/usr/bin/env bash
set -euo pipefail
ARA_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ARA_PROJECT_DIR"
if [ -n "${ARA_DATABASE_URL:-}" ]; then
  .venv/bin/python -c 'from ara_os.store import engine; from sqlalchemy import text; c=engine.connect(); c.execute(text("SELECT 1")); c.close(); print("Configured PostgreSQL is reachable")'
else
  if docker container inspect ara-os-postgres >/dev/null 2>&1; then
    docker start ara-os-postgres >/dev/null
  else
    docker compose up -d postgres
  fi
  for ara_attempt in {1..30}; do
    if docker exec ara-os-postgres pg_isready -U ara_os -d ara_os >/dev/null 2>&1; then
      printf '%s\n' 'Agent OS PostgreSQL is ready'
      exit 0
    fi
    sleep 1
  done
  printf '%s\n' 'PostgreSQL did not become ready' >&2
  exit 1
fi
