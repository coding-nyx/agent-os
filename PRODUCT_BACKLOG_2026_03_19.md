# AGNES Product Backlog (Audit-Derived)

Generated: 2026-03-19
Source: module + core infrastructure audit (broken/missing/partial)

Legend:
- Status: `Backlog`
- Severity: `Broken` | `Missing` | `Partial`

## Broken / Critical (runtime failures or silent data loss)

| ID | Title | Location (primary) |
|---|---|---|
| B1 | Spine events never persist because `Spine.setDataLayer()` is never called | `src/lib/spine/spine-event-bus.ts:143-156` |
| B2 | `SOUL_WRITE_REQUESTED` is emitted but has zero subscribers (writes get orphaned) | `src/lib/global-projection-service.ts` (emit) |
| B3 | Cascade rules double-register under React Strict Mode/HMR (rules run multiple times) | `src/App.tsx:50-58` |
| B4 | Reminder scheduling depends on a Cloud Function (`scheduleReminder`) that is not present in the repo | `src/lib/notifications/reminder-scheduler-service.ts:55-64` |
| A1 | Agnes somatic branch is dead (selects `somatic` state but renders the session UI instead; breathwork/grounding never mount) | `src/modules/agnes/AgnesPage.tsx` |
| A2 | Agnes “Resume Sync” always calls `onStartSession('new')` (unreachable continue/resume session flow) | `src/modules/agnes/components/AgnesSanctuaryContent.tsx` |
| A3 | Agnes `detect_data_hint` handler registered only under `nexus`, so Agnes emits may be dropped | `src/lib/actions/core-handlers.ts:803` (registration) |
| L1 | Ledger camera capture uses `process.env.REACT_APP_OPENROUTER_KEY` (Vite env should be `import.meta.env.VITE_*`) | `src/modules/ledger/LedgerPage.tsx:223` |
| L2 | Ledger `paidQuarters` gets dropped on profile normalize (resets after reload) | `src/modules/ledger/services/ledger-intake-service.ts:152` |
| L3 | Ledger create-empty profile omits `paidQuarters` (new profiles also lose the field) | `src/modules/ledger/services/ledger-intake-service.ts:281-303` |
| T1 | Titan routine builder imports `@hello-pangea/dnd` and will crash if the package isn’t installed | `src/modules/titan/components/RoutineBuilder.tsx:8` |
| T2 | Titan `workoutLogs` never gets written (sparklines stay empty) | `src/modules/titan/components/PRBoard.tsx` + write paths in `titan/services/actions.ts` |
| SC1 | Scout `onActionParsed` is never passed (AI actions are dropped during doc analysis flows) | `src/modules/scout/ScoutPage.tsx` |
| SC2 | Scout digest persistence ignores `encryptionKey` (digests saved plaintext; decrypt fails later) | `src/modules/scout/scout-digest-service.ts:268-284` |
| SC3 | Scout `generate_digest` passes encrypted `SourceEntry[]` to a function expecting decrypted sources | `src/modules/scout/services/actions.ts:268-283` |
| SO1 | Soma onboarding `onComplete` is a no-op (profile refresh depends on delayed subscriptions/offline reliability) | `src/modules/soma/SomaPage.tsx:174` |
| SO2 | Soma diagnosis merge has potential `SomaProfile` type import mismatch (risk of wrong persisted shape) | `src/modules/soma/diagnosis/soma-diagnosis-merge.ts` |
| AT1 | Atlas `delegateToModule` is a no-op (`() => {}`), so cross-module orchestration doesn’t happen | `src/modules/atlas/AtlasPage.tsx:260-261` |
| AT2 | Atlas field actions likely never register because `atlas-field-actions.ts` isn’t wired | `src/modules/atlas/AtlasPage.tsx` (no registration call) |
| FO1 | Forge `execute_code` leaves session stuck as `running` when backend env vars are missing/failure occurs | `src/modules/forge/forge-cloud-execution.ts` + `src/modules/forge/services/actions.ts` |
| FO2 | Forge lacks an onboarding gate (users reach chat without profile setup despite `ForgeOnboarding` existing) | `src/modules/forge/ForgePage.tsx:375-389` |

