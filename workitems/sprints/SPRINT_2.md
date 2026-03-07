# Sprint 2: Security Hardening — "Lock the Doors"

> **Sprint Goal:** Close all P0 security vulnerabilities identified in the 5-agent audit.
> Every item in this sprint addresses a *currently exploitable* attack vector.
>
> **Duration:** 2 weeks
> **Depends on:** Sprint 1 fixes (hooks violations, accessibility, storage.rules rewrite, PBKDF2, etc.) must be merged first.

---

## Sprint Scope Summary

| ID | Title | Effort | Risk | Owner |
|----|-------|--------|------|-------|
| S2-001 | Cloud Functions Auth | M | 🔴 Critical | Backend Dev |
| S2-002 | LLM API Keys Out of Client Bundle | L | 🔴 Critical | Backend Dev + Frontend Dev |
| S2-003 | forgeExecute Sandbox Escape | M | 🔴 Critical | Backend Dev |
| S2-004 | Firestore Write Validation Rules | M | 🟠 High | Backend Dev |
| S2-005 | Admin UID → Custom Claims | S | 🟠 High | Backend Dev |
| S2-006 | Server-Side Guest Quota | M | 🟠 High | Backend Dev + Frontend Dev |
| S2-007 | Vault Password Session Security | S | 🟠 High | Frontend Dev |
| S2-008 | Env Var Validation at Startup | S | 🟡 Medium | Frontend Dev |

**Effort:** S = 1-2 days, M = 3-5 days, L = 5-8 days

---

## Sprint Items

### [S2-001] Cloud Functions Require Authentication
**Backlog Ref:** BL-001 · **Priority:** P0 Critical

**Problem:** `forgeExecute` and `scoutWebSearch` are `onRequest` HTTP endpoints with zero authentication. Anyone with the URL can execute arbitrary code or consume Tavily API quota. `forgeExecute` is effectively a public remote code execution service.

**User Story:** As a system administrator, when `forgeExecute` or `scoutWebSearch` receive an HTTP request, then the function must reject any request without a verified Firebase Auth token.

**Tasks:**
- [ ] **T1:** Add `verifyIdToken` middleware to both functions OR convert to `onCall` (preferred — Firebase handles auth automatically).
- [ ] **T2:** Update client callers to use `httpsCallable()` instead of raw `fetch()`.
- [ ] **T3:** Add integration test: unauthenticated request → 401.
- [ ] **T4:** Add integration test: expired token → 403.
- [ ] **T5:** Add integration test: valid token → 200 + correct response.

**Acceptance Criteria:**
- [ ] Zero unauthenticated requests succeed against either endpoint.
- [ ] Client code uses `httpsCallable` from `firebase/functions`.
- [ ] Existing functionality (web search, code execution) works for authenticated users.
- [ ] Integration tests pass in Firebase Emulator.

**Files to Modify:**
```
functions/src/index.ts            # Convert onRequest → onCall (or add auth middleware)
src/lib/services/web-search-service.ts  # Use httpsCallable instead of fetch
src/modules/forge/ForgePage.tsx   # Use httpsCallable for forge execution
```

**Definition of Done:** PR merged, emulator tests green, manual smoke test confirms auth rejection.

---

### [S2-002] LLM API Keys Must Not Ship in Client Bundle
**Backlog Ref:** BL-002 · **Priority:** P0 Critical

**Problem:** `VITE_OPENROUTER_API_KEY`, `VITE_GROK_API_KEY`, `VITE_GOOGLE_API_KEY`, `VITE_TAVILY_API_KEY` are inlined into production JavaScript via Vite's `import.meta.env`. Any user can extract them from browser DevTools → Sources.

**User Story:** As a security engineer, when I inspect the production JS bundle, then I must find zero LLM API keys.

**Tasks:**
- [ ] **T1:** Create `functions/src/llm-proxy.ts` — a new `onCall` Cloud Function that:
  - Accepts `{ messages, model, module }` from authenticated clients.
  - Reads API keys from `functions/.env` (server-side only).
  - Forwards to OpenRouter/Grok/Google and streams the response back.
- [ ] **T2:** Create `functions/src/search-proxy.ts` (or merge into existing `scoutWebSearch`) for Tavily.
- [ ] **T3:** Update `ai-context.tsx` / `CognitiveAgent` to call the proxy instead of direct API endpoints.
- [ ] **T4:** Remove all `VITE_OPENROUTER_API_KEY`, `VITE_GROK_API_KEY`, `VITE_GOOGLE_API_KEY`, `VITE_TAVILY_API_KEY` from client-side code.
- [ ] **T5:** Create `.env.example` documenting server-only vs client-safe variables.
- [ ] **T6:** Add CI check: `grep -r "VITE_.*API_KEY" src/` returns zero results.

