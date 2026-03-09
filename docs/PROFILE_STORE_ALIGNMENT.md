# Profile Store Alignment Audit

**Task:** S1-006 — Scan all module services for cross-module Firestore writes.  
**Date:** 2025-07  
**Auditor:** Senior Engineer pass

---

## Methodology

Scanned every file in `src/modules/*/services/` for:

1. Direct Firestore writes (`setDoc`, `updateDoc`, `addDoc`) to another module's collection.
2. `GlobalProjectionService.updateCrossFunctionalState` calls writing fields outside the module's `NSV_OWNERSHIP` domain.
3. Any reads or writes to `global_souls`, `agnes_profiles`, `titan_profiles`, `ledger_profiles`, `atlas_profiles`, `scout_knowledge`, `forge_sessions`, `soma_profiles`, or `belief_graphs` from a foreign module.

---

## Collection-to-Module Ownership Map

| Collection | Owning Module |
|---|---|
| `agnes_profiles` | Agnes |
| `belief_graphs` | Agnes |
| `titan_profiles` | Titan |
| `soma_profiles` | Soma (absorbed into Titan) |
| `ledger_profiles` | Ledger |
| `atlas_profiles` | Atlas |
| `scout_knowledge` | Scout |
| `forge_sessions` | Forge |
| `global_souls` | Orchestrator / `GlobalProjectionService` (shared write path) |

---

## Findings

### ✅ No Cross-Module Profile Collection Violations Found

Every module exclusively writes to its own collection. No module writes to another module's profile collection.

| Module | Collections Written | Verdict |
|---|---|---|
| Agnes | `agnes_profiles`, `belief_graphs` | ✅ Clean |
| Titan | `titan_profiles` | ✅ Clean |
| Soma | `soma_profiles` | ✅ Clean |
| Ledger | `ledger_profiles` | ✅ Clean |
| Atlas | `atlas_profiles` | ✅ Clean |
| Scout | `scout_knowledge` | ✅ Clean |
| Forge | `forge_sessions` | ✅ Clean |

---

## GlobalProjectionService Cross-Cutting Writes (Sanctioned Pattern)

Several modules write to `global_souls` via `GlobalProjectionService.updateCrossFunctionalState`. These are **sanctioned** writes that follow the NSV ownership matrix — each module only writes to the NSV fields it owns.

| Module | File | NSV Fields Written | Within NSV_OWNERSHIP? |
|---|---|---|---|
| Atlas | `atlas/services/atlas-profile-service.ts:230` | `cognitive.activeLoad` | ✅ Yes — Atlas owns `cognitive.*` |
| Atlas | `atlas/services/actions.ts:204` | `cognitive.*` (focusScore, activeLoad, planningLoad…) | ✅ Yes — Atlas owns `cognitive.*` |
| Titan | `titan/services/actions.ts:295` | `biological.*` (cnsFatigue, sleepQuality) | ✅ Yes — Titan owns `biological.*` |
| Titan | `titan/services/actions.ts:374` | `biological.sleepQuality` | ✅ Yes |
| Titan | `titan/services/actions.ts:592` | `biological.recoveryScore` | ✅ Yes |
| Scout | `scout/services/scout-knowledge-service.ts:256` | `cognitive.researchLoad` | ✅ Yes — Scout owns `cognitive.researchLoad` |

**Conclusion:** All `GlobalProjectionService.updateCrossFunctionalState` calls respect the NSV ownership matrix. No module writes to a domain it does not own.

---

## Confirmed Correct Module Isolation

All modules correctly isolate their Firestore writes. The architecture is clean:

- **Profile data** is scoped per-module (each module has its own collection).
- **Global state (NSV)** is written through the `GlobalProjectionService` shared path, and every write is gated to that module's owned fields.
- No module bypasses another module's service layer to mutate foreign profile data.

---

## Recommendations

1. **Enforce at lint time (future):** Add an ESLint rule or CI check that validates `doc(db, '<collection>', ...)` writes are only made from the collection's owning module directory.
2. **Global soul writes via Spine:** Consider routing `GlobalProjectionService.updateCrossFunctionalState` calls through the Spine event bus so they are auditable and observable.
3. **Scout writes `cognitive.researchLoad`:** Scout owns `cognitive.researchLoad` per `NSV_OWNERSHIP` but note that `cognitive.interestDiversity` is also Scout-owned and does not yet have an auto-sync write path from Scout's service layer. No violation — just an observation that calibration is manual-only for `interestDiversity`.

---

## No Violations Found — Profile Store is Aligned
