#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  printf '%s\n' 'Usage: bash scripts/setup.sh [--skip-model | --use-existing] [--replace-models] [--non-interactive]' \
    'Installs dependencies, prepares the presets, then opens one shared provider/model wizard.' \
    'Existing per-agent model choices are preserved unless replacement is confirmed.'
  exit 0
fi
ARA_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ARA_PROJECT_DIR"
mkdir -p .runtime .state
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ARA_PROJECT_DIR/.runtime/uv-cache}"
export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$ARA_PROJECT_DIR/.runtime/python}"
export npm_config_cache="${npm_config_cache:-$ARA_PROJECT_DIR/.runtime/npm-cache}"
uv python install --no-bin --no-registry 3.14.8 || true
uv sync --frozen --python 3.12
uv run --frozen python scripts/setup_runtime.py
npm --prefix web ci --no-audit --no-fund
npm --prefix web run build
bash scripts/services.sh
uv run --frozen ara setup "$@"
printf '%s\n' 'ARA Agent OS installed. Start with: .venv/bin/ara serve'
printf '%s\n' 'Run hermes profiles to list the presets. Rerun .venv/bin/ara setup to configure a shared model, or override individual agents in Connections > Models.'
