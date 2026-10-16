# ARA V2 — upstream-compatible Hermes distribution and data platform

Status: supporting technical notes. The [consolidated Agent OS master plan](ARA-AGENT-OS-MASTER-PLAN.md) is the decision authority for clients/APIs/modules/deployments and product-wide lifecycle/failure behavior. The [connections/conversations contract](ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md) defines model/channel owners, multi-instance operation and output delivery. Hermes remains the single fork after auditing native profile files, learning, memory providers and extensions. Neither runtime's footprint has been benchmarked here. See [Upstream decision and profile compatibility](ARA-UPSTREAM-AND-PROFILE-COMPATIBILITY.md) for native evidence.

This is a plan, not a completed fork, OAuth deployment, migration or memory integration. Delivery priority remains web/data foundation → full installed runtime integration → Android. The application is single-user; future ownership boundaries remain encapsulated.

## 1. Product decisions

1. Fork **Hermes**; preserve native CLI, gateway/dashboard, profile/config formats, provider authentication, memory files, skills, plugins and update behavior within a tested version window. OpenClaw is a reference/import consideration, not a second engine to maintain.
2. Use **PostgreSQL** for independent ARA datasets and ARA metadata. Keep native Hermes files/state native and use supported hooks/commands to manage them.
3. Build the primary **ARA web client independently against a versioned Agent OS API**, sharing domain/action contracts with Android and MCP adapters. Keep the native Hermes dashboard for optional runtime administration; themes/plugins can provide ARA links/status without hosting the entire application.
4. Use native provider plugins, OAuth/device flows and custom endpoints. ChatGPT/Codex, Grok, Anthropic, Gemini, DeepSeek, MiniMax, OpenRouter and other enabled upstream connections use the methods actually supported by the pinned release.
5. Preserve the rule **data → agents; data + agents → orchestrator**. Finance, private notebook, training, research and custom stores are independent of agent profiles.
6. Profiles include native identity/instruction files, skills, curated memory, external memory configuration, vault/data/tool bindings and optional rich UI surfaces.
7. Per-profile self-learning is explicit and separate from transcript persistence, memory capture and manual identity edits.
8. The local host is an ARM64 Linux server or Mac mini; no Firebase is required. A full node runs its own required local services; lightweight remote clients have only their declared cache/offline capabilities.

## 2. Why Hermes, and what still needs proof

Hermes directly matches the requested installable profile model: each profile owns config, SOUL, curated memory files, skills, plugin configuration, sessions and gateway state. Its docs provide provider OAuth/custom endpoints, background review and write-approval controls, Hindsight integration, and both web and desktop extension systems.

OpenClaw has a useful published gateway client/protocol, extensibility and learning as well. It is not rejected for lacking those. The reason to prefer Hermes here is reduced custom work around the user's native profile/memory/skills requirements. A PostgreSQL-backed ARA service does not depend on the runtime itself using PostgreSQL.

Provider counts, idle RAM/CPU, installation size and integration effort were not measured quantitatively. Before calling Hermes “lighter,” benchmark matching headless configurations on the target machines, then measure web and Hindsight separately. ARA's PostgreSQL and optional memory/inference services have their own resource cost.

Hermes also has integration constraints: the inspected native canonical gateway path has cutover limits, and its web and desktop plugin SDKs are separate. Use supported surfaces and verify real auth/streaming/approval behavior before promising parity. Do not reuse an Electron-only API in the web client.

## 3. Projects and ownership

```text
ara-hermes/                         Minimal downstream Hermes fork
  native CLI/runtime/gateway/web    Stay close to upstream

ara-os/                             Independent ARA application and domain packages
  apps/web/                         Primary React client of the ARA API
  services/api/                     Modular domain/control API and runtime bridge
  packages/
    data-core/                      Context, revisions, schema/export contracts
    data-finance/
    data-notebook/
    data-training/
    data-research/                  Data contracts now; rich Scout UI later
    data-custom/
    data-api/                       Independent FastAPI/OpenAPI + MCP surfaces
    hermes-plugin/                  Native tools, configuration and API bridge
    web-surfaces/                   ARA module renderers
    dashboard-plugins/              Optional native admin links/status
    profiles/                       Preset templates and sidecar metadata
    native-assets/                  File revisions, checkpoints, path mappings
    integration-registry/           MCP, vault and memory-provider bindings
    learning-policy/
    sync/
  deploy/linux/ and deploy/macos/
  compatibility.lock.json

ara-android/                        Later native client
```

ARA domain packages must be usable without importing a Hermes agent or React component. Expose the same validated service functions through the data API, MCP and native tools. Native profile state belongs to Hermes; PostgreSQL stores ARA records, bindings and projections rather than a competing copy of every native store.

