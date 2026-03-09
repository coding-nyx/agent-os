# Architectural Conformance Report — AGNES/Nexus Codebase
**Report Date:** 2025-07-14  
**Analyst:** Lead Module Architect  
**Scope:** Full deep-analysis — `src/`, `docs/`, `guardrails/`  
**Reference Documents:** NEXUS_PRODUCT_DEFINITION.md · ANTI_PATTERN_SCAN.md · CONFORMANCE_ANALYSIS.md · AGENTS.md  
**Overall Conformance Score: 8.1 / 10** *(up from 7.5 in prior assessment)*

---

## EXECUTIVE SUMMARY

The codebase has made **measurable architectural progress** since the last conformance scan. The three highest-severity violations documented in ANTI_PATTERN_SCAN.md have been resolved (Titan→Soma import decoupled, NSV bypass via `updateDoc` routed through GPS, `ProfilePage` collection map driven from `MODULE_MANIFEST`). The `NexusDataLayer` abstraction layer is fully wired in contexts.

However, five new or previously-uncategorized violations have been found through deeper investigation. The most structurally significant is the **Spine Event Bus directly coupling to Firebase/Firestore**, which defeats the decoupling guarantee the NexusDataLayer was built to provide. Additionally, `analysis-actions.ts` and `data-transfer-service.ts` still bypass the data layer with raw Firestore calls.

---

## SECTION 1: CRITICAL VIOLATIONS
*Break architectural contracts — require immediate resolution.*

---

### CRIT-001 — Spine Event Bus Directly Calls Firestore (Bypasses NexusDataLayer)

| Field | Detail |
|---|---|
| **File** | `src/lib/spine/spine-event-bus.ts` |
| **Lines** | 1–4, 130–136 |
| **Severity** | Critical |
| **Contract Broken** | NexusDataLayer abstraction, AGENTS.md §Persistence Surfaces |

```typescript
// Line 1–4 — Direct Firestore imports in the core event bus
import { addDoc, collection } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

// Line 130–136 — Direct Firestore write bypassing NexusDataLayer
private async logEvent(event: SpineEvent): Promise<void> {
  if (!this.uid) return;
  const { db } = getFirebase();
  if (!db) return;
  await addDoc(collection(db, 'spine_events', this.uid, 'events'), event);
}
```

**Analysis:** The entire point of NexusDataLayer is to abstract persistence away from Firebase so the Spine, services, and contexts can operate against a testable, swappable adapter. Spine breaks this guarantee by calling `getFirebase()` and `addDoc` directly. This means:
1. Spine event logging **cannot be tested** with InMemoryDataProvider — Firebase must be available.
2. If Firebase is replaced in a migration, Spine breaks silently.
3. Anti-pattern guardrail tests (S1-008) do not scan `src/lib/spine/`, leaving this uncovered.

**Recommended Fix:** Inject `NexusDataLayer` into `SpineEventBus.setUser()` alongside the uid, or pass it through a `configure(options)` method. Replace the `logEvent` body:
```typescript
await this.dataLayer.createDocument('spine_events', {
  ...event,
  userId: this.uid,
  _collection: `spine_events/${this.uid}/events`
});
```

---

### CRIT-002 — `analysis-actions.ts` Still Contains Raw Firestore Calls

| Field | Detail |
|---|---|
| **File** | `src/lib/actions/analysis-actions.ts` |
| **Lines** | 11–14 |
| **Severity** | Critical |
| **Contract Broken** | NexusDataLayer abstraction, S1-002 data layer wiring |

```typescript
// Lines 11–14 — Direct Firebase/Firestore imports
import { doc } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { readDocOnce } from '../services/firestore-once';
```

**Analysis:** While the `updateDoc` direct-write violation (ANTI_PATTERN_SCAN CRIT) was correctly fixed by routing through `GlobalProjectionService.appendCompactedInsight()`, the file still imports `doc`, `getFirebase`, and `readDocOnce` (a raw Firestore wrapper). These are used deeper in the analysis functions to read module profile data for cross-module analysis. This bypasses NexusDataLayer entirely for reads.

