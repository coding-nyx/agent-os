# Migration Map v1 — Firestore Collections → NexusDataLayer Entities

**Status:** Design Complete  
**Spike ID:** S1-007  
**Owner:** Platform / Architecture  
**Purpose:** Single authoritative reference for every Firestore collection: who owns it, what NSV fields it updates, whether it is vault-gated, and how it maps to the NexusDataLayer entity model.

---

## Legend

- **Vault-Gated:** Whether the collection's data requires the user's vault (encryption key) to read/write. `Yes` = E2EE encrypted in Firestore. `No` = plaintext or metadata-only.
- **NSV Fields Updated:** NSV fields written as a result of reads/writes to this collection. `—` means the collection itself does not trigger NSV updates; downstream services may.
- **NexusDataLayer Entity:** The logical entity name in the planned NexusDataLayer abstraction (future data access layer that wraps all Firestore reads/writes behind a typed service interface).
- **Write Authority:** The module(s) permitted to write to this collection.

---

## Collection Map

### 1. `users/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `users/{userId}` |
| **Owning Module** | Orchestrator (Nexus) |
| **Write Authority** | Orchestrator, Auth layer |
| **Vault-Gated** | No (plaintext; contains no sensitive health/financial data) |
| **NSV Fields Updated** | None directly. `typicalSleepHours` and `age` may inform Titan's biological baseline but are not written to NSV automatically. |
| **NexusDataLayer Entity** | `CoreUserProfile` |
| **Schema Reference** | `CoreUserProfile` interface in `src/lib/types.ts` |
| **Notes** | Stores identity, preferences, `agentPersonalityProvision` (module aliases, genders), `securityPreferences.vaultLocks`. The `schemaVersion` field is used for migration guards. |

---

### 2. `vaults/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `vaults/{userId}` |
| **Owning Module** | Vault system (`vault-context.tsx`) |
| **Write Authority** | Vault service only |
| **Vault-Gated** | Yes (stores the encrypted vault key itself — double-encrypted with user passphrase) |
| **NSV Fields Updated** | None |
| **NexusDataLayer Entity** | `VaultKeyEnvelope` |
| **Schema Reference** | `{ encryptedKey: string, iv: string, salt: string, createdAt: string }` |
| **Notes** | The vault key unlocks all E2EE module profiles. Never read in plaintext by module services. Read only by `VaultContext` during vault unlock. |

---

### 3. `global_souls/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `global_souls/{userId}` |
| **Owning Module** | Orchestrator (`global-soul-context.tsx`, `global-projection-service.ts`) |
| **Write Authority** | Orchestrator; individual modules write via `updateCrossFunctionalState()` |
| **Vault-Gated** | No (NSV values are numeric; no PII; see Notes) |
| **NSV Fields Updated** | **ALL** — this IS the NSV store. All `NeuralStateVector` fields live here. |
| **NexusDataLayer Entity** | `GlobalProjection` |
| **Schema Reference** | `GlobalProjection` interface in `src/lib/types.ts` |
| **Notes** | The `crossFunctionalState: NeuralStateVector` field is the live NSV. All modules read it via `useGlobalSoul()`. Modules write their owned fields via `updateCrossFunctionalState(patch)`. Not vault-gated because NSV fields (0-10 numeric scores) are not individually identifiable; however, `compactedInsights` (string array) may be quasi-sensitive and should be reviewed. |

**NSV Field → Module Ownership (from `nsv-ownership.ts`):**

| NSV Path | Owner Module |
|---|---|
| `biological.cnsFatigue` | Titan |
| `biological.sleepQuality` | Titan |
| `biological.recoveryScore` | Titan |
| `biological.hormonalContext` | Titan |
| `emotional.emotionalResilience` | Agnes |
| `emotional.stressLoad` | Agnes |
| `emotional.moodTrend` | Agnes |
| `emotional.traumaMarkers` | Agnes |
| `cognitive.energyBudget` | Atlas |
| `cognitive.focusScore` | Atlas |
| `cognitive.activeLoad` | Atlas |
| `cognitive.planningLoad` | Atlas |
| `cognitive.taskCompletionRate` | Atlas |
| `cognitive.researchLoad` | Scout |
| `cognitive.interestDiversity` | Scout |
| `planning.streakHealth` | Atlas |
| `planning.deadlinePressure` | Atlas |
| `resource.financialFriction` | Ledger |
| `resource.resonanceROI` | Ledger |

---

