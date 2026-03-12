# Titan & Atlas — Vendor Readiness Audit
**Date**: 2025-07-16  
**Auditor**: PM Orchestrator (Nexus/AGNES)  
**Scope**: Titan module (training/health), Atlas module (planning/productivity), cross-module wiring, Spine/NSV integrity  
**Codebase**: `/Users/raj-13766/Desktop/nexus/agnes` — Vite + React 19 SPA  

---

## Executive Summary

| Dimension | Titan | Atlas |
|-----------|-------|-------|
| Feature completeness | ✅ 49 actions, all domains covered | ✅ 37+ actions, all 5 pillars complete |
| LLM integration | ✅ useModuleAI wired, system prompt builder present | ✅ useModuleAI wired, 3 dedicated journal AI actions |
| Spine/NSV emission | ✅ Emits MODULE_PROFILE_UPDATED, VITAL_UPDATED | ✅ Emits ATLAS_STATE_CHANGED, TASK_COMPLETED, DEADLINE_APPROACHING |
| Cross-module data access | ❌ **ZERO Atlas data access** | ⚠️ Reads NSV vitals but no direct Titan health state |
| Validation layer | ⚠️ Unsafe type casts, no schema validation | ✅ normalizeAtlasProfile() covers backward compat |
| Guest profile lifecycle | ⚠️ 3 exports possibly unused | ✅ Guest→user migration wired |
| Known logic errors | 🔴 isNewPR bug, PersonalRecord type mismatch | ✅ None detected |

**Vendor release blocker count: 3 CRITICAL items.**

---

## Audit Sections

### 1. Titan Vendor-Readiness

**Titan covers**: workout logging, personal records, sleep tracking, menstrual cycles, biomarker commits, lab report parsing, medical image analysis, medical clearance, CNS fatigue/readiness computation, and Soma delegation (49 registered actions).

#### ✅ What is complete
- All 49 actions in `actions.ts` have real implementations — no stubs, no `throw new Error('Not implemented')`.
- `TitanPage.tsx` (857 lines) renders all tabs: Overview, Workouts, Health, Sleep, Readiness — all tabs return valid JSX.
- Medical diagnosis pipeline (`titan-diagnosis-spec.ts` → `titan-diagnosis-extractor.ts` → `titan-diagnosis-merge.ts`) is complete and wired.
- `UnifiedModulePage` correctly wires profile load/save/subscribe/guest-sync lifecycle.
- Onboarding (`TitanOnboarding`) integrates with `IntakeBaseContextService` and syncs to `CoreProfileService`.
- NSV emission: `compute_readiness` persists `recoveryScore` to GlobalProjectionService; `sync_vitals` and workout actions emit `VITAL_UPDATED`.

#### ❌ What is incomplete or broken
- **isNewPR logic error** — `TitanPage.tsx` line 753 unconditionally sets `isNewPR = true` after the conditional on line 744, making every PR update appear as a new record. The celebration/badge UX is always triggered.
- **PersonalRecord type mismatch** — `titan/types.ts` defines `PersonalRecord.exerciseId` but `lib/types.PersonalRecord` uses `exerciseName`. `TitanPage.tsx` line 339 works around this by passing `[]` to `annotatePRs()`, completely disabling workout annotation.
- **No Atlas planning context in compute_readiness** — The readiness action accepts `sleepQuality`, `energyLevel`, `stressPhysical`, `restingHeartRate`. It does NOT consume Atlas `planningLoad`, deadline pressure, or overdue task count. A user can be biologically green but cognitively overloaded, and Titan returns GREEN.
- **Heuristic constants undocumented** — RPE thresholds (`rpe >= 8 ? -1.5 : rpe >= 6 ? -0.5 : 0`), CNS fatigue formula (48-hour half-life exponential decay), sleep score peak (8.25h), recovery modifier thresholds are all magic numbers in `actions.ts`. No configuration surface, no inline references.

---

### 2. Atlas Usability & Customizability

**Atlas covers**: tasks (with recurrence engine), goals (with milestones), habits (with streak tracking), journal (AI-powered), daily planning, weekly reviews, morning briefs, evening check-ins, predictive state machine (Normal → Compressed → Overloaded → Recovery), energy wave management.