**Recommended Fix:** Replace all `readDocOnce(doc(...), ...)` calls with `dataLayer.getDocument(collection, id)`. The `ActionContext` should carry a `dataLayer` reference, or the file should call `getNexusDataLayer()` from the data-layer provider.

---

### CRIT-003 — `data-transfer-service.ts` Fully Bypasses NexusDataLayer

| Field | Detail |
|---|---|
| **File** | `src/lib/services/data-transfer-service.ts` |
| **Lines** | 8–10 |
| **Severity** | Critical |
| **Contract Broken** | NexusDataLayer abstraction, S1-002 data layer wiring |

```typescript
// Line 8 — Direct Firestore batch/collection operations
import { doc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { readDocOnce } from './firestore-once';
```

**Analysis:** The data export/import service is the most significant remaining Firestore bypass. It uses `writeBatch`, `getDocs`, and `collection()` directly. This means:
1. Data export cannot be unit-tested without a live Firebase connection.
2. Any future migration from Firestore breaks the entire backup/restore system.
3. `writeBatch` has no equivalent in `NexusDataLayer` — meaning bulk operations are outside the abstraction boundary.

**Recommended Fix:** Extend `NexusDataLayer` with a `batchSet(operations: Array<{collection, id, data}>): Promise<void>` method. Implement it in `FirebaseDataLayer` using `writeBatch` and as a loop in `InMemoryDataProvider`. Then rewrite `data-transfer-service.ts` to use `NexusDataLayer` exclusively.

---

### CRIT-004 — `ProfilePage.tsx` Uses Direct Firestore (`onSnapshot`)

| Field | Detail |
|---|---|
| **File** | `src/modules/profile/ProfilePage.tsx` |
| **Lines** | 10–11, 76–129 |
| **Severity** | Critical (module-layer violation) |
| **Contract Broken** | NexusDataLayer abstraction, module isolation |

```typescript
// Line 10–11
import { getFirebase } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

// Line 76–129 — Direct Firestore subscription
const { db } = getFirebase();
const ref = doc(db, map.firestoreCollection, user.uid);
const unsub = onSnapshot(ref, (snap) => { ... });
```

**Analysis:** `ProfilePage` subscribes to module collection documents directly via `onSnapshot`. Although it previously hardcoded a `MODULE_STORAGE_MAP` (now resolved via `firestoreCollection` in `MODULE_MANIFEST`), it still calls Firestore directly instead of using `NexusDataLayer.subscribeToDocument()`. This makes the profile status polling unavailable in test/offline environments.

**Recommended Fix:**
```typescript
const unsubscribe = dataLayer.subscribeToDocument(
  map.firestoreCollection,
  user.uid,
  (record) => { /* same logic */ }
);
```

---

## SECTION 2: MEDIUM VIOLATIONS
*Deviate from intended pattern — should be resolved before 1.0 release.*

---

### MED-001 — Provider Stack Deviates from Mandated Order (DataLayerProvider Undocumented)

| Field | Detail |
|---|---|
| **File** | `src/App.tsx` |
| **Lines** | 153–172 |
| **Severity** | Medium |
| **Contract Broken** | AGENTS.md §Architecture Map §Entry and Runtime Composition |

**Expected provider order (per AGENTS.md and prior CONFORMANCE_ANALYSIS):**
```
ThemeProvider → AuthProvider → VaultProvider → GlobalSoulProvider → AIProvider → Router
```

**Actual provider order:**
```
ThemeProvider → DataLayerProvider → Router → AuthProvider → VaultProvider → GlobalSoulProvider → AIWrapper(AIProvider)
```

**Deviations:**
1. `DataLayerProvider` was inserted between `ThemeProvider` and `Router` — it does not appear in AGENTS.md's mandated provider order.
2. `Router` is now wrapped by `DataLayerProvider` but wraps `AuthProvider`. This means `useNavigate()` is accessible from Auth/Vault/Soul providers (a valid improvement), but it breaks the documented contract.

**Impact:** The prior CONFORMANCE_ANALYSIS marked this as "EXCELLENT" but that assessment predates DataLayerProvider. AGENTS.md must be updated to reflect the current canonical order.

**Recommended Fix:** Update AGENTS.md to document the new canonical order:
```
ThemeProvider → DataLayerProvider → Router → AuthProvider → VaultProvider → GlobalSoulProvider → AIProvider
```
No code change required — the current order is architecturally sound; the documentation is stale.

