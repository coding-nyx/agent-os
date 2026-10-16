# Upstream decision, native profile files and memory integrations

Status: supporting native compatibility audit under the [consolidated Agent OS master plan](ARA-AGENT-OS-MASTER-PLAN.md). Recommend Hermes as the single ARA fork for the currently stated priorities. OpenClaw remains a comparison/reference; there is no second runtime implementation planned. The primary ARA clients use an independent shared API; native dashboard extensions are optional administration/integration surfaces.

ARA logical profiles versus native runtime instances, provider/channel ownership, multi-instance routing and output delivery are specified in the [connections/conversations contract](ARA-CONNECTIONS-GATEWAYS-AND-CONVERSATIONS.md). One native home/session authority per instance does not prohibit concurrent isolated instances of one logical profile. Master-plan sections 15–17 apply lifecycle and graceful failure behavior across all product features.

## 1. Why the recommendation changed

The previous OpenClaw choice put too much weight on TypeScript and published gateway-client packages. That was insufficient to rank it above Hermes for native portable profiles, provider flexibility, learning and memory integrations. Source inspection shows that Hermes already exposes relevant web/dashboard extension surfaces as well as the native profile and memory-provider lifecycle ARA needs.

| Criterion | Hermes evidence | OpenClaw evidence | Decision implication |
| --- | --- | --- | --- |
| Model/provider access | Broad built-in/plugin provider catalog, custom endpoints, ChatGPT/Codex and Grok OAuth, auxiliary-model configuration | Broad provider plugins, OAuth, custom providers | Both cover required providers. Exact provider counts change and were not enumerated; do not claim a numeric winner from memory. |
| Native profile portability | Per-profile `HERMES_HOME`, config, SOUL, memories, skills, plugins, native state and clone/import commands | Per-agent/workspace state, native config/skills/auth and migration commands | Hermes' profile home maps directly to the requested installable agent profiles. |
| Learning | Native memory/skill writes, write approval, background review, review-model/budget controls | Skill Workshop, automatic reviews, tool policy and undo | Reuse Hermes' existing controls; learning is not a missing feature requiring a new engine. |
| External memory | Dedicated memory-provider hooks; catalog integration for Hindsight and others | Memory/plugin extension system, builtin/optional providers | Hermes has a documented Hindsight path that reduces ARA-specific integration work. |
| Custom UI | Dashboard themes, tabs/page slots/backend plugins; separate desktop plugin SDK | Published gateway clients, Control UI and plugin SDK | OpenClaw has useful client contracts; Hermes can support a custom ARA dashboard through its native extension points. |
| Runtime resources | No same-hardware measurements performed | No same-hardware measurements performed | Neither idle RAM/CPU nor installation footprint is proven here. A headless/runtime benchmark must be separate from optional web/desktop/memory services. |
| PostgreSQL | ARA can own domain PostgreSQL independently; native Hermes state need not be rewritten | Upstream PostgreSQL adapter exists but is experimental with store-specific gaps | PostgreSQL does not require an OpenClaw fork; preserve native state formats in either case. |
| Upstream maintenance | Native plugin/provider/file contracts and a small downstream patch queue | Native plugin/wire contracts and a small downstream patch queue | Both require version pinning and update tests. TypeScript alone does not establish lower integration cost. |

Recommendation: **one minimal Hermes fork + native profiles/plugins + PostgreSQL domain services + independent ARA clients/shared API.** Native dashboard extensions remain optional. This recommendation is grounded in the fit to the user's profile/memory/integration requirements, not a measured performance victory or a promise of conflict-free upstream merges.

### Measurements before claiming “lighter”

On the intended ARM64 Linux and macOS targets, compare equivalent headless deployments with the same model route, channels, tool set, active profiles and external memory disabled. Measure cold/warm start, process-tree resident memory, idle CPU/wakeups, installation disk use, first-run dependencies and run/cancel/tool overhead. Report separately with dashboard enabled and with Hindsight enabled. Remote model latency and optional inference model weights are not runtime overhead.

ARA's PostgreSQL and optional Hindsight services contribute their own load. A light agent process does not imply that the complete stack uses the same resources.

## 2. Native file and profile contract

Hermes recognizes a profile as an isolated home directory. Use the native profile manager/`HERMES_HOME` resolution rather than hardcoding that every profile lives in one path. A standard named profile commonly resides below `~/.hermes/profiles/<name>/`; the native CLI remains able to open it.

One active writer/owner per native profile home. Do not mount the same profile directory read/write into several machines or independently running agents. Shared knowledge belongs in authorized data services or explicitly shared memory banks.

