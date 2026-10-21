# Verification

## 21 October 2026 — guided desktop setup, version 0.2.1

- Added operator-only setup checks and native macOS permission requests for the
  selected host/node, including setup before remote observation is enabled.
  The dashboard shows driver detection, Screen Recording, Accessibility and
  explicit remote-access/agent controls separately. A prompt being started is
  not presented as a granted OS permission or a successful screen capture.
- Node-local MCP configuration now carries the shared native source, Python
  and tool-store paths into its child after a release switch. Existing managed
  deployments refresh that configuration idempotently. Driver lookup also checks
  existing PATH, standard macOS app and ordinary Hermes managed installations.
  An invalid explicit override is preserved and reported, not replaced.
- Adapter failure preserves the actual platform and reports unknown installation
  status. Worker discovery refreshes after setup and periodically. Permission
  request subprocesses use the native sanitized driver environment. Setup is not
  exposed to agent MCP capabilities. Unassigned grants are rejected and local
  emergency stops are retained.
- Relevant regression suite: **133 passed in 151.76 seconds**. Final update/setup
  protocol run: **25 passed in 5.61 seconds**, including an additional authenticated
  round-trip/replay case before remote view is enabled. The final Mac setup browser
  case also passed after reconnect-state handling was refined. The frontend
  production build and live desktop/mobile setup-page checks passed.
- Built Python source/wheel distributions for 0.2.1. The actual 0.2.0 standalone
  installer accepted the 0.2.1 archive. Installed the candidate with its frozen
  dependencies in an isolated directory; CLI reported 0.2.1 and native paths were
  reused. Setup instructions stay in the existing allowlisted NODE-RUNTIMES file
  so the stricter 0.2.0 installer can read the release.
- Final node artifact: `dist/ara-node-0.2.1-56bdfd4a931d.tar.gz`, with adjacent
  descriptor and checksum. SHA-256:
  `2b9973a1f474d8b5e3d38ef019e85b0b0c59fcbc217c5d3387c7b3122760998c`.
- Host server restarted with 0.2.1. `work` stopped polling at **10:54:37 UTC**;
  request `0f20ef15-db1c-45f5-a4e4-86fab0e9e6cc` is queued for final build
  `56bdfd4a931db0bfa4f970c777d68c2a62dd6d0b2c56bdf40bb8349006172af2`.
  The undelivered preview was replaced only after checking the request ID,
  queued/no-receipt state and heartbeat predating the request. No node upgrade,
  Mac permission grant or physical capture is claimed while it is offline.
  The user was asked to reconnect its worker before live Mac verification.
- Screenshots: `/tmp/ara-cua-setup-live-{desktop,mobile}.png`. The live page
  displays the Mac instructions and disables requests while its worker is offline.

## 21 October 2026 — private HTTP chat and dropdown layout

- Reproduced the node-browser issue at `http://100.121.113.13:8787`:
  `isSecureContext` is false, `crypto.randomUUID` is undefined and
  `crypto.getRandomValues` is available. All dashboard operation IDs now use a
  shared random UUID implementation built on `getRandomValues`.
- Native single-select controls share one inset chevron and reserve text space
  for it. Form grid columns and labels can shrink; binding access selectors have
  bounded width so they do not squeeze dataset names. Native multiple-select and
  forced-colors controls retain their platform treatment.
- Production build passed. Browser checks: **9 passed in 9.59 seconds** for
  computer/deployment/update surfaces, insecure HTTP chat with distinct operation
  IDs, and long dropdown labels at 1440, 768 and 390 pixels. The separate end-to-end
  data/voice/chat/pairing flow passed **1 test in 20.36 seconds** with `randomUUID`
  explicitly absent. Its old assertions now follow the current save text and
  two-step pairing dialog.
- Confirmed `work` reports application 0.2.0 on Darwin/arm64 and Scout's deployment
  is active with its native runtime running. Submitted one new read-only diagnostic
  through the actual insecure-HTTP browser; run
  `377fe6427ef6c71e1f9f35801c78655b07b7cf32921d34074f9ed7135b65dc81`
  succeeded on the pinned node and reported hostname `raj-13766`, Darwin, arm64.
  The existing `host status` turn was also successful: the agent interpreted it
  as a request for hosted app connector status. Its disconnected-app reply does
  not represent a deployment/model failure; the node's provider status reports
  existing connected accounts. No accounts or credentials were transferred.
- Live desktop/mobile connection-form checks show one chevron per field and no
  horizontal overflow. Screenshots: `/tmp/ara-private-http-node-chat.png` and
  `/tmp/ara-dropdowns-live-{desktop,mobile}.png`. Reload an existing dashboard tab
  to load the new host-served bundle; a node package update is unnecessary.

## 21 October 2026 — versioned node packages and dashboard updates

