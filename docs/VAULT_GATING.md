## Vault-Gated Data Surfaces

This project separates **vault-protected** records (must be encrypted with the user-held vault key) from **casual / pre-vault** surfaces (safe to browse without unlocking). The main rules:

- **Requires vault unlock + client-side encryption**
  - `module_memory/{uid}_{moduleId}` — episodic history, snapshots. Payload is written to `encryptedPayload` with AES-GCM and tagged via `metadata.vault.{encrypted,eventCount,updatedAt,salt}`. Plaintext `eventHistory`/`latestSnapshot` are cleared when a key is available.
  - Module profile stores (e.g., `agnes_profiles`, `atlas_profiles`, `ledger_profiles`, `titan_profiles`, `scout_profiles`, `documents_profiles`) — already E2EE with vault salt markers.
  - Dynamic field values (`extension_field_values`) — encrypted per module key when vault is open.
  - Data export/import — protected exports use the vault key; encrypted module memory is exported with both metadata and encrypted sessionHistory.

- **Live-but-not-vaulted (operational)**
  - `active_sessions/{uid}_{moduleId}[_{sessionId}]` — mirrors the in-flight chat buffer for cross-tab sync. Does not contain consolidated history and remains plaintext to keep live UX stable.
  - Orchestrator/hub shell metadata (module health, NSV summaries) — reads only non-sensitive metadata and never attempts to decrypt vault-locked payloads.

- **Casual browsing allowed**
  - Hub/Orchestrator pages, guest mode entry, and module landing shells can render without a vault key. When a collection is vault-protected and still locked, APIs return empty payloads plus `metadata.vaultLocked` to avoid accidental plaintext writes.

**Trauma / episodic writes**: Modules with `securityPolicy.defaultLocked` or `mandatory` (e.g., Agnes, Atlas, Ledger, Scout, Documents) refuse episodic writes unless a vault key is present. Non-sensitive modules (Orchestrator, Forge, Titan) may persist plaintext, but will encrypt if a key is provided.