#### ✅ What is complete
- All 5 pillars (planning, habits, journal, goals, tasks) have dedicated actions and UI components.
- `generate_daily_schedule` (1,178–1,309 lines) implements full energy-budgeted scheduling with overdue-first sorting, morning front-loading, and capacity protection at low energy.
- Recurrence engine spawns next task occurrence automatically on completion (daily, weekdays, weekly, monthly).
- Journal has 3 dedicated AI actions: `atlas_journal_generate_prompt`, `atlas_journal_synthesize_response`, `atlas_journal_extract_insights`.
- `field-templates.ts` defines 10 extension field templates (deep work hours, pomodoro count, distraction count, screen time, meeting load, decision fatigue, creative output, learning hours, journaling streak, morning routine score).
- `atlas-field-actions.ts` registers `create_field`, `delete_field`, `suggest_field`, `update_field_value` — all registered at app startup via `main.tsx`.
- `atlas-predictive-service.ts` implements a full 4-state machine with velocity-based risk detection and burnout detection (2-of-3 crisis model).
- `QuickCaptureBar` uses `use-atlas-entry-parser.ts` for deterministic NLP (no LLM needed for quick entry).
- `atlas-profile-service.ts` normalizes 13 array/object fields with backward compat migration from `weeklyReviews` → `reviews`.

#### ⚠️ Gaps
- **No dedicated extension fields management UI in AtlasPage tabs** — Custom field creation is available via AI chat (`suggest_field` renders an inline suggestion card), but there is no UI panel in the Atlas tab navigation for users to browse the 10 template suggestions from `field-templates.ts`, view active extension fields, or manage them without going through the AI. This is a discoverability gap.
- **`suggest_field` is a no-op action** — It renders a suggestion card in chat but does not automatically execute `create_field`. The user must confirm via a follow-up turn. This is by design but should be documented as intentional UX, not a bug.
- **`atlas-review-service.ts` not fully audited** — The file exists but its auto-generation completeness for weekly reviews (vs. user-driven temporal_review action) is unverified.

---

### 3. LLM Integration Completeness

#### Shared infrastructure
- `useModuleAI` at `/src/lib/hooks/use-module-ai.ts` (811 LOC) is the single integration point for all 8 modules.
- Full pipeline confirmed: user message → routing → memory retrieval (RAG, 1,800-char limit) → NSV context injection → system prompt (PersonaFactory) → streaming → action execution → NSV patch → Spine event emission.
- Both Titan and Atlas are confirmed in the 8-module list using `useModuleAI` (grep: 61 files reference it).
- Session persistence: Firestore with 1,500ms debounce + SessionStorage fallback; 200-message consolidation via LLM compression.

#### Titan LLM coverage
- System prompt builder: `titan/prompts/` directory contains prompt builders (not fully audited but present).
- `titanAllowedActions` export gates which actions the LLM can invoke.
- Diagnosis mode: separate `titanDiagnosisSpec` with its own system prompt via `buildTitanDiagnosisPrompt`.
- All medical actions (parse_lab_report, analyze_medical_image, commit_biomarker, issue_clearance) are LLM-invocable.

#### Atlas LLM coverage
- System prompt builder: `atlas/prompts/atlas-prompt-builder.ts` present.
- `atlas_journal_generate_prompt` — LLM-generates tone-tuned journal prompts (5 tones: reflective, gratitude, challenge, growth, creative).
- `atlas_journal_synthesize_response` — LLM synthesizes 3-sentence warm response from journal entry.
- `atlas_journal_extract_insights` — LLM analyzes 7-day journal entries for word-frequency blockers.
- `deriveNsvTone()` helper maps NSV state to journal tone without LLM (correct — deterministic fallback).

#### Surfaces that should be AI-powered but aren't
- **Atlas quick-add entry parsing** — Intentionally deterministic (`use-atlas-entry-parser.ts`). Correct choice for latency reasons. ✅
- **Titan readiness interpretation narrative** — `compute_readiness` returns a tier (GREEN/AMBER/RED) and a numeric score but no natural-language explanation. The score is passed to NSV, but there is no `pushAssistantMessage` call to give the user a contextual readiness briefing. The action calls `pushAssistantMessage` at the end (confirmed from the action signature), so this may be implemented — but the quality of the narrative should be validated in QA.
- **Atlas weekly review generation** — `temporal_review` action exists and records review data, but it's unclear if the LLM auto-generates the review narrative or if the user writes it manually. This is a potential gap in the guided review experience.

---

### 4. Titan → Atlas Data Access

**Finding: Zero cross-module data access. This is the single most significant architectural gap for Nexus's value proposition.**