## Missing / Not Wired (defined but no handlers, subscribers, or UI wiring)

### Cross-cutting / Spine / orchestration

| ID | Title | Location (primary) |
|---|---|---|
| X1 | `SOMATIC_SUPPORT_REQUESTED` has zero subscribers (cross-module somatic support never delivered) | `src/lib/spine/cascade-rules.ts` |
| X2 | `MORNING_BRIEF_DUE` / `EVENING_CHECKIN_DUE` / `WEEKLY_REVIEW_DUE` have no UI handlers | `src/lib/spine/cascade-rules.ts:344-368` |
| X3 | `REDUCE_TRAINING_LOAD` emitted by cascades but Titan has no subscriber | `src/lib/spine/cascade-rules.ts:711` |
| X4 | `ATLAS_MORNING_RULES` never registered (morning/evening cadence dead) | `src/App.tsx` (registration) |
| X5 | Agnes burnout cascade guard bug: domain check uses `'B'` but emitter uses `'system'` | `src/lib/spine/cascade-rules.ts:280` |
| X6 | `ConflictResolutionOverlay` permanently disabled (conflict detection + resolution reroutes dead) | `src/App.tsx:136` |
| X7 | Intelligence pipeline implements only a small subset of intended cross-module patterns | `src/lib/services/intelligence-pipeline.ts` |
| X8 | `SchedulerService` starts but no module ever registers schedules (scheduler governs nothing) | `src/lib/spine/scheduler-service.ts` |
| X9 | `notification_inbox` has no client-side writer (depends on missing Cloud Function path) | `src/modules/notifications/NotificationsPage.tsx` |

### Agnes

| ID | Title | Location (primary) |
|---|---|---|
| A4 | Agnes `AgnesDashboard` exists but is never mounted/used in the Agnes page flow | `src/modules/agnes/AgnesPage.tsx` |
| A5 | `AgnesSettingsPanel` component exists but is never used/rendered | `src/modules/agnes/components/AgnesSettingsPanel.tsx` |
| A6 | Belief graph split-brain: SVG `BeliefGraph.tsx` derives from profile context while session updates feed a service graph; UI visibility mismatch | `src/modules/agnes/BeliefGraph.tsx` + `belief-graph-service.ts` |

### Nexus

| ID | Title | Location (primary) |
|---|---|---|
| N1 | Nexus `MemorySearchResults` component is orphan (memory search results are never displayed) | `src/modules/nexus/components/MemorySearchResults.tsx` |
| N2 | `CommandPalette` “ask module” drops the `question` argument (always empty) | `src/modules/nexus/NexusDashboard.tsx` + `useCommandPalette.ts` |
| N3 | `update_orchestrator_intake` has no registered action handler | `src/modules/nexus/onboarding/NexusOnboarding.tsx` |
| N4 | `query_module`/`search_memory` have no structured response UI (only chat bubbles) | `src/modules/nexus/personas.ts` |

### Ledger

| ID | Title | Location (primary) |
|---|---|---|
| L4 | `suggest_field` action handler is empty (no output, no events, nothing visible) | `src/modules/ledger/actions/ledger-field-actions.ts:308-320` |
| L5 | Vision commit never maps `debtItems` into the profile model | `src/modules/ledger/LedgerPage.tsx:248-259` |
| L6 | `isLocked` is computed but doesn’t gate non-overview tabs (transactions/budget/tax pages still render) | `src/modules/ledger/LedgerPage.tsx:128-129` |
| L7 | Behavioral insights panel is feature-gated with no discoverable UI toggle | `src/modules/ledger/components/BehavioralInsightsPanel.tsx:39-44` |

### Scout

| ID | Title | Location (primary) |
|---|---|---|
| SC4 | Scout diagnosis pipeline is registered but never surfaced in the UI (no start/view/merge) | `src/modules/scout/scout-diagnosis-*.ts` + `ScoutPage.tsx` |
| SC5 | Scout `showUploadZone` state is never set to `true` (overlay unreachable) | `src/modules/scout/ScoutPage.tsx:86, 870-905` |
| SC6 | Scout digest viewer sections are hardcoded empty (key themes/knowledge gaps/recommended actions never saved from LLM output) | `src/modules/scout/scout-digest-service.ts:224-231` |
| SC7 | Scout onboarding never passes `onGlobalBaseContextFinalize` (global context handoff is dropped) | `src/modules/scout/ScoutPage.tsx:967-972` |