### 4. `agnes_profiles/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `agnes_profiles/{userId}` |
| **Owning Module** | Agnes |
| **Write Authority** | Agnes module only |
| **Vault-Gated** | Yes (contains therapeutic data, mood logs, trauma markers — highest sensitivity) |
| **NSV Fields Updated** | `emotional.emotionalResilience`, `emotional.stressLoad`, `emotional.moodTrend`, `emotional.traumaMarkers` |
| **NexusDataLayer Entity** | `AgnesProfile` |
| **Schema Reference** | Agnes profile type (in Agnes module types) |
| **Notes** | Contains therapeutic baseline, session insights, belief graph references. E2EE mandatory. `traumaMarkers` is the most sensitive field — only Agnes's LLM prompt receives it (enforced by `NSV_READ_PERMISSIONS`). |

---

### 5. `belief_graphs/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `belief_graphs/{userId}` |
| **Owning Module** | Agnes |
| **Write Authority** | Agnes module only |
| **Vault-Gated** | Yes (belief/value structures are deeply personal) |
| **NSV Fields Updated** | None directly. Belief graph shifts may inform Agnes's NSV writes (stressLoad, resilience) indirectly through session outcomes. |
| **NexusDataLayer Entity** | `BeliefGraph` |
| **Schema Reference** | Agnes module — belief graph types |
| **Notes** | Stores the user's core belief structures, value hierarchies, and identified cognitive distortions. Used by Agnes for therapeutic framing. Must never be read by other modules. |

---

### 6. `titan_profiles/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `titan_profiles/{userId}` |
| **Owning Module** | Titan |
| **Write Authority** | Titan module |
| **Vault-Gated** | Yes (`TitanPrivacyLevel: 'complete'` triggers E2EE; `'basic'` may not) |
| **NSV Fields Updated** | `biological.cnsFatigue`, `biological.sleepQuality`, `biological.recoveryScore`, `biological.hormonalContext` |
| **NexusDataLayer Entity** | `TitanProfile` |
| **Schema Reference** | `TitanProfile` interface in `src/lib/types.ts` |
| **Notes** | Contains workout routines, supplement stack, macros, sleep config, cycle data. Does NOT contain Soma biomarkers (those live in `soma_profiles`). Post-merge (S1-012): any legacy biomarker fields in `TitanProfile` are deprecated and will be removed. |

---

### 7. `soma_profiles/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `soma_profiles/{userId}` |
| **Owning Module** | **Titan** (post S1-012 merge; was Soma) |
| **Write Authority** | Titan (via `soma-profile-service.ts`) |
| **Vault-Gated** | Yes (biomarkers, lab results, clearances, medical conditions — clinical sensitivity) |
| **NSV Fields Updated** | `biological.recoveryScore` (via readiness score mapping), `biological.cnsFatigue` (indirect via cascade: `SOMA_READINESS_UPDATED` → `MEDICAL_ALERT` → Titan NSV write) |
| **NexusDataLayer Entity** | `SomaProfile` (retained as a distinct entity even post-merge) |
| **Schema Reference** | `SomaProfile` interface in `src/modules/soma/types.ts` |
| **Notes** | **Collection name permanently retained** per S1-012 decision (data continuity, E2EE integrity). Contains: `biomarkers[]`, `labSummaries[]`, `clearances[]`, `medicalImageAnalyses[]`, `knownConditions[]`, `medications[]`, `allergies[]`. Written by Titan as Medical Mode. |

**Cascade Chain:**
```
soma_profiles write
  → soma-profile-service.ts saves
  → Spine: SOMA_PROFILE_UPDATED (priority: info)
    → cascade: HEALTH_CONTEXT_STALE (target: orchestrator)
      → Nexus re-fetches GlobalProjection on next render
```

---

### 8. `atlas_profiles/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `atlas_profiles/{userId}` |
| **Owning Module** | Atlas |
| **Write Authority** | Atlas module |
| **Vault-Gated** | Yes (contains goals, habits, personal planning data) |
| **NSV Fields Updated** | `cognitive.energyBudget`, `cognitive.focusScore`, `cognitive.activeLoad`, `cognitive.planningLoad`, `cognitive.taskCompletionRate`, `planning.streakHealth`, `planning.deadlinePressure` |
| **NexusDataLayer Entity** | `AtlasProfile` |
| **Schema Reference** | `AtlasProfile` interface in `src/lib/types.ts`; normalized by `normalizeAtlasProfile()` |
| **Notes** | Contains: `energyWave[]`, `recoveryWindows[]`, `taskGraph[]`, `scheduledTasks[]`, `dailyIntentions[]`, `habitRecords[]`, `tasks[]`, `goals[]`, `projects[]`, `habits[]`, `routine`, `reviews[]`. After save, `GlobalProjectionService.updateCrossFunctionalState()` is called with `cognitive.activeLoad = taskGraph.length`. `flattenedUntil` field records energy wave compression state. |

---

