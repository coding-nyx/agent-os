# ARA Agent OS · Core Package

This directory contains the core implementation of **ARA Agent OS**:
- **Backend**: Python 3.12, FastAPI, SQLAlchemy, PostgreSQL 17, and the native Hermes runtime bridge.
- **Frontend**: React 19, TypeScript, and Vite running on port 8787.
- **Subsystems**:
  - `ara_os.cua`: Explicitly authorized native desktop control, periodic observation, and operator intervention. Physical device support requires validation.
  - `ara_os.swarms`: Native child-agent teams for any preset/custom profile, staged worktrees, durable node receipts and acknowledged server sync.
  - `ara_os.mcp`: Model Context Protocol tool endpoints and standalone stdio server.
  - `ara_os.domains`: Domain persistence layer for Finance, Training, Notes, Reflections, and Planning.

---

## Getting Started

Versioned node packages and dashboard updates are documented in
[Node releases and updates](docs/NODE-UPDATES.md). Use `ara --version` to inspect
the application version and `ara package --output ./dist` to build a node package.

See [Native agents on nodes](docs/NODE-RUNTIMES.md) for standalone setup,
node-owned dashboard chat, deployment and profile sync.

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

For an execution-only node without PostgreSQL or the dashboard, start with
`bash scripts/setup-node.sh --profile coding-agent`, then configure its model
using `hermes --profile coding-agent model`. See [node/swarms setup](docs/SWARMS.md).

To use computer control with a local Hermes agent without the web server:
```bash
# Explicitly grant a standalone native profile observation and supervised inputs
.venv/bin/ara cua configure --profile coding-agent --allow-view --allow-input --mode supervised

# Run stdio MCP with that identity (supervised inputs need an operator surface)
.venv/bin/ara cua mcp --profile coding-agent

# Inspect native driver presence without capturing the screen
.venv/bin/ara cua devices

# Optional driver installation through setup; no computer grants are enabled
.venv/bin/ara setup --skip-model --computer-control
```

---

## Control a paired node desktop

Update the code on both machines and install the native driver on the node.
In the node's graphical login session, explicitly enable paired-host control:

```bash
.venv/bin/ara cua remote --allow-view --allow-input --mode supervised
.venv/bin/ara node work
```

Open **System Control → Desktop** on the host and select the node. Pairing alone
does not grant desktop access. Use `ara cua remote --allow-view` for observation
only, or `ara cua remote` to revoke remote access. Agent grants are configured
separately on the node. See [remote desktop setup](docs/CUA_SYSTEM_CONTROL.md#remote-node-desktops).

---

## Testing & Verification

Run the full pytest suite:
```bash
.venv/bin/pytest -v
```

Run specific test modules:
```bash
.venv/bin/pytest tests/test_cua.py -v       # Policy and mocked capture/input transport tests
.venv/bin/pytest tests/test_execution.py -v # Native standalone/node execution, worktrees and sync
.venv/bin/pytest tests/test_swarms.py -v    # Profile/MCP native swarm execution
```

---

## Documentation Index

- [CUA & System Control Architecture](docs/CUA_SYSTEM_CONTROL.md)
- [Multi-Agent Swarm Intelligence](docs/SWARMS.md)
- [Node-Owned Hermes Runtime Fix Plan](docs/NODE-AGENT-RUNTIME-FIX-PLAN.md)
- [Host-Node Networking & AgentMesh Roadmap](../docs/design/ARA-NODE-HOST-NETWORKING-AND-AGENTMESH-ROADMAP.md)
- [Sovereign Voice & Visual Avatar Roadmap](../docs/design/ARA-VOICE-AND-AVATAR-ROADMAP.md)
- [Agent Presets & Specialist Roles](docs/AGENT-PRESETS.md)
- [UI Surface Contracts & Failure Semantics](docs/PRODUCT-SURFACES.md)
- [Source Audits & Upstream Decisions](docs/UPSTREAM-DECISIONS.md)
- [Verification Evidence & Benchmarks](docs/VERIFICATION.md)
