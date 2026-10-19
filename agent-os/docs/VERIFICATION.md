# v0.1 verification

Current-instance validation on x86 Linux; browser timezone Asia/Kolkata. This is not a live deployment or a fresh cloud-machine restoration claim.

## 19 October 2026 — preset workflows and legacy-session recovery

- Production TypeScript/Vite build passed.
- Full regression run: **46 passed in 204.03 seconds**. The final focused
  recovery/preset run subsequently passed **17 tests in 30.58 seconds**, including
  one newly added regression for executable native CLI commands in error messages.
- All six recommended presets ran through actual native sessions and scoped MCP
  discovery with an explicitly local protocol fixture. Test configuration and
  datasets stayed in the disposable installation.
- Reproduced a legacy native session created with an empty model, then configured
  a model and verified its old policy still refused restoration. Explicit recovery
  opened a separate conversation; a deliberate fixture turn succeeded without
  rewriting the old receipt or automatically resending the failed turn.
- Desktop/mobile Chromium checked recovery visibility, disabled old-session
  sending, an empty replacement draft, no page errors and no horizontal overflow.
  Screenshots: `test-results/session-recovery-{desktop,mobile}.png`.
- Live local API restarted only after confirming no pending managed work. Health
  returned ready. Titan's diagnosed legacy conversation received an empty replacement;
  native session creation succeeded using its configured model. Original history
  and receipt were verified unchanged. **No live inference was submitted.**
- Agnes/Scout ChatGPT account selection was requested, but native validation
  correctly refused model assignment without each profile's login. No OAuth
  tokens were copied and neither profile is claimed account-ready.

## 16 October 2026 — initial prototype verification

| Command/check | Observed result |
| --- | --- |
| `bash scripts/setup.sh` | Passed: frozen app dependencies, managed native Python, pinned native imports, clean frontend install/build and PostgreSQL readiness. Existing-environment refresh exercised. |
| `bash scripts/start.sh` | Passed: combined server restarted; database migrations adopted the original prototype schema; health ready, six presets ready, dashboard and static client respond. |
| `bash scripts/check.sh` | 20 passed in 142.13 seconds after legacy cleanup, including production TypeScript/Vite build and event reconnection. |
| Python unused-code check | Ruff F checks passed; TypeScript unused-local/parameter checks are enabled and passed in the build. |
| GitHub Actions | Pinned validation workflow added; YAML/service settings and equivalent local commands verified. Hosted CI execution is not claimed here. |
| Owning CLI `ara runtime PROFILE -- auth --help` | Passed through actual native CLI (exit 0). |
| Native Git diff / repository whitespace check | Native checkout clean; no upstream core patch. Superseded Firebase/Cortex code and generated artifacts were removed after verifying a private local preservation archive of legacy files and uncommitted changes. |
| Cloud environment configuration | Complete prototype-only install/start instructions saved to the configuration draft, replacing obsolete root npm/Firebase commands and preserving repository membership. Not published by this work. |

The tests cover independent data surviving profile disablement, exact money, validation, atomic imports, revision/idempotency conflicts, read-only MCP scope, native asset boundaries, real native model/tool execution, canonical clarification/cancellation, staged learning approval, native schedule/MCP configuration, clone credential exclusion, scoped delegation/cycle rejection, uncertain-outcome reconciliation, native/OpenClaw imports, unsafe archives, authenticated passive node sync/checksums, encrypted recovery, and starting restored application/native state with received node snapshots intact. Storage failure leaves the UI/diagnostics available. Event reconnection honors Last-Event-ID.

The browser case creates finance data, binds Ledger, uses its finance workspace, edits identity, checks denied-microphone degradation, reviews typed voice text and sends it through the actual agent, downloads node enrollment, and checks mobile navigation/no horizontal overflow/no page errors. Screenshots are regenerated under `test-results/` (ignored).

Model responses come from an explicit deterministic OpenAI wire fixture. Native session authority, tool discovery, tool execution, SQLite persistence, application services, PostgreSQL and MCP transport are real. These checks do not certify paid provider behavior or reasoning quality.

Not live-certified: OAuth completion, paid model calls, Telegram send/receive, physical microphone capture and provider STT/TTS, external Hindsight/Obsidian services, ARM/macOS execution, active host/node gateway handoff or bidirectional data replication. The prototype exposes actual configured native capabilities and labels/gates unsupported placement cases. Android and hosted deployment are outside this implementation.
