# Vault Shell Assessment

**Task:** GAP-07 — Audit vault 3-state shell system  
**Spec Reference:** Product spec §8  
**Date:** 2025-07  
**Auditor:** Senior Engineer pass

---

## Spec Requirement

Product spec §8 mandates three distinct vault states:

```
Logged Out  →  Logged In (vault locked)  →  Logged In (vault unlocked)
```

When **vault locked**, vault-gated modules must show a **shell**:
- Non-sensitive metadata (module name, last active timestamp, goal/item counts)
- "Unlock your vault to continue" prompt/button
- **NO** attempt to decrypt or render any sensitive data

---

## Module-by-Module Assessment (Before Fixes)

### Agnes — `src/modules/agnes/AgnesPage.tsx` + `AgnesDashboard.tsx`

**Pattern:** `AgnesPage.tsx` uses `isModuleAccessible('agnes')` → passes `isAccessible` as a prop. The page renders a locked card when `!isAccessible`, showing a "Unlock vault to access encrypted neural sessions" message **inline** within the session-selection UI (not a hard blank wall).

**AgnesDashboard.tsx** has a separate `isLocked` early return → bare `EmptyState("Vault locked", "Unlock Agnes to view emotional telemetry.")`.

**Status:** ⚠️ Partial — Agnes has inline locked-state messaging in the session picker, but `AgnesDashboard` falls back to a bare EmptyState with no shell metadata. The session-picker pattern is actually the best existing pattern in the codebase.

---

### Atlas — `src/modules/atlas/components/AtlasDashboard.tsx`

**Pattern (before fix):** `isLocked` → bare `EmptyState("Vault locked", "Unlock Atlas to view cognitive telemetry.")`. No shell metadata. Complete blank wall.

**Status (before fix):** ❌ Blocks entirely — no shell data shown.

**Status (after fix):** ✅ **Fixed** — replaced with `VaultLockedShell` showing module identity, description, and combined goals+habits item count (if profile metadata available). See implementation in `src/core/components/VaultLockedShell.tsx`.

---

### Ledger — `src/modules/ledger/components/LedgerDashboard.tsx`

**Pattern (before fix):** `isLocked` → bare `EmptyState("Vault locked", "Unlock Ledger to view financial telemetry.")`. No shell metadata.

**Status (before fix):** ❌ Blocks entirely — no shell data shown.

**Status (after fix):** ✅ **Fixed** — replaced with `VaultLockedShell` showing module identity, description, and combined plans+savings goals item count. See implementation.

---

### Scout — `src/modules/scout/components/ScoutDashboard.tsx`

**Pattern:** `isLocked` → bare `EmptyState("Vault locked", "Unlock Scout to view research telemetry.")`.

**Status:** ❌ Blocks entirely — no shell data shown.

**Recommendation:** Replace with `VaultLockedShell` using `moduleName="Scout"`, `accentClassName="text-lime-400"`, and optionally `itemCount` for knowledge article count from unencrypted metadata.

---

### Forge — `src/modules/forge/components/ForgeDashboard.tsx`

**Pattern:** `isLocked` → bare `EmptyState("Vault locked", "Unlock Forge to view runtime telemetry.")`.

**Status:** ❌ Blocks entirely — no shell data shown.

**Note:** Forge has `defaultLocked: false` in the security manifest. Vault lock only applies if the user explicitly locks it. Lower priority for shell upgrade.

**Recommendation:** Replace with `VaultLockedShell` using `moduleName="Forge"`, `accentClassName="text-rose-400"`.

---

### Documents — `src/modules/documents/DocumentsPage.tsx`

**Pattern:** No `isModuleAccessible` check. The page uses `isUnlocked` + `getModuleKey('documents')` to obtain the encryption key. When `!isUnlocked`, the key is never obtained and the page renders with `encryptionKey = null` → documents list will be empty, notebook will be empty, but the page frame IS rendered.

**Status:** ⚠️ Implicit lock — no explicit locked shell. The page renders but with empty content. This is arguably worse than a clear locked state because the user sees a blank page with no explanation.

**Note:** Documents has `defaultLocked: true` in the manifest but the page doesn't check `isModuleAccessible`. It relies on `isUnlocked` as a gate for the key, which is technically correct but provides no UX feedback.

**Recommendation:** Add `isModuleAccessible('documents')` check and render `VaultLockedShell` when locked, consistent with other modules.

---

### Titan — `src/modules/titan/TitanPage.tsx` + `TitanReadiness.tsx` + `TitanDiagnosisPanel.tsx`

**Pattern:** `isLocked` = `!isModuleAccessible('titan')`. Passed to `TitanDashboard`, `ClearancePanel`, and `TitanDiagnosisPanel`. `TitanReadiness` has its own bare `EmptyState("Vault locked", ...)` return.

**Note:** Titan has `defaultLocked: false` in the security manifest — vault lock is manual only.

**Status:** ❌ `TitanReadiness` blocks entirely with bare EmptyState.

**Recommendation:** Apply `VaultLockedShell` to `TitanReadiness` for consistency.

---

## Shell Pattern: Recommended Approach

Use the shared `VaultLockedShell` component (`src/core/components/VaultLockedShell.tsx`) across all vault-gated modules. This component:

1. **Shows** the module's name and description (never sensitive).
2. **Shows** a non-sensitive item count from unencrypted profile metadata (if available).
3. **Shows** last-active timestamp from unencrypted metadata (if available).
4. **Renders** a "Unlock vault to continue" button/prompt.
5. **Never** attempts to decrypt or display any vault-encrypted data.

### Props

```tsx
<VaultLockedShell
  moduleName="Atlas"
  moduleDescription="Cognitive planning, task scheduling, and habit tracking"
  accentClassName="text-sky-400"         // module accent colour
  lastActive="2025-07-01T10:00:00Z"      // optional — from unencrypted metadata
  itemCount={5}                          // optional — from unencrypted metadata
  itemCountLabel="goals & habits"        // optional label for itemCount
  onUnlock={handleOpenVaultUnlockModal}  // optional — CTA handler
/>
```

---

## Implementation Status

| Module | Status | Priority |
|---|---|---|
| Atlas | ✅ Fixed (this PR) | High — `defaultLocked: true` |
| Ledger | ✅ Fixed (this PR) | High — `defaultLocked: true` |
| Agnes | ⚠️ Partial — session picker has inline locked state, dashboard uses bare EmptyState | High — `mandatory: true` |
| Scout | ❌ Bare EmptyState | Medium — `defaultLocked: true` |
| Documents | ⚠️ No locked shell — blank page on lock | Medium — `defaultLocked: true` |
| Titan | ❌ TitanReadiness uses bare EmptyState | Low — `defaultLocked: false` |
| Forge | ❌ Bare EmptyState | Low — `defaultLocked: false` |

---

## Future Work

- **Unencrypted metadata reads:** Load `metadata` field from Firestore (unencrypted) when vault is locked to populate `lastActive` and `itemCount` in the shell. Each module's save path already writes a `metadata` sub-object alongside `encryptedData`.
- **Vault unlock CTA:** Wire `onUnlock` prop to the system vault unlock modal. Currently the shell shows the text but cannot trigger the unlock flow (requires vault-context access in the dashboard component).
- **Consistency pass:** Apply `VaultLockedShell` to Scout, Documents, Titan, and Forge in a follow-up sprint.
