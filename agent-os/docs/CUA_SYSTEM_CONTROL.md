# Native computer control

ARA-managed computer control uses the pinned native computer-use adapter and
cua-driver. The older Linux/macOS/Android provider source files remain in the
tree but are not registered or routed by the managed engine.
No driver, missing permissions, unsupported actions and failed captures report
unavailability; they do not return successful placeholders.

## Setup and authorization

`ara setup --computer-control` explicitly invokes the native driver installer.
Ordinary setup checks driver presence without capturing a screen or enabling
computer access. Presence is not proof of live readiness; native
`hermes computer-use status` and `hermes computer-use doctor` provide further
diagnostics. Doctor/capture checks may observe the desktop: run them deliberately.

Desktop policy is separate from model setup and dataset capabilities. It defaults
to view-only mode with no agent grants. System Control can explicitly grant an
agent observation or observation plus input, and select:

- View only: backend rejects inputs, including operator clicks.
- Supervised: agent inputs become single-use operator approvals.
- Autonomous: explicitly granted agents may issue supported inputs; native hard
  safety checks remain in force.

Agent input requires a stable `operation_id`. Repeated IDs return the receipt
instead of repeating an OS action; changed payloads conflict. Agents must first
capture a fresh target window. Observation is actor-scoped and expires after
15 seconds. Approval consumption and operation receipts are saved locally.
Authorization, approval requirements and freshness are checked after acquiring
the device lock. Revoked queued reads do not reach the provider; policy changes
during reads discard their results. A mode change while input waits cannot
bypass supervised approval. Policy changes invalidate pending approvals.

Captures create an opaque, actor-bound observation reference in protected local
state. The pinned adapter records the desktop, process creation identity, exact
window ID/title and image dimensions. Each input process validates that reference,
captures that exact target and invokes native safety dispatch on the same backend.
Another foreground window cannot redirect the input. Missing/replaced targets,
changed dimensions, expired observations, policy changes and capture-owner restarts
require a fresh capture. Window identity is limited to what the OS/driver exposes;
this does not establish semantic continuity of the contents inside a window.

Coordinates are relative to the observed window image, including its reported
pixel dimensions, and clamp to valid image edges. Window movement alone does not
change those relative coordinates. Unconfirmed native effects retain their
verification metadata and require inspection before another action. Target
validation does not use an auxiliary vision model. The native approval grant
covers one action in a unique temporary session; native hard blocks remain active.

OS scripting is not included in desktop grants. Use separately authorized
terminal tools. Swarm workers do not inherit computer control.

## Dashboard

The System Control surface starts observation only on explicit user action.
Frames are periodic native observations, not a claimed 30–60 FPS hardware stream.
Clicks map against the actual image bounds. Missing readiness and capture errors
remain visible.

Operator REST calls require a distinct bearer capability. Observation sockets
require that capability via WebSocket subprotocol and reject foreign browser
origins; sockets do not accept input commands. Screenshot responses use
`Cache-Control: no-store`. Agent MCP screenshots use native image content blocks,
not base64 embedded in text.

A cross-process device lock serializes operations; a short controller lease
prevents another agent taking over between inputs. The human operator can take
control. Policy/kill changes interrupt active managed transports and block new
inputs. An OS action already delivered cannot be undone; interrupted outcomes
are reported unknown and must be inspected before retrying.

These controls govern ARA-managed operations. They are not a machine-wide block
against unrelated software or independently launched native CLI control sessions.

## Standalone execution nodes

The same policy and native driver may run on an execution node without the host
web server or PostgreSQL:

```bash
ara cua configure --profile coding-agent --allow-view --allow-input --mode autonomous
ara cua mcp --profile coding-agent
```

Select autonomous mode deliberately. Supervised standalone work needs an available
local operator surface to consume approvals; it must not silently auto-approve
because the host dashboard is absent. Configure Hermes stdio MCP with the matching
`ara cua mcp --profile NAME` arguments and installation state directory.

Without a local web server, the human operator can run `ara cua approvals`, then
`ara cua approve APPROVAL_ID` or `ara cua reject APPROVAL_ID` from another terminal.
Input still requires a fresh observation and a matching grant. Consumed approvals
cannot be replayed; interrupted approval execution remains uncertain, not a retry.

## Remote node desktops

System Control includes a **Desktop** selector for the host and paired nodes.
Both the host and node must have the updated application code. Install the native
driver deliberately on the node, pair it as usual, then run on that node:

```bash
# Permit the paired dashboard to observe and send explicit operator inputs.
# Agent inputs still need their own grants and, in supervised mode, approval.
ara cua remote --allow-view --allow-input --mode supervised
ara node work
```

Keep the continuous worker running in the node's graphical login session with
its OS capture/accessibility permissions. `ara node work --once` exchanges swarm
tasks only; it does not serve desktops. Driver presence is reported separately
from a successful capture. Restart the worker after installing a driver.

For observation without remote input, use `ara cua remote --allow-view`. To revoke
all paired-host desktop access, run `ara cua remote` with no allow flags.
Enrollment alone grants no desktop access. The dashboard cannot enable remote
access or change the node's modes and native-profile grants.

To give a host-managed profile computer tools on its assigned execution node,
configure that profile's execution placement on the host and grant its matching
**native name** on the node:

```bash
ara cua configure --profile coding-agent --allow-view --allow-input --mode supervised
```

The host MCP endpoint routes those computer calls to that node and never falls
back to the host desktop. The node checks current enabled placement bindings,
native-profile grants and mode. Native standalone stdio MCP continues to operate
locally. Swarm children still do not inherit desktop tools or permissions.

Remote screenshots include `metadata.observation_id`. Agent input must send that
ID with its stable `operation_id`; the dashboard supplies both for operator
clicks. The node binds the input to that actor's actual captured window and the
15-second observation lifetime. Switching desktops clears the dashboard frame,
tree and approvals, and discards late responses from the previous selection.

Remote supervised approvals appear on the selected node's dashboard panel. They
remain single-use, node-local receipts; stale observations and changed policy
still require a new capture and request. A repeated agent operation retrieves
the final approval receipt without executing the input again.

Desktop commands use separate authenticated pull polling alongside swarm work,
so snapshot uploads and native swarm execution do not block the desktop loop.
Commands expire after 15 seconds, execution is bounded to 12 seconds, and a node
reports offline after 12 seconds without a desktop heartbeat. Link failure pauses
remote input and cancels outstanding work. Reconnects and host restarts do not
extend input deadlines. Durable input admissions prevent replay after node
restarts; an uncertain action stays unknown. Reusing an operation ID retrieves
the receipt instead of admitting another input.

The dashboard stop flag is separate from the node's emergency kill switch.
Resuming from the host cannot clear a local stop. Stop propagation follows the
node polling interval and link timeout; it is not an instantaneous OS-wide stop.
Already delivered actions cannot be undone. Policy and authority are rechecked
after the device lock, including command expiry and admission epoch.

Image payloads stay out of durable command receipts and application history.
Host frame caching is limited to four frames, each result at most 12 MB, expiring
after 30 seconds. Observation commands and accessibility results are removed from
the host transport queue after about one minute; input receipts remain durable.
Screenshots are periodic observations, not hardware video streaming. No capture
starts merely from listing or selecting a device.

Android, iOS and additional device providers need separately validated
implementations. Actual node desktop operation, macOS permission grants and
third-party driver behavior require explicit hardware validation.
