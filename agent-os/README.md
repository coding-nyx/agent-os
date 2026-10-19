# ARA Agent OS · Core Package

This directory contains the core implementation of **ARA Agent OS**:
- **Backend**: Python 3.12, FastAPI, SQLAlchemy, PostgreSQL 17, and the native Hermes runtime bridge.
- **Frontend**: React 19, TypeScript, and Vite running on port 8787.
- **Subsystems**:
  - `ara_os.cua`: Standalone Computer-Using Agent engine with hardware-accelerated video streaming (macOS, Android, Linux) and native semantic scripting (`osascript`, `adb shell`).
  - `ara_os.swarms`: Coordinated multi-agent worker teams executing in tandem with parallel phases and consensus synthesis.
  - `ara_os.mcp`: Model Context Protocol tool endpoints and standalone stdio server.
  - `ara_os.domains`: Domain persistence layer for Finance, Training, Notes, Reflections, and Planning.

---

## Getting Started

### 1. Setup & Installation
```bash
# Automated setup (provisions venv, dependencies, PostgreSQL schema, and seed profiles)
bash scripts/setup.sh

# Start the combined API and Dashboard service on port 8787
bash scripts/start.sh
```

### 2. Fast Non-Interactive Reconfiguration
```bash
# Reopen model onboarding wizard without reinstalling dependencies
.venv/bin/ara setup

# Deliberately replace existing preset choices with one shared model
.venv/bin/ara setup --replace-models

# Apply an already-selected native-root model non-interactively
.venv/bin/ara setup --use-existing --replace-models --non-interactive
```

---

## Running Standalone CUA (Computer-Using Agent)

To use computer control with a local Hermes agent without the web server:
```bash
# Run stdio MCP server for Hermes
.venv/bin/ara cua mcp

# Inspect discovered hardware devices (macOS screens, Android devices via ADB, Linux desktops)
.venv/bin/ara cua devices
```

---

## Testing & Verification

Run the full pytest suite (83 tests):
```bash
.venv/bin/pytest -v
```

Run specific test modules:
```bash
.venv/bin/pytest tests/test_cua.py -v     # CUA streaming, osascript, and input tests
.venv/bin/pytest tests/test_swarms.py -v  # Multi-agent swarm execution tests
```

---

## Documentation Index

- [CUA & System Control Architecture](docs/CUA_SYSTEM_CONTROL.md)
- [Multi-Agent Swarm Intelligence](docs/SWARMS.md)
- [Agent Presets & Specialist Roles](docs/AGENT-PRESETS.md)
- [UI Surface Contracts & Failure Semantics](docs/PRODUCT-SURFACES.md)
- [Source Audits & Upstream Decisions](docs/UPSTREAM-DECISIONS.md)
- [Verification Evidence & Benchmarks](docs/VERIFICATION.md)