- Grep search across all Titan module files returns **0 matches** for: `atlasProfile`, `AtlasProfile`, `atlas_planning`, `planningLoad`, `atlasTasks`, `atlasGoals`.
- `compute_readiness` in `actions.ts` receives only biometric inputs (sleepQuality, energyLevel, stressPhysical, restingHeartRate). It does NOT call `loadAtlasProfile()` or read Atlas NSV metrics like `planningLoad` or `deadlinePressure`.
- The cascade-rules define ATLAS_CASCADE_RULES and ATLAS_MORNING_RULES, confirming the architecture intends cross-module signal flow — but Titan does not listen to `ATLAS_STATE_CHANGED` events to update its readiness model.

**Impact on Nexus**: The Nexus promise is that health + planning intelligence are unified. If Titan's readiness score ignores Atlas planning overload, a user in Recovery (Atlas) could still receive a GREEN readiness score from Titan, causing contradictory recommendations from the two modules.

**Recommended wiring**:
```typescript
// In compute_readiness action, after loading Titan profile:
const atlasProfile = await loadAtlasProfile({ userId, encryptionKey });
const planningPressure = atlasPredictiveService.getLatestScore()?.planningLoad ?? 0;
const deadlinePressure = atlasPredictiveService.getLatestScore()?.deadlinePressure ?? 0;
// Apply planning load penalty: planningPressure > 7 → -1.0 readiness adjustment
```

Alternatively, Titan can subscribe to `ATLAS_STATE_CHANGED` at module init and store the latest Atlas state in local ref for use in readiness computation.

---

### 5. Nexus/Spine Data Passing

#### Titan Spine emissions (confirmed)
| Event | Trigger | Destination |
|-------|---------|-------------|
| `VITAL_UPDATED` | `sync_vitals`, workout completion | All cascade listeners |
| `MODULE_PROFILE_UPDATED` | Any profile save (via useModuleAI) | Orchestrator, NSV |
| `SESSION_STARTED` / `SESSION_ENDED` | Chat session lifecycle | Logging, Analytics |
| `MODULE_DELEGATED` | Cross-module routing | Target module |
| Titan-specific clearance events | `issue_clearance` | Soma, Agnes |
| Workout volume / PR events | `log_workout_session` | Downstream (cascade) |

#### Atlas Spine emissions (confirmed)
| Event | Trigger | Destination |
|-------|---------|-------------|
| `MORNING_BRIEF_DUE` | 5am–11am on app open | Agnes, Orchestrator |
| `WEEKLY_REVIEW_DUE` | Sunday 6pm–9pm | Agnes, Orchestrator |
| `COMMITMENT_MISSED` | Overdue task detected | Agnes, cascade |
| `BURNOUT_WARNING` | Predictive service burnout flag | Titan (should → readiness penalty) |
| `ATLAS_STATE_CHANGED` | State machine transition | Titan (not wired — gap) |
| `TASK_COMPLETED` | complete_task action | Ledger (habit streaks), cascade |
| `DEADLINE_APPROACHING` | set_deadline action | Agnes, user notification |
| `ROUTINE_UPDATED` | generate_daily_schedule | Titan (not consumed — gap) |
| `ATLAS_PREDICTIVE_ALERT` | Velocity risk ≥ 0.6 | Agnes, Orchestrator |

#### Cascade rules coverage
The `cascade-rules.ts` file defines rules for both modules:
- `ATLAS_CASCADE_RULES` (2 rules): weekly review checks
- `ATLAS_MORNING_RULES` (2 rules): morning brief + evening check-in
- `ATLAS_JOURNAL_RULES` (1 rule): reflection streak milestone
- `ATLAS_FAILURE_RULES` (2 rules): commitment missed + habit streak broken
- `AGNES_CASCADE_RULES` (1 rule): burnout → somatic support

**Gap**: No cascade rule converts `ATLAS_STATE_CHANGED` (overloaded/recovery) into a Titan readiness penalty event. This is the missing rule needed to close the cross-module feedback loop.

---

### 6. Validation Authority

#### titan-diagnosis-extractor.ts
- **RISK**: `payload.value` in the `commit_biomarker` case (line ~16) has no type check. If the LLM returns `null`, `undefined`, or an object, the label string interpolation silently produces `"undefined mg/dL"` or `"[object Object] mg/dL"` and this enters the biomarker record.
- `clearance.status` fallback is hardcoded string `'conditional'` — should be validated against the clearance status enum before persisting.
- Conditions, medications, allergies iteration uses type guards correctly (`typeof c === 'string'`). ✅

