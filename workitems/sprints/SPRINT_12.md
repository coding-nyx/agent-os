# SPRINT 12 — Vault Redesign: Global Gate + Encryption Foundation

**Status:** COMPLETED  
**Objective:** Redesign the vault from a per-module rendering concern into a global, route-level authentication gate. Eliminate 34 scattered encrypt/decrypt calls with a generic EncryptedProfileService wrapper. Make vault optional (unencrypted mode). Add vault controls to profile popover.

**Follows from:** Sprint 10 (Platform Core), Sprint 11 (Ledger Sprint 2). Informed by arch/PM/design debate (March 2026).

---

## Background

Current state:
- Vault is per-module: each module independently checks `isModuleAccessible()` — or doesn't (Orchestrator/Forge have no vault check at all)
- 34 `encryptWithKey`/`decryptWithKey` calls scattered across 11 services — no centralized wrapper
- Vault lock → modules show **onboarding** instead of locked shell (root bug)
- No vault controls in profile popover; lock/unlock requires navigating to Profile > Security
- `SoulTerminationService` exists but has no UI trigger

New model:
- Single global gate: `ProtectedRoute` redirects to `/vault-gate` when `hasVault && !isUnlocked`
- `AppVaultGate` full-screen unlock component at `/vault-gate` route
- Optional vault: `hasVault=false` skips all gates; one-time nudge post-onboarding
- `VaultPopoverPanel` in profile popover: inline unlock, lock button, status, persistence toggle
- Per-module `securityPolicy` retained as UI metadata only (not enforcement)

---

## Items

### S12-001 — EncryptedProfileService Generic Wrapper (P0)
**Goal:** Eliminate code duplication across 11 services. Create a generic factory that any module uses for load/save/subscribe/syncGuest without writing encrypt/decrypt boilerplate.

**Files:**
- NEW `src/lib/services/encrypted-profile-service.ts` — `createEncryptedProfileService<TProfile>()` factory
- NEW `src/lib/types/encrypted-document.ts` — shared `EncryptedDocument<TMetadata>` interface + `payloadMode` field
- MIGRATE `src/modules/titan/services/titan-profile-service.ts` — reference migration using new wrapper

**Spec:**
- `payloadMode: "encrypted" | "plaintext"` field in schema (absent → inferred "encrypted" for backwards compat)
- `key=null` → writes `payloadMode: "plaintext"`, skips encryption
- `key!=null` → writes `payloadMode: "encrypted"`, full AES-GCM

---

### S12-002 — BUG-001: UnifiedModulePage Vault Check (P0 hotfix)
**Goal:** Insert vault accessibility check BEFORE onboarding render in `UnifiedModulePage`. Vault locked + null profile should show `VaultLockedShell`, not onboarding.

**Files:**
- `src/core/components/UnifiedModulePage.tsx`

**Gate order after fix:** Loading → VaultLocked → Guest → Onboarding → Content

---

### S12-003 — BUG-002+004: ProtectedRoute + isHandshaking (P0)
**Goal:** Route-level vault gate. `ProtectedRoute` redirects locked vault users to `/vault-gate`. Fix `isHandshaking` race condition that causes gate flash during SESSION auto-unlock.

**Files:**
- `src/core/routing/ProtectedRoute.tsx` (or wherever ProtectedRoute lives)
- `src/lib/vault-context.tsx`

**Changes:**
- `ProtectedRoute`: if `!isGuest && hasVault && !isUnlocked && !isHandshaking` → `<Navigate to="/vault-gate?returnTo=..." replace />`
- `vault-context.tsx`: initialize `isHandshaking = true` synchronously when `persistenceMode !== 'STRICT'` && `nexus_vault_session` exists

---

### S12-004 — AppVaultGate Component + Route (P1)
**Goal:** Full-screen unlock screen. NEXUS wordmark, lock icon with ping animation, password input, persistence toggle. `/vault-gate` route registered outside ProtectedRoute.

**Files:**
- NEW `src/core/components/AppVaultGate.tsx`
- `src/App.tsx` — register `/vault-gate` outside ProtectedRoute

**VaultContext additions:**
- `isVaultGateVisible: boolean` — derived: `hasVault && !isUnlocked && !isHandshaking`
- `vaultSetupNudgeSeen: boolean` — localStorage `nexus_vault_nudge_seen`
- `dismissVaultSetupNudge(): void`
- `initializeVault(): void` — triggers `UnifiedAuthModal` in `VAULT_HANDSHAKE` mode

**Design:** Dark glassmorphism, radial gradient bg, ping ring lock icon, inline error on wrong password (shake animation + rose border), success: gate fades out + blur exit.

---

### S12-005 — VaultSetupNudge Modal (P1)
**Goal:** One-time post-onboarding modal for users without a vault. "Secure my data" or "Skip for now".

**Files:**
- NEW `src/core/components/VaultSetupNudge.tsx`
- `src/modules/orchestrator/OrchestratorPage.tsx` — trigger when `!hasVault && !vaultSetupNudgeSeen && !isGuest`

---

### S12-006 — VaultPopoverPanel + SystemCommandCenter (P1)
**Goal:** Inline vault controls in profile popover. 3-state: no vault / locked / unlocked. Lock button triggers immediate redirect to `/vault-gate`. Inline unlock (no modal launch).

**Files:**
- NEW `src/core/components/VaultPopoverPanel.tsx`
- `src/core/components/SystemCommandCenter.tsx`

**3 states:**
- No vault: amber UNENCRYPTED pill + "Initialize Vault" CTA row
- Locked: red LOCKED pill + inline password input + Unlock button
- Unlocked: emerald SECURED pill + "Lock vault" button + SESSION/STRICT inline toggle

---

### S12-007 — SecurityPanel Cleanup + SoulTermination UI + VAULT.md (P2)
**Goal:** Remove per-module vault toggles (deprecated). Add "Destroy Neural Soul" trigger. Write canonical VAULT.md doc.

**Files:**
- `src/modules/profile/components/SecurityPanel.tsx` — remove module lock toggles; keep Export Data; add Soul Termination CTA
- NEW `src/docs/VAULT.md` — full spec: gate model, state machine, schema, EncryptedProfileService API, SoulTermination flow, phase 2 roadmap

---

## Dependencies
```
S12-001 (wrapper) ──┬──▶ S12-002 (bug001)
                    └──▶ S12-003 (bug002+004)
                              └──▶ S12-004 (gate + route)
                                        ├──▶ S12-005 (nudge)
                                        └──▶ S12-006 (popover)
                                                  └──▶ S12-007 (cleanup)
```

## Done Definition
- [x] No authenticated route renders content when `hasVault=true` and `isUnlocked=false`
- [x] `/vault-gate` shows `AppVaultGate`; unlocking redirects to `returnTo`
- [x] Guest users never redirected to `/vault-gate`
- [x] `hasVault=false` users access all routes with no gate; one-time nudge appears
- [x] Profile popover shows correct vault state + inline unlock/lock works
- [x] `createEncryptedProfileService` used for Titan profile as reference migration
- [x] Titan module no longer falls through to onboarding when vault is locked
- [x] `npm run build` passes
