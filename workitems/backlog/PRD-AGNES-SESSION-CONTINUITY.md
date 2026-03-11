# PRD: Agnes Session Continuity & State Recovery
**Module:** Agnes (AI Therapist) · Nexus Personal Intelligence Platform  
**Status:** Draft v1.0  
**Author:** Nexus PM (AI)  
**Scope:** Session persistence, reload behavior, navigation guards, vault/auth edge cases  
**Related Sprint:** TBD — see Section 6 for MVP vs V2 split  

---

## 1. Problem Statement

Agnes currently has no coherent contract between what the user *believes* is happening to their session and what the system *actually* does. This creates three compounding trust failures:

| Failure | User Experience | Why It Matters |
|---|---|---|
| **Silent state loss on reload** | Regular session messages vanish or appear inconsistently depending on timing of debounce flush | User assumes therapy context is preserved; discovering it isn't mid-crisis is a trust-breaking moment |
| **No navigation warning** | Leaving Agnes mid-session via in-SPA nav silently abandons the session without triggering the "Sync to Vault" end flow | User loses session data they explicitly intended to save |
| **Impromptu ambiguity** | SessionStorage persists across in-SPA nav but not tab close — users have no signal about which actions destroy their session | Unpredictable, uncontrollable behavior erodes confidence in an inherently sensitive tool |

Agnes is a therapy tool. **The cost of unexpected data loss here is not a UX annoyance — it is a breach of user trust in a vulnerable context.** These issues must be treated as P0 correctness bugs, not polish items.

---

## 2. User Mental Models

These are prescriptive decisions, not open questions.

### Regular Session — "Resuming a Paused Conversation"

> *"Agnes remembers where we left off, even if I had to step away."*

A regular session represents a therapeutic relationship with continuity. The user has opted into persistence (implicitly, by not choosing Impromptu). Every reload, crash, or return from another module **must feel identical**: Agnes greets the user by restoring the conversation exactly as it was, with no action required. The selector should not be the destination — the session should be.

This means: **auto-resume is the correct behavior for regular sessions.** Presenting the selector on return is a wrong answer.

### Impromptu Session — "This Conversation Ends When I Close It"

> *"What I say here is private to this window. When I'm done, it's gone."*

The entire value proposition of Impromptu mode is zero-persistence. The mental model must be browser-tab-scoped. Navigating to another Nexus module and returning is analogous to switching tabs within the same browser session — reasonable users may expect continuity there. **But closing the tab is the natural, expected end of an impromptu session.** The product should not fight this expectation; it should make it explicit with a one-time disclosure.

In-SPA navigation continuity (AC-I2) is a pragmatic concession to usability, not a contradiction of the mental model, *provided* the user received the upfront disclosure that tab-close ends the session.

---

## 3. Acceptance Criteria

### Regular Session Scenarios

---

**AC-R1: Tab close → reopen Agnes**

```
GIVEN a user is in an active regular session with messages
  AND the debounce flush has committed to Firestore (or beforeunload fired flushActiveSession)
WHEN the user closes the browser tab
  AND reopens Agnes (in a new tab or after relaunch)
THEN the session selector is bypassed entirely
  AND Agnes loads directly into the session view
  AND all previous messages are restored in correct order
  AND a subtle non-blocking indicator reads "Session restored" (auto-dismisses after 3s)
  AND currentState is set to 'session' without user interaction
```

**AC-R2: Navigate to Titan → return to Agnes**

```
GIVEN a user is in an active regular session
WHEN the user navigates to Titan (or any other Nexus module) via in-SPA navigation
THEN Agnes's beforeunload does NOT fire (SPA navigation, not unload)
  AND the active session subscription (subscribeActiveSession) is torn down cleanly on unmount
WHEN the user returns to Agnes
THEN the selector is bypassed
  AND Agnes re-subscribes to the active session from Firestore
  AND the conversation is restored to the exact state it was in before navigation
  AND no "Reconnect Link" button is shown (that button is for cold-start orphaned sessions only)
```

**AC-R3: Browser crash → reopen Agnes**