| Asset | Native location/ownership | ARA behavior |
| --- | --- | --- |
| `config.yaml` | Profile home; Hermes configuration and plugin/provider settings | Typed editor plus raw view, validation and backup. Preserve unknown upstream fields/comments where the native writer supports them; use native commands/APIs for owned settings. |
| `SOUL.md` | `$HERMES_HOME/SOUL.md`; native primary identity/personality | Preserve as a real file; editor, revisions, diff, proposed edit/approval and export. Preset updates never overwrite a modified SOUL silently. |
| Display identity/avatar/preset ID | Native profile metadata where supported; ARA-only presentation in sidecar metadata | Map presentation without inventing a second prompt source or claiming Hermes loads `IDENTITY.md` automatically. |
| Project `AGENTS.md` / overrides | Project/workspace, using native discovery and precedence | Show actual provenance and effective project context. Do not flatten project instructions into SOUL or copy unrelated projects into every profile. |
| `memories/MEMORY.md` | Native curated memory file | Native memory tool remains the writer. ARA provides inspect/edit/review/history and respects native size/approval behavior. |
| `memories/USER.md` | Native curated user-profile memory | Same lifecycle with separate scope. It is not a provider login or a new multiuser account database. |
| `skills/<...>/SKILL.md` | Profile skill package with scripts/references/assets | Preserve complete package layout, native discovery, configuration, trust metadata and install/update commands. A skill is not just its Markdown body. |
| Skill origin/install metadata | Native bundled manifests, hub lock/install records and source refs | Retain upstream ownership/update behavior; do not replace these with an unrelated ARA registry. |
| `plugins/<id>/` and plugin config | Native installed plugin packages and versions | Pin supported packages; use plugin setup/uninstall/update flows. Record ARA metadata alongside rather than alter plugin internals. |
| Provider auth / `.env` | Native credential owner and profile override resolution | Secret-aware editor/login flow. Exclude values from normal file sync/export; apply explicit credential transfer policy. |
| `state.db`, sessions, cron/state assets | Native runtime-owned state | Export/restore through supported native snapshot/maintenance paths. Do not write Hermes tables from ARA PostgreSQL services. |
| Hindsight plugin config | `$HERMES_HOME/hindsight/config.json` in the inspected plugin | Use its actual schema; do not invent `memory.hindsight.*` fields that the plugin ignores. Resolve secrets separately during export/transfer. |
| Obsidian vault | External user-owned Markdown directory | Reference an allowed host-specific vault binding. Vault ownership and synchronization remain explicit, independent of the agent profile. |

Hermes' SOUL docs distinguish instance identity from project instructions; native curated memory is injected as a frozen session-start snapshot. ARA must show “saved” separately from “effective in this running session” and respect restart/new-session requirements. An arbitrary imported `IDENTITY.md`, `TOOLS.md` or OpenClaw workspace file is not assumed to have Hermes-native semantics: retain it and perform a visible mapping/import if needed.

## 3. Editing, presets and updates

- Native files remain authoritative. PostgreSQL may hold version history, hashes, references and searchable projections; it does not become a conflicting second writer.
- File edits from web use an allowlisted asset ID, current content hash/revision, native validation and an atomic write/staged native operation. Reject a stale edit rather than overwrite a CLI/desktop change.
- Observe native/CLI edits and invalidate UI projections. If native operations do not expose revision fencing, serialize ARA writes and detect external changes; do not claim universal multiwriter safety.
- Seed preset SOUL/config/skills only on profile creation. Track template version and origin. Preview upstream/preset changes and preserve user/learned modifications using the native update behavior or explicit conflict review.
- A profile manifest records native profile identity, preset/template version, plugin versions, required files/integrations and machine path mappings. It contains credential references, not credential values.
- Future Scout and custom UI surfaces register through the dashboard plugin contract. Browser, desktop and Android need appropriate surface implementations; a native desktop ESM plugin is not automatically a web or Android plugin.

## 4. Skills are executable integration packages

Support catalog/tap/Git installs, skill instructions, supporting scripts/assets, per-skill settings, environment-secret references, tool/dependency requirements, host-platform requirements, enable/disable, update/diff and native approvals.

Keep preset-provided, user-installed and learned skills distinguishable. A shared skill package can be installed in multiple profiles, but learning/editing is scoped; publishing a modified package to other profiles is explicit. Preserve package provenance and lock hashes during import/export. Dependencies are restored through the native installer at the pinned version, not through machine-specific virtualenv binaries copied to another OS.

Project-owned skills remain project-owned; do not let automatic learning overwrite them. Model generation of a new skill does not authorize the script to run with unrestricted machine access. Existing approved tool/policy scopes still apply.

## 5. Memory is several separate subsystems