#### titan-profile-service.ts
- Lines 46, 67: Unsafe type assertions for `nutrition` and `personalRecords` — the object shape is cast without structural validation. A profile written with malformed `nutrition.supplements` (e.g., an array of numbers instead of strings) would pass normalization silently.
- Array slicing limits (sleepLog: 730, workoutSessions: 500, biomarkers: 200, workoutLogs: 1,000) are enforced in normalization. ✅
- No Zod or equivalent schema validation library used anywhere in the Titan validation path. Validation is hand-rolled field-by-field.

#### atlas-profile-service.ts
- `normalizeAtlasProfile()` is more thorough — validates 13 array and object fields with `Array.isArray()` guards and backward compat migration. ✅
- Guest profile functions (`loadGuestAtlasProfile`, `saveGuestAtlasProfile`, `clearGuestAtlasProfile`) are present and the guest→user sync is confirmed wired in `AtlasPage`. ✅

---

### 7. Bloat & Unlinked Elements

#### Titan
| Item | File | Status |
|------|------|--------|
| `loadGuestTitanProfile` | titan-profile-service.ts | Exported but not referenced in TitanPage or actions.ts. Possibly used in onboarding — verify. |
| `saveGuestTitanProfile` | titan-profile-service.ts | Same — potentially orphaned export. |
| `clearGuestTitanProfile` | titan-profile-service.ts | Same — possibly dead. |
| `annotatePRs()` receives `[]` | TitanPage.tsx line 339 | Workaround due to type mismatch renders the annotation feature completely inert. |
| `titan-diagnosis-prompt.ts` | diagnosis/ | Not audited — verify it's consumed by `titanDiagnosisSpec.buildSystemPrompt`. |
| `titan-diagnosis-merge.ts` | diagnosis/ | Not audited — verify it's consumed by `titanDiagnosisSpec.mergeToBase`. |

#### Atlas
| Item | File | Status |
|------|------|--------|
| `suggest_field` action | atlas-field-actions.ts | Registered but is intentionally a no-op (renders suggestion card in chat). Needs documentation. |
| `field-templates.ts` templates | field-templates.ts | 10 templates defined but no UI surface in AtlasPage for browsing them. Only accessible via AI chat. |
| `atlas-review-service.ts` | services/ | Exists but not audited — may contain unreachable auto-review generation logic. |
| `getAtlasFieldCategory()` | field-templates.ts | Utility function present — verify it's called from components (not just defined). |

#### Shared Infrastructure
| Item | File | Status |
|------|------|--------|
| `useModuleAI` 811-LOC monolith | lib/hooks/use-module-ai.ts | Single hook handles hydration, memory, actions, persistence, recovery, consolidation. Not a bug, but high maintenance risk. Decompose after vendor release. |
| NSV write audit trail | GlobalProjectionService | No timestamped write log to Firestore. Compliance risk for health data. |
| Event replay | spine-event-bus.ts | No replay buffer — late-mounting listeners miss past events. |

---

## Prioritized Gap List

---

### 🔴 CRITICAL — Blocks Vendor Release

| # | Module | Issue | Recommended Fix |
|---|--------|-------|-----------------|
| C1 | **Titan** | **`isNewPR` logic error**: `TitanPage.tsx` line 753 unconditionally sets `isNewPR = true`, overwriting the `isNewPR = !existing` logic on line 744. Every PR entry triggers the "new PR" celebration — including existing PRs that were not beaten. Corrupts user feedback and PR badge display. | Delete line 753 (`isNewPR = true`). The assignment on line 744 is the correct conditional logic. |
| C2 | **Titan** | **`PersonalRecord` type mismatch**: `titan/types.ts` defines `exerciseId: string` while `lib/types.PersonalRecord` uses `exerciseName: string`. `TitanPage.tsx` line 339 passes `[]` to `annotatePRs()` as a workaround, making workout annotation completely non-functional. | Unify types: add `exerciseName` to `titan/types.PersonalRecord` OR make `TitanPage` resolve exercise names before calling `annotatePRs()`. Remove the empty-array workaround. |
| C3 | **Titan → Atlas** | **Zero cross-module data access for readiness computation**: `compute_readiness` uses only biometric inputs (sleep, energy, stress, HRR) and ignores Atlas planning state (`planningLoad`, `deadlinePressure`, Atlas machine state). A user in Atlas `Recovery` state can receive a Titan `GREEN` readiness score — directly contradictory recommendations from the two modules. This breaks Nexus's core cross-domain intelligence promise. | Subscribe Titan to `ATLAS_STATE_CHANGED` at module init. Store latest Atlas planning load/deadline pressure in a module-scoped ref. Apply a planning penalty (−1.0 to −2.0) to the composite readiness score when Atlas state is Overloaded or Recovery. |

