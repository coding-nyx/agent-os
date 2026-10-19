# ARA v0.1 interface contract

The dashboard begins with the user's data and agents, then reveals native runtime controls inside a profile. Every count and activity item comes from persisted state. There is no fabricated demonstration data in the product.

| View | Main task | Failure and lifecycle behavior |
| --- | --- | --- |
| Overview | See enabled agents, owned datasets, completed work and attention items; create data/agents. | Empty states offer creation; API failures show a retry. Unknown work stays visible. |
| Agents | Select a preset/custom instance and see readiness separately from enablement. | Setup failures retain the profile and expose retry; disabling keeps datasets intact. |
| Profile workspace | Use the finance/training/notebook/research surface for bound module datasets. | No binding offers creation or explicit access selection. Data ownership remains in the library. |
| Conversation | Start/resume private app conversations, follow streamed output, answer questions/approvals, stop work. | One pending turn per conversation; retries use stable server IDs; uncertain transport outcomes remain unknown. No implicit external-channel replies. |
| History | Inspect the native session history from CLI, gateway and app. | External-channel sessions remain read-only from ARA in this release. |
| Profile data | Grant dataset read/write access and select permitted specialists. | Missing targets and cycles rejected; notebook access plus managed external channel is gated until audience scoping is certified. |
| Identity/skills/memory | Read and edit actual native assets. | A stale hash refuses overwrite and retains the local editor text; path escapes and secret files are refused. Session context changes take effect at native boundaries. |
| Swarms | Configure profile-scoped multi-agent swarms, trigger policies (intelligent vs explicit), allowed presets (research, coding, analysis, custom), deploy swarms and inspect worker states. | Swarms disabled refuses tool and API spawn; workers run in tandem and output is synthesized into verified results. |
| Connections | Configure endpoint/protocol/key, native account login/model, bot, MCP and learning. | Each subsystem reports its own error; credentials are never a UI export. Duplicate bots are rejected independently from chat. |
| Automations | Configure native jobs and control activation/triggering. | Native validation is authoritative; paused state uses scheduler-owned enabled/state fields. |
| Voice | Record or type, transcribe, review, send and play speech. | Browser permission, STT and TTS fail independently; typed chat stays available. Real-time duplex is later work. |
| Data library | Create, inspect, edit, archive and export independent datasets. | Domain validation, transactionally atomic imports, exact money, revision conflicts and idempotency protect writes. |
| Machines & sync | Pair a node, inspect acknowledged passive snapshots, create/download encrypted recovery bundles. | Pairing is separate from connection health; no received snapshot means no remote backup claim. Explicit import/activation replaces unverified automatic failover. |
| Activity | Inspect accepted/running/waiting/terminal/unknown runs. | A restart cannot certify the outcome of an in-flight native turn; native history remains authoritative. |
| Settings | Inspect storage/runtime capability, export application records, find the versioned API. | Missing storage keeps diagnostics and static UI reachable. Exported application JSON is private data and excludes raw credentials. |

Desktop uses a persistent navigation rail and compact profile tabs. Mobile uses an explicit drawer, scrollable profile tabs and stacked panels. Dialogs use native modal focus/escape behavior. The browser suite checks a complete data → profile workspace → identity edit flow and mobile navigation without page errors or horizontal overflow.

Future module extensions should supply independently versioned data validation, application endpoints, MCP tools, capability requirements and a UI surface. Clients consume module JSON contracts rather than native SQLite or engine internals. Custom v0.1 datasets support JSON Schema, while a third-party UI/plugin loader and Scout's dedicated application remain future work. This preserves the direction **data → agent**, with explicit **data + agents → orchestrator** grants.