## 4. Web implementation

The primary ARA web application uses independent React surfaces and a stable versioned API, as specified by the master plan. This supports customized domain workspaces, Firebase/static hosting and Android without binding product releases to upstream dashboard internals. Reuse native backend/provider/session contracts through the runtime adapter. Keep the native dashboard available for runtime administration; its themes/slots/plugins remain optional supported integrations, not the application boundary.

V2 views:

- Home: active machine/profile, pending approvals, recent work, data and integration status.
- Data: independent datasets, direct CRUD/search/import/export and connected-profile visibility.
- Profiles: presets/custom profiles, enable/disable, config, model account, tools and dataset bindings.
- Identity/context: SOUL editor, display identity, actual project-instruction provenance.
- Skills: installed/learned packages, requirements, settings, versions, pending changes and diffs.
- Memory: native MEMORY/USER files, session history/search, selected external provider and capture policy.
- Knowledge: Obsidian vaults/documents, host bindings, permissions and indexing status.
- Integrations: MCP servers, native plugins, memory services and their required credentials/dependencies.
- Learning: effective per-profile controls, resource budget, proposed changes, provenance and rollback.
- Runs/jobs/channels: native activity and controls, with one execution owner per item.
- Machines/sync/portability: connection status, durable changes, checkpoints, conflicts, import and explicit host transfer.

Specialized surfaces are extension packages, not fixed assumptions about finance/training/notebook. Define surface ID/version, routes/tabs, data requirements, events, artifacts and permitted actions in V2. Scout later adds sources, documents, citations, research sessions, findings and evidence/artifact panels. Generic custom agents work before a rich bespoke renderer exists.

The native desktop SDK and web dashboard SDK are different. Shared backend services can support both; UI bundles may need separate adapters. Android likewise needs native views or an explicitly designed embedded web surface.

## 5. PostgreSQL domain platform

Start with one local PostgreSQL database/cluster and separately migrated schemas such as `ara_core`, `ara_finance`, `ara_notebook`, `ara_training`, `ara_research` and registered custom namespaces. A schema is not by itself an access-control boundary: actual service/tool grants must enforce dataset and operation scope.

Domain data examples:

- Finance: accounts, exact currency amounts, entries/postings, budgets, recurring payments, import/reconciliation and correction history.
- Notebook: versioned notes and self-reported observations, sessions, goals and derived summaries linked to source revisions. Raw-note access is independently granted.
- Training: exercise/program versions, prescriptions, performed sessions/sets, units, progression and recovery.
- Research: sources/documents, sessions, citations, findings, evidence links and artifacts.
- Custom: JSON-Schema-validated JSONB records, declared queries/indexes and typed tool/action definitions.

Data may be created/edited while every agent is disabled. Profiles reference dataset IDs and allowed tools; they never own the dataset schema or delete it when uninstalled. Models propose typed changes; services validate domain invariants and approvals before committing a mutation and outbox event in one PostgreSQL transaction.

Keep native Hermes `state.db`, sessions and curated files under native ownership. Hindsight's internal store also remains Hindsight-owned. Sharing a PostgreSQL cluster with another service is conditional on its supported deployment/configuration, not permission to modify its private tables.

## 6. Native files, skills and identity

Each runtime instance maps to an isolated native Hermes profile/home, resolved through its profile manager/`HERMES_HOME`. A logical ARA profile may have several such instances with shared published definition/data bindings and separate native sessions/memory; active state is not merged. Preserve:

| Asset | Contract |
| --- | --- |
| `config.yaml` | Native settings/provider/plugin config; validate through supported interfaces and preserve unknown native fields. |
| `SOUL.md` | Profile identity/personality; real file, explicit approved edits, revisions and preset-update conflict handling. |
| Project `AGENTS.md` / override files | Native project discovery/precedence; keep provenance and avoid copying unrelated context globally. |
| `memories/MEMORY.md`, `memories/USER.md` | Native curated files and write/size policy; respect session-start prompt snapshots. |
| `skills/.../SKILL.md` + assets/scripts/references | Complete skill package, native origin hashes/locks, requirements, tool policy and updates. |
| Native plugin packages/config | Pin versions, use native setup/migrations, keep profile-local configuration. |
| Native auth stores and `.env` | Secret-aware lifecycle; separate encrypted handoff from normal file sync. |
| Native state/session/schedule assets | Supported consistent checkpoints/imports, not ad hoc writes or live-file copies. |

ARA PostgreSQL can hold references, hashes and version history; files stay authoritative. Web edits use expected hashes/revisions and native validation/staging with atomic writes. Watch CLI/editor changes and show conflicts. Do not invent a native Hermes `IDENTITY.md` loading contract merely because another agent ecosystem uses that name; imported files need a visible mapping.

