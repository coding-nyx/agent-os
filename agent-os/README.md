# ARA Agent OS · v0.1

A local, single-user agent workspace with a React dashboard, PostgreSQL data modules, and a pinned native agent runtime. This branch replaces the legacy Firebase application source. The hosted application is not deployed or migrated by this prototype.

The native engine has its own downstream branch and remains compatible with its upstream profile format. ARA owns the application API, data modules, profile capabilities, interface and recovery workflow. It does not implement a second agent loop. See [verification evidence](docs/VERIFICATION.md), [interface behavior](docs/PRODUCT-SURFACES.md), [runtime decisions](docs/UPSTREAM-DECISIONS.md) for the source audit and [compatibility.lock.json](compatibility.lock.json) for the exact revision.

## Run locally

Prerequisites: Linux or macOS, Git, uv, Node ≥22.12 (24 tested), and Docker with Compose for local PostgreSQL. An existing PostgreSQL 17 service can be supplied through `ARA_DATABASE_URL` instead. Docker is not needed for the native agent itself. ARM Linux/macOS are intended targets; this environment verified x86 Linux only.

```bash
cd /workspace/ara/agent-os
bash scripts/setup.sh
bash scripts/start.sh
```

The API and compiled dashboard share loopback port 8787. Startup runs versioned PostgreSQL migrations, seeds six presets, and creates isolated native homes. Missing PostgreSQL leaves the static client and health diagnostics available while initialization retries. A model account is configured separately in each profile's Connections view; installation does not require a paid model account.

For frontend development, keep the API running and run `npm --prefix web run dev` in another terminal. Vite proxies `/api` to port 8787. Rebuild with `npm --prefix web run build` for the combined server.

```bash
bash scripts/check.sh
.venv/bin/ara --help
.venv/bin/ara node status
.venv/bin/ara chat NATIVE_PROFILE_NAME
.venv/bin/ara runtime NATIVE_PROFILE_NAME -- auth --help
```

Tests require the local development PostgreSQL administrator and a Chromium executable (`/usr/bin/chromium` here). Set `ARA_BROWSER_EXECUTABLE` to a different installed Chromium. They create and drop isolated databases and use an explicitly named OpenAI protocol fixture to drive the **real native runtime**. They never substitute a simulated agent into the product or use a paid account by default.

## What can be tested

| Area | Implemented behavior |
| --- | --- |
| Dashboard | Real profile/data/run counts, activity and attention states; responsive desktop/mobile layout; empty and failure states. |
| Profiles | Ara, Ledger, Titan, Soma, Scout, Orchestrator; custom identity; create, disable, retry setup, isolated instances. Each native home has its own state and default working directory (not an OS security sandbox). |
| Data before agents | Independent finance, training, notebook, research and JSON Schema datasets. Validated writes, exact decimal amounts, optimistic edits, idempotent writes/import, archive, export. Deleting/disabling an agent does not own or delete its data. |
| Customized workspaces | Ledger finance table/totals; training log; notebook; research sources; custom records. Shared module components appear in both the library and bound profile workspace. Scout's future specialized application is not implemented. |
| Agent execution | Canonical authenticated native gateway, model streaming, deferred tool discovery, native durable admission receipts, private app conversations, stop, clarification and approvals; receipt-based inspection of uncertain outcomes without resubmission. Browser disconnection does not cancel native execution. |
| Scoped tools | Streamable HTTP MCP tools for explicitly bound datasets; separate read/write grants; scoped specialist delegation and task inspection; delegation cycles rejected. |
| Model connections | URL/key/model and native Chat Completions, Responses or Anthropic protocol selection. Native OAuth catalog, supported device login/poll/cancel/disconnect and account/model selection. External CLI account flows remain on the owning machine. |
| Identity/skills/memory | Real `SOUL.md`, native skill packages, `memories/MEMORY.md`, `USER.md`; hash-conflict editing. Read-only redacted config inspection. Profile import preserves native assets. |
| Learning | Off/review/automatic policies configure actual native background review and memory/skill write approvals. Staged proposals are visible in the memory/skills views for hash-checked approve/reject through native appliers. This is runtime learning, not model weight training. |
| Integrations | Native MCP create/list/test/disable/remove API and advanced JSON UI. Native memory-provider API supports existing integrations; Obsidian files or Hindsight require their own configured services/tools. No Hindsight service is silently installed. |
| Gateways | Native per-profile adapters and state. Managed Telegram validates bot identity and allowed users, reserves one owner, and supports pause. Credentials and adapters stay on the actual owner. Other native adapters remain accessible through owner CLI/API where dependencies exist. |
| Scheduling | Native create/list/pause/resume/manual trigger; native validation and profile isolation. Create paused schedules while evaluating. |
| Voice | Browser recording → native STT → review → normal agent conversation. Browser/native TTS and stop. Separate speech settings. Text chat remains available when microphone/provider support is absent. |
| Node | Same code distribution, native CLI/harness, native/OpenClaw preview/apply imports, device pairing, explicit passive profile sync and watched reconciliation. No separate stripped engine. |
| Recovery | Native WAL-safe snapshots plus application records, durable event history and received node archives in an encrypted bundle. Download, separate recovery key, isolated restore into an empty PostgreSQL database; profiles/connections restored inactive. |

Live OAuth completion, paid model endpoints, Telegram delivery, microphone/STT/TTS providers, and external memory services need the respective real accounts/network/hardware. Protocol-fixture tests establish native integration, not live provider service availability. New profiles do not force an old model ID. Choose a model supported by your current account; the native provider/model APIs remain authoritative. Provider login methods are discovered from the pinned native catalog; no unsupported Grok/ChatGPT OAuth method is invented.

## Layout and boundaries