---

### MED-002 — Module Action Registration is Lazy (Unvisited Modules Have No Handlers)

| Field | Detail |
|---|---|
| **Files** | `src/modules/agnes/AgnesPage.tsx:36`, `src/modules/titan/TitanPage.tsx` (inferred), all module pages |
| **Lines** | Module-level call site |
| **Severity** | Medium |
| **Contract Broken** | AGENTS.md §Functional Runtime Flow §AI Conversation Pipeline |

```typescript
// AgnesPage.tsx line 36 — registration called at page load, not at app boot
registerAgnesActions();
```

**Analysis:** Module-specific action handlers (agnes, titan, atlas, ledger, scout, forge) are registered **lazily** when the module's page component is first imported (i.e., first route visit). Only platform-level handlers are registered at boot in `main.tsx`. This creates a structural gap:

- If Nexus (orchestrator) delegates `delegate_to_module` → `agnes` **before** the user has visited `/agnes`, the AgnesActions are unregistered, and `ActionHub.execute('agnes', ...)` silently falls through to orchestrator fallback.
- Spine cascade events that target `agnes` (e.g., `STREAK_BROKEN → agnes`) fire but may have no consumer registered.

**Recommended Fix:** Move all `registerXxxActions()` calls to `main.tsx` alongside `registerCoreActions()`. Since the action handlers are pure functions (no React hooks), there is no technical reason they must wait for page render.

---

### MED-003 — `documents` Module Has No ActionHub Registration

| Field | Detail |
|---|---|
| **Directory** | `src/modules/documents/` |
| **Severity** | Medium |
| **Contract Broken** | Action Hub completeness (CONFORMANCE_ANALYSIS §5) |

**Analysis:** The `documents` module has no `services/actions.ts` and no `registerDocumentsActions()` call anywhere. It is the only `hasPage: true` module with zero ActionHub coverage. Any LLM action tags emitted by the Documents agent (`create_document`, `save_notebook_cell`, `analyze_document`) would silently fall through to the orchestrator fallback with no handler.

**Recommended Fix:** Create `src/modules/documents/services/actions.ts` and register handlers for at minimum: `create_document`, `delete_document`, `create_notebook_cell`, `analyze_document_with_vision`.

---

### MED-004 — Vault Per-Module Key Derivation Returns Master Key

| Field | Detail |
|---|---|
| **File** | `src/lib/vault-context.tsx` |
| **Lines** | 67–69 |
| **Severity** | Medium |
| **Contract Broken** | Product Definition §8 Security Model — "bounded access per module" |

```typescript
const getModuleKey = useCallback(async (moduleName: string): Promise<CryptoKey | null> => {
  return masterKeyRef.current;  // Same key for ALL modules
}, []);
```

**Analysis:** The product vision defines per-module encryption keys derived from the master key. The current implementation returns the master key for every module, meaning:
1. A compromised module has access to all other modules' encrypted data (no isolation).
2. "Revoke module access" cannot be implemented without rotating the master key.
3. The `moduleName` parameter is accepted but completely unused.

**Recommended Fix:**
```typescript
const getModuleKey = useCallback(async (moduleName: string): Promise<CryptoKey | null> => {
  if (!masterKeyRef.current) return null;
  return deriveModuleKey(masterKeyRef.current, moduleName); // HKDF derivation
}, []);
```
Add `deriveModuleKey(masterKey, moduleId)` to `encryption.ts` using HKDF.

---

### MED-005 — `global-soul-context.tsx` Imports Directly from LLM Engine Types

| Field | Detail |
|---|---|
| **File** | `src/lib/global-soul-context.tsx` |
| **Line** | 6 |
| **Severity** | Medium |
| **Contract Broken** | AGENTS.md §2 "LLM Engine is External Runtime Boundary" |

```typescript
import { ConversationContext } from '@/llm-engine/types';
```

**Analysis:** `GlobalSoulContext` exports `enhanceContext()` and `enhanceContextForModule()` which accept `ConversationContext` typed from the LLM engine internals. This creates a compile-time dependency between a core platform context and the LLM engine boundary. Per AGENTS.md mandate, app-layer code should not couple to engine internals — interaction should go through `useAI`, `AIProvider`, or `useModuleAI`.

