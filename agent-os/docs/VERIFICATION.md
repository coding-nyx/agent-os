# v0.1 verification

Current-instance validation on x86 Linux; browser timezone Asia/Kolkata. This is not a live deployment or a fresh cloud-machine restoration claim.

## 20 October 2026 — swarm outcome and desktop dispatch fixes

- Addressed all five findings in the [implementation review](SWARM-DEVICE-REVIEW-2026-10-20.md)
  under the [fix plan](SWARM-DEVICE-FIX-PLAN.md).
- Full isolated regression run: **139 passed in 321.39 seconds**. After the last
  approval-binding and capture-owner guards, final focused CUA/native-adapter and
  execution checks passed **57 cases in 11.31 seconds**. The capture-owner test
  was also repeated with a distinct, still-live target process and passed.
  Two additional regression cases were added after full-suite collection; they
  are covered by the final focused run. These counts are separate runs.
- Production TypeScript/Vite build, Python compilation and Git whitespace checks
  passed. The existing Starlette/HTTPX test-client deprecation warning remains.
- Device coverage uses synchronization on actual lock contention to exercise
  mode changes, revoked queued inputs/observations, observation expiry, stale
  approvals, original-payload binding and revocation during reads. Single-use
  decisions and operation receipts are serialized across processes.
- Native-adapter coverage runs the real pinned target selection, capture,
  approval gate, hard blocks and input dispatch against an explicit fake driver
  transport in separate native Python processes. Tests cover exact targeting
  after foreground changes, click/type/key, changed or absent windows, process
  creation identity, actor/desktop/geometry/policy mismatch, expiry, capture-owner
  exit during revalidation, valid coordinate edges and unconfirmed effect metadata.
  A supervised approval from another application process delivers one fake input
  to the original target; operation replay does not repeat it. No auxiliary-model
  inference is used by the target-validation path. The upstream runtime core has
  no local changes.
- Swarm checks preserve unknown execution and native handles when artifact
  collection fails, retain completed summaries/usage, stop dependent stages on
  missing/invalid/truncated artifacts, and finalize cancellation atomically after
  synthesis. Node event upload/replay preserves separate artifact diagnostics and
  unknown states; prior event formats remain readable.
- The local API was reloaded after checking that all managed runs were terminal,
  no swarm runs were active and the API had zero child processes. Health returned
  ready with PostgreSQL available. All **nine** recorded native configuration
  hashes remained unchanged; computer control remains **view-only with zero
  agent grants**.
- Physical desktop capture/input, external scanning and paid inference were not
  performed. Actual OS/driver input reliability remains a separate hardware
  validation step. Remote desktop routing and Android/iOS providers remain outside
  the managed desktop implementation.

## 19 October 2026 — native swarms, standalone nodes and guarded computer control

- Clean, isolated full regression run: **103 passed in 292.89 seconds**.
  Production TypeScript/Vite build, Python compilation, shell syntax and Git
  whitespace checks passed. One dependency deprecation warning remains in
  Starlette's HTTPX test-client integration.
- Swarm coverage exercises actual native child sessions with a local provider
  fixture, any-profile policy, custom coding roles, inherited isolated Git
  worktrees, real file/terminal tools, partial failures, cancellation, durable
  event receipts and unknown-outcome handling. No paid inference was submitted.
- Standalone node checks run without application PostgreSQL, execute native
  workers locally, replay immutable events after reconnection and acknowledge
  credential-scrubbed native snapshots separately from task completion.
  These tests do not certify a production multi-host deployment.
- Computer-control checks use explicit fake drivers, never physical desktop
  capture or input. They cover default-deny grants, single-use approvals and
  rejection, durable input idempotency, controller leases, revocation, strict
  action validation, MCP image responses and HTTP/WebSocket access boundaries.
  Chromium checks cover unavailable-driver readiness, grants and modes, mobile
  overflow and browser errors. Existing visual styling was retained while
  readiness and permission states were made explicit.
- The live API was restarted only after confirming no pending managed work or
  API-owned child processes. Health returned ready; all **nine** native config
  hashes were unchanged. Computer control remains **view-only with zero agent
  grants**. The untrusted-Host probe returned HTTP 403.
- Remote-node desktop streaming, Android control, physical driver operation and
  production provider reliability are not claimed. Git artifacts are not applied
  automatically to the source checkout. The runtime adapter retains native
  delegation through v1; replacing that dependency is a post-v1 step.

## 19 October 2026 — installation model onboarding

- `scripts/setup.sh` now provisions the six presets before first server start,
  then offers one native provider/account/model wizard and explicit application
  confirmation. `.venv/bin/ara setup` reopens onboarding without reinstalling.
- Existing model choices are preserved by default. `--replace-models` explicitly
  targets the original six presets, not retained profiles or extra instances.
  `--skip-model`, `--non-interactive` and `--use-existing` support unattended setup
  without hanging on account prompts. Setup itself never submits inference.
- Shared API-key setup was exercised through all six real native agent sessions
  against an authenticated local wire fixture. OAuth tests verified one native-root
  refresh grant remained available to child profiles without cloning its tokens.
  Native account resolution is checked under each profile before success is reported.
- Fresh installation into a disposable empty database created six native homes
  and the CLI default before any web server was started. Cancellation, existing
  choices, changed-file conflicts and running-API outcome preservation are covered.
- Full regression run: **74 passed in 222.25 seconds**. Final focused setup run:
  **8 passed in 31.48 seconds**, including the additional fresh-install check
  and replacement of an earlier shared API key without keeping a stale fallback.
  Production frontend build and shell syntax checks passed.
- Live `.venv/bin/ara setup --skip-model` passed; all eight pre-existing native
  configuration hashes were unchanged and health remained ready. The user's
  Agnes/Scout provider split was not replaced.

## 19 October 2026 — live account checks and provider dependency repair

- Kept the user's selected split: Agnes uses ChatGPT/Codex with
  `gpt-6-luna-900k`; Scout uses MiniMax OAuth with `MiniMax-M2.7-highspeed`.
- Both profiles completed a real, connection-only inference turn and returned
  `READY`. No tool calls were recorded. Personal setup answers, dataset grants and
  credentials were not copied or changed. This verifies a single live turn per
  connection, not general reasoning quality or provider reliability.
- Scout's initial check exposed a missing Anthropic Messages SDK. Added the
  pinned native `anthropic` extra and actual adapter import smoke checks; rebuilt
  through native PM with a validated staged environment and a retained previous
  environment. Stopped the native gateway only after checking for active native
  admissions/workers, then repeated Scout's connection check successfully.
- Re-running `scripts/setup_runtime.py` verified imports and launcher help
  without another rebuild. Tests cover failed staged checks, promotion rollback,
  preservation of the previous environment and installed adapter availability.
- Connection reporting and managed execution now read native model/provider/
  protocol settings rather than trusting stale application metadata. Regression
  coverage includes CLI-style changes, stale cache execution and rejection of a
  removed or malformed native model without creating a run.
- Production TypeScript/Vite build passed. Full regression run:
  **67 passed in 214.25 seconds**, including provider selection, native adapter
  imports, staged dependency refresh/rollback, session recovery, preset workflows,
  swarms, browser flows, node snapshots and encrypted backup/restore.

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

Beyond the two account checks above, other provider OAuth flows, metered API billing, production provider reliability, Telegram send/receive, physical microphone capture and provider STT/TTS, external Hindsight/Obsidian services, ARM/macOS execution, active host/node gateway handoff and bidirectional data replication remain uncertified. The prototype exposes actual configured native capabilities and labels/gates unsupported placement cases. Android and hosted deployment are outside this implementation.
