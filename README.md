# ARA Agent OS

A local-first, single-user agent workspace: a web client, independent PostgreSQL data modules, and a pinned native agent runtime. Host and node use the same distribution. Android is planned after the web and node workflows.

The implementation lives in [`agent-os/`](agent-os/README.md). Its guide describes supported features, boundaries, native compatibility, model setup, node synchronization and recovery.

## Start

Prerequisites: Git, uv, Node 24, and Docker with Compose (or an existing PostgreSQL 17 instance).

```bash
cd agent-os
bash scripts/setup.sh
bash scripts/start.sh
```

The combined API/dashboard binds loopback port 8787. Configure a model account in a profile's Connections view. No Firebase project or application signup is required for the local prototype.

```bash
cd agent-os
bash scripts/check.sh
```

Checks use isolated PostgreSQL databases, installed Chromium and a deterministic model protocol fixture driving the actual native agent. See [verification](agent-os/docs/VERIFICATION.md) for evidence and live-account limitations.

## Repository

- [`agent-os/`](agent-os/README.md): application, frontend, native adapter, CLI, migrations, tests and scripts.
- [`docs/design/`](docs/README.md): the current product architecture and future delivery contracts.
- [Runtime integration decisions](agent-os/docs/UPSTREAM-DECISIONS.md): native source audits and compatibility seams.
- [Interface behavior](agent-os/docs/PRODUCT-SURFACES.md): views, lifecycle states and failure behavior.

This branch replaces the legacy Firebase/Cortex application source and deployment workflow. Earlier code remains in Git history; switching branches does not migrate or deploy the hosted application. Runtime installations, credentials, databases and generated output are excluded from commits.
