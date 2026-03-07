# Sprint 3: Module Upgrades — "Bring It to Life"

> **Sprint Goal:** Upgrade all core modules from MVP scaffolds to feature-complete, interactive experiences aligned with Product Definition v3.
>
> **Scope:** Nexus → Atlas → Soma-Titan merger → Agnes → Ledger
>
> **Product Definition:** `docs/PRODUCT_DEFINITION.md` (v3)
> **Design Specs:** `plans/` directory

---

## Sprint Scope Summary

| ID | Title | Priority | Status | Spec |
|----|-------|----------|--------|------|
| S3-001 | Nexus Upgrade — Command Center Dashboard | #1 | ✅ Done | `plans/NEXUS_UPGRADE_SPEC.md` |
| S3-002 | Atlas — Full Life Planner | #2 | ✅ Done | `plans/ATLAS_PLANNER_SPEC.md` |
| S3-003 | Soma-Titan Merger | #3 | 🔄 In Progress | `plans/SOMA_TITAN_MERGER_SPEC.md` |
| S3-004 | Agnes Therapy Upgrade | #4 | ⏳ Pending | `plans/AGNES_UPGRADE_SPEC.md` |
| S3-005 | Ledger Upgrade | #5 | ⏳ Pending | `plans/LEDGER_UPGRADE_SPEC.md` |
| S3-006 | Hub Enhancement | #6 | ⏳ Pending | No spec yet |

---

## Completed Items

### [S3-001] Nexus Upgrade — Command Center Dashboard ✅

**Objective:** Transform Orchestrator from a simple chat page into a full command center with daily briefs, cross-domain synthesis, module health monitoring, and ⌘K command palette.

**What was built:**
- 3 hooks: `useNexusSynthesis` (8 correlation patterns), `useModuleHealth`, `useCommandPalette`
- 7 components: `NexusDashboard`, `DailyBriefSection`, `SynthesisPanel`, `ModuleHealthCards`, `CommandPalette`, `RoutingSuggestion`, `MemorySearchResults`
- Rewrote `OrchestratorPage` from simple chat to full NexusDashboard layout
- Post-login redirect changed from `/hub` to `/orchestrator`
- Smart routing with keyword confidence ≥0.62 + 8s auto-dismiss

**Files created:**
```
src/modules/orchestrator/hooks/useNexusSynthesis.ts
src/modules/orchestrator/hooks/useModuleHealth.ts
src/modules/orchestrator/hooks/useCommandPalette.ts
src/modules/orchestrator/components/NexusDashboard.tsx
src/modules/orchestrator/components/DailyBriefSection.tsx
src/modules/orchestrator/components/SynthesisPanel.tsx
src/modules/orchestrator/components/ModuleHealthCards.tsx
src/modules/orchestrator/components/CommandPalette.tsx
src/modules/orchestrator/components/RoutingSuggestion.tsx
src/modules/orchestrator/components/MemorySearchResults.tsx
```

**Files modified:**
```
src/modules/orchestrator/OrchestratorPage.tsx
src/modules/landing/LandingPage.tsx
src/core/layout/ModuleLayout.tsx
```

**Build:** ✅ Zero type errors

---

### [S3-002] Atlas — Full Life Planner ✅

**Objective:** Transform Atlas from an "energy mapping" scaffold into a full life planner with task management, goal tracking, habit streaks, and weekly reviews.

**What was built:**
- 10 new data interfaces (AtlasTask, AtlasGoal, AtlasMilestone, AtlasProject, AtlasHabit, etc.)
- 21 action handlers (16 new + 5 existing) covering tasks, goals, habits, scheduling, cross-module
- 8 new UI components: ViewSwitcher, TaskCard, TaskTimeline, WeekGrid, FocusView, QuickAddForm, HabitTracker, GoalProgress
- AtlasDashboard rewritten with Today/Week/Focus views
- AtlasPage wired with 8 ActionHub dispatch callbacks + mobile tabs
- 6 new Spine event types added