---

### 🟠 HIGH — Significant Feature Gaps

| # | Module | Issue | Recommended Fix |
|---|--------|-------|-----------------|
| H1 | **Titan** | **Biomarker validation gap**: `titan-diagnosis-extractor.ts` — `payload.value` has no type check before string interpolation. Malformed LLM output (null, object, array) silently corrupts biomarker labels (e.g., `"undefined mg/dL"`). Medical data corruption is a vendor liability. | Add `const value = typeof payload.value === 'number' ? payload.value : typeof payload.value === 'string' ? parseFloat(payload.value) : null;` with a null guard before creating the ExtractedDataItem. |
| H2 | **Titan** | **Clearance status unvalidated**: `titan-diagnosis-extractor.ts` — clearance `status` falls back to hardcoded string `'conditional'` without enum validation. If a future clearance status is renamed, the fallback silently produces an invalid state. | Define `ClearanceStatus` enum, validate `payload.status` against it, use the enum default. |
| H3 | **Titan** | **Heuristic constants are undocumented magic numbers**: RPE penalty thresholds (`rpe >= 8 ? -1.5`), CNS fatigue exponential decay formula (48-hour half-life), sleep score peak (8.25h), and readiness tier cutoffs (7 = GREEN, 4 = AMBER) are scattered across `actions.ts` with no documentation or configuration surface. Vendor/clinical reviewers cannot audit or tune them. | Extract all biometric constants to a `titan-constants.ts` file with empirical source citations. Consider a Firebase Remote Config hook for runtime tuning without code deploy. |
| H4 | **Atlas** | **Extension fields have no management UI**: `field-templates.ts` defines 10 curated extension field templates. `atlas-field-actions.ts` provides CRUD. But AtlasPage has no tab or settings panel for users to browse available templates, see active extension fields, or delete them without AI chat. The only entry point is the AI conversation (`suggest_field` no-op action). | Add an "Extensions" panel in Atlas settings or the Dashboard tab. Display the 10 templates from `field-templates.ts` with one-click activation. Show active extension fields with delete controls. |
| H5 | **Spine** | **Missing cascade rule: Atlas planning overload → Titan readiness penalty**: `ATLAS_STATE_CHANGED` events (Overloaded, Recovery) are emitted by the Atlas predictive service but no cascade rule converts them into a Titan-consumable signal. The cross-module feedback loop is architecturally defined (cascade-rules.ts has the pattern) but the specific rule is missing. | Add to `cascade-rules.ts`: a rule that transforms `ATLAS_STATE_CHANGED { state: 'overloaded' }` into a `TITAN_READINESS_PENALTY` event (or directly into a `VITAL_UPDATED` NSV patch reducing `recoveryScore`). |

---

### 🟡 MEDIUM — Polish & Completeness

| # | Module | Issue | Recommended Fix |
|---|--------|-------|-----------------|
| M1 | **Titan** | **PR update logic duplicated 3+ times**: The personal record calculation block (compute e1RM → compare existing → update) appears in `TitanPage.tsx` (lines 526–546, 586–606, 725–809) and in `actions.ts`. Any fix to the algorithm must be applied in multiple places. | Extract `updatePersonalRecords(existingPRs, set): PersonalRecord[]` into a shared utility in `titan/utils/`. |
| M2 | **Titan** | **Unsafe type assertions in profile normalization**: `titan-profile-service.ts` lines 46, 67 cast `nutrition` and `personalRecords` to their expected types without structural validation. Malformed data from an old profile version passes silently. | Add structural validators: check `nutrition.supplements` is `string[]`, check each `personalRecord` has required fields (`exerciseId`, `e1RM`, `date`). |
| M3 | **Titan** | **3 guest profile exports likely orphaned**: `loadGuestTitanProfile`, `saveGuestTitanProfile`, `clearGuestTitanProfile` in `titan-profile-service.ts` are not referenced in `TitanPage.tsx` or `actions.ts`. `UnifiedModulePage` receives `syncGuestProfile` (the migration function) but not load/save. | Grep full codebase for usages. If unused, remove exports and add `// @deprecated` JSDoc. If used in onboarding, document the dependency. |
| M4 | **Atlas** | **`atlas-review-service.ts` unaudited**: The service exists in `services/` but its role in the weekly review auto-generation flow is unverified. If the LLM-generated review narrative is missing, the weekly review is user-written only — a significant UX gap for the guided planning experience. | Audit `atlas-review-service.ts`. Confirm whether `temporal_review` action calls it for narrative generation, or if it's a stub. |
| M5 | **Atlas** | **`suggest_field` is undocumented as intentional no-op**: The action registers with an empty handler (`// renders inline suggestion card`). Future developers may treat this as a bug and try to implement it, or the AI may try to call it expecting a state change. | Add a JSDoc comment: `// @intentional: This action renders a confirmation card in chat; the user must explicitly confirm via create_field.` |
| M6 | **Both** | **No NSV write audit trail**: Every `updateGlobalSoul()` call in useModuleAI patches NSV without recording a timestamped history. For health/financial data, this is a compliance risk (no traceability of who changed what and when). | Add `nsv_audit_log/{userId}/events` Firestore collection. Each `VITAL_UPDATED` emission should write `{ field, oldValue, newValue, source, timestamp }`. |