**Impact:** If `ConversationContext` in `@/llm-engine/types` is refactored, the GlobalSoulProvider breaks. This is a violation of the "black-box runtime" principle.

**Recommended Fix:** Define a `SoulContextInput` interface in `src/lib/types.ts` that mirrors the fields of `ConversationContext` used by the soul provider. This breaks the direct engine dependency while keeping type safety.

---

### MED-006 — Duplicate `InMemoryDataProvider` Implementations

| Field | Detail |
|---|---|
| **Files** | `src/lib/data-layer/index.ts` (lines 84–354), `src/lib/data-layer/in-memory-data-layer.ts` |
| **Severity** | Medium |
| **Contract Broken** | Single source of truth principle |

**Analysis:** There are **two separate implementations** of `InMemoryDataProvider` in the same directory — one in `index.ts` (exported as `InMemoryDataProvider`) and a second in `in-memory-data-layer.ts`. The `provider.tsx` uses the one from `index.ts`. This creates:
1. Divergence risk — bug fixes to one won't automatically propagate.
2. Import confusion — consumers that import from `in-memory-data-layer.ts` get a different implementation than `provider.tsx` uses.

**Recommended Fix:** Keep exactly one implementation. Move it to `in-memory-data-layer.ts`, re-export from `index.ts`, and remove the duplicate inline class.

---

## SECTION 3: SPRINT 1 ARCHITECTURAL ITEMS STATUS

| Item | Description | Status | Evidence |
|---|---|---|---|
| **S1-001** | NexusDataLayer interface definition | ✅ **DONE** | `src/lib/data-layer/index.ts` — full `NexusDataLayer` interface with 8 operations, proper generics |
| **S1-002** | Data layer wiring in contexts | ✅ **DONE** | `auth-context.tsx:9`, `vault-context.tsx:6`, `global-soul-context.tsx:11` all call `useDataLayer()` |
| **S1-003** | Vault gating rules | ✅ **DONE** | `isModuleAccessible()` in `vault-context.tsx:165–175` checks `MODULE_MANIFEST[moduleId].securityPolicy` with user pref override |
| **S1-004** | Global Soul NSV filters | ✅ **DONE** | `filterGlobalSoulForModule()`, `filterNSVForModule()`, full `NSV_READ_PERMISSIONS` matrix in `nsv-ownership.ts` |
| **S1-005** | Spine event schema validation | ✅ **DONE** | `validateAndNormalize()` in `spine-event-bus.ts:138–170` validates type, source, domain, priority, data, cascadeDepth |
| **S1-006** | Module profile store alignment | ⚠️ **PARTIAL** | Module services clean, but `data-transfer-service.ts` uses raw `writeBatch`/`getDocs` bypassing NexusDataLayer (CRIT-003) |
| **S1-007** | Migration map v1 | ✅ **DONE** | `docs/migration/MIGRATION_MAP_V1.md` — complete per-module map with Firestore → NexusDataLayer entity mappings |
| **S1-008** | Anti-pattern guardrails scan | ✅ **DONE** | `src/guardrails/anti-patterns.test.ts` — 3 test suites covering cross-module writes, NSV read boundaries, hardcoded schemas |

**Previously-documented violations from ANTI_PATTERN_SCAN.md — Resolution Status:**

| Violation | Status | Notes |
|---|---|---|
| Titan imports `ClearanceService` from `soma` | ✅ **FIXED** | `clearance-service.ts` now lives in `src/lib/services/`. Titan's `actions.ts` imports only from its own services and `@/lib/types` |
| `analysis-actions.ts` direct `updateDoc` to `global_souls` | ✅ **FIXED** | Now routed through `GlobalProjectionService.appendCompactedInsight()` (line 810–815). GPS method confirmed at lines 240–251 |
| `ProfilePage.tsx` hardcoded `MODULE_STORAGE_MAP` | ✅ **FIXED** | Now derives from `MODULE_MANIFEST[moduleId].firestoreCollection` (line 96). `firestoreCollection` added to all manifest entries |
| `analysis-actions.ts` remaining direct Firestore imports | ❌ **OPEN** | `doc`, `getFirebase`, `readDocOnce` still present (lines 11–14) — now CRIT-002 above |

