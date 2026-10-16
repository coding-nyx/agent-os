#!/usr/bin/env bash
set -euo pipefail
ARA_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ARA_PROJECT_DIR"
bash scripts/services.sh
exec .venv/bin/ara serve "$@"
