# Anti-Pattern Scan Report — AGNES/Nexus Codebase

**Scan date:** 2025-07-14  
**Ticket:** S1-008  
**Scope:** `src/` (excluding `node_modules`, `*.test.*`, `*.spec.*`)

---

## Category 1 — Cross-Module Writes

**Definition:** A module's own service files directly importing from another module's service directory, or writing to another module's Firestore collection.

### Findings

#### VIOLATION — `titan` imports from `soma`

| Field | Detail |
|---|---|
| **File** | `src/modules/titan/services/actions.ts` |
| **Line** | 8 |
| **Import** | `import { ClearanceService } from '@/modules/soma/services/clearance-service';` |
| **Severity** | Medium |

**Analysis:** Titan's action handler directly imports `ClearanceService` from the Soma module to record activity clearances. This creates a hard compile-time dependency between two independent modules. If the Soma module is refactored, removed, or renamed, Titan's build will break.

**Recommended Fix:** Extract `ClearanceService` (or at minimum the `issueClearance` / `selfClearanceCheck` interface) into a shared lib path, e.g. `src/lib/services/clearance-service.ts`. Titan and Soma both depend on it, but neither should own it. Alternatively, emit a Spine event from Titan and let Soma subscribe — fully decoupled.

---

#### VIOLATION — `analysis-actions.ts` writes directly to `global_souls` Firestore collection

| Field | Detail |
|---|---|
| **File** | `src/lib/actions/analysis-actions.ts` |
| **Lines** | 11, 815–822 |
| **Write target** | `doc(db, 'global_souls', userId)` via `updateDoc` |
| **Severity** | High |

**Analysis:** A direct `updateDoc` call to the `global_souls` Firestore collection bypasses `GlobalProjectionService`, which is the designated write gateway for that collection. This circumvents the authority-guard layer and any future middleware (e.g., audit log, conflict resolution) that might be added to `GlobalProjectionService`.

**Recommended Fix:** Replace the direct `updateDoc` call with a call to `GlobalProjectionService`. Since `compactedInsights` is not an NSV path, add a dedicated method:

```typescript
// In GlobalProjectionService:
async appendCompactedInsight(uid: string, insight: string): Promise<void>
```

Then update `analysis-actions.ts` to call:
```typescript
await GlobalProjectionService.appendCompactedInsight(userId, summaryText);
```

---

#### VIOLATION — `ProfilePage.tsx` holds a hardcoded cross-module collection map

| Field | Detail |
|---|---|
| **File** | `src/modules/profile/ProfilePage.tsx` |
| **Lines** | 16–24 |
| **Pattern** | `MODULE_STORAGE_MAP` hardcoded with collection names for `agnes`, `titan`, `ledger`, `atlas`, `scout`, etc. |
| **Severity** | Low–Medium |

**Analysis:** The profile page maintains a local mapping of module IDs to their Firestore collection names. This is a duplication risk: if a module renames its collection (e.g., for a migration), the Profile module will silently break or write to a stale collection. The profile page is not strictly writing to another module's collection, but it is the keeper of that schema knowledge without a canonical registry.

**Recommended Fix:** Add a `firestoreCollection` field to each module's entry in `MODULE_MANIFEST` (in `src/lib/module-manifest.ts`), and have `ProfilePage.tsx` derive its map from there:

```typescript
const collection = MODULE_MANIFEST[moduleId]?.firestoreCollection;
```

This makes the manifest the single source of truth.

---

### Cross-Module Services Assessment