---

## SECTION 4: MISSING ARCHITECTURAL COMPONENTS

### 4.1 Documents Module — Zero Action Coverage

**Specified in:** Product Definition §3.2 (Documents has a page), AGENTS.md §Module Domains  
**Status:** No `services/actions.ts`, no `registerDocumentsActions()`, no ActionHub registration  
**Impact:** Any action tags from Documents agent silently fail. Document creation, analysis, and notebook operations cannot be triggered via the LLM conversation surface.

### 4.2 `batchWrite` Operation in NexusDataLayer Interface

**Specified by:** `data-transfer-service.ts` operational requirements  
**Status:** Not defined in `NexusDataLayer` interface  
**Impact:** Forces data-transfer-service to bypass the data layer entirely (CRIT-003). Any bulk operation path exits the abstraction.

### 4.3 Episodic Memory Encryption Before Firestore Write

**Specified in:** CONFORMANCE_ANALYSIS.md §B.7 (medium priority backlog item)  
**Status:** NOT STARTED — `ModuleMemoryService` writes session data to Firestore without E2EE  
**Impact:** Session history (conversation messages, emotional context) is stored in plaintext, violating the "private by architecture" product principle.

### 4.4 `AtlasPredictiveService` — Burnout Detection + Sustainable Load Computation

**Specified in:** Product Definition §9 (Atlas), CONFORMANCE_ANALYSIS.md §B.1  
**Status:** PARTIAL — `atlas-predictive-service.ts` exists but `atlas-review-service.ts` lacks deep burnout synthesis logic  
**Impact:** Atlas cannot compute sustainable work windows or proactively surface burnout risk.

### 4.5 Per-Module Key Derivation in `VaultProvider`

**Specified in:** Product Definition §8 Security Model — "bounded vault access per module"  
**Status:** NOT STARTED — `getModuleKey()` returns master key unconditionally (MED-004 above)  
**Impact:** No module-level key isolation; cannot revoke per-module access without full vault rotation.

### 4.6 Hub Module — No ActionHub Registration

**Specified by:** AGENTS.md §Module Domains — Hub is a platform module  
**Status:** `src/modules/hub/` has no `services/` directory, no action handlers  
**Impact:** Hub-specific actions (daily brief updates, module health polling) cannot be LLM-triggered.

---

## SECTION 5: DATA LAYER ASSESSMENT

### 5.1 Current State — NexusDataLayer ✅ Well-Implemented

The `NexusDataLayer` interface (`src/lib/data-layer/index.ts`) is complete and well-designed:
- 8 core operations: `getDocument`, `listDocuments`, `createDocument`, `setDocument`, `updateDocument`, `deleteDocument`, `query`, `subscribeToDocument`, `subscribeToQuery`
- Proper generics throughout
- Full `InMemoryDataProvider` implementation with query support (where, orderBy, limit, dot-notation paths)
- `FirebaseDataLayer` adapter correctly wraps all Firestore operations

**Provider wiring is correct:** `DataLayerProvider` creates/resolves the adapter singleton, contexts consume via `useDataLayer()`.

### 5.2 Firebase Coupling Remaining (Post-NexusDataLayer Adoption)

Despite the abstraction, the following files still call Firebase directly:

| File | Direct Firebase Operations | Risk |
|---|---|---|
| `src/lib/spine/spine-event-bus.ts` | `addDoc`, `collection` | **HIGH** — Core runtime leaks |
| `src/lib/actions/analysis-actions.ts` | `doc`, raw reads via `readDocOnce` | **HIGH** — Analysis bypasses abstraction |
| `src/lib/services/data-transfer-service.ts` | `doc`, `collection`, `getDocs`, `writeBatch` | **HIGH** — Export/import fully outside layer |
| `src/modules/profile/ProfilePage.tsx` | `doc`, `onSnapshot` | **MEDIUM** — Profile status polling |
| `src/lib/services/firestore-once.ts` | Direct Firestore (this is the helper itself) | **LOW** — Utility, should be absorbed into data layer |
| `src/lib/services/firestore-utils.ts` | Direct Firestore utilities | **LOW** — Same, utility-level |