```text
agent-os/
  web/src/                 React interface and typed HTTP helpers
  src/ara_os/
    app.py                 Versioned application API and capability boundaries
    domains.py             Independent data validation and service operations
    profiles.py            Presets, native provisioning, bindings, learning
    runs.py                Native run projection, receipts and generation controls
    runtime.py             Process transport and conflict-aware asset edits
    native_worker.py       Narrow adapter executed in native environment
    mcp.py                 Scoped data and specialist tools
    store.py, migrations/  PostgreSQL records/events and Alembic migrations
    recovery.py, cli.py    Node, import and protected recovery workflows
  compatibility.lock.json Exact native source revision and tested extras
  .runtime/                Ignored source checkout, native environment and caches
  .state/                  Ignored private runtime homes, device keys and archives
```

PostgreSQL stores workspace-scoped JSONB entities and durable events in v0.1, with separate service schemas/validation for each module. This is not a complete accounting schema or clinical record system. Native session state remains in native SQLite databases; ARA does not rewrite the native store into PostgreSQL. Workspace IDs prepare a later tenancy boundary but do not constitute implemented multiuser authorization.

The public application contract is `/api/v1`; OpenAPI is available at `/docs`. Android can consume these same JSON endpoints and event stream later. An optional Firebase-hosted frontend still needs the private API/runtime host; Firebase hosting does not run the native engine or PostgreSQL. Remote deployment, an authenticated network edge and Android are later work.

## Node synchronization and import

Create an enrollment from **Machines & sync**, securely transfer the downloaded file, then:

```bash
.venv/bin/ara node pair --enrollment ./node-enrollment.json
.venv/bin/ara node sync --profile NATIVE_PROFILE_NAME --watch
```

Use a host base address reachable over a trusted private connection. The server intentionally binds loopback. An SSH tunnel can connect a node to a host without exposing the single-user control API publicly. Enrollment protects node upload endpoints; it does not turn the entire dashboard into an authenticated multiuser server. Do not publish this local control API directly to the Internet.

The watcher checks definition hashes every five seconds, snapshots changed definitions, and reconciles changed session DB state at most once per minute. It records pending/acknowledged state locally, backs off on outages, and leaves local work intact. The host checks content hashes and stores passive snapshots encrypted. The UI displays received snapshots, never implies an unacknowledged machine is backed up, and allows explicit download/import. The prototype limit is 32 MB compressed / 250 MB expanded per profile snapshot.

```bash
.venv/bin/ara import native ./profile.tar.gz --name imported-agent
.venv/bin/ara import native ./profile.tar.gz --name imported-agent --apply
.venv/bin/ara import openclaw ~/.openclaw --name imported-agent
.venv/bin/ara import openclaw ~/.openclaw --name imported-agent --apply
```

Preview preserves the source. Apply stages and sanitizes before native discovery, excludes credentials, disables bots and schedules, and registers the imported profile disabled. Native configuration, identity, skills and supported memory/history mappings remain in native formats. Imported schedules are retained separately for deliberate review.

**Remote execution routing, bidirectional data replication, automatic profile failover, refresh-token sharing and bot-owner handoff are not certified or enabled in v0.1.** Native CLI work can continue without the dashboard. ARA PostgreSQL tools require the data host; offline writes to those tools return an error rather than pretending to be committed. Gateway conversations stay under native authority; web conversations do not mirror replies into Telegram or Android. Multiple instances may execute independently, but never share a live native DB. Native root credential-pool fallback may share a grant under native control on one owner; rotating grants are not copied to another machine by ARA sync.

## Recovery drill

```bash
.venv/bin/ara backup
.venv/bin/ara backup-key --output /secure/separate-location/ara-recovery.key
.venv/bin/ara restore ./snapshot.ara --key /secure/separate-location/ara-recovery.key --target ./restored-state
ARA_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST/EMPTY_DATABASE' \
  .venv/bin/ara --state ./restored-state serve --port 8788
```

Keep the recovery key outside the protected machine and separately from the bundle. Ordinary profile exports and node snapshots exclude credentials. Full recovery bundles can contain native credentials and private conversation content and are encrypted. Restore deactivates native credential/channel/schedule state, reconnects local ARA tool capabilities, and requires deliberate account setup and activation. Previously enrolled nodes require re-pairing. Application data restore requires an empty database and never overwrites an occupied target.

Recovery captures native DB-consistent snapshots and a separate application capture boundary; it is not a distributed atomic transaction across external services. External workspaces, Obsidian vaults, Hindsight databases and arbitrary files require separate backups. Quiesce external CLI/gateway writers for a coordinated recovery point. The prototype rejects backups while managed runs are active.

## Upstream updates

1. Keep the native checkout's `upstream` remote and ARA downstream branch. Preserve original license/attribution.
2. Audit the candidate native changes against [UPSTREAM-DECISIONS.md](docs/UPSTREAM-DECISIONS.md), especially gateway contracts, staging hooks, auth pools, channels and backup APIs.
3. Update the revision/extras in `compatibility.lock.json` on a development branch. `scripts/setup.sh` fetches that exact revision, refuses dirty tracked native files, and rebuilds its environment when the recorded build revision/extras change. For a Python-version change, remove/rebuild the stopped native environment deliberately.
4. Run `scripts/check.sh`, including real harness, tools, controls, imports, clone sanitization, node and restore checks. A failed compatibility check blocks promotion.
5. Record exceptions and advance the pin only after passing. Do not auto-pull upstream main into an active installation or run native self-update past the pin.

No upstream core patch is currently needed. ARA's adapter wraps the native profile layout seam to strip keys before a clone is published; the compatibility suite guards this internal integration point. The exact branch remains a local downstream checkout; no external fork or deployment has been published by this work.