1. **Identity/instructions:** SOUL, user-facing identity and project context.
2. **Curated native memory:** MEMORY.md and USER.md, bounded and human-reviewable.
3. **Session history:** native transcripts, search and tool outcomes.
4. **Procedural memory:** SKILL.md packages and learned procedures.
5. **External memory:** selected native memory-provider plugin such as Hindsight.
6. **Canonical domain data:** PostgreSQL finance/notebook/research/training records.
7. **External knowledge files:** Obsidian vaults, documents and selected folders.

Do not collapse these into a single vector database or a single self-learning switch. Canonical data keeps its own validation and update workflow. A remembered statement about an account or health record is source-linked context, not an automatic change to that record.

## 6. Hindsight support

The inspected Hermes catalog includes a pinned **community** Hindsight integration maintained by Vectorize, not a bundled always-on feature. It registers the external memory-provider lifecycle and tools such as retain/recall/reflect. Native docs describe cloud, local-external and local-embedded modes.

Implementation:

- Install/activate through the native plugin/memory-provider interfaces and pin plugin + service versions.
- Provide per-profile setup/status/health UI for actual plugin config, endpoint, mode, bank and secret references.
- Default each new/cloned ARA profile to a separate bank unless the user deliberately chooses shared memory. Native cloning can preserve an existing bank ID, so this requires explicit preflight and mapping rather than assuming isolation.
- Preserve normal native curated files as configured; selecting an external provider does not imply its built-in memory files have been replaced.
- Surface auto-retain, auto-recall, capture scope and provider context budgets independently. The documented integration can send complete turns/tool results and mirrored native memory writes to the selected server. Remote memory storage must not be silently enabled by toggling a general learning setting.
- Memory provider configuration is per-profile. Current Hermes supports one active external provider at a time; do not present Hindsight/Honcho/Mem0 as simultaneously active native backends without a separately implemented router.
- ARA dataset permissions and private-note policy also apply to memory capture. If a plugin hook cannot enforce an exclusion, use a scoped/read-only/tool-only integration or keep capture disabled for that profile instead of claiming it is filtered.
- Keep Hindsight's own data store under Hindsight's migrations. ARA PostgreSQL stores connection/bank metadata and references; it does not write Hindsight's private tables. Sharing one PostgreSQL service/cluster is possible only if the deployed service officially supports the required isolation and connection configuration.
- Verify the actual local service distribution on Linux ARM64/macOS before promising embedded support. Cloud/external support is not proof of a working embedded ARM deployment.

Offline behavior: native profile files and local domain operations remain available; failed external recall/retention is shown with its actual result. If durable external-retention retry is required, implement a bounded, visible native-plugin-compatible outbox and verify idempotency, rather than silently dropping or duplicating memories.

## 7. Obsidian support

Support Obsidian as a user-owned knowledge vault, not automatically as the authoritative store for every ARA dataset or a second active native memory provider.

- Map a logical vault ID to a host-specific path. Bind allowed folders, read/write mode, attachments and the profiles allowed to access it.
- Preserve Markdown/frontmatter, tags, wikilinks, aliases, backlinks, folders and relative attachments. Index these as derived views; files remain authoritative.
- Expose list/search/read and staged create/update/append tools through the native vault skill/plugin or MCP adapter. Headless use must not depend on Obsidian Desktop or its local REST plugin being open unless that connector explicitly requires it.
- Provide a vault browser/note editor/graph as an optional ARA web surface. The existing catalog `obsidian-memory` entry is a **community desktop UI** integration; its desktop bundle is not assumed to run in the web dashboard.
- Exclude `.obsidian` configuration/secrets, caches and machine-specific plugin state from general data capture by default; select any required assets explicitly.
- Preserve externally edited notes with content hashes and conflict copies. Do not overwrite concurrent Obsidian edits.
- Choose one owner for vault sync: existing Obsidian Sync/Git/filesystem sync, or an explicit ARA-managed dataset transfer. Do not run two file synchronizers over the same writable tree unknowingly.
- An Obsidian vault can be a tool/resource alongside Hindsight as the active external memory provider. Optional ingestion of selected notes into Hindsight creates source-linked derived memory, with update/deletion handling; it does not transfer file ownership.

## 8. Per-profile learning and retention controls

Expose separate controls for automatic skill improvement, curated memory writes, external memory capture, retention and identity editing. A single umbrella toggle can configure defaults, but show its effective settings.

Native knobs verified in the inspected docs include:

- `auxiliary.background_review.enabled` — automatic post-turn review forks;
- `auxiliary.background_review.max_input_tokens` and model routing — review resource/cost control;
- `skills.write_approval` — staged writes for native skill mutations;
- `memory.write_approval` — review gate for native memory changes;
- `memory.memory_enabled` / `memory.user_profile_enabled` — built-in memory stores/tool behavior;
- Hindsight `auto_retain` / `auto_recall` — external capture/retrieval, in its plugin's own config.

