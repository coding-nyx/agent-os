# Production audit — 21 October 2026

## Fixed in this working tree

- Node deployment now has an explicit versioned update path, staged package
  verification, rollback on failed activation, visible update receipts and safe
  cancellation only before delivery. The public `ara` command survives release
  switches and preserves its original state directory and native runtime paths.
- Setup now installs the command on PATH. Hermes profile export/import is
  available from the CLI, with scrubbed export files, archive checks, preview,
  and credentials/channels/schedules left inactive. Dashboard profile export
  has a verified artifact endpoint.
- System Control distinguishes the actual machine platform from the desktop
  adapter, detects existing CUA installs, offers setup and permission prompts
  on macOS, and keeps a permission request separate from a verified grant.
- Chat handles browsers without `crypto.randomUUID`, supports safe Markdown,
  tables and copyable code, reports initial-load failures, respects IME input,
  and makes operation failures visible. Stale native conflicts keep their
  useful HTTP status. Agent copies preserve native preferences.
- Update requests can be cancelled only while queued and undelivered. Health
  reports the actual network exposure state. macOS now has a per-user launchd
  service path; Linux retains systemd user services.
- Sidebar scrolling, select arrows/layout, contrast, keyboard focus, reduced
  motion and long Activity-row text have been repaired.
- Health now respects the actual explicit loopback bind, and attempts to read
  private native paths such as `.env` return a permission refusal.

## Verified

- `npm run build` succeeds. The formatter is split into a lazy-loaded chunk.
- The latest live loopback browser pass covered Overview, Agents, Data library,
  System Control, Connections, Machines & sync, Activity and Settings at
  1440×1000 and 390×844. Axe reported no WCAG 2.1 A/AA violations; there was no
  horizontal overflow or uncaught browser exception. The long Activity input
  case was included and now truncates inside its row.
- A separate pass across all 13 agent detail tabs also reports no axe
  violations, alerts, or desktop/mobile horizontal overflow.
- Mocked launchd tests verify LaunchAgent contents, file permissions, lifecycle
  and refusal handling. They do not replace testing on a real macOS login
  session.
- The rebuilt 0.2.3 node archive downloaded from the local host and matched its
  advertised SHA-256. Its embedded release identity and macOS service code were
  checked.
- Python verification finished with **212 passed, 1 warning**. The frontend
  production build succeeds, and `git diff --check` is clean.
- The node service and the native preference-copy regression tests pass.

## Still problematic / rollout blockers

1. **The dashboard has no operator authentication.** The HTTP boundary checks
   Host and, for some writes, Origin. Those checks are not identity or
   authorization. Most profile, deployment, storage and node-management API
   operations are reachable without an operator session. The pairing endpoint
   also returns a node key, and the generated bootstrap command puts that key
   in a query string. Do not expose the server to a shared LAN or tailnet until
   access is restricted to a trusted single operator or a real auth layer is
   added. The current UI/API still labels the product a single-user prototype.
2. **The connected Mac node is offline, and the audit host is loopback-only.**
   Its 0.2.3 update is queued but cannot be delivered yet. Deployment, CUA
   permissions, Hermes runtime readiness, launchd startup and post-update
   recovery could not be exercised on that machine. Linux mocks and the
   host-side UI cannot prove those Mac behaviors.
3. **Profile portability is not a complete dashboard flow.** Export can be
   downloaded, but import and preview still require the CLI. Remote import
   needs a node-owned upload/staging route so an archive reaches the selected
   machine without landing on the wrong host.
4. **Account states are easy to misread across owners.** Hermes model
   credentials belong to a native profile on one machine; hosted application
   integrations are a separate surface. The dashboard should explain both
   ownership and the actual account checked when it says “disconnected”.
5. **Small text remains common.** Automated contrast checks now pass on the
   audited views, but many secondary labels are 8–10 px. That remains hard to
   read on high-density displays and at browser zoom.

## Product decisions to make

- Choose the supported network security model: built-in operator accounts, or
  explicitly supported private access through an authenticated reverse proxy /
  tailnet ACL. Until chosen, loopback-only is the safe deployment default.
- Decide whether profile import belongs in the dashboard for local nodes only
  or for remote nodes too. Remote import needs an upload, preview, target-node
  confirmation and explicit apply step.
- Pick a dark-theme direction (system-following, manual toggle, or both). The
  current dashboard has no dark theme.
- Decide whether releases should be signed independently of the serving host.
  Current archive hashes detect corruption against the host-published manifest;
  they do not establish an independent publisher identity.