```
GIVEN a user is in an active regular session
  AND the browser crashes (beforeunload may or may not have fired)
WHEN the user reopens Agnes
THEN Agnes attempts to restore from Firestore active_sessions
  AND if a session record exists: behavior is identical to AC-R1
  AND if the Firestore record is incomplete (crash before debounce): Agnes restores what exists
    AND displays a non-blocking warning: "Session may be incomplete — some messages could not be recovered"
  AND the user is NEVER deposited on a blank session selector without explanation
```

---

### Impromptu Session Scenarios

---

**AC-I1: Tab close → reopen Agnes**

```
GIVEN a user is in an active impromptu session
WHEN the user closes the browser tab
  AND sessionStorage is cleared by the browser
WHEN the user reopens Agnes
THEN Agnes renders the session selector (selecting state)
  AND NO session is restored (expected behavior, not an error)
  AND NO error message or recovery prompt is shown
  AND the selector does NOT show a "Reconnect" button for the previous impromptu session
```

**AC-I2: Navigate to Titan → return to Agnes**

```
GIVEN a user is in an active impromptu session
  AND sessionStorage key nexus_session_agnes_current contains messages
WHEN the user navigates to Titan via in-SPA navigation
  AND sessionStorage is preserved (same browser session, SPA navigation)
WHEN the user returns to Agnes
THEN Agnes reads nexus_session_agnes_current from sessionStorage
  AND if the key exists and contains messages: Agnes restores the session silently (no indicator needed)
  AND currentState is set to 'session'
  AND NO Firestore writes are made at any point during this flow
```

**AC-I3: "New Session" clicked while impromptu session is active**

```
GIVEN a user is in an active impromptu session with at least one user message
WHEN the user clicks "New Session" (or any action that would navigate to session selector)
THEN Agnes displays an inline confirmation:
    "Your impromptu session will be permanently lost. This cannot be undone."
  WITH two actions: [Discard & Continue] [Stay in Session]
WHEN the user confirms "Discard & Continue"
THEN sessionStorage key nexus_session_agnes_current is cleared
  AND Agnes navigates to session selector
WHEN the user selects "Stay in Session"
THEN the confirmation is dismissed and the session continues uninterrupted
```

