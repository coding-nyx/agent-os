#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || "$#" == "0" ]]; then
  printf '%s\n' 'Usage: bash scripts/setup-node.sh --profile NAME [--computer-control]' \
    'Installs the pinned ARA runtime and a standalone native profile. No PostgreSQL, web build, model inference or computer grants.' \
    'Configure the model locally afterward; then pair the node and enable its explicit swarm policy.'
  exit 0
fi
ARA_NODE_PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ARA_NODE_PROJECT_DIR"
export ARA_CLI_BIN_DIR="${ARA_CLI_BIN_DIR:-$ARA_NODE_PROJECT_DIR/.state/bin}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$ARA_NODE_PROJECT_DIR/.runtime/uv-cache}"
export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$ARA_NODE_PROJECT_DIR/.runtime/python}"
uv python install --no-bin --no-registry 3.14.8 || true
uv sync --frozen --python 3.12
uv run --frozen python scripts/setup_runtime.py
uv run --frozen ara node init "$@"