**Acceptance Criteria:**
- [ ] `grep -r "VITE_.*API_KEY" src/` returns empty.
- [ ] Production bundle contains zero API keys (verified via `vite build && grep -r "sk-" dist/`).
- [ ] LLM calls work end-to-end through the proxy.
- [ ] `.env.example` documents all required server-side secrets.

**Files to Modify:**
```
functions/src/index.ts             # New llm-proxy onCall function
functions/src/llm-proxy.ts        # NEW: LLM proxy logic
functions/.env                     # Server-side API keys (gitignored)
src/llm-engine/ai-context.tsx     # Remove direct API calls, use proxy
src/llm-engine/engine/CognitiveAgent.ts  # Route through proxy
src/lib/services/embedding-service.ts    # Route through proxy
src/lib/services/web-search-service.ts   # Already uses scoutWebSearch, ensure no direct Tavily key
.env.example                       # NEW: Document all vars
```

**Definition of Done:** PR merged, `vite build` output contains no API keys, end-to-end chat works.

**⚠️ Migration Risk:** This is the largest item in the sprint. The LLM call path touches every module. Plan for 1 day of integration testing.

---

### [S2-003] forgeExecute Sandbox Escape
**Backlog Ref:** BL-003 · **Priority:** P0 Critical

**Problem:** Node.js `vm` module is explicitly documented as "not a security mechanism." A user can escape via `this.constructor.constructor('return process')()` and access the host filesystem, environment variables, and network.

**User Story:** As a security engineer, when a user submits code to Forge, then the sandbox must prevent access to host resources.

**Tasks:**
- [ ] **T1:** Replace `vm.createContext` / `vm.runInContext` with `isolated-vm` (V8 isolate).
  - `isolated-vm` runs code in a separate V8 isolate with no access to the host process.
- [ ] **T2:** Configure isolate limits: `memoryLimit: 128` (MB), timeout: 2000ms.
- [ ] **T3:** Whitelist only safe globals: `console.log`, `Math`, `JSON`, `Date`, `Array`, `Object`, `String`, `Number`, `RegExp`.
- [ ] **T4:** Security tests:
  - `require('fs')` → throws ReferenceError
  - `process.env` → throws ReferenceError
  - `fetch('http://evil.com')` → throws ReferenceError
  - `this.constructor.constructor('return process')()` → throws
  - Infinite loop → times out after 2s
  - Memory bomb (`Array(1e9)`) → killed by memory limit

**Acceptance Criteria:**
- [ ] All 6 security tests pass.
- [ ] Legitimate code (math, string manipulation, algorithms) executes correctly.
- [ ] Execution timeout ≤ 2s, memory ≤ 128MB.
- [ ] `vm` import is completely removed from the codebase.

**Files to Modify:**
```
functions/src/index.ts        # Replace vm usage with isolated-vm
functions/package.json        # Add isolated-vm dependency
```

**Definition of Done:** PR merged, security test suite green, manual test confirms sandbox escape is blocked.

---

### [S2-004] Firestore Write Validation Rules
**Backlog Ref:** BL-004 · **Priority:** P0 High

**Problem:** Current rules only check `isOwner(userId)` — they do not validate document schema. A malicious client can write any fields, any types, any size to any writable collection.

**User Story:** As a data integrity engineer, when any client writes to Firestore, then the rules must validate document schema.

**Tasks:**
- [ ] **T1:** Audit all writable collections and define allowed fields:
  - `users/{uid}` — `displayName` (string, ≤100), `email` (string, ≤254), `photoURL` (string, ≤500), `createdAt` (timestamp)
  - `users/{uid}/souls/{soulId}` — Define soul document schema
  - `users/{uid}/modules/{moduleId}/*` — Per-module schemas
  - `users/{uid}/semantic_memory/facts` — `text` (string, ≤5000), `category` (string, ≤100), `confidence` (number, 0-1)
- [ ] **T2:** Implement `hasOnly()` validation for each collection.
- [ ] **T3:** Add `size()` limits on string fields (max 10KB per field).
- [ ] **T4:** Test with Firebase Emulator: valid writes succeed, invalid writes are rejected.

**Acceptance Criteria:**
- [ ] Every writable collection has field-level validation.
- [ ] Writes with unexpected fields are rejected.
- [ ] String fields > 10KB are rejected.
- [ ] Firebase Emulator test suite verifies at least 10 valid + 10 invalid write scenarios.

**Files to Modify:**
```
firestore.rules                # Add schema validation functions
firestore.indexes.json         # If new indexes needed
```

**Definition of Done:** PR merged, emulator tests green, deployed rules verified in staging.

---