The following modules were scanned for cross-module service imports — all came back **clean** (imports found were within the same module's own service namespace):

| Module | Cross-Module Service Imports | Status |
|---|---|---|
| `agnes` | None | ✅ Clean |
| `titan` | `soma/services/clearance-service` | ⚠ Violation (above) |
| `ledger` | None | ✅ Clean |
| `atlas` | None | ✅ Clean |
| `scout` | None | ✅ Clean |
| `forge` | None | ✅ Clean |
| `documents` | None | ✅ Clean |

---

## Category 2 — NSV Bypass

**Definition:** Direct mutation of `crossFunctionalState` or `global_souls` outside of `GlobalProjectionService`, bypassing the ownership-gating layer.

### Findings

#### VIOLATION — Direct `updateDoc` to `global_souls` in `analysis-actions.ts`

*(Documented above in Category 1 — same violation, dual classification.)*

| Field | Detail |
|---|---|
| **File** | `src/lib/actions/analysis-actions.ts` |
| **Lines** | 815–822 |
| **Nature** | `updateDoc(doc(db, 'global_souls', userId), { compactedInsights: [...] })` |
| **Severity** | High |

This is the only confirmed direct write to the `global_souls` collection outside of designated services.

---

#### CLEAN — `crossFunctionalState` reads are widespread but read-only

The following files read `crossFunctionalState` directly from the `GlobalProjection` object (passed as a prop or from context). These are **reads only** — no mutations — and are acceptable:

| File | Line(s) | Access Type |
|---|---|---|
| `src/lib/actions/analysis-actions.ts` | 427, 533, 605, 687, 767 | Read |
| `src/lib/hooks/use-module-ai.ts` | 421 | Read |
| `src/lib/global-soul-context.tsx` | 108, 133, 159 | Read + normalize |
| `src/modules/hub/components/DailyBrief.tsx` | 186 | Read |
| `src/modules/hub/HubPage.tsx` | 108–109 | Read |
| `src/modules/ledger/LedgerPage.tsx` | 179, 192 | Read |
| `src/modules/ledger/components/LedgerDashboard.tsx` | 46–47 | Read |
| `src/modules/atlas/components/AtlasDashboard.tsx` | 87–88 | Read |
| `src/modules/atlas/components/TodaysPlanCard.tsx` | 191 | Read |
| `src/modules/agnes/components/AgnesDashboard.tsx` | 59 | Read |
| `src/modules/orchestrator/hooks/useModuleHealth.ts` | 94 | Read |
| `src/modules/orchestrator/hooks/useNexusSynthesis.ts` | 182 | Read |

Reading `crossFunctionalState` from a passed `globalSoul` object is the correct pattern — it respects the `filterGlobalSoulForModule` gating in `nsv-ownership.ts`. No fix required for these.

---

#### CLEAN — All NSV writes in module action files route through `GlobalProjectionService`

| File | Pattern | Status |
|---|---|---|
| `src/modules/agnes/services/actions.ts` | `GlobalProjectionService.updateCrossFunctionalState(...)` | ✅ Correct |
| `src/modules/titan/services/actions.ts` | `GlobalProjectionService.updateCrossFunctionalState(...)` | ✅ Correct |
| `src/modules/ledger/LedgerPage.tsx` | `GlobalProjectionService.updateCrossFunctionalState(...)` | ✅ Correct |
| `src/modules/atlas/services/actions.ts` | `GlobalProjectionService.updateCrossFunctionalState(...)` | ✅ Correct |
| `src/modules/scout/services/actions.ts` | `GlobalProjectionService.updateCrossFunctionalState(...)` | ✅ Correct |

The authority guard added to `GlobalProjectionService.updateCrossFunctionalState` (via `callerModuleId` parameter, implemented in GAP-15) will now enforce ownership at this gateway.

---

## Category 3 — Hardcoded Schemas

**Definition:** Hardcoded Firestore collection names, field IDs, or NSV path strings scattered across module files instead of using a central registry or manifest.

### Findings

#### OBSERVATION — Module-scoped services use hardcoded collection names (expected pattern)

| File | Line(s) | Hardcoded String | Module |
|---|---|---|---|
| `src/modules/ledger/services/ledger-intake-service.ts` | 201, 227, 268–269, 301 | `'ledger_profiles'` | ledger |
| `src/modules/atlas/services/atlas-profile-service.ts` | 145, 171, 212–213, 250 | `'atlas_profiles'` | atlas |
| `src/modules/scout/services/scout-knowledge-service.ts` | 167, 193, 234–235, 276 | `'scout_knowledge'` | scout |
| `src/modules/titan/services/titan-profile-service.ts` | 79, 103, 148, 179 | `'titan_profiles'` | titan |
| `src/modules/agnes/services/agnes-profile-service.ts` | 47, 73, 119, 172 | `'agnes_profiles'` | agnes |
| `src/modules/agnes/services/belief-graph-service.ts` | 75, 98, 140 | `'belief_graphs'` | agnes |
| `src/lib/services/global-projection-service.ts` | 11 | `'global_souls'` | lib |
| `src/lib/services/chat-thread-service.ts` | 5 | `'chat_threads'` | lib |
| `src/lib/services/data-transfer-service.ts` | 98 | `'global_souls'` constant | lib |

**Severity:** Low for module-owned services (acceptable), Medium for cross-references.

**Assessment:** Module-scoped profile services owning their own collection name string (e.g., `ledger-intake-service.ts` hardcoding `'ledger_profiles'`) is an **acceptable pattern** — each module owns its own Firestore namespace and the string is internal to that module. This is not a violation of encapsulation.

The `ProfilePage.tsx` case (Category 1) is the true anti-pattern here because it imports collection names from a *different module's domain* into a cross-cutting concern.

---

#### VIOLATION — `src/lib/actions/analysis-actions.ts` hardcodes `'global_souls'`

| Field | Detail |
|---|---|
| **File** | `src/lib/actions/analysis-actions.ts` |
| **Line** | 815 |
| **String** | `doc(db, 'global_souls', userId)` |
| **Severity** | Medium |

**Analysis:** The string `'global_souls'` appears as a raw literal in `analysis-actions.ts`. The canonical constant `COLLECTION = 'global_souls'` is private to `global-projection-service.ts`. If the collection is renamed in a migration, this reference would silently drift.

**Recommended Fix:** As noted in Category 2, route this write through `GlobalProjectionService` — the collection name duplication problem disappears automatically.

---

#### OBSERVATION — Soma `field-templates.ts` contains hardcoded `fieldId` strings

| Field | Detail |
|---|---|
| **File** | `src/modules/soma/field-templates.ts` |
| **Lines** | 71–113 |
| **Pattern** | `fieldId: 'cortisol-level'`, `'testosterone-level'`, etc. |
| **Severity** | Low |

**Assessment:** These are field *definitions* declared inside the module that owns them, registered via the Schema Registry. This is the correct pattern — the templates are the registry source of truth for Soma's own schema. No fix required.

---

## Summary: Overall Code Health Assessment

| Category | Violations | Severity | Status |
|---|---|---|---|
| Cross-Module Writes | 3 | High (1), Medium (1), Low (1) | ⚠ Needs attention |
| NSV Bypass | 1 | High | ⚠ Needs attention |
| Hardcoded Schemas | 1 real + observations | Medium | ⚠ Minor cleanup needed |

**Overall: Good with isolated violations.** The codebase follows strong encapsulation principles for the vast majority of modules. Module-owned services write only to their own Firestore collections and route NSV updates correctly through `GlobalProjectionService`. The three findings above are concentrated in two files (`analysis-actions.ts` and `titan/services/actions.ts`) and are addressable with targeted fixes.

### Priority Fixes

1. **[HIGH]** Move the `compactedInsights` write in `analysis-actions.ts` (line 815) to a new `GlobalProjectionService.appendCompactedInsight()` method. This eliminates both the NSV bypass and the hardcoded collection name in one move.

2. **[MEDIUM]** Extract `ClearanceService` from `src/modules/soma/services/` into `src/lib/services/clearance-service.ts` to break the Titan→Soma hard dependency.

3. **[LOW]** Add a `firestoreCollection` field to `MODULE_MANIFEST` entries and derive the `ProfilePage.tsx` collection map from it, eliminating the locally-maintained `MODULE_STORAGE_MAP`.

### What's Clean

- All module NSV write paths route through `GlobalProjectionService` ✅
- No module reads another module's Firestore collection directly ✅
- `crossFunctionalState` reads are all read-only, through proper context ✅
- Schema field definitions are owned by their declaring module ✅
- No circular module dependencies detected ✅
- The new `SoulAuthorityGuard` (GAP-15) adds enforcement at the `updateCrossFunctionalState` gateway going forward ✅