### Atlas

| ID | Title | Location (primary) |
|---|---|---|
| AT3 | Atlas analytics charts exist but aren’t wired into the dashboard analytics tab | `src/modules/atlas/components/*` + `EnhancedAtlasDashboard.tsx` |
| AT4 | `atlas-review-service.ts` exists but is orphaned (review logic reinvents inline) | `src/modules/atlas/services/atlas-review-service.ts` |
| AT5 | Atlas `fieldValues` are ephemeral and not persisted (custom values lost on navigation) | `src/modules/atlas/AtlasPage.tsx:212-213` |

### Forge

| ID | Title | Location (primary) |
|---|---|---|
| FO3 | Forge advertises multiple action types but they have no registered handlers | `src/modules/forge/personas.ts` + `src/modules/forge/services/actions.ts` |
| FO4 | Forge `read_file` / `write_file` are stubs (queued forever, no real backend execution) | `src/modules/forge/services/actions.ts:135-169` |
| FO5 | Nexus-link integration is effectively dead (`nexus_link_command` errors; persona says to never use) | `src/modules/forge/services/nexus-link-client.ts` + `src/modules/forge/services/actions.ts:116-132` |
| FO6 | Forge dashboard has a permanent developer warning banner visible to users | `src/modules/forge/ForgeDashboard.tsx:119-124` |
| FO7 | Forge `edit_section` does not persist stored documents (display-only) | `src/modules/forge/services/actions.ts:297-314` |
| FO8 | Forge artifacts list is read-only (no expand/copy/delete interactions) | `src/modules/forge/ForgeDashboard.tsx:218-246` |

### Hub / Platform

| ID | Title | Location (primary) |
|---|---|---|
| H1 | Hub `DailyBrief` exists but is not mounted in `HubPage` | `src/modules/hub/HubPage.tsx` + `DailyBrief.tsx` |
| H2 | `overallWellnessScore` is never computed/written (read-only from prior persisted state) | `src/lib/services/global-projection-service.ts` |

## Partial (implemented but incomplete / inconsistent in edge conditions)

| ID | Title | Location (primary) |
|---|---|---|
| P1 | Conflict resolution UX is disabled, so downstream conflict detection + reroute side effects never trigger | `src/App.tsx:136` |
| P2 | NSV is populated + injected into prompts, but cascade responders are missing/partial (threshold reactions don’t fully materialize) | `src/lib/services/nsv*` + `src/lib/spine/cascade-rules.ts` |
| P3 | Bridge sends OS notifications but never writes to `notification_inbox` (inbox remains empty) | `src/lib/services/bridge-service.ts` |
| P4 | Vault flow mostly works, but “new vault creation” path depends on modal/open timing; setup nudge gating may be brittle | `src/lib/vault-context.tsx` |
| P5 | Scheduler timer logic is implemented, but no schedules are registered anywhere | `src/lib/spine/scheduler-service.ts` |
| P6 | Agnes burnout cascade domain guard wrong (`'B'` vs `'system'`) prevents somatic-support cascade | `src/lib/spine/cascade-rules.ts:280` |
| P7 | `DataLayerProvider` is not mounted in the tree; dependency-injection safeguards don’t run | `src/App.tsx` + `src/lib/data-layer/provider.tsx` |
| P8 | NSV synthesis panel can be silent for users with no NSV data (no empty-state explanation) | `src/modules/nexus/useNexusSynthesis.ts` |
| P9 | Agnes “continue” session path exists but is unreachable from the UI resume flow (same root cause as A2) | `src/modules/agnes/components/AgnesSanctuaryContent.tsx` |
| P10 | Bridge + other event-driven features rely on event type casts as `any` in multiple places (subscriptions can silently fail on typos) | `src/modules/scout/*`, `src/modules/atlas/*`, `src/core/*` (as applicable) |