> **Note:** If the impromptu session has zero user messages (only Agnes's opening message or blank), no confirmation is required. Discard silently.

---

### Vault / Auth Edge Cases

---

**AC-V1: Vault becomes locked mid-session (encryptionKey unavailable)**

```
GIVEN a user is in an active regular session
  AND the vault becomes locked (encryptionKey is no longer available, e.g. session timeout, key rotation)
WHEN Agnes attempts any write that requires vault encryption
THEN the write fails gracefully (no unhandled exception)
  AND Agnes displays a persistent (non-dismissable) banner:
    "Your Vault is locked. Session messages are being held temporarily and will sync when you unlock your Vault."
  AND session messages continue to accumulate in-memory and in Firestore active_sessions (unencrypted staging)
  AND when the vault is unlocked: Agnes flushes the pending messages to the Vault
  AND the banner is dismissed automatically upon successful vault sync
WHEN the vault remains locked and the user ends the session
THEN the end-session modal presents a THIRD option alongside "Sync to Vault" and "Discard":
    "Save Draft (Sync when Vault unlocks)"
  AND "Sync to Vault" is disabled with tooltip: "Vault is locked"
```

**AC-V2: User logs out mid-session**

```
GIVEN a user is in an active regular OR impromptu session
WHEN the user initiates logout
THEN Agnes intercepts the logout action BEFORE the auth state is cleared
  AND presents a blocking modal:
    [Regular session]: "Logging out will end your current session. Sync your session to Vault before leaving?"
      Options: [Sync & Logout] [Discard & Logout] [Cancel]
    [Impromptu session]: "Logging out will permanently end your impromptu session. This data cannot be recovered."
      Options: [Logout] [Cancel]
WHEN [Sync & Logout] is selected (regular session)
THEN the end-session Agnes summary flow executes
  AND Vault sync completes
  AND ONLY THEN does logout proceed
WHEN [Discard & Logout] or [Logout] is selected
THEN sessionStorage and active Firestore active_sessions record are cleared
  AND logout proceeds immediately
WHEN [Cancel] is selected
THEN logout is aborted, session continues uninterrupted
```

> **Hard rule:** Logout MUST NEVER proceed while a Vault write is in-flight. The logout action is blocked, not raced.

---

### Abandonment Scenarios

---

**AC-A1: Regular session — navigate away without ending session**

```
GIVEN a user is in an active regular session with unsaved messages (end flow not triggered)
WHEN the user attempts to navigate away via in-SPA nav (to Titan, Dashboard, etc.)
THEN Agnes presents a navigation guard modal:
    "Leave Agnes? Your session is still active."
    [Continue Session] [Leave — Session stays active]
  AND the "Leave" option does NOT end the session — it simply navigates away
  AND the session remains resumable on return (per AC-R2)
  AND before navigating, Agnes synchronously flushes active_sessions to Firestore
  AND the "Reconnect Link" button in the selector is available if the user returns cold
THEN no modal is shown for beforeunload (tab close/reload) — rely on existing flushActiveSession
```

> **Rationale:** We do not end a regular session on navigation — we only protect the user from unintentional departure. The session persists until explicitly ended.

**AC-A2: Impromptu session — navigate away without ending session**

```
GIVEN a user is in an active impromptu session with at least one user message
WHEN the user attempts to navigate away via in-SPA nav
THEN Agnes presents a navigation guard modal:
    "Leave Agnes? Your impromptu session will still be here when you return, but will be lost if you close this browser tab."
    [Stay] [Leave]
WHEN [Leave] is selected
THEN Agnes navigates away WITHOUT clearing sessionStorage
  AND the session remains restorable on in-SPA return (per AC-I2)
WHEN the user closes the browser tab from any page (not Agnes)
THEN sessionStorage is cleared by the browser naturally — no custom handling needed or desired
```

---

## 4. What We Are Explicitly NOT Building

| Exclusion | Rationale |
|---|---|
| **Cross-device regular session sync / live multi-tab sync** | Firestore active_sessions already handles persistence; real-time multi-tab coordination introduces conflict resolution complexity with no validated user need |
| **Impromptu session Vault sync** | Contradicts the core value proposition. If a user wants persistence, they should start a Regular session. Adding an optional save to Impromptu creates a false "private but saveable" mental model. |
| **Session export / download** | Out of scope for this PRD. A future Vault export feature should own this. |
| **Navigation guard on browser tab close (beforeunload confirmation dialog)** | Browsers increasingly suppress these dialogs; they create more anxiety than value in a therapy context. The existing silent `flushActiveSession` is correct. |
| **Crash detection heuristics (e.g., "did the last session end abnormally?")** | Partial Firestore recovery (AC-R3) covers the user need. Crash-type detection adds complexity without meaningfully improving the recovery experience. |
| **Per-message encryption in active_sessions** | `active_sessions` is an unencrypted staging store by design. Vault handles encryption at the session-end sync step. Encrypting individual messages in active_sessions is architectural scope creep. |
| **Session timer / inactivity timeout** | No validated user need. Therapy sessions are variable-length by nature. |

---

## 5. Implementation Notes for Developer

### State Persistence Map

| Data | Where | Lifecycle | Notes |
|---|---|---|---|
| Regular session messages | Firestore `active_sessions` | Until session end or explicit discard | Already implemented; ensure flush on SPA navigation |
| Impromptu session messages | `sessionStorage['nexus_session_agnes_current']` | Tab session only | Already implemented; no changes needed |
| `currentState` (`selecting` \| `session`) | **Derived from Firestore on mount** (regular) or **sessionStorage presence** (impromptu) — NOT stored separately | Per-mount | Do NOT persist `currentState` to localStorage or URL. It must be derived. |
| Pending vault writes (AC-V1) | In-memory queue + Firestore `active_sessions` | Until vault unlocks | New: requires a `pendingVaultSync` flag in component state or context |
| Vault lock status | Existing `encryptionKey` context | Per auth session | No new storage needed; listen to existing key availability signal |

### Selector Auto-Resume Logic

```
On Agnes mount:
  1. Check Firestore active_sessions for current user
     → If record exists AND has messages: set currentState = 'session', skip selector
     → Else: check sessionStorage['nexus_session_agnes_current']
       → If key exists AND has messages: set currentState = 'session' (impromptu resume)
       → Else: set currentState = 'selecting', render selector
  2. The existing "Reconnect Link" button ONLY appears when:
     - active_sessions exists in Firestore
     - AND mount did NOT auto-resume (i.e., something caused selector to render anyway)
     - AND user is not a guest
     This is a fallback escape hatch, not the primary flow.
```

### Navigation Guard Implementation

- Implement a `useNavigationGuard(isDirty: boolean, message: string)` hook that wraps the router's `blocker` API
- `isDirty` = `currentState === 'session' && messages.length > 0`
- Guard fires on in-SPA navigation only (not `beforeunload` — do not change existing behavior)
- Guard must call `flushActiveSession()` synchronously before allowing navigation for regular sessions
- Guard must NOT fire on programmatic navigation triggered by Agnes itself (e.g., post-logout redirect, post-session-end return to selector) — use a `bypassGuard` ref flag

### Vault Lock Handling

- Subscribe to `encryptionKey` availability in Agnes's session context
- On key becoming `null`/`undefined` mid-session: set `vaultLocked = true`, surface persistent banner (AC-V1)
- Do NOT throw or halt the session. Agnes continues writing to `active_sessions` as normal staging.
- On key becoming available again: attempt `flushPendingVaultSync()`, clear banner on success
- End-session modal must receive `vaultLocked` prop and conditionally disable "Sync to Vault" / show "Save Draft"

### Logout Handling

- The logout interceptor must live **outside** Agnes's component tree — either in a global auth context or an app-level logout handler
- Agnes must expose an imperative handle (ref or context method): `agnes.requestSessionEnd()` → returns a Promise that resolves when session is cleanly ended or discarded
- The global logout handler calls this handle and awaits resolution before proceeding with auth signout
- This decouples Agnes from the logout mechanism while ensuring ordering guarantees

---

## 6. MVP vs V2 Prioritization

### MVP (Must-Fix — ship together as atomic correctness patch)

| Item | ACs Covered | Why MVP |
|---|---|---|
| Auto-resume regular session on mount (skip selector) | AC-R1, AC-R2, AC-R3 | Core trust contract. Selector-on-return is actively wrong today. |
| Auto-resume impromptu session from sessionStorage on in-SPA return | AC-I2 | Already architecturally supported; requires only mount-time logic fix |
| Navigation guard (in-SPA) with flush for regular sessions | AC-A1, AC-A2 | Without this, the end-session Vault sync flow is silently bypassed constantly |
| Impromptu discard confirmation on "New Session" | AC-I3 | One-line data loss risk; trivially cheap to fix |
| Logout interception modal | AC-V2 | Logout without this can silently destroy in-progress session data |

### V2 (Polish — schedule separately)

| Item | ACs Covered | Why V2 |
|---|---|---|
| Vault-locked banner + pending sync queue | AC-V1 | Requires new state infrastructure; vault lock is an edge case, not the common path |
| "Session may be incomplete" recovery warning (crash) | AC-R3 (partial) | Needs diffing logic to detect incomplete records; crash is low-frequency |
| "Save Draft (Sync when Vault unlocks)" end-modal option | AC-V1 | Depends on V2 vault-lock infrastructure |
| One-time impromptu disclosure on first use | Supports AC-I1 mental model | UX polish; the mental model is still correct without it — just less explicitly communicated |
| "Session restored" toast indicator | AC-R1 | Cosmetic confirmation of correct behavior; the behavior itself is MVP |

> **MVP decision rule:** If the absence of a feature causes silent data loss or actively incorrect behavior, it is MVP. If the absence of a feature causes user confusion but no data loss, it is V2.