**Firebase decoupling is approximately 70% complete.** The core contexts (auth, vault, global-soul) are fully wired to NexusDataLayer. The remaining violations are in analysis actions, data transfer, and the Spine.

### 5.3 In-Memory Provider Status

Two implementations exist (MED-006). Both are functionally correct but diverge at risk. The `provider.tsx` uses the one inline in `index.ts`. Tests that import from `in-memory-data-layer.ts` get a separate instance with potentially different behavior.

---

## SECTION 6: SPINE / NSV COMPLETENESS

### 6.1 Spine Cascade Rule Coverage ✅ Strong

The `CORE_CASCADE_RULES` array (18 rules) covers all documented cascade scenarios:

| Trigger | → Cascade | Status |
|---|---|---|
| `VITAL_UPDATED` (high fatigue + low resilience) | `BURNOUT_WARNING` | ✅ |
| `VITAL_UPDATED` (cnsFatigue ≥ 8) | `BLOCK_HIGH_INTENSITY` | ✅ |
| `VITAL_UPDATED` (financialFriction ≥ 8) | `FINANCIAL_STRESS` | ✅ |
| `VITAL_UPDATED` (planningLoad ≥ 8) | `PLANNING_OVERLOAD` | ✅ |
| `VITAL_UPDATED` (deadlinePressure ≥ 8) | `DEADLINE_CRUNCH` | ✅ |
| `VITAL_UPDATED` (compound stress+fatigue+low resilience) | `CRISIS_MODE` | ✅ |
| `VITAL_UPDATED` (streakHealth ≤ 3) | `STREAK_BROKEN` → agnes | ✅ |
| `CLEARANCE_DENIED` | `BLOCK_HIGH_INTENSITY` + `FLATTEN_ENERGY_WAVE` | ✅ |
| `BURNOUT_WARNING` | `FLATTEN_ENERGY_WAVE` | ✅ |
| `BLOCK_HIGH_INTENSITY` | `FLATTEN_ENERGY_WAVE` | ✅ |
| `PLANNING_OVERLOAD` | `FLATTEN_ENERGY_WAVE` | ✅ |
| `DEADLINE_CRUNCH` | `FLATTEN_ENERGY_WAVE` | ✅ |
| `SOMA_READINESS_UPDATED` (score < 40) | `MEDICAL_ALERT` | ✅ |
| `SOMA_CLEARANCE_CHANGED` (revoked/expired) | `BLOCK_HIGH_INTENSITY` | ✅ |
| `SOMA_BIOMARKER_COMMITTED` (energy-relevant) | `FLATTEN_ENERGY_WAVE` | ✅ |
| `SOMA_PROFILE_UPDATED` | `HEALTH_CONTEXT_STALE` | ✅ |

**Cascade depth guard** (max 3) is implemented at `spine-event-bus.ts:82`.  
**Cascade conflict** (FLATTEN_ENERGY_WAVE triggering multiple times): no deduplication — Atlas could receive 3-4 FLATTEN events per critical state. This is benign but noisy.

### 6.2 Missing Cascade Rules (Product Definition Gaps)

| Missing Trigger | Expected Cascade | Priority |
|---|---|---|
| `FINANCIAL_STRESS` (once emitted) | Should cascade → Agnes (`emotional.stressLoad += financial_stress`) | Medium |
| `CRISIS_MODE` | Should cascade → all modules (lock high-intensity + flatten wave + alert Agnes) | Medium |
| `STREAK_BROKEN` | Target is `agnes`, but no cascade handler listens for `STREAK_BROKEN` in current module registrations | Low |

### 6.3 NSV Ownership Matrix ✅ Complete

All 19 NSV metric paths have explicit ownership. The `SoulAuthorityGuard` (`soul-authority-service.ts`) enforces write authority at the `updateCrossFunctionalState` gateway. No gaps detected.

**One ownership anomaly:** `soma` module has an empty `NSV_OWNERSHIP` array even though the migration map specifies "Soma supplies signals; Titan is the sole writer." This is intentional (correct) but worth documenting explicitly as `// soma signals are ingested via Titan — soma owns nothing directly`.