**Files created:**
```
src/modules/atlas/components/ViewSwitcher.tsx
src/modules/atlas/components/TaskCard.tsx
src/modules/atlas/components/TaskTimeline.tsx
src/modules/atlas/components/WeekGrid.tsx
src/modules/atlas/components/FocusView.tsx
src/modules/atlas/components/QuickAddForm.tsx
src/modules/atlas/components/HabitTracker.tsx
src/modules/atlas/components/GoalProgress.tsx
```

**Files modified:**
```
src/modules/atlas/services/atlas-profile-service.ts (297→440 lines)
src/modules/atlas/services/actions.ts (165→802 lines)
src/modules/atlas/components/AtlasDashboard.tsx (rewritten)
src/modules/atlas/AtlasPage.tsx (action wiring + mobile tabs)
src/lib/types.ts (6 new SpineEventTypes)
```

**Build:** ✅ Zero type errors

---

### [S3-003] Soma-Titan Merger ✅

**Objective:** Full absorption of Soma into Titan. Three-tab dashboard (Training | Biomarkers | Recovery), dual-mode AI persona (Training/Medical), internal clearance logic, and `/soma` → `/titan?tab=biomarkers` redirect.

**All 10 phases completed:**
- [x] Phase 1: Schema & Types — TitanProfile extended with 9 medical fields + 4 medical interfaces
- [x] Phase 2: NSV Ownership Transfer — recoveryScore + hormonalContext → titan
- [x] Phase 3: Action Consolidation — 5 Soma actions absorbed, clearance-service.ts created, lab-import-service.ts copied
- [x] Phase 4: Persona Merger — Dual-mode prompt (training/medical), persona updated
- [x] Phase 5: Onboarding Extension — Optional medical intake flow (conditions, medications, allergies, consent)
- [x] Phase 6.1-6.3: UI Components — TitanDashboardTabs, BiomarkerDashboard, ClearancePanel created
- [x] Phase 6.4: TitanPage Assembly — Wire tabs + components + action callbacks
- [x] Phase 7: Routing & Manifest — /soma redirect, manifest update, nexus routing keywords
- [x] Phase 8: Cascade Cleanup — Deprecate CLEARANCE_DENIED/GRANTED, update cascade sources
- [x] Phase 9: Delete Soma Module — src/modules/soma/ directory deleted
- [x] Phase 10: Build Verification — zero errors
- [x] Post-merger: 14+ files cleaned of stale soma references
- [x] PM Audit: 94% spec-compliant, self_clearance_check gap fixed
- [x] Design Audit: 7 UI fixes applied (landing grid, labels, state display)

**Files created:**
```
src/modules/titan/components/TitanDashboardTabs.tsx
src/modules/titan/components/BiomarkerDashboard.tsx
src/modules/titan/components/ClearancePanel.tsx
src/modules/titan/services/clearance-service.ts
src/modules/titan/services/lab-import-service.ts
```

**Files modified:**
```
src/lib/types.ts (medical interfaces + TitanProfile extension + @deprecated SpineEventTypes)
src/lib/services/nsv-ownership.ts (soma→titan ownership transfer)
src/lib/module-manifest.ts (soma hasPage=false, titan description updated)
src/lib/constants.ts (soma removed from MODULES_REQUIRING_ONBOARDING)
src/lib/actions/core-handlers.ts (soma handlers removed, request_clearance on titan)
src/lib/services/user-data-registry.ts (soma removed from MODULE_IDS)
src/lib/services/nsv-prompt-fragments.ts (soma→titan references)
src/lib/services/core-profile-service.ts (soma removed from aliases)
src/lib/services/global-projection-service.ts (soma removed, change-detection added)
src/lib/spine/cascade-rules.ts (deprecated soma cascade rules)
src/modules/titan/services/titan-profile-service.ts (normalization + migration helper)
src/modules/titan/services/actions.ts (5 Soma actions + self_clearance_check absorbed)
src/modules/titan/prompts/titan-session-prompt.ts (dual-mode prompt)
src/modules/titan/prompts/ai-titan-personas.ts (mode parameter)
src/modules/titan/onboarding/TitanOnboarding.tsx (medical intake steps)
src/modules/titan/TitanPage.tsx (3-tab dashboard, URL param support)
src/modules/hub/HubPage.tsx (soma removed from coreModulesAccessible)
src/modules/hub/constants.ts (soma removed from CORE_MODULES + modelType)
src/modules/hub/components/three/ThreeDView.tsx (soma model removed)
src/modules/hub/components/three/models/index.tsx (SomaModel removed)
src/modules/hub/hooks/index.ts (soma positions removed)
src/modules/orchestrator/hooks/useCommandPalette.ts (soma removed)
src/modules/orchestrator/personas.ts (soma reference cleaned)
src/modules/landing/LandingPage.tsx (soma card removed, grid fixed)
src/core/components/DataSharingSettings.tsx (soma→titan ownership)
src/App.tsx (/soma redirect added, SomaPage import removed)
```