### [S2-005] Replace Hardcoded Admin UID with Custom Claims
**Backlog Ref:** BL-005 · **Priority:** P0 High

**Problem:** `firestore.rules` line 16 contains `'super-admin-uid'` as a literal string. This is a placeholder that either grants no one admin access (if unchanged) or grants a single hardcoded UID admin access (if customized). Neither is acceptable.

**User Story:** As an administrator, when I need admin access, then my privileges must come from Firebase Custom Claims.

**Tasks:**
- [ ] **T1:** Update `firestore.rules` `isAdmin()` function: `return request.auth.token.admin == true;`
- [ ] **T2:** Create `functions/src/admin-claims.ts` — an `onCall` function (admin-only or bootstrap) that sets custom claims:
  ```typescript
  admin.auth().setCustomUserClaims(uid, { admin: true })
  ```
- [ ] **T3:** Document the admin provisioning process in `docs/ADMIN_SETUP.md`.
- [ ] **T4:** Test: non-admin user cannot access admin-only paths. Admin user can.

**Acceptance Criteria:**
- [ ] String `'super-admin-uid'` does not appear anywhere in the codebase.
- [ ] Admin access requires `token.admin == true` custom claim.
- [ ] Admin provisioning is documented and repeatable.

**Files to Modify:**
```
firestore.rules                  # Update isAdmin() function
functions/src/index.ts           # Export admin-claims callable
functions/src/admin-claims.ts    # NEW: Set custom claims
docs/ADMIN_SETUP.md              # NEW: Admin provisioning docs
```

**Definition of Done:** PR merged, hardcoded UID removed, admin provisioning tested.

---

### [S2-006] Server-Side Guest Quota Enforcement
**Backlog Ref:** BL-006 · **Priority:** P0 High

**Problem:** Guest quota is enforced via `localStorage` counter in `guest-quota-service.ts`. Opening an incognito window or clearing storage resets the quota. The limit is purely cosmetic.

**User Story:** As a product owner, when a guest hits 10 turns, then the limit must be enforced server-side.

**Tasks:**
- [ ] **T1:** Create Firestore collection `guest_quotas/{anonUid}` with field `turnsUsed` (number).
- [ ] **T2:** Create `functions/src/guest-quota.ts` — `onCall` function that:
  - Reads current turn count.
  - Rejects if `turnsUsed >= 10` with a clear error message.
  - Increments `turnsUsed` atomically on success.
- [ ] **T3:** Update Firestore rules: guests can only read their own quota doc. Cannot write directly.
- [ ] **T4:** Update `guest-quota-service.ts` to call the Cloud Function instead of localStorage.
  - Keep localStorage as a *cache* for instant UX feedback, but enforce server-side.
- [ ] **T5:** Test: clearing localStorage does not reset quota. Creating new anonymous session does.

**Acceptance Criteria:**
- [ ] Guest turn count persists across localStorage clears.
- [ ] Server rejects turn 11+ with HTTP 429 / appropriate error.
- [ ] Client shows "Sign up to continue" prompt at quota limit.

**Files to Modify:**
```
functions/src/guest-quota.ts         # NEW: Server-side quota enforcement
functions/src/index.ts               # Export guest-quota callable
src/lib/services/guest-quota-service.ts  # Use Cloud Function, localStorage as cache
firestore.rules                      # Guest quota collection rules
```

**Definition of Done:** PR merged, server-side enforcement verified, localStorage bypass confirmed blocked.

---

### [S2-007] Vault Password Must Not Be Plaintext in sessionStorage
**Backlog Ref:** BL-007 · **Priority:** P0 High

**Problem:** `vault-context.tsx` stores the raw vault password in `sessionStorage` under key `agnes_vault_session`. Any XSS vulnerability instantly leaks the master password.

**User Story:** As a security-conscious user, when I unlock the Vault, then my password must not be stored as plaintext in sessionStorage.

**Tasks:**
- [ ] **T1:** On vault unlock, derive a wrapping key from the password using `deriveKey()` from `encryption.ts`.
- [ ] **T2:** Store only the derived wrapping key (as base64) in `sessionStorage` — never the raw password.
- [ ] **T3:** Update `getSessionPassword()` to return the wrapping key (rename to `getSessionKey()`).
- [ ] **T4:** Ensure all consumers that use the session password for decryption work with the derived key instead.
- [ ] **T5:** Add idle timeout: clear `agnes_vault_session` after 15 minutes of no interaction.
- [ ] **T6:** Unit test: `sessionStorage.getItem('agnes_vault_session')` never contains the original password string.

**Acceptance Criteria:**
- [ ] Raw password never appears in `sessionStorage`.
- [ ] Vault lock/unlock still works end-to-end.
- [ ] 15-minute idle timeout clears the session key.
- [ ] Unit tests verify no plaintext password in storage.