Preset updates seed or propose native file changes rather than overwriting user/learned edits. A SOUL or memory edit being saved does not mean it has replaced a running session's frozen prompt snapshot; display actual effectiveness/reload state.

## 7. Memory integrations and knowledge vaults

Memory layers stay distinct: identity/project instructions, curated native memory, transcripts, procedural skills, external memory services, PostgreSQL canonical domain data and external knowledge files.

### Hindsight

Use the Hermes catalog integration maintained by Vectorize, pinned alongside the service. It supports documented retain/recall/reflect tools and cloud/local-external/local-embedded modes; local ARM/macOS service packaging must be verified separately.

- Per-profile bank, endpoint, actual plugin config and credential reference.
- Separate auto-retain/auto-recall, capture scope and retrieval budget controls.
- A new profile/clone gets an explicit new-bank-or-share choice; do not assume a copied config creates a new bank.
- Current native Hermes supports one active external memory provider at a time. Other providers are alternatives unless a separately tested router is introduced.
- Hindsight capture can include conversation/tool output and mirrored memory writes. Apply profile/dataset privacy policy; do not silently enable remote capture with a general learning toggle.
- Expose service health and failed/queued retention. Preserve native curated memory behavior as configured; external provider selection alone does not replace it.
- Config file export alone does not include bank data. Native-plugin/service export or an authorized remote bank mapping is required.

### Obsidian

Treat the vault as an external user-owned data source with a logical vault ID, host-specific path mapping, permitted folders and read/write mode. Preserve Markdown, frontmatter, wikilinks, tags and attachments. Index derived views without making PostgreSQL a conflicting writer.

Use native skill/plugin or MCP operations for search/read/staged edits; headless tools must not require an open GUI unless that connector declares it. Keep note content hashes, external-edit conflicts and one explicit vault-sync owner. The catalog Obsidian UI integration is a community desktop plugin, so it needs a web-specific UI adapter for the ARA dashboard.

Hindsight may be the active memory provider while Obsidian is a vault tool/resource. Optional ingestion of selected vault notes into Hindsight is a separately configured derived-memory pipeline with source/deletion tracking, not a transfer of vault ownership.

## 8. Model authentication and sharing

Retain native Hermes provider/auth flows. A web login selects the target host/profile, uses its supported browser/device-code path, and stores credentials at the native credential owner. The web receives status and an account reference. CLI changes are reflected in the same profile rather than creating a second token store.

Support OAuth/subscription methods actually exposed by enabled providers, API keys and custom endpoints. OpenAI Chat Completions, Responses, Anthropic Messages and Gemini remain explicit protocols; URL + key is sufficient only for a compatible configured transport/model.

Sync configuration, account bindings and host-reported status as metadata. Static credentials may transfer encrypted to authorized hosts under explicit policy. OAuth refresh grants keep a native recorded owner; use supported handoff or independent login where needed. Native root/shared grants and profile overrides must retain their actual resolution order. Do not sync auth.json by blind file replication.

An unavailable credential host means another runtime needs an already usable permitted credential or a fresh login. Config sync alone does not authorize model use. Credentials and provider tokens do not enter dashboard localStorage, ordinary profile exports, prompts or learned skills.

## 9. Per-profile learning

Use native controls, including `auxiliary.background_review.enabled`, review-model/budget configuration, `skills.write_approval` and `memory.write_approval`. Built-in memory enablement and external capture are separate controls, not aliases for learning.

ARA's profile UI offers off/review/automatic policies with visible effective native settings. Off disables automatic reviews and automatic committed skill/memory improvements under that policy. Explicit manual learning can remain a separately approved action. Map every enabled path and fill only an actual enforcement gap with a focused patch; do not claim a single notification flag disables learning.

Track learned artifacts, source run/evidence, versions, review/approval and rollback. Scope learned skills/memory to the profile unless explicitly shared. SOUL changes require identity-edit approval. Learning cannot expand permissions, change provider auth, modify schemas/canonical domain data or rewrite the upstream executable.

Hindsight auto-retain and Obsidian capture stay independently visible. A profile with learning off must not silently keep sending private content to a newly activated external memory service. Existing native profiles keep their settings until the user chooses an ARA policy.

## 10. Fork and update maintenance

Maintain a pristine upstream remote/tracking branch, an additive ARA branch and a small patch inventory. Prefer native dashboard/backend/provider/memory/skill plugin interfaces. Preserve native CLI/onboarding/dashboard entry points and allow the baseline runtime to operate without ARA domain plugins.

