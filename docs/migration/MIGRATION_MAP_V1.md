# Migration Map V1 — Firestore ➜ NexusDataLayer

**Goal:** Define how existing Firestore collections/fields map into the NexusDataLayer entities per module, with explicit ownership to prevent cross‑module overwrites. Scope covers Therapist (Agnes), Trainer (Titan, Soma feeder), Financial Planner (Ledger), and Web Scout (Scout), plus shared platform stores.

## Principles
- **Ownership first:** Only the owning module writes to its NexusDataLayer slice. Other modules consume via read‑only contracts or derived views.
- **No cross‑module overwrites:** Aggregations occur via the owning module’s service (e.g., Soma ➜ Titan for biological NSV metrics).
- **MVP migration:** Preserve existing semantics; defer reshaping non‑critical fields to later phases.

## Per‑Module Maps

### Agnes (Therapy)
| Current Firestore | Key Fields (existing) | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- | --- |
| `agnes_profiles/{uid}` | `emotionalResilience`, `stressLevel`, `currentState` (text), `therapeuticGoals`, `primaryConcerns`, `supportSystem`, `sessionFrequency`, `copingStrategies`, `triggers`, `progressNotes`, `lastSessionDate`, `nextSessionDate` | **NeuralStateVector.emotional**: <br>- `emotionalResilience` ➜ `emotional.emotionalResilience` (Agnes writes)<br>- `stressLevel` ➜ `emotional.stressLoad` (Agnes writes)<br>- `currentState` (text) ➜ `emotional.moodTrend` (Agnes writes) | Agnes owns emotional domain. Trauma markers (if added later) remain Agnes‑exclusive; other modules read only. |
| `semantic_memory/{uid}/facts/{factId}` | `fact`, `confidence`, `moduleId`, `updatedAt` | **SemanticFact store** (module scoped) | Module that wrote the fact owns updates; Agnes reads/writes therapy facts. |
| `module_memory/{uid_agnes}` & `active_sessions/{uid_agnes}` | `ModuleMemoryEnvelope` (snapshot, events, metadata) | **ModuleMemoryEnvelope** | Agnes owns writes; others read only for context. |

### Titan (Trainer)
| Current Firestore | Key Fields | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- | --- |
| `titan_profiles/{uid}` | `fitnessLevel`, `fitnessGoals`, `currentWeight`, `targetWeight`, `height`, `workoutFrequency`, `preferredActivities`, `injuries`, `activityLevel`, `nutritionGoals`, `sleepQuality`, `recoveryScore`, `lastWorkout`, `nextWorkout` | **NeuralStateVector.biological**: <br>- `sleepQuality` ➜ `biological.sleepQuality` (Titan writes)<br>- `recoveryScore` ➜ `biological.recoveryScore` (Titan writes)<br>**TrainerProfile (schema‑registry)** retains remaining fields for planning/training logic. | Titan owns biological slice. Agnes/Atlas/Scout may read; no external writes. |
| `module_memory/{uid_titan}` & `active_sessions/{uid_titan}` | Session snapshots/events | **ModuleMemoryEnvelope** | Titan owns writes. |
| `titan_portfolios/{uid}` (public read) | Portfolio metrics | **PublicPerformanceView** (read‑only) | Titan writes; others consume. |

### Soma (Biomarkers feeder into Titan)
| Current Firestore | Key Fields | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- | --- |
| `soma_profiles/{uid}` | Biomarkers: `age`, `biologicalSex`, `height`, `weight`, `bmi`, `restingHeartRate`, `bloodPressure`, `vo2Max`, `bodyFatPercentage`, `muscleMass`, `sleepHours`, `sleepQuality`, `dailySteps`, `activeMinutes`, `hydrationLevel`, `menstrualCycle`, `cycleDay`, `chronicConditions`, `medications`, `supplements`, `energyLevel`, `stressPhysical`, `lastCheckup`, `nextCheckup` | **NeuralStateVector.biological** (via Titan ingestion):<br>- `sleepQuality` ➜ `biological.sleepQuality` (Titan writes, sourced from Soma)<br>- `energyLevel` ➜ `biological.cnsFatigue` inverse (Titan computes/write)<br>- `stressPhysical` ➜ `biological.cnsFatigue` (Titan computes/write) | Soma supplies signals; Titan is the sole writer to biological NSV (no direct Soma writes). |

