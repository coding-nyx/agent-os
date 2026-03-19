# Vault Architecture — Canonical Reference

> **Sprint:** S12 · **Owner:** Platform  
> **Last updated:** S12-007  
> **Enforcement layer:** `VaultContext` + `ProtectedRoute` (NOT `MODULE_MANIFEST`)

---

## 1. Overview

The Vault is a **global, route-level second authentication gate** that sits on top of Firebase Auth.

| Concept | Detail |
|---|---|
| **Auth layer** | Firebase Auth — identity only |
| **Vault layer** | PBKDF2 + AES-GCM master key — data access |
| **Scope** | Single master key unlocks **all** encrypted collections simultaneously |
| **Optional** | Users without a vault (`hasVault = false`) bypass the gate entirely; a one-time setup nudge is shown |
| **Key derivation** | PBKDF2-HMAC-SHA256, random 16-byte salt stored in `vaults/{uid}` |
| **Encryption** | AES-GCM 256-bit; per-document random IV stored alongside ciphertext |

The vault password is **never stored**. The derived `CryptoKey` lives exclusively in a `useRef` inside `VaultProvider` and is garbage-collected on lock or tab close (STRICT mode) / page reload (SESSION mode — password stored in `sessionStorage`).

---

## 2. State Machine

```
Firebase Auth login
  └─▶ VaultProvider mounts
        │
        ├─ hasVault = false
        │     └─▶ No gate rendered.
        │         VaultSetupNudge shown once (dismissible, persisted in localStorage).
        │
        ├─ hasVault = true  AND  persistenceMode ≠ STRICT  AND  sessionStorage has password
        │     └─▶ isHandshaking = true (set synchronously in useState initialiser)
        │         BootLoader spinner shown while auto-unlock runs.
        │         On success → isUnlocked = true, isHandshaking = false → app renders normally.
        │         On failure → isHandshaking = false, isUnlocked = false → falls through to gate.
        │
        └─ hasVault = true  AND  isUnlocked = false  AND  isHandshaking = false
              └─▶ isVaultGateVisible = true
                  AppVaultGate component rendered at /vault-gate.
                  User enters master password → unlockVault(password) called.
                  On success → navigate(returnTo ?? '/').
```

> **Flash prevention:** `isHandshaking` is initialised synchronously (not in `useEffect`) so `ProtectedRoute` never sees a momentary "locked" state during auto-unlock.

---

## 3. Render Gate Order in `UnifiedModulePage`

Every module page follows this strict priority cascade before rendering content:

```
1. isLoading        → <LoadingShell />  (spinner; covers auth + vault isHandshaking)
2. isVaultLocked    → <VaultLockedShell />  (prompt to unlock or navigate to /vault-gate)
3. isGuest          → <GuestShell />  (unauthenticated state)
4. !onboardingDone  → <OnboardingFlow />
5. (default)        → <ModuleContent />
```

Conditions are evaluated top-down; the first truthy branch wins.

---

## 4. `EncryptedProfileService` API

All profile services are built with the `createEncryptedProfileService` factory from  
`src/lib/services/encrypted-profile-service.ts`.

### 4.1 Factory Signature

```typescript
function createEncryptedProfileService<TProfile, TMetadata>(
  config: EncryptedProfileServiceConfig<TProfile, TMetadata>
): EncryptedProfileService<TProfile>
```

### 4.2 `EncryptedProfileServiceConfig` Fields

| Field | Type | Purpose |
|---|---|---|
| `collection` | `string` | Firestore collection name (e.g. `'titan_profiles'`) |
| `guestStorageKey` | `string` | `localStorage` key for unauthenticated guest profile |
| `createEmpty` | `() => TProfile` | Zero-state factory; called when no document exists |
| `normalize` | `(raw: unknown) => TProfile` | Sanitise raw Firestore/localStorage data; must handle `unknown` gracefully |
| `metadataProjection` | `(profile: TProfile) => TMetadata` | Extracts plaintext fields written alongside ciphertext (e.g. `onboardingComplete`) for server-side queries |

### 4.3 Returned Service Methods

| Method | Signature | Behaviour |
|---|---|---|
| `load` | `(ctx: LoadContext) => Promise<TProfile \| null>` | Authenticated + key → decrypt from Firestore. Authenticated + no key (vault locked) → `null`. No userId → localStorage guest. |
| `save` | `(profile, ctx) => Promise<void>` | Authenticated + key → encrypt + write. Authenticated + no key → plaintext write. No userId → localStorage. |
| `subscribe` | `(ctx, onUpdate) => () => void` | Real-time listener. Vault-locked (userId present, no key): returns no-op unsubscribe and **never** calls `onUpdate`. Guest: calls `onUpdate` synchronously from localStorage then returns no-op. |
| `syncGuestToUser` | `(ctx) => Promise<boolean>` | Copies guest localStorage profile to Firestore if no document exists yet. Returns `true` if migration occurred. |
| `loadGuest` | `() => TProfile \| null` | Read guest profile from `localStorage`. |
| `saveGuest` | `(profile) => void` | Write guest profile to `localStorage`. |
| `clearGuest` | `() => void` | Remove guest profile from `localStorage`. |