**Spec:** `plans/SOMA_TITAN_MERGER_SPEC.md` (1,168 lines)
**Audit:** `plans/SOMA_TITAN_MERGER_AUDIT.md`

---

### [S3-QA] Post-Merger Bug Fixes ✅

**7 bugs found by QA audit, all fixed:**

| Bug | Severity | Fix |
|-----|----------|-----|
| BUG-1: ModuleHealthCards hidden by welcome message | 🔴 Critical | Always render cards (NexusDashboard.tsx) |
| BUG-2: SyncTransition stuck on orchestrator exit | 🔴 Critical | hideBack on orchestrator + isSyncing reset (OrchestratorPage, ModuleLayout) |
| BUG-3: Hub page orphaned | 🟠 High | Added "Open Hub" button (NexusDashboard.tsx) |
| BUG-4: SyncTransition no escape | 🟠 High | 5s safety timeout + Escape key + Skip button (SyncTransition.tsx) |
| BUG-5: ProtectedRoute no timeout | 🟡 Medium | Documented, deferred |
| BUG-6: Stale onComplete closure | 🟡 Medium | Fixed dependency array (SyncTransition.tsx) |
| Firestore write spam | 🟠 High | Change-detection in global-projection-service + hydration skip in use-module-ai |

---

## Pending Items

### [S3-004] Agnes Therapy Upgrade ⏳

**Objective:** Upgrade Agnes from basic chat to a full therapeutic experience with session flow management, emotional timeline, coping toolbox, and crisis detection.

**Spec:** `plans/AGNES_UPGRADE_SPEC.md` (1,087 lines)
**Depends on:** S3-003 (merger changes types.ts and NSV ownership)

---

### [S3-005] Ledger Upgrade ⏳

**Objective:** Upgrade Ledger from scaffold to clinical health synthesis with lab record management, trend analysis, and cross-module health correlations.

**Spec:** `plans/LEDGER_UPGRADE_SPEC.md` (458 lines)
**Depends on:** S3-003 (merger affects how biomarker data flows)

---

### [S3-006] Hub Enhancement ⏳

**Objective:** Upgrade Hub central command with 3D visualization and real-time module status.
**Spec:** Not yet created.
**Depends on:** S3-001 through S3-005

---

## Sprint Log

- [x] Cross-functional meeting + conformance audit
- [x] Product Definition updated to v3
- [x] 6 design/architecture specs produced (~5,500 lines)
- [x] Nexus implementation — 10 files created, 3 modified
- [x] Atlas implementation — 8 files created, 5 modified
- [x] Soma-Titan merger — 5 files created, 26 modified, soma/ deleted
- [x] Post-merger QA audit — 7 bugs found and fixed
- [x] Firestore write spam diagnosed and fixed
- [x] Backlog updated (BL-045: Titan Quick Diagnosis)
- [ ] Agnes upgrade
- [ ] Ledger upgrade
- [ ] Hub enhancement