An updater opens upstream-merge PRs with gateway/API/plugin/config/schema/auth changes, dependency/toolchain requirements and patch conflicts. Pin the tested runtime/plugins/UI packages in a compatibility manifest; do not auto-upgrade active profiles from a moving branch. Run stock baseline plus ARA integration/restore tests before release.

Keep native profile files, bundled skill origin hashes and provider plugin configuration compatible. Preserve secrets and user/learned changes across updates. Retain versioned checkpoints and compatible executables; restoring a migrated native state may require restoring data, not merely downgrading binaries.

## 11. Sync and portability

The [host/node execution, synchronization and recovery contract](ARA-HOST-NODE-SYNC-AND-RECOVERY.md) specifies layout, cadence, acknowledgements, failover and environment portability. All runner machines use the same ARA-Hermes distribution. A node-owned native instance has a passive replica outside native discovery; web routes each conversation to its assigned authority. Logical profiles can have several isolated instances. Model grants, channel connections and triggers have separate ownership, as detailed in the connections contract. Restore/promotion requires native unknown-work, credential and capability checks. Replication/federation remains proposed ARA functionality.

A portable manifest identifies native files, preset/template versions, skills/plugin revisions, native checkpoint compatibility, PostgreSQL dataset references/exports, selected curated memory/learned artifacts, external memory banks/vaults, machine path mappings and credential requirements.

Keep credentials, caches, virtualenvs and native binaries out of ordinary exports. Reinstall pinned dependencies on the target architecture. Snapshot native runtime state consistently and preserve attachments. External Hindsight/Obsidian content requires an explicit export or reachable authorized source; config-only copies are insufficient.

Use hash/revision conflicts for native instance files and domain-specific merge rules for PostgreSQL events. Maintain one active authority per native home. Never share a writable `HERMES_HOME` across independent instances/hosts or merge live `state.db` files. Keep local operations durable while a coordinator is unavailable; transfer reconciles state and separately confirms schedule/channel activation. PostgreSQL streaming replication is not a replacement for peer/conflict/ownership protocols.

## 12. Implementation stack

- Web: independent React/TypeScript/Vite ARA client with module renderers and generated API contracts; native Hermes dashboard remains supported as optional administration.
- Backend integration: native Python plugin/FastAPI routes. ARA domain packages use Pydantic contracts, SQLAlchemy/psycopg and Alembic migrations with PostgreSQL. They can expose a standalone local API/MCP service without importing the agent engine.
- Contracts: generate OpenAPI/JSON Schema and typed frontend clients; do not maintain conflicting handwritten Python and TypeScript data rules.
- Tools: native Hermes plugins/skills and MCP for external/domain integrations, preserving scopes, secret references and capability checks.
- Memory: native files/history first, optional version-pinned Hindsight or another selected provider, optional vault connectors.
- Runtime: upstream-compatible Python/uv and lockfiles; web toolchain follows its pinned release. No duplicate AI orchestration framework is mandatory.
- Local services: PostgreSQL plus required plugin services on ARM Linux/systemd or macOS/launchd; optional ARM-compatible containers. Model generation offline needs an available configured local inference endpoint.
- Android later: Kotlin/Compose, Room cache/drafts, generated/shared API schemas and gateway transport adapter; native UI surfaces need native renderers or an explicit embedded web choice.

## 13. Delivery gates

1. **Web/data foundation:** independent OS views/API, PostgreSQL domain services, profile/binding editor, native asset editor, generic/rich surface contract, native provider login from web and real persistence with all agents disabled.
2. **Installed Hermes distribution:** complete native CLI/gateway/service lifecycle, presets/custom profiles, domain MCP/tools, scoped orchestrator, channels/jobs and verified per-profile learning policy.
3. **Memory/vault and portability:** pinned Hindsight setup/bank isolation/capture, Obsidian tools/web surface, safe native files/skills updates, consistent checkpoints and cross-host import/auth handoff.
4. **Upstream maintenance:** stock baseline compatibility, CLI/web bidirectional edits, update preservation, schema/plugin migrations, rollback/restore and measured ARM/macOS footprint.
5. **Android:** same data/profile/auth/memory integration contracts, appropriate native surfaces and clear offline capability limits.

Readiness requires actual tests of profile restarts, provider auth/refresh, data invariants, approvals, file conflicts, integration availability, learning isolation, secret-free export, restore and upstream upgrade preservation. Source/documentation support is not a completed runtime test.

## References

The [master plan](ARA-AGENT-OS-MASTER-PLAN.md) consolidates all current decisions and coverage. The detailed [upstream/profile compatibility audit](ARA-UPSTREAM-AND-PROFILE-COMPATIBILITY.md) links the inspected official provider, profile, SOUL, memory, skills, Hindsight, Obsidian and web/desktop extension documents. Superseded plans have been removed from this branch; the Git history retains earlier committed material.