### 4.4 `LoadContext`

```typescript
type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};
```

Obtain `encryptionKey` from `useVault().getMasterKey()` — returns the master `CryptoKey` when unlocked, `null` when locked.

### 4.5 `payloadMode` Behaviour

| `payloadMode` value | When written | Read behaviour |
|---|---|---|
| `'encrypted'` | User has vault; key available at save time | `readDoc` decrypts with AES-GCM using the provided key |
| `'plaintext'` | User has no vault (`hasVault = false`) | `readDoc` JSON-parses `plaintextData` directly |
| absent (legacy) | Documents written before S12 sprint | Treated as `'encrypted'` (see §5 below) |

---

## 5. Document Schema

### 5.1 Encrypted Document (`EncryptedPayloadDocument`)

```typescript
interface EncryptedPayloadDocument {
  payloadMode?: 'encrypted';   // absent on legacy docs — inferred as encrypted
  encryptedData: string;       // AES-GCM ciphertext, base64-encoded
  iv: string;                  // AES-GCM IV, base64-encoded (random per write)
  salt: string;                // Constant marker: 'vault_salt_used'
  metadata: Record<string, unknown>; // plaintext projection for Firestore queries
}
```

### 5.2 Plaintext Document (`PlaintextPayloadDocument`)

```typescript
interface PlaintextPayloadDocument {
  payloadMode: 'plaintext';    // required; discriminates from encrypted
  plaintextData: string;       // JSON.stringify of the profile object
  metadata: Record<string, unknown>; // plaintext projection for Firestore queries
}
```

### 5.3 Legacy Document Handling

Documents written before the `payloadMode` field was introduced **lack the field entirely**.  
The `isEncryptedDoc` type guard treats the absence of `payloadMode` as `'encrypted'`:

```typescript
function isEncryptedDoc(doc: ProfileDocument): doc is EncryptedPayloadDocument {
  return !doc.payloadMode || doc.payloadMode === 'encrypted';
}
```

All consumers rely on `isEncryptedDoc` — **never** do a direct field comparison.

---

## 6. `VaultContext` API

Accessed via `useVault()` inside any component under `<VaultProvider>`.

| Field / Method | Type | Description |
|---|---|---|
| `isUnlocked` | `boolean` | Master key is loaded in memory and ready |
| `isLoading` | `boolean` | Composite: `authLoading \|\| vaultLoading \|\| isHandshaking` |
| `isHandshaking` | `boolean` | SESSION auto-unlock is in progress |
| `hasVault` | `boolean` | A vault document exists for this user in Firestore |
| `isVaultGateVisible` | `boolean` | `hasVault && !isUnlocked && !isHandshaking` — use this to decide whether to render the gate |
| `persistenceMode` | `VaultPersistenceMode` | `'STRICT' \| 'SESSION' \| 'GRACE'` |
| `setPersistenceMode` | `(mode) => void` | Persists to `localStorage` under `nexus_vault_mode` |
| `unlockVault` | `(password: string) => Promise<void>` | Derives key, verifies canary, sets master key ref |
| `lockVault` | `() => void` | Nulls master key ref, clears session storage password |
| `getMasterKey` | `() => Promise<CryptoKey \| null>` | Returns the single vault master key when unlocked, else `null` |
| `checkModuleVault` | `(collectionName: string) => Promise<boolean>` | Checks if a document exists in the given collection for this user |
| `isModuleAccessible` | `(moduleId: ModuleId) => boolean` | Legacy access check based on `securityPreferences.vaultLocks`; **do not use for new enforcement** — use `isVaultGateVisible` + `ProtectedRoute` |
| `refreshVaultStatus` | `() => Promise<void>` | Re-fetches `hasVault` from Firestore |
| `setSessionPassword` | `(password: string) => void` | Writes to `sessionStorage` if mode ≠ STRICT |
| `getSessionPassword` | `() => string \| null` | Reads from `sessionStorage` |
| `vaultSetupNudgeSeen` | `boolean` | Whether the user has dismissed the vault setup nudge |
| `dismissVaultSetupNudge` | `() => void` | Marks nudge seen in `localStorage` |
| `initializeVault` | `() => void` | Placeholder — wire to `UnifiedAuthModal` VAULT_HANDSHAKE step |