**Files to Modify:**
```
src/lib/vault-context.tsx    # Replace password storage with derived key
src/lib/encryption.ts        # Ensure deriveKey is usable for session wrapping
```

**Definition of Done:** PR merged, manual test confirms sessionStorage contains only derived key, tests green.

---

### [S2-008] Validate All Environment Variables at Startup
**Backlog Ref:** BL-008 · **Priority:** P0 Medium

**Problem:** Missing environment variables cause silent fallback to mock mode or cryptic runtime errors. Developers waste hours debugging config issues. `src/vite-env.d.ts` only declares 5 Firebase vars — the rest are undeclared.

**User Story:** As a developer, when I deploy with missing config, then the app must fail fast with a clear error.

**Tasks:**
- [ ] **T1:** Create `src/lib/env-validation.ts`:
  ```typescript
  import { z } from 'zod';
  const envSchema = z.object({
    VITE_FIREBASE_API_KEY: z.string().min(1),
    VITE_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    VITE_FIREBASE_PROJECT_ID: z.string().min(1),
    VITE_FIREBASE_STORAGE_BUCKET: z.string().min(1),
    VITE_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    VITE_FIREBASE_APP_ID: z.string().min(1),
    // Post BL-002: LLM keys will be server-only, not validated here
  });
  export function validateEnv() { ... }
  ```
- [ ] **T2:** Call `validateEnv()` in `src/main.tsx` before `ReactDOM.createRoot`.
- [ ] **T3:** On failure, render a developer-friendly error page (not a blank screen).
- [ ] **T4:** Update `src/vite-env.d.ts` with all `VITE_*` vars.
- [ ] **T5:** Create `.env.example` with all required vars (values blanked).

**Acceptance Criteria:**
- [ ] Missing `VITE_FIREBASE_PROJECT_ID` → error page listing the missing var.
- [ ] All required vars present → app boots normally.
- [ ] `.env.example` exists and documents every variable.

**Files to Modify:**
```
src/lib/env-validation.ts    # NEW: Zod schema for env vars
src/main.tsx                 # Call validateEnv() before mount
src/vite-env.d.ts            # Complete type declarations
.env.example                 # NEW: Template for all env vars
```

**Definition of Done:** PR merged, tested with intentionally missing vars, error page renders correctly.

---

## Sprint 2 Velocity & Risk Assessment

### Capacity Plan
| Item | Effort | Assignee | Days |
|------|--------|----------|------|
| S2-001 | M | Backend Dev | 3 |
| S2-002 | L | Backend + Frontend | 6 |
| S2-003 | M | Backend Dev | 4 |
| S2-004 | M | Backend Dev | 4 |
| S2-005 | S | Backend Dev | 1 |
| S2-006 | M | Backend + Frontend | 3 |
| S2-007 | S | Frontend Dev | 2 |
| S2-008 | S | Frontend Dev | 2 |
| **Total** | | | **~25 dev-days** |

### Risk Register
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| S2-002 (LLM proxy) breaks streaming | High | High | Test streaming in Firebase Emulator before merge. Have a feature flag to fall back to direct calls. |
| S2-003 (`isolated-vm`) has native compilation issues | Medium | Medium | Test on CI build environment early. Have Docker-based fallback plan. |
| S2-004 (Firestore rules) blocks legitimate writes | Medium | High | Deploy to staging first. Run full E2E suite against emulator. |
| S2-001 + S2-002 are coupled | High | Medium | Do S2-001 first (auth), then S2-002 (proxy) builds on it. |

### Execution Order (Recommended)
```
Week 1:
  S2-005 (Admin Claims — small, unblocks S2-004)
  S2-008 (Env Validation — small, independent)
  S2-001 (Cloud Functions Auth — unblocks S2-002 and S2-006)
  S2-007 (Vault Password — independent)

Week 2:
  S2-002 (LLM Proxy — depends on S2-001 auth)
  S2-003 (Sandbox Escape — independent, backend only)
  S2-004 (Firestore Rules — depends on S2-005 for admin rules)
  S2-006 (Guest Quota — depends on S2-001 for auth pattern)
```

---

## Sprint 2 Exit Criteria

- [ ] All 8 items merged to `main`.
- [ ] Zero API keys in production bundle (`grep -r "sk-" dist/` returns empty).
- [ ] Zero unauthenticated Cloud Function calls succeed.
- [ ] Firestore Emulator test suite passes with schema validation.
- [ ] `vm` module completely removed from codebase.
- [ ] `'super-admin-uid'` string removed from codebase.
- [ ] E2E test suite passes against staging environment.
- [ ] Security items verified by code review from at least 2 reviewers.