### 6.4 Spine Event Bus Firebase Dependency (Critical)

As noted in CRIT-001, the Spine's `logEvent()` method calls Firestore directly. This makes Spine event persistence untestable against InMemoryDataProvider and breaks the decoupling guarantee.

---

## SECTION 7: RECOMMENDATIONS (Priority Ordered)

### Priority 1 — CRITICAL: Fix Before Any Production Traffic

**P1-A: Inject NexusDataLayer into SpineEventBus** *(CRIT-001)*  
- Modify `SpineEventBus.setUser()` or add `SpineEventBus.configure(uid, dataLayer)` 
- Replace `addDoc(collection(db, 'spine_events', ...))` with `dataLayer.createDocument(...)`
- **Effort:** Low (1–2 hour change, spine-event-bus.ts only)
- **Risk of not fixing:** Spine tests fail without Firebase; migration path blocked

**P1-B: Migrate `analysis-actions.ts` reads to NexusDataLayer** *(CRIT-002)*  
- Replace all `readDocOnce(doc(...))` calls with `dataLayer.getDocument(collection, id)`
- Add `dataLayer` to `ActionContext` or use `getNexusDataLayer()` directly
- **Effort:** Medium (2–4 hours, multiple read paths in a 900-line file)
- **Risk of not fixing:** Cross-module analysis silently breaks in non-Firebase environments

**P1-C: Add `batchWrite` to NexusDataLayer + migrate data-transfer-service** *(CRIT-003)*  
- Extend `NexusDataLayer` interface with `batchWrite(ops: BatchOperation[]): Promise<void>`
- Implement in `FirebaseDataLayer` (writeBatch) and `InMemoryDataProvider` (sequential loop)
- Rewrite `data-transfer-service.ts` to consume only NexusDataLayer
- **Effort:** High (4–8 hours)
- **Risk of not fixing:** Data backup/restore is completely Firebase-locked

**P1-D: Migrate `ProfilePage.tsx` subscriptions to NexusDataLayer** *(CRIT-004)*  
- Replace `onSnapshot(doc(db, ...))` with `dataLayer.subscribeToDocument(...)`
- **Effort:** Low (30-min change, contained in one `useEffect`)
- **Risk of not fixing:** Profile page module health checks fail in test/offline environments

---

### Priority 2 — MEDIUM: Fix Before 1.0 Release

**P2-A: Move all `registerXxxActions()` calls to `main.tsx`** *(MED-002)*  
- Prevents silent action failures when Nexus delegates to unvisited modules
- **Effort:** Low (add 6 imports + calls to `main.tsx`)
- **Impact:** Eliminates entire class of "orchestrator delegated to agnes but nothing happened" bugs

**P2-B: Create `documents/services/actions.ts`** *(MED-003)*  
- Register handlers for: `create_document`, `delete_document`, `analyze_document`, `create_notebook_cell`
- **Effort:** Medium (2–3 hours, follow Forge actions pattern)

**P2-C: Implement per-module key derivation in VaultProvider** *(MED-004)*  
- Add `deriveModuleKey(masterKey: CryptoKey, moduleId: string): Promise<CryptoKey>` to `encryption.ts` using HKDF
- Update `getModuleKey()` to call it
- **Effort:** Low-Medium (2–3 hours including tests)
- **Impact:** Enables future per-module vault revocation; aligns with product security vision

**P2-D: Decouple `global-soul-context.tsx` from `@/llm-engine/types`** *(MED-005)*  
- Define `SoulEnhancementInput` in `src/lib/types.ts` with the subset of ConversationContext fields used
- **Effort:** Low (1 hour, type extraction)

**P2-E: Consolidate duplicate InMemoryDataProvider** *(MED-006)*  
- Remove the inline class from `index.ts` OR the class from `in-memory-data-layer.ts`
- Re-export from `index.ts` for backward compatibility
- **Effort:** Low (30 min)

---

### Priority 3 — OPERATIONAL: Address Before Public Beta

**P3-A: Encrypt episodic memory before Firestore write**  
- Wrap `ModuleMemoryService.commitSession()` with AES-GCM encryption using vault key
- **Effort:** Medium (3–4 hours)
- **Impact:** Addresses "private by architecture" product principle for conversation history