### 9. `ledger_profiles/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `ledger_profiles/{userId}` (via `LedgerIntakeProfile` document) |
| **Owning Module** | Ledger |
| **Write Authority** | Ledger module |
| **Vault-Gated** | Yes (contains income, debt, expense data — financial sensitivity) |
| **NSV Fields Updated** | `resource.financialFriction`, `resource.resonanceROI` |
| **NexusDataLayer Entity** | `LedgerProfile` |
| **Schema Reference** | `LedgerIntakeProfile` in `src/modules/ledger/services/ledger-intake-service.ts` |
| **Notes** | Contains: `monthlyIncome`, `fixedExpenses[]`, `variableExpenses[]`, `debtItems[]`, `savingsGoals[]`, `financialPlans[]`, document analysis metadata. NSV writes happen via `computeResonanceROI()` → `updateGlobalSoul({ resource: { financialFriction, resonanceROI } })`. Post S1-010: `taxCategory` field added to expense items. |

---

### 10. `scout_knowledge/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `scout_knowledge/{userId}` (or subcollection — verify) |
| **Owning Module** | Scout |
| **Write Authority** | Scout module |
| **Vault-Gated** | Conditional (research notes may contain sensitive content; default: Yes) |
| **NSV Fields Updated** | `cognitive.researchLoad`, `cognitive.interestDiversity` |
| **NexusDataLayer Entity** | `ScoutKnowledgeBase` |
| **Schema Reference** | Scout module types |
| **Notes** | Stores research threads, source annotations, extracted facts, interest vectors. `interestDiversity` is computed from breadth of active topics. High `researchLoad` + low `interestDiversity` triggers `INTEREST_HYPERFOCUS` synthesis alert. |

---

### 11. `module_memory/{userId}/modules/{moduleId}`

| Property | Value |
|---|---|
| **Current Path** | `module_memory/{userId}/modules/{moduleId}` |
| **Owning Module** | All modules (each module writes its own memory envelope) |
| **Write Authority** | Each module writes its own `moduleId` document |
| **Vault-Gated** | Yes (contains session summaries with potentially sensitive content) |
| **NSV Fields Updated** | None directly. Memory is consumed by context injection at session start; does not write NSV. |
| **NexusDataLayer Entity** | `ModuleMemoryEnvelope` |
| **Schema Reference** | `ModuleMemoryEnvelope` interface in `src/lib/types.ts` |
| **Notes** | Contains: `latestSnapshot` (string summary), `eventHistory: SessionEventSummary[]` (with embeddings), `activeSessionId`. Used by `IntakeBaseContextService` to build module prompts. `eventHistory` is bounded (implementation should enforce max ~50 events). |

---

### 12. `active_sessions/{userId}/sessions/{sessionId}`

| Property | Value |
|---|---|
| **Current Path** | `active_sessions/{userId}/sessions/{sessionId}` |
| **Owning Module** | Orchestrator (session management) |
| **Write Authority** | LLM engine / session management layer |
| **Vault-Gated** | Yes (contains full message history — may include sensitive content from any module) |
| **NSV Fields Updated** | None. Session data feeds into module memory on session close, which may then trigger NSV updates. |
| **NexusDataLayer Entity** | `ActiveSessionState` |
| **Schema Reference** | `ActiveSessionState` interface in `src/lib/types.ts` |
| **Notes** | Contains: `sessionId`, `moduleId`, `history: Message[]`, `tokenCount`, `contextPolicy`, `docIds`. Cleaned up on session end — long-term retention happens via `ModuleMemoryEnvelope.eventHistory`. Guest sessions use `isGuestTrial: true` and are not persisted to Firestore. |

---

### 13. `semantic_memory/{userId}/facts/{factId}`

| Property | Value |
|---|---|
| **Current Path** | `semantic_memory/{userId}/facts/{factId}` |
| **Owning Module** | All modules (each module writes facts from its domain) |
| **Write Authority** | All modules via semantic memory service |
| **Vault-Gated** | Yes (facts may encode personal health, financial, emotional information) |
| **NSV Fields Updated** | None directly. High-confidence facts about the user may inform NSV calibration prompts. |
| **NexusDataLayer Entity** | `SemanticFact` |
| **Schema Reference** | `SemanticFact` interface in `src/lib/types.ts` |
| **Notes** | Contains: `moduleId`, `fact` (string), `confidence` (0-1), `updatedAt`. Used for long-term memory retrieval via similarity search. `embedding` field (if present) stores vector for semantic search. |

---

### 14. `spine_events/{userId}/events/{eventId}`

