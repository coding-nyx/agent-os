# Node releases and updates

ARA uses a semantic application version plus a SHA-256 content build identity.
The runtime revision and update protocol are independent compatibility fields.
Two working builds of the same application version are distinct updates. A node
running a newer semantic release cannot be downgraded by the coordinator.

`ara_os.__version__` is the Python packaging authority. `pyproject.toml` derives
its wheel version from that value. Compatibility and frontend package metadata
must use the same release version; the dashboard displays the running server's
version. The current release is **0.2.3**.

## Dashboard

Open **Machines & sync → Node software** on a paired node. The card shows the
installed version/build separately from the release available on the host.
**Update node** saves an explicit request for that exact build. Offline requests
stay queued. Progress is acknowledged by the node; a queued request is not an
installation claim. Completion requires the new worker to report the requested
build under the original node identity.

**Cancel queued update** is available only before the request has reached the
worker. Once delivered, wait for the result. This avoids pretending to cancel
an installation that may already be running. Cancel an undelivered old request
before selecting a newer host release.

Fresh bootstrap verifies the pinned installer and package before extraction.
Repeating it on a paired installation uses the staged updater; it does not
overwrite the existing source tree. Stop the old worker before repeating
bootstrap. Nonempty unpaired installations are preserved for explicit pairing.

An older worker cannot execute an update protocol it does not contain. For a
legacy node, select **Copy upgrade command**, stop its old worker and run that
command on the node once. The command fetches a checksum-verified installer and
uses the existing enrollment. The default project directory is `~/ara/agent-os`;
set `ARA_NODE_DIR` to the repository parent or `ARA_STATE_DIR` for a custom state
root. Subsequent updates are initiated from the dashboard.

## Package contract

`ara package --output ./dist` writes a versioned `.tar.gz`, checksum file and release descriptor.
The dashboard also provides the package, checksum and release notes.

The package is built from an allowlist of application source, dependency lock,
compatibility metadata, setup scripts and selected documentation. It includes
an embedded file manifest, fixed archive timestamps and per-file hashes/modes.
Native profiles, enrollment files, credentials, journals, runtime environments,
node modules and arbitrary workspace files are excluded. The legacy bootstrap
bundle endpoint serves the same release artifact.

Nodes download only from their enrolled coordinator and refuse redirected
package downloads. They check archive size/hash, manifest identity, each member
hash, duplicate paths, traversal and links before writing payload files.
Checksums establish consistency with the chosen coordinator artifact; they are
not signatures from an independent publisher. Use a trusted coordinator link
such as the configured private Tailscale network or HTTPS.

## Staging, restart and recovery

Each build is prepared under `STATE/node-releases/BUILD/agent-os`, with its own
application environment installed from the frozen lockfile. When the Hermes pin
changes, its runtime is prepared there too. An unchanged native runtime is
reused. Setup failure retains the running release and a private `install.log`.
Updates require `uv` and access to the dependencies needed for that release.

After checks pass, new managed work is held while existing managed native turns,
swarms and desktop commands finish. Control/cancellation and durable outbox
traffic continue. The supervisor then restarts the control worker from the new
release, preserving the original state root and shared native runtime paths.
This is a control-plane restart; standalone native sessions retain their own
Hermes lifecycle and ownership semantics.

The stable supervisor holds one worker lock per state directory. A new worker
must publish its build/PID health record within 60 seconds. A failed boot restores
the previous active pointer and starts that release. Health here certifies the
updated control worker started, not that inference or physical desktop input
succeeded. Subsequent application/runtime errors remain visible separately.

Do not delete the original installation or retained releases while their
supervisor/native runtime is in use. `ara node status` shows the application,
active release and latest update receipt without requiring PostgreSQL.