These controls are not interchangeable. Disabling notification banners does not stop learning; disabling built-in memory does not by itself disable an external provider. “Automatic learning off” must disable background reviews and prevent automatic committed memory/skill modifications under the ARA policy; explicit manual `/learn` can remain a separate approved action. Do not claim complete enforcement merely by changing one unrelated flag.

SOUL changes remain explicit identity edits with approval. Learned artifacts need provenance, revision history, inspection/approval and rollback; they cannot modify provider auth, tool permissions, PostgreSQL schemas or canonical finance/notebook records. Native functions should implement as much of this as possible; fill only a demonstrated gap with a focused patch.

## 9. Sync, export and restore

See the [host/node sync and recovery contract](ARA-HOST-NODE-SYNC-AND-RECOVERY.md) for one-owner execution, passive replica layout, event-driven sync timing, coherent recovery bundles, offline branches, transfer and environment reconstruction. A native backup may contain credentials and must be classified/filtered or placed in a separate encrypted recovery capsule before host replication.

Portable package classes:

- profile definition: config/SOUL/presentation/approved settings;
- skills/plugins: source refs, versions, hashes and required assets;
- curated memory files and selected learned artifacts, under explicit inclusion settings;
- native runtime state: supported consistent checkpoint, not a copied live database;
- domain datasets: PostgreSQL export/replication manifest independent of profile files;
- external connections: logical IDs, bank/vault mappings and secret refs;
- optional vault/memory-service data: provider-specific export or reference, selected separately.

Normally exclude credentials, virtualenvs, native binaries, caches and machine paths. An explicit encrypted credential handoff remains separate. OAuth grants preserve their native refresh owner; a file-sync process must not clone auth.json into every node.

Use per-asset hashes/revisions and a manifest with schema/runtime/plugin compatibility. Preview restores and resolve host path mappings. Reinstall pinned dependencies for the destination architecture. Local-external Hindsight bank data needs a compatible service export/connection; copying only hindsight/config.json does not copy that memory. Referencing an Obsidian vault ID does not prove the vault files exist on the target.

Pause/reconcile a profile's native writer when required for a consistent checkpoint. Only activate schedules/channel subscriptions after ownership transfer is confirmed. Do not continuously merge two live state.db files or allow automatic learning to write the same profile directory from two hosts.

## 10. Integration inventory and UI

Maintain an integration registry with ID/type/version/source, active native component, configuration owner, auth reference, profile bindings, host/path constraints, data/capture scope, required dependencies, health, export/restore capabilities and update policy.

Web profile sections:

- Identity: SOUL and presentation, project-context provenance.
- Skills: packages, settings, permissions, provenance, versions and pending writes.
- Memory: native MEMORY/USER files, session search, external provider and bank/capture settings.
- Knowledge: Obsidian vaults/documents and access scope.
- Data: PostgreSQL/MCP datasets and allowed operations.
- Providers: model login/keys, effective account bindings and sharing status.
- Channels/conversations: connection ownership/routing, explicit audiences, native delivery status and transfer requirements.
- Learning: effective policy, budget, proposed changes and rollback.
- Portability: export selection, integration requirements and destination preflight.

A setup is ready only after real profile restart, CLI/web edits, upstream update preservation, secret-free export, restore on another directory/host, provider health and profile isolation tests pass. Hindsight/Obsidian support in source is not a claim that these tests have already been run.

## Sources inspected

Hermes snapshot `201b32361592bd9ac230d33fd592e101b8cca4af`; OpenClaw snapshot `ff13ebe1d6dd5d66befc1449ba71b1234df757cd`.

- [Hermes profiles](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md)
- [SOUL](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/guides/use-soul-with-hermes.md)
- [Context files](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/context-files.md)
- [Persistent memory and review controls](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md)
- [Skills and write approval](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md)
- [Memory providers](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory-providers.md)
- [Hindsight catalog entry](https://github.com/NousResearch/hermes-agent/blob/main/plugin-catalog/hindsight.yaml)
- [Obsidian catalog entry](https://github.com/NousResearch/hermes-agent/blob/main/plugin-catalog/obsidian-memory.yaml)
- [Web dashboard extensions](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/extending-the-dashboard.md)
- [Desktop plugin SDK and web/desktop distinction](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/desktop-plugin-sdk.md)
- [Hermes gateway cutover limits](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/docs/canonical-gateway-protocol.md)
- [OpenClaw web client contract](https://github.com/openclaw/openclaw/blob/main/docs/gateway/clients.md)
- [OpenClaw database limits](https://github.com/openclaw/openclaw/blob/main/docs/reference/database-engines.md)
