# ADR-0004: Soma Authority Model and Module Key Derivation

Status: Accepted  
Date: 2026-03-10  
Owners: Platform Architecture / Sprint 4

## Context
Two unresolved architecture decisions were blocking conformance:
1. Whether Soma should be fully merged into Titan or remain sovereign.
2. Whether vault encryption should continue using a shared master key or derive per-module keys.

## Decision
1. Soma remains a sovereign authority for medical profile logic and data ownership, with shared UI embedding in Titan as the default UX.
2. Vault encryption will migrate to deterministic per-module derived keys from the unlocked master key.

## Consequences
Positive:
- Preserves medical-domain separation and reduces accidental cross-domain mutation.
- Improves security boundaries and supports future per-module revocation.
- Keeps current UX continuity while tightening architecture.

Tradeoffs:
- Adds migration complexity for existing encrypted records.
- Requires strict module identity stability in route+manifest contracts.

## Implementation Notes
- No direct `llm-engine` internal coupling changes are required by this ADR.
- Module key derivation rollout should be feature-flagged.
- Encryption metadata must carry key-version/module markers for compatibility.

## Follow-up Work
- Implement module-key derivation in `VaultProvider.getModuleKey`.
- Add read/write compatibility path for old master-key-encrypted records.
- Add conformance tests for module-key segregation and fallback behavior.