---

## 7. Module Security Policy — UI Metadata Only

`MODULE_MANIFEST[id].securityPolicy` fields are **decorative UI metadata**. They drive label rendering (e.g. "Encrypted" badge) but have **no enforcement authority**.

```typescript
interface ModuleSecurityPolicy {
  defaultLocked: boolean;  // UI hint: show "Encrypted" badge by default
  mandatory: boolean;      // UI hint: badge is non-dismissible
}
```

**Enforcement is handled exclusively by:**
1. `VaultProvider` / `isVaultGateVisible` — gate the whole app
2. `ProtectedRoute` — per-route authentication checks

> **Removed in S12-007:** The per-module vault lock toggles in `SecurityPanel` that used `profile.securityPreferences.vaultLocks` to drive per-module `isModuleAccessible` enforcement. `isModuleAccessible` is preserved in `VaultContext` for legacy callers but should not be used in new code.

---

## 8. Soul Termination Flow

`SoulTerminationService` (`src/lib/services/soul-termination-service.ts`) provides a complete user data wipe.

### 8.1 What Gets Deleted

1. **Firestore subcollections** — iterated and batch-deleted before parent documents (Firestore does not cascade-delete):
   - `semantic_memory/{uid}/facts`
   - `spine_events/{uid}/events`
   - `users/{uid}/modules`
2. **Firestore parent documents** — all collections listed in `getUserDataDeletionTargets(uid)` from `user-data-registry.ts`
3. **`sessionStorage`** — keys: `nexus_guest_active`, `nexus_vault_session`
4. **`localStorage`** — all keys prefixed with `nexus_` or `agnes_`, plus any key containing `integrity`

### 8.2 API

```typescript
SoulTerminationService.purgeUserData(uid: string): Promise<void>
SoulTerminationService.clearLocalArtifacts(): void
SoulTerminationService.terminateSoul(uid: string): Promise<void>  // calls both
```

### 8.3 Triggering from UI

`SecurityPanel` exposes the only production entrypoint:

1. User clicks **TERMINATE NEURAL SOUL** → `confirmTerminate = true`
2. Inline confirmation shown with destructive warning text
3. User clicks **YES, TERMINATE** →
   ```typescript
   await SoulTerminationService.terminateSoul(user.uid);
   await logout();
   ```
4. On error: `terminateError` state is set; loading stops; user stays on the page

### 8.4 Onboarding Re-trigger After Reset

After termination and logout, the user's Firestore onboarding flags are gone. On next login:
- `hasVault` resolves to `false` (vault document deleted)
- Each module's `onboardingComplete` is `false` (profile documents deleted)
- Onboarding flows re-run normally

---

## 9. Persistence Modes

| Mode | Session password stored | Auto-unlock on reload | Use case |
|---|---|---|---|
| `SESSION` (default) | `sessionStorage['nexus_vault_session']` | ✅ Yes — within the same browser tab/session | Standard users |
| `STRICT` | Never | ❌ No — password must be re-entered on every page load | High-security users |
| `GRACE` | `sessionStorage` (same as SESSION) | ✅ Yes | Reserved — currently behaves like SESSION |

### Storage Keys

| Key | Storage | Content |
|---|---|---|
| `nexus_vault_mode` | `localStorage` | Active `VaultPersistenceMode` string |
| `nexus_vault_session` | `sessionStorage` | Plaintext vault password (SESSION/GRACE only) |
| `nexus_vault_nudge_seen` | `localStorage` | `'true'` once nudge dismissed |

> **Security note:** Storing the password in `sessionStorage` (SESSION mode) is a deliberate UX trade-off. It is erased automatically when the browser tab/session ends. Users who require zero persistence should use STRICT mode.

---

## 10. Phase 2 Roadmap

| Feature | Status | Notes |
|---|---|---|
| **Vault disable** | Planned | Requires bulk re-encryption migration: decrypt all docs → write as `payloadMode: 'plaintext'` → delete vault doc |
| **Biometric unlock** | Planned | WebAuthn `PRF` extension — derive key from authenticator instead of password |
| **Auto-lock timer** | Planned | Idle timeout watcher calls `lockVault()` after N minutes of inactivity |
| **Master password change** | Planned | Re-encryption pipeline: unlock with old password → re-encrypt all docs with new key → update vault salt + canary atomically |
| **Multi-device trusted registry** | Planned | Each device generates an asymmetric keypair; master key wrapped with device public key and stored in `vaults/{uid}/devices/{deviceId}` |

---

*This document is the single source of truth for vault architecture. Do not duplicate these specifications in component-level comments — link here instead.*