- Application, frontend metadata, CLI, MCP servers and Python distributions now
  report **0.2.0**. Python metadata derives its version from `ara_os.__version__`.
  Frozen dependency sync and Python wheel/source builds succeeded.
- Node update API/package/dashboard suite: **21 passed**. Coverage includes
  authenticated requests and receipts, immutable content identities, deterministic
  archives, checksum/member validation, traversal/link rejection, isolated setup,
  supervised activation/rollback, stale downgrade rejection and offline requests.
- Installed the actual archive with `uv sync --frozen --no-dev` in an isolated
  release directory. Candidate CLI reported `ara 0.2.0`; original native runtime
  paths were reused. An actual worker exited for update, restarted under the
  stable supervisor, wrote the matching build health record and completed its
  local receipt while retaining the test pairing file. This used an isolated
  state and unavailable loopback coordinator, not the real `work` identity.
- Release artifact: `dist/ara-node-0.2.0-a3f4aaf15d8b.tar.gz`, with adjacent
  SHA-256 file and JSON release descriptor. Full build identity:
  `a3f4aaf15d8bdcaeb48aa8c6833ffe8b1e029f431ce8ca6c9a5471e11c22a47c`.
  Archive SHA-256: `80053832308da18e5dee18f42f58ad794367521a7f6bc5e5dab1cb9fe497b066`.
- Production frontend build and live headless desktop/mobile checks succeeded.
  The live server reports 0.2.0/ready and serves the new Machines & sync controls.
  Screenshot: `/tmp/ara-node-updates-live.png`.
- `work` still has no version/update-protocol receipt. Its dashboard provides a
  one-time upgrade command using the private host address; the old worker must
  be stopped and that command run on the node. No upgrade or remote inference on
  the macOS node is claimed. Subsequent versioned workers support queued updates.
- Broader checks exposed and repaired one remaining package-qualified native
  journal import. Legacy import/replay fixtures now use the node-local instance
  registry, complete native policy and explicit existing ownership/receipt handshake.
- Final combined update, recovery, execution, launcher, runtime and dashboard
  regression run: **85 passed in 121.04 seconds**. The version authority check
  also verifies the frontend dependency lock metadata.

## 21 October 2026 — live host startup and attempted work-node deployment

- Started the existing PostgreSQL container and ARA server using the saved
  `0.0.0.0:8787` binding. Health confirms application/database ready. Local dashboard:
  `http://127.0.0.1:8787`; private Tailscale address: `http://100.121.113.13:8787`.
- Submitted one tool-free Ara turn using its existing native connection. Run
  `6d6931c04a1f2e9399f6509b35f871c010c3e9ec739cb1a3285f1764e30be919`
  completed with `ARA_HOST_OK`. Native runtime status subsequently reports running.
- Fixed three failures exposed by live APIs: native profile helpers depended on
  absent PyYAML rather than Hermes's YAML interface; legacy null configuration
  broke preferences; launching the native worker put `ara_os/mcp.py` ahead of the
  MCP SDK. The worker now imports ARA helpers through their package namespace.
  Native setup verification includes the shared helpers. Profile publication,
  asset listing (62 entries) and preference reads then succeeded.
- Published Ara definition
  `680a93cb517737eae0d2c3f9ac01de77e56e778e461d70c4a97c67c9b2076df5`
  and requested deployment to paired node `work`. Its last recorded heartbeat
  remains **20 October 2026, 12:17:28 UTC**; deployment is **pending**, with no
  node confirmation. Remote runtime checks return `node_upgrade_required`.
  `work` does not resolve as an SSH hostname. Remote inference, settings, sync,
  recovery and computer control could not be exercised without a reachable node.
- The installed Linux driver passes its diagnostic checks. After the import fix,
  an actual screenshot of an isolated X11 Chrome test window succeeded at
  **988 × 751**. The ordinary Wayland target returned no image; native Wayland
  support remains opt-in. Physical text input reached the driver but returned
  `background_unavailable`, requiring an explicitly approved foreground mode
  that ARA currently does not expose. The test textarea stayed empty, including
  after replay of the same refused operation. The temporary browser was closed;
  the server remains running.
- Final focused run: **68 passed in 14.51 seconds** across runtime integration,
  browser surfaces, computer policy, fake native driver transport and disconnect
  outcome tests. Five cases invoke profile helpers in the actual pinned Hermes
  environment, and another checks that the worker cannot shadow the MCP SDK.
  Python compilation and whitespace checks passed. The existing Starlette/HTTPX
  deprecation warning remains. This is not a successful remote-deployment claim
  or a certification of general desktop input.

## 21 October 2026 — runtime, deployment and desktop integration repairs

