#!/usr/bin/env bash
set -euo pipefail
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
printf '%s\n' 'ARA Agent OS installed. Start with: .venv/bin/ara serve'
printf '%s\n' 'Startup creates the six profiles. Run hermes profiles to list them; configure Ara in Connections > Models or with hermes model before chatting.'