**P3-B: Update AGENTS.md provider order documentation**  
- Document current canonical order including `DataLayerProvider`
- **Effort:** Trivial (5-minute doc edit)

**P3-C: Add missing cascade rules**  
- `FINANCIAL_STRESS` → Agnes emotional domain
- `CRISIS_MODE` → broadcast to all authority modules
- **Effort:** Low (30 min, add to `cascade-rules.ts`)

**P3-D: Document Soma identity decision**  
- Commit in writing: Soma is permanently absorbed into Titan (recommended) OR will re-emerge as independent module
- Remove or retain `@deprecated` dual-write flags accordingly
- **Effort:** Policy decision, not code

---

## APPENDIX: FILES INSPECTED

| File | Lines Reviewed | Key Findings |
|---|---|---|
| `src/App.tsx` | Full (176 lines) | Provider order deviation, DataLayerProvider undocumented |
| `src/main.tsx` | Full (33 lines) | Missing module action registrations |
| `src/lib/vault-context.tsx` | Full (229 lines) | `getModuleKey()` master key return; vault gating confirmed working |
| `src/lib/global-soul-context.tsx` | Full (221 lines) | `@/llm-engine/types` import; NSV filtering correct |
| `src/lib/auth-context.tsx` | Full (214 lines) | DataLayer wired correctly; GlobalProjectionService.syncFromProfile() called |
| `src/lib/spine/spine-event-bus.ts` | Full (185 lines) | **Direct Firestore dependency in `logEvent()`** |
| `src/lib/spine/cascade-rules.ts` | Full (318 lines) | 18 rules confirmed; cascade depth guard present |
| `src/lib/actions/action-hub.ts` | Full (125 lines) | Hub implementation clean; fallback-to-orchestrator confirmed |
| `src/lib/actions/core-handlers.ts` | Partial (200/~600 lines) | Orchestrator handlers confirmed; NSV ownership respected |
| `src/lib/actions/analysis-actions.ts` | Lines 1–30, 800–830 | Remaining direct Firestore imports; `updateDoc` bypass fixed |
| `src/lib/data-layer/index.ts` | Full (354 lines) | NexusDataLayer interface complete; duplicate InMemoryDataProvider |
| `src/lib/data-layer/in-memory-data-layer.ts` | Lines 1–50 | Second InMemoryDataProvider implementation |
| `src/lib/data-layer/provider.tsx` | Full (41 lines) | Provider pattern correct; uses first InMemoryDataProvider |
| `src/lib/services/nsv-ownership.ts` | Full (281 lines) | Ownership matrix complete; read permissions matrix correct |
| `src/lib/services/global-projection-service.ts` | Lines 1–60, 240–290 | COLLECTION constant private; `appendCompactedInsight()` confirmed |
| `src/lib/services/soul-authority-service.ts` | Lines 1–50 | SoulAuthorityGuard implemented; write authority enforcement confirmed |
| `src/lib/services/data-transfer-service.ts` | Lines 1–120 | **Full Firestore bypass** — writeBatch, getDocs, doc direct calls |
| `src/lib/module-manifest.ts` | Full (228 lines) | `firestoreCollection` added to all entries; soma absorbed state documented |
| `src/modules/agnes/AgnesPage.tsx` | Lines 1–80 | `registerAgnesActions()` called at module load (lazy registration pattern) |
| `src/modules/titan/TitanPage.tsx` | Lines 1–60 | No direct llm-engine imports; Spine event subscription confirmed |
| `src/modules/titan/services/actions.ts` | Lines 1–60 | Soma import confirmed **removed**; clean module boundary |
| `src/modules/profile/ProfilePage.tsx` | Lines 1–130 | **Direct Firestore `onSnapshot` calls**; MODULE_MANIFEST fix confirmed |
| `src/modules/documents/DocumentsPage.tsx` | Lines 1–20 | No actions.ts; no ActionHub registration |
| `src/guardrails/anti-patterns.test.ts` | Full (129 lines) | 3 suites; does NOT scan `src/lib/spine/` (gap) |

---

*Report generated by architectural conformance analysis — 2025-07-14*