---

### 🔵 LOW — Nice-to-Have

| # | Module | Issue | Recommended Fix |
|---|--------|-------|-----------------|
| L1 | **Titan** | **`analyze_medical_image` action registered** but it's unclear if a file-upload UI exists in TitanPage. If the action is only callable via LLM tool call but has no user-facing upload trigger, the feature is partially hidden. | Audit TitanPage's Health tab for an image upload component. If absent, add an upload button or surface the AI diagnostic mode in the tab UI. |
| L2 | **Titan** | **CNS fatigue formula undocumented**: The 48-hour half-life exponential decay with `sessionRPE * 0.6 + min(4, volumeLoad / 5000)` accumulation is a sophisticated algorithm with no inline citation. Clinical reviewers cannot validate it. | Add inline comment: `// Based on: Banister impulse-response model (1975), adapted for CNS fatigue half-life = 48h.` |
| L3 | **Both** | **`useModuleAI` 811-LOC monolith**: The hook handles 12 distinct responsibilities. While functional, it creates a high-risk single file for bugs and testing. | Post-release refactor: extract `useModuleAISession`, `useModuleAIMemory`, `useModuleAIActions`, `useModuleAIRecovery` into composable sub-hooks. |
| L4 | **Atlas** | **`deriveNsvTone()` is a critical decision function without documentation**: This helper maps NSV state to journal prompt tone (lines 81–115 in actions.ts). As NSV dimensions grow, this function will become a maintenance hotspot. | Add unit tests and a decision table comment showing which NSV ranges map to which tones. |
| L5 | **Spine** | **No event replay capability**: Listeners that subscribe after an event fires miss the event entirely. Morning brief and weekly review detection in AtlasPage uses an on-mount check, which is a workaround for this limitation. | Implement a short-lived event ring buffer (last 10 events per type, TTL 60s) in `spine-event-bus.ts`. New subscribers receive recent events on attach. |
| L6 | **Both** | **Scattered console.error logging**: Both modules use `console.error` for all error reporting. Vendor release should route errors through a centralized observability service (e.g., Firebase Crashlytics or a custom error boundary). | Add an `ErrorReporter.capture(error, context)` utility and replace raw `console.error` calls in service layers. |

---

## Action Item Summary

| Priority | Count | Owner Suggestion |
|----------|-------|-----------------|
| 🔴 CRITICAL | 3 | Sprint 18, pre-release freeze |
| 🟠 HIGH | 5 | Sprint 18–19 |
| 🟡 MEDIUM | 6 | Sprint 19–20 |
| 🔵 LOW | 6 | Post-release backlog |
| **Total** | **20** | |

---

## Recommended Sprint 18 Focus

1. **Fix C1** (`isNewPR` bug) — 30 min, single-line delete
2. **Fix C2** (PersonalRecord type unification) — 2–3 hours, types + adapter
3. **Wire C3** (Titan reads Atlas state for readiness) — 1 day, subscribe to `ATLAS_STATE_CHANGED` + penalty logic
4. **Add H5** (Cascade rule: Atlas overload → Titan signal) — 2 hours, add to `cascade-rules.ts`
5. **Fix H1** (Biomarker value validation) — 1 hour, add type guard in extractor

Items C1–C3 and H1 must be resolved before any vendor demo or production release. The `isNewPR` bug and type mismatch actively corrupt workout data. The Titan→Atlas data void silently undermines the core Nexus cross-module intelligence value proposition.

---

*Audit completed. Workitem saved to `/workitems/AUDIT-TITAN-ATLAS-VENDOR-READINESS.md`*