- Missing native operation results now fail explicitly; native error codes and
  recovery actions survive the bridge. Native startup/discovery failures retain
  their reason and detail instead of becoming `installed`. Explicitly unserved
  multiplexed profiles can confirm stopped state.
- Remote chat readiness requires an online node and a running, acknowledged
  instance with a selected model. Deployment cards distinguish assignment,
  installation and runtime state, show native diagnostics, and offer instance-
  scoped **Check runtime** and **Start runtime** commands. Malformed local config
  reports an error without breaking the deployment directory. Model selection
  does not certify credentials or successful inference.
- Local screenshot responses now expose observation IDs. Dashboard clicks, text,
  keys and scrolling bind to the displayed observation; stale observations are
  refused. Stable operator operation IDs retain receipts for local replay.
  Existing clients omitting observation/operation IDs retain legacy behavior.
  Node setup instructions are shown for remote desktops.
- Targeted regression command:
  `.venv/bin/pytest -q tests/test_runtime_integration.py tests/test_runtime_surfaces.py tests/test_cua.py tests/test_native_computer.py`:
  **61 passed in 13.70 seconds**. The existing Starlette/HTTPX deprecation warning
  remains. Production TypeScript/Vite build, Python compilation and whitespace
  checks passed. Browser checks use intercepted APIs and synthetic screenshots;
  native adapter tests use fake driver transports. Updated the older local-only
  HTTP/MCP test fixtures to account for deployment lookup and node discovery.
- No full-suite run, real node deployment, paid inference, service installation
  or physical desktop input was performed. The live acceptance gates below
  remain open. Host and node need the updated code for remote lifecycle commands.

Remaining integration work includes explicit access to host datasets and
specialist delegation from deployed nodes: the installed `ara-node` MCP server
currently exposes local swarms and computer tools. Definition publication also
excludes MCP connections. This repair pass does not establish host/node feature
parity or certify the multi-machine runtime design.

## 20 October 2026 — node-owned native runtime implementation

- Added local instance identities and ownership epochs, node-only creation,
  standalone lifecycle and Linux service commands, and persisted coordinator mode.
- Normal chat and native settings use the selected node through an encrypted
  command inbox and ordered event outbox. Conversations retain their owner;
  observer recovery reads receipts without resubmitting admitted prompts.
- Added actual-file definition publication, local overlay/conflict handling,
  reviewed application, explicit adoption and coherent remote profile export.
- Python compilation, the TypeScript/Vite production build and `git diff --check`
  passed. No test suite, paid inference, remote deployment, service installation
  or physical desktop checks were run for these additions. The delivery gates
  in `NODE-AGENT-RUNTIME-FIX-PLAN.md` remain outstanding live acceptance checks.
- The local dashboard service was stopped with no pending runs or swarms. It
  was started on the existing configured address; health reports database and
  application ready, and the active browser receives dashboard responses.

Current-instance validation on x86 Linux; browser timezone Asia/Kolkata. This is not a live deployment or a fresh cloud-machine restoration claim.

## 20 October 2026 — deployments on multiple machines

- Added per-agent deployment management, node selection and bulk deploy/undeploy,
  a machine/agent directory, default execution selection and per-run machine choice.
- Desired assignments are separate from node-confirmed state. Generation-bound
  receipts cannot confirm superseded requests; disabled assignments remain as
  tombstones until nodes acknowledge them. Undeploy cancels managed work and
  blocks new admission without deleting node data or unpairing other agents.
- Node reconciliation writes persistent disable markers, preserves existing
  model/tool configuration, disables removed managed bindings and refreshes
  authority after provisioning. Host and standalone computer tools recheck
  deployment authority; MCP can select among enabled machines and granted desktops.
- Production TypeScript/Vite build, Python compilation and whitespace checks
  passed. No tests or live multi-node deployment exercises were run for this
  change. Earlier regression results below do not cover this implementation.

## 20 October 2026 — remote node desktop implementation

- Added authenticated node desktop command polling alongside continuous swarm
  work, node-local remote access opt-in, current placement/grant enforcement,
  stable input receipts and node-local supervised decisions.
- System Control selects host or node desktops, clears observations when
  switching, and supplies the displayed screenshot's observation identity on
  remote clicks. Host resume cannot clear a node-local emergency stop.
- Remote input expiry, admission epoch checks and link-loss cancellation prevent
  queued input from surviving an expired command or disconnected session. Lost
  result delivery is recovered by reading the original receipt.
- Production TypeScript/Vite build and Python compilation passed. No new tests
  were added or run for this implementation. Earlier regression counts below
  apply to the earlier local desktop/swarm fixes, not this remote transport.
- Real node desktop capture/input, distributed reconnect behavior and OS driver
  permissions have not been exercised. Remote access remains disabled until
  explicitly enabled on each node; see [setup](CUA_SYSTEM_CONTROL.md#remote-node-desktops).

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
