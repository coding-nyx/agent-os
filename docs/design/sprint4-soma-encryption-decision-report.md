# Sprint 4 Decision Report: Soma Identity + Vault Key Model

Date: March 10, 2026  
Scope: Item 2 + Item 4 discussion outcomes for Sprint 4

## Decision 1: Soma Identity
Decision: Keep Soma as a sovereign data domain and runtime authority, while preserving shared UX embedding inside Titan by default.

Rationale:
- Current code already treats Soma data as a distinct persistence authority (`soma_profiles`).
- Shared UI inside Titan minimizes user friction for daily use.
- A hard merge into Titan increases risk of boundary erosion for medical logic and clearance handling.

Implementation direction:
- Keep `soma` in module contracts for data authority and action ownership.
- Keep `/soma` behavior intentionally mapped to Titan’s medical surface unless a standalone route is explicitly restored later.
- Preserve Titan->Soma dependency through explicit ActionHub/service contracts instead of implicit cross-module writes.

## Decision 2: Vault Key Strategy
Decision: Move from single master-key reuse to deterministic per-module derived keys in a staged migration.

Rationale:
- Current implementation uses one master key for all modules, which weakens least-privilege segmentation.
- Per-module derivation is required for future revocation and bounded decryption scopes.

Implementation direction:
- Add deterministic derivation in VaultProvider:
  - `moduleKey = HKDF(masterKey, moduleId)` (or equivalent WebCrypto-safe derivation).
- Keep master key in-memory only; derive module keys on-demand and cache ephemeral handles.
- Migrate encrypted payload writes opportunistically:
  - New writes use module-derived keys.
  - Existing records re-encrypt during normal read/write cycles (no forced blocking migration).

## Risks and Mitigations
- Risk: Mixed encrypted data during migration.
  - Mitigation: Version-tag encrypted envelopes and implement dual-read fallback.
- Risk: Increased decrypt failures if module ID mapping drifts.
  - Mitigation: Centralize module identity in manifest + route truth checks.

## Rollback
- Keep a feature flag for module-key derivation.
- If rollback needed, disable derivation and continue master-key reads/writes while preserving data compatibility.