### Ledger (Financial Planner)
| Current Firestore | Key Fields | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- | --- |
| `ledger_profiles/{uid}` | `monthlyIncome`, `currency`, `financialGoals`, `budgetCategories`, `totalDebt`, `totalSavings`, `totalInvestments`, `riskTolerance`, `spendingHabits`, `financialStressLevel`, `creditScore`, `paymentSchedule`, `lastBudgetReview`, `nextBudgetReview` | **NeuralStateVector.resource**:<br>- `financialStressLevel` ➜ `resource.financialFriction` (Ledger writes)<br>- Derived ROI from goals/allocations ➜ `resource.resonanceROI` (Ledger writes)<br>**LedgerProfile (schema‑registry)** keeps full budget/goal inputs. | Ledger owns resource domain; Atlas/Agnes may read for planning/stress correlation only. |

### Atlas (Cognitive & Planning)
| Current Firestore | Key Fields | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- | --- |
| `atlas_profiles/{uid}` | `energyBudget`, `planningLoad`, `taskCompletionRate`, `streakHealth`, `urgencyPressure`, `focusScore`, `openLoopCount`, `peakProductivityTime`, `workStyle`, `priorityAreas`, `habitTracking`, `goalReviewFrequency`, `procrastinationTriggers`, `lastReview`, `nextReview` | **NeuralStateVector.cognitive / planning**:<br>- `energyBudget` ➜ `cognitive.energyBudget` (Atlas writes)<br>- `planningLoad` ➜ `cognitive.planningLoad` (Atlas writes)<br>- `taskCompletionRate` ➜ `cognitive.taskCompletionRate` (Atlas writes)<br>- `streakHealth` ➜ `planning.streakHealth` (Atlas writes)<br>- `urgencyPressure` ➜ `planning.deadlinePressure` (Atlas writes)<br>- `focusScore` ➜ `cognitive.focusScore` (Atlas writes) | Atlas owns cognitive+planning metrics. Scout may contribute read‑only signals (research load) but cannot overwrite Atlas metrics. |

### Scout (Research / Web Scout)
| Current Firestore | Key Fields | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- | --- |
| `scout_knowledge/{uid}` | Research docs/sources/interests (unstructured store) | **NeuralStateVector.cognitive (research slice)**:<br>- Derived engagement ➜ `cognitive.researchLoad` (Scout writes)<br>- Diversity of sources ➜ `cognitive.interestDiversity` (Scout writes)<br>**KnowledgeBase** remains module‑local for documents. | Scout owns researchLoad & interestDiversity. Atlas may read for planning; no overwrites. |

## Cross‑Cutting Stores (Platform)
| Current Firestore | Target NexusDataLayer Entity | Ownership / Write Rule |
| --- | --- | --- |
| `users/{uid}` | **CoreUserProfile** | Orchestrator owns identity; modules read. |
| `global_souls/{uid}` | **GlobalProjection** incl. `crossFunctionalState: NeuralStateVector` | Orchestrator composes read‑only projection from module‑owned NSV slices. |
| `module_memory/{uid_module}` & `active_sessions/{uid_module}` | **ModuleMemoryEnvelope** | Each module owns its document; no cross‑writes. |
| `semantic_memory/{uid}/facts/{factId}` | **SemanticFact** | Authoring module owns; others read. |
| `spine_events/{uid}/events/{eventId}` | **SpineEvent log** | System append‑only; no edits after write. |
| `belief_graphs/{uid}` | **BeliefGraph** (visual/cognitive state) | Atlas owns writes; others read. |
| `documents/{docId}` | **Document entity** (userId, moduleId, threadId, content, timestamps) | Module that created document owns updates; shared read where authorized. |
| `vaults/{uid}` | **SecureVault** | User/enclave owned; no cross‑module writes. |
| `platform_settings/{doc}` | **PlatformConfig** | Admin only. |

## Notes & Gaps to Validate (post‑MVP)
- Confirm `documents` field schema (content shape) before migration; treat as opaque payload in v1.
- Scout knowledge store is unstructured; define minimal metadata contract before migration to Nexus KnowledgeBase.
- Trauma markers are reserved for Agnes; no other module should emit or store them in NSV.
- Soma signals must be ingested via Titan to avoid biological slice conflicts.
- Keep `titan_portfolios` as public read view; map to read‑only projection, not NSV.

---

Status: SQL done.***