| Property | Value |
|---|---|
| **Current Path** | `spine_events/{userId}/events/{eventId}` |
| **Owning Module** | Spine event bus (cross-module) |
| **Write Authority** | `SpineEventBus.logEvent()` — auto-writes `alert` and `critical` events only |
| **Vault-Gated** | No (Spine events contain numeric payloads + type labels; no PII by design) |
| **NSV Fields Updated** | None (Spine events describe NSV changes; they don't write to NSV themselves) |
| **NexusDataLayer Entity** | `SpineEvent` |
| **Schema Reference** | `SpineEvent` interface in `src/lib/types.ts` |
| **Notes** | Only `priority !== 'info'` events are persisted (see `spine-event-bus.ts` line ~94). Events contain: `type`, `source`, `domain`, `priority`, `data`, `timestamp`, `cascadeDepth`. The `data` payload must not contain raw PII — it should contain only numeric values and reason codes. `info` events are in-memory only (50-event ring buffer in `SpineEventBus.recentEvents`). |

---

### 15. `bridge_config/{userId}`

| Property | Value |
|---|---|
| **Current Path** | `bridge_config/{userId}` |
| **Owning Module** | Bridge (alert daemon) |
| **Write Authority** | Bridge module + user settings |
| **Vault-Gated** | No (configuration data — notification preferences, webhook endpoints) |
| **NSV Fields Updated** | None |
| **NexusDataLayer Entity** | `BridgeConfig` |
| **Schema Reference** | Bridge module types |
| **Notes** | Contains: notification preferences, alert thresholds, webhook configs (if any). Bridge is the only module with `hasPage: false` in the manifest — it operates as a background daemon. Config changes here affect which Spine events trigger external notifications. |

---

## NexusDataLayer Entity Summary

The NexusDataLayer (future) will expose these typed entities via a unified service interface. Each entity maps 1:1 to a Firestore collection (or collection group).

```typescript
type NexusDataLayerEntity =
  | 'CoreUserProfile'         // users/{userId}
  | 'VaultKeyEnvelope'        // vaults/{userId}
  | 'GlobalProjection'        // global_souls/{userId}
  | 'AgnesProfile'            // agnes_profiles/{userId}
  | 'BeliefGraph'             // belief_graphs/{userId}
  | 'TitanProfile'            // titan_profiles/{userId}
  | 'SomaProfile'             // soma_profiles/{userId}  ← retained name
  | 'AtlasProfile'            // atlas_profiles/{userId}
  | 'LedgerProfile'           // ledger_profiles/{userId}
  | 'ScoutKnowledgeBase'      // scout_knowledge/{userId}
  | 'ModuleMemoryEnvelope'    // module_memory/{userId}/modules/{moduleId}
  | 'ActiveSessionState'      // active_sessions/{userId}/sessions/{sessionId}
  | 'SemanticFact'            // semantic_memory/{userId}/facts/{factId}
  | 'SpineEvent'              // spine_events/{userId}/events/{eventId}
  | 'BridgeConfig';           // bridge_config/{userId}
```

---

## Vault-Gating Summary

| Collection | Vault-Gated | Sensitivity Level |
|---|---|---|
| `users` | No | Low (identity, preferences) |
| `vaults` | Yes (double-encrypted) | Critical (master key) |
| `global_souls` | No | Low-Medium (numeric NSV; `compactedInsights` review needed) |
| `agnes_profiles` | Yes | Critical (therapeutic, trauma markers) |
| `belief_graphs` | Yes | Critical (cognitive/belief structures) |
| `titan_profiles` | Yes | High (health metrics, cycle data) |
| `soma_profiles` | Yes | Critical (biomarkers, lab results, medical conditions) |
| `atlas_profiles` | Yes | Medium (goals, habits, schedule) |
| `ledger_profiles` | Yes | High (financial data, income, debt) |
| `scout_knowledge` | Yes | Medium (research notes) |
| `module_memory` | Yes | Medium (session summaries) |
| `active_sessions` | Yes | High (full message history) |
| `semantic_memory` | Yes | High (long-term personal facts) |
| `spine_events` | No | Low (numeric event data, no PII) |
| `bridge_config` | No | Low (notification preferences) |

---

## Open Questions / Action Items

1. **`global_souls.compactedInsights`** — This string array may contain quasi-sensitive summaries of the user's state. Should it be encrypted? (Recommendation: yes in v2 — add vault-gating for the `compactedInsights` field only, not the entire document.)

2. **`scout_knowledge` path** — Confirm exact Firestore path (may be subcollection `scout_knowledge/{userId}/threads/{threadId}` vs top-level document). Update this map accordingly.

3. **NexusDataLayer service interface** — This document defines the entity mapping; the actual `NexusDataLayer` service that wraps these collections is a separate implementation task (post-Sprint 1).

4. **Data retention policy** — `spine_events` and `active_sessions` have no defined TTL. Define a retention policy (recommendation: 90 days for spine events, 30 days for ended sessions).

5. **`global_souls` write race conditions** — Multiple modules call `updateCrossFunctionalState()` concurrently. Confirm Firestore merge semantics are being used (`.set(..., { merge: true })` or field-level updates) to prevent overwrites.
