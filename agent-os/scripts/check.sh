#!/usr/bin/env bash
set -euo pipefail
ARA_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ARA_PROJECT_DIR"
bash scripts/services.sh
npm --prefix web run build
.venv/bin/pytest -q "$@"
