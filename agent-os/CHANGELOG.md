# Release notes

## 0.2.3 — 21 October 2026

- macOS nodes can install, inspect and remove a per-user launchd service. It
  starts at graphical login; Linux systemd service behavior is unchanged.
- The dashboard's eight main views pass the current desktop/mobile axe sweep.
  Long Activity prompts now truncate inside their rows without painting over
  adjacent controls.
- System Control placeholder copy and destructive node actions meet text
  contrast checks.
- Health follows an explicit loopback bind even if the saved network preference
  is exposed. Private and unsupported native assets return a clear not-editable
  status instead of looking like malformed paths.

## 0.2.2 — 21 October 2026

- Conversation replies render Markdown, tables, fenced code and safe links.
  Code blocks can be copied. The formatter loads only when a reply is shown.
- Copy controls work on private HTTP dashboards and report browser failures.
  Keyboard composition no longer submits unfinished IME text; chat loading
  errors are visible. Dialog names, focus indicators and reduced motion improve
  keyboard and assistive technology support. Muted dashboard text is darker.
- Setup installs an installation-bound `ara` command and adds its directory to
  shell startup files. It selects the activated release while retaining the
  original state and shared native runtime paths. Foreign commands are preserved.
- Repeated bootstrap preserves paired installations and uses the staged updater.
  Fresh bootstrap verifies the pinned installer, archive and file manifest before
  extraction. Invalid profile names are rejected before generating shell code.
- `ara export PROFILE --output FILE` creates a private, scrubbed native profile
  archive without a host database. Existing files are never replaced. Import and
  sync accept the same underscore-containing native names as node initialization.
- Undelivered queued node updates can be cancelled in Machines & sync. Requests
  that may already have reached the worker are retained until their outcome.
- Health reports network exposure instead of always claiming localhost-only.
- Native validation and stale-file conflicts retain their 400/403/409 status
  across the Hermes worker boundary. Instance copies use the selected native
  preferences and refuse an identity that changes while the copy is captured.

## 0.2.1 — 21 October 2026

- System Control guides setup on the selected machine, checks existing drivers
  and macOS permissions, and can request the native permission dialogs there.
  A request is distinct from a verified Screen Recording/Accessibility grant.
- Explicit operator controls configure remote observation/input, control mode
  and assigned-agent grants. Local emergency stops remain in force. Setup checks
  and permission requests work before remote observation has been enabled.
- Node-local MCP tools preserve the shared Hermes runtime paths after a package
  update, and existing deployments refresh that configuration without rewriting
  it on unchanged polls. Driver discovery reuses existing PATH/app/Hermes installs.
- Failed desktop discovery preserves the actual platform and reports unknown
  installation status. Worker status refreshes after setup and periodically.
- Dashboard selects keep their labels and arrows within the layout. Operation
  IDs work on private HTTP addresses without the secure-context randomUUID API.
- The node package includes computer-control setup instructions.

## 0.2.0 — 21 October 2026

- Machines & sync shows the installed node version/build, the available host
  release, update progress, release notes and a downloadable package.
- Modern paired workers accept explicit dashboard update requests, including
  requests queued while offline. Updates verify archive/file hashes, prepare a
  separate application environment and wait for managed work to finish.
- A portable worker supervisor activates prepared releases and restores the
  previous release when a new worker fails its startup check. Pairing, native
  profiles, credentials, journals and grants remain in the existing state root.
- Legacy workers have a one-time installer command in the dashboard. Linux and
  macOS workers gain the same update protocol. Existing Linux services use it
  through `ara node daemon`; foreground workers use `ara node work`.
- `ara --version` and `ara package --output DIRECTORY` expose the semantic
  application version and reproducible, checksummed node archives. The Python
  package version comes from `ara_os.__version__`. The Hermes revision remains
  separately pinned in `compatibility.lock.json`.
- Repairs to native helper YAML imports, MCP package shadowing and legacy null
  preferences address failures found during live host integration checks.

## 0.1.0

Initial local agent/data dashboard, native Hermes integration and node execution.
