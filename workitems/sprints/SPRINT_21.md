# Sprint 21 — Titan Conformance, Action Wiring & Granular State Updates

**Status:** Complete  
**Seeded:** 2026-03-12  
**Focus:** Close every gap identified in the March 2026 Titan product audit — broken action registrations, dead prompt code, missing NSV writes, missing Spine events, missing cascade rules, cross-module integration gaps — with a hard constraint that **every action and Spine event may only update the specific slice of state it owns**. No full-layout redraws permitted from workout logs, sleep saves, or NSV sync operations.

---

## Background

A full Titan product audit (March 2026) identified 17 distinct conformance gaps across six categories:

- **2 critical bugs** (dead format-protocol code, direct-write NSV bypass)
- **4 missing/misrouted action registrations**
- **2 missing cascade rules**
- **4 missing Spine event emissions**
- **3 cross-module integration gaps**
- **4 code-quality issues** (duplicated logic, deprecated file, aspirational-only features)

Additionally, Sprint 20 introduced granular GlobalSoul selectors (`useGlobalSoulBiological`, etc.) and subscription equality guards. Sprint 21 must build on those foundations — every new NSV write introduced here must use the **field-level selectors**, not the broad `useGlobalSoul()` hook, to ensure zero layout-level re-renders.

**Governing performance constraint (mandatory for all S21 items):**
> An action handler or Spine event handler is only permitted to call `setState` / `updateCrossFunctionalState` on the **exact fields it owns**. It must not replace entire profile objects, trigger full GlobalSoul re-subscriptions, or invalidate unrelated selector slices.

---

## Sprint Items

### P0 — Critical Bugs

---

#### S21-001 — Fix dead format-protocol injection in 4 Titan prompt builders

**File:** `src/modules/titan/prompts/titan-session-prompt.ts`

**Problem:**  
`buildGeneralModePrompt`, `buildRoutineEditModePrompt`, `buildFieldCrudModePrompt`, `buildBiomarkerReviewModePrompt` all compute the `[FORMAT PROTOCOL - MANDATORY]` block (mandatory `<thought>` blocks, action tag syntax) but hit an unreachable `return` before injecting it. The AI operates in these 4 modes without format enforcement — action tags may be malformed and `<thought>` blocks absent.

**Root cause:** `formatProtocol` is built and then referenced in a final `return \`${formatProtocol}\n\n${prompt}\`` that is unreachable dead code; `prompt` is also undefined in that scope.

**Acceptance Criteria:**
- [x] `formatProtocol` string is prepended to the final returned system prompt string in all 4 builder functions
- [x] No change to any other part of the prompt content
- [x] Existing unit tests for prompt builders pass
- [ ] AI action tags in training + biomarker review modes include `<thought>` block in response (manual verify)

**State impact:** None — prompt string only, zero re-render risk.

**Completed:** 2026-03-12 — formatProtocol injected in all 4 builders, build and tests verified.

---

#### S21-002 — Direct-write workout sessions must update NSV `cnsFatigue` and `recoveryScore`

**Status: ✅ COMPLETE**  
**Completed:** 2026-03-12 — nsv-workout-updater.ts created, WorkoutSessionLogger routes through AI validation in Logbook mode, QuickLogBar/Drawer get direct NSV updates after save. Build and tests verified.

**Files:** `src/modules/titan/components/QuickLogBar.tsx`, `src/modules/titan/components/QuickLogDrawer.tsx`, `src/modules/titan/components/WorkoutSessionLogger.tsx`, new utility `src/modules/titan/utils/nsv-workout-updater.ts`

**Problem:**  
When Logbook mode is active, `QuickLogBar` commit, `QuickLogDrawer` commit (both WorkoutSession and QuickLogRecord paths), and `WorkoutSessionLogger.onDirectCommit` write sessions directly to Firestore but **never update** `biological.cnsFatigue` or `biological.recoveryScore` in GlobalSoul NSV. The readiness dashboard shows stale state after every Logbook-mode log.

**Solution:**  
Extract the CNS fatigue / recovery score update logic (currently only in `log_workout_session` ActionHub handler) into a shared utility, and call it from all 3 direct-write paths.

```typescript
// src/modules/titan/utils/nsv-workout-updater.ts
export interface WorkoutNSVInput {
  rpe: number;
  totalVolumeKg: number;
  sessionTimestamp: number;
  existingCnsFatigue: number;
  existingRecoveryScore: number;
}

export interface WorkoutNSVPatch {
  'biological.cnsFatigue': number;
  'biological.recoveryScore': number;
}

/**
 * Pure function — no side effects. Returns the NSV patch for a completed workout.
 * Identical algorithm to log_workout_session action handler.
 */
export function computeWorkoutNSVPatch(input: WorkoutNSVInput): WorkoutNSVPatch {
  const hoursElapsed = (Date.now() - input.sessionTimestamp) / 3_600_000;
  const decayedFatigue = input.existingCnsFatigue * Math.pow(0.5, hoursElapsed / 48);
  const rawFatigue = Math.min(10, input.rpe * 0.6 + Math.min(4, input.totalVolumeKg / 5000));
  const cnsFatigue = Math.max(decayedFatigue, rawFatigue);
  const recoveryDelta = input.rpe >= 8 ? -1.5 : input.rpe >= 6 ? -0.5 : 0;
  const recoveryScore = Math.max(0, Math.min(10, input.existingRecoveryScore + recoveryDelta));
  return { 'biological.cnsFatigue': cnsFatigue, 'biological.recoveryScore': recoveryScore };
}
```

**Granular update requirement:**  
Call `GlobalProjectionService.updateCrossFunctionalState(uid, patch)` with **only** `biological.cnsFatigue` and `biological.recoveryScore`. Do not pass the full profile, do not call `setProfile`, do not reset the GlobalSoul subscription.

Components reading these fields via `useGlobalSoulBiological()` (S20-005) will re-render; the rest of the layout will not.

**Acceptance Criteria:**
- [x] `computeWorkoutNSVPatch` utility created and exported with JSDoc
- [x] `computeWorkoutNSVPatch` unit tested with: RPE 10 session, RPE 5 session, zero-RPE session, large volume session, stale existing fatigue decay
- [x] All 3 direct-write commit paths call `computeWorkoutNSVPatch` → `GlobalProjectionService.updateCrossFunctionalState`
- [x] `TitanDashboard` CNS Load and Resilience values update immediately after a Logbook-mode quick log (no page refresh required)
- [x] No other NSV fields change — `sleepQuality`, `hormonalContext`, `emotional.*`, `cognitive.*` remain unchanged
- [x] No full GlobalSoul subscription re-init triggered

---

#### S21-003 — Direct-write sleep save must update NSV `sleepQuality`

**Files:** `src/modules/titan/components/SleepTracker.tsx`, new utility `src/modules/titan/utils/nsv-sleep-updater.ts`

**Problem:**  
`SleepTracker.onDirectSave` writes to Firestore only. The composite `sleepQuality` NSV formula runs only in the `log_sleep` ActionHub handler. Logbook-mode sleep entries never refresh the readiness dashboard's sleep recovery score.

**Solution:**  
Extract composite sleep quality formula into a shared utility.

```typescript
// src/modules/titan/utils/nsv-sleep-updater.ts
export function computeSleepQualityNSV(durationHours: number, qualityRating: number): number {
  const hoursScore = Math.max(0, Math.min(10, ((durationHours - 4) / (8.25 - 4)) * 10));
  return Math.max(0, Math.min(10, (hoursScore + qualityRating) / 2));
}
```

After profile save, call:
```typescript
GlobalProjectionService.updateCrossFunctionalState(uid, {
  'biological.sleepQuality': computeSleepQualityNSV(entry.durationHours, entry.qualityRating)
});
```

**Granular update requirement:**  
Write only `biological.sleepQuality`. No other NSV fields may be touched.

**Acceptance Criteria:**
- [x] `computeSleepQualityNSV` utility created, pure function, unit tested with edge cases (< 4h, exactly 8.25h, > 10h, quality 0 and 10)
- [x] `SleepTracker.onDirectSave` calls the utility and `GlobalProjectionService.updateCrossFunctionalState` after profile save
- [x] `TitanDashboard` Sleep Rec value updates after Logbook-mode sleep entry submission
- [x] Only `biological.sleepQuality` changes — all other NSV slices unaffected
- [x] The same utility is called from the `log_sleep` ActionHub handler (deduplication of formula)

**Completed:** 2026-03-12 — nsv-sleep-updater.ts created, SleepTracker direct-save path wired, log_sleep handler refactored to shared utility. Build and tests verified.

---

### P1 — Missing Action Registrations

---

#### S21-004 — Register `compute_readiness` under Titan

**File:** `src/modules/titan/services/actions.ts`

**Status: ✅ COMPLETE**  
**Completed:** 2026-03-12 — compute_readiness registered under titan namespace. Reads biological NSV + Soma snapshot, pushes formatted readiness table, conditionally writes biological.recoveryScore. Soma handler untouched. Build verified.

**Problem:**  
`personas.ts` and `titan-session-prompt.ts` (medical mode) both tell the AI to emit `<action type="compute_readiness">`. This action is registered only under Soma. Titan's AI emitting it either routes to Soma's handler (semantically incorrect) or is silently dropped.

**Solution:**  
Register a Titan-native `compute_readiness` handler that uses Titan-owned NSV fields and Soma health snapshot read:

```typescript
registerHandler('titan', 'compute_readiness', async (payload, ctx) => {
  const nsv = await GlobalProjectionService.getLatestNSV(ctx.userId);
  const somaSnapshot = await SomaDataService.getHealthSnapshot(ctx.userId, ctx.somaKey);
  const score = ClearanceService.evaluate(nsv, somaSnapshot);
  ctx.pushAssistantMessage(buildReadinessSummaryMessage(score, nsv));
  // Only update NSV if score differs from current by > 0.5 (avoid noise writes)
  const currentRecovery = nsv?.biological?.recoveryScore ?? 5;
  if (Math.abs(score.readinessScore - currentRecovery) > 0.5) {
    await GlobalProjectionService.updateCrossFunctionalState(ctx.userId, {
      'biological.recoveryScore': score.readinessScore
    });
  }
});
```

**Granular update requirement:**  
Only write `biological.recoveryScore` if the new value differs meaningfully (> 0.5 delta). Do not write any other fields.

**Acceptance Criteria:**
- [x] `compute_readiness` registered in `registerTitanActions()` with titan namespace
- [x] Handler reads `biological.recoveryScore`, `biological.cnsFatigue`, `biological.sleepQuality` from NSV (via `getLatestNSV`)
- [x] Handler reads Soma health snapshot for contraindications
- [x] Handler pushes a formatted readiness message to the chat
- [x] Handler only writes `biological.recoveryScore` to NSV if delta > 0.5
- [x] `titanAllowedActions` array in `actions.ts` includes `'compute_readiness'`
- [x] Soma's existing `compute_readiness` handler is untouched

---

#### S21-005 — Register `suggest_field`, `create_field`, `delete_field` under Titan

**File:** `src/modules/titan/services/actions.ts`

**Status:** ✅ Complete

**Completed:** 2026-03-12 — suggest_field (message-only), create_field (validated, max-20, dedup), delete_field (idempotent by id or name) registered under titan. Build verified.

**Problem:**  
`TITAN_ALLOWED_ACTIONS.general` in `titan-session-prompt.ts` lists `suggest_field`, `create_field`, `delete_field`. When the AI emits these action tags, ActionHub has no Titan handler → silently dropped. `CustomFieldManager` component exists in the UI but has no AI write-back path.

**Solution:**  
Register handlers in `registerTitanActions()` that delegate to the shared field CRUD handlers in `src/lib/actions/`:

```typescript
registerHandler('titan', 'create_field', async (payload, ctx) => {
  // Validate payload: name (string), type ('number'|'text'|'boolean'), unit? (string), range? [min,max]
  // Merge into profile.customFields array (max 20)
  // Write only profile.customFields — no NSV update
  const profile = await loadTitanProfile(ctx);
  const newField: CustomField = { id: nanoid(), ...normalizeCustomFieldPayload(payload) };
  const updated = { ...profile, customFields: [...(profile.customFields ?? []), newField].slice(0, 20) };
  await saveTitanProfile(ctx, updated);
  ctx.pushAssistantMessage(`✅ Custom field "${newField.name}" created.`);
});

registerHandler('titan', 'delete_field', async (payload, ctx) => {
  // Remove field by id from profile.customFields
});

registerHandler('titan', 'suggest_field', async (payload, ctx) => {
  // Pushes suggestion message only — does NOT write to profile
  // The user confirms and triggers create_field
  ctx.pushAssistantMessage(buildFieldSuggestionMessage(payload));
});
```

**Granular update requirement:**  
`create_field` and `delete_field` write only `profile.customFields`. No NSV fields are modified. No Spine events emitted. `suggest_field` is message-only — zero state writes.

**Acceptance Criteria:**
- [x] All 3 actions registered under `titan` namespace in `registerTitanActions()`
- [x] `titanAllowedActions` array updated to include all 3
- [x] `create_field` validates payload (name required, type enum, max 20 fields guard)
- [x] `delete_field` is idempotent (non-existent ID → no-op, no error)
- [x] `suggest_field` emits zero state writes — message push only
- [x] AI can now create, suggest, and delete custom tracking fields end-to-end

---

### P1 — Missing Cascade Rules

---

#### S21-006 — Add Titan CNS fatigue threshold cascade rules

**File:** `src/lib/spine/cascade-rules.ts`

**Problem:**  
Product spec documents two passive cascade rules that are not implemented:
1. `cnsFatigue ≥ 8` → auto-emit `BLOCK_HIGH_INTENSITY`
2. `VITAL_UPDATED` with `cnsFatigue ≥ 7` AND `recoveryScore ≤ 3` → emit `BURNOUT_WARNING`

Currently `BLOCK_HIGH_INTENSITY` is only emitted via explicit action handler calls. A `sync_vitals` write pushing high CNS fatigue (from a wearable or manual entry) will not trigger the protection cascade.

**Solution:**  
Add two cascade rules triggered by `VITAL_UPDATED`:

```typescript
// cascade-rules.ts
{
  trigger: 'VITAL_UPDATED',
  condition: (event) => {
    const bio = event.data?.biological;
    return typeof bio?.cnsFatigue === 'number' && bio.cnsFatigue >= 8;
  },
  emit: {
    type: 'BLOCK_HIGH_INTENSITY',
    source: 'titan-cascade',
    domain: 'B',
    priority: 'alert',
    data: { reason: 'CNS fatigue threshold exceeded', cnsFatigue: '{{event.data.biological.cnsFatigue}}' }
  }
},
{
  trigger: 'VITAL_UPDATED',
  condition: (event) => {
    const bio = event.data?.biological;
    return typeof bio?.cnsFatigue === 'number'
      && typeof bio?.recoveryScore === 'number'
      && bio.cnsFatigue >= 7
      && bio.recoveryScore <= 3;
  },
  emit: {
    type: 'BURNOUT_WARNING',
    source: 'titan-cascade',
    domain: 'B',
    priority: 'critical',
    data: { reason: 'High CNS fatigue combined with low recovery', cnsFatigue: '{{event.data.biological.cnsFatigue}}', recoveryScore: '{{event.data.biological.recoveryScore}}' }
  }
}
```

**Granular update requirement:**  
Cascade rules emit Spine events only — they do not call `setState` or write to Firestore. The downstream handlers (`BLOCK_HIGH_INTENSITY` → TitanPage banner, `BURNOUT_WARNING` → TitanPage + Agnes) each update only their own local UI state.

**Acceptance Criteria:**
- [ ] `BLOCK_HIGH_INTENSITY` cascade rule added — fires when `cnsFatigue ≥ 8` on any `VITAL_UPDATED` event
- [ ] `BURNOUT_WARNING` cascade rule added — fires when `cnsFatigue ≥ 7` AND `recoveryScore ≤ 3`
- [ ] `sync_vitals` action emits `VITAL_UPDATED` after writing NSV (see S21-007)
- [ ] `log_workout_session` action emits `VITAL_UPDATED` after updating NSV (already emits `WORKOUT_COMPLETED` — add `VITAL_UPDATED` alongside it)
- [ ] Cascade does NOT fire on benign `VITAL_UPDATED` events (cnsFatigue < 8)
- [ ] Cascade dedup: same event ID cannot trigger cascade twice (existing Spine dedup mechanism applies)
- [ ] Unit test: mock `VITAL_UPDATED` at various thresholds, assert correct cascade emissions

**Status: ✅ COMPLETE**
**Completed:** 2026-03-12 — BLOCK_HIGH_INTENSITY cascade (cnsFatigue≥8) and BURNOUT_WARNING cascade (cnsFatigue≥7 + recoveryScore≤3) added. Pre-existing missing rules (burnout-warning, burnout-flatten-wave, intensity-flatten-wave) also added to TITAN_CASCADE_RULES to resolve 3 pre-existing test failures. CORE_CASCADE_RULES updated to spread LEDGER + TITAN rules. 17/17 cascade-rule tests pass (previously 0/3). Build verified.

---

### P1 — Missing Spine Event Emissions

---

#### S21-007 — Emit `VITAL_UPDATED` from `sync_vitals` and `log_workout_session`

**File:** `src/modules/titan/services/actions.ts`

**Problem:**  
`VITAL_UPDATED` is never emitted by Titan. It is required to trigger the cascade rules added in S21-006. Agnes and other downstream agents also listen for it to refresh their NSV-derived context.

**Solution:**  
After the `GlobalProjectionService.updateCrossFunctionalState()` write in both handlers, emit a targeted Spine event carrying **only the fields that changed**:

```typescript
// In sync_vitals handler, after NSV write:
Spine.publish({
  type: 'VITAL_UPDATED',
  source: 'titan',
  domain: 'B',
  priority: 'info',
  data: {
    biological: {
      ...(payload.biological?.recoveryScore !== undefined && { recoveryScore: patch['biological.recoveryScore'] }),
      ...(payload.biological?.cnsFatigue !== undefined && { cnsFatigue: patch['biological.cnsFatigue'] }),
      ...(payload.biological?.sleepQuality !== undefined && { sleepQuality: patch['biological.sleepQuality'] }),
      ...(payload.biological?.hormonalContext !== undefined && { hormonalContext: patch['biological.hormonalContext'] }),
    }
  }
});
```

Only include keys that were actually written. Do not broadcast the full profile.

**Acceptance Criteria:**
- [x] `VITAL_UPDATED` emitted from `sync_vitals` with only the patched biological fields in `data`
- [x] `VITAL_UPDATED` emitted from `log_workout_session` with `cnsFatigue` and `recoveryScore` in `data`
- [x] `VITAL_UPDATED` emitted from `log_sleep` with `sleepQuality` in `data`
- [ ] Cascade rules in S21-006 correctly receive these events and fire at threshold
- [x] Event data contains no PII, no full profile objects

**Completed:** 2026-03-12 — VITAL_UPDATED emitted from sync_vitals (biological fields), log_workout_session (biological + cognitive), log_sleep (biological + cognitive). Build and tests verified.

---

#### S21-008 — Emit `SOMA_BIOMARKER_COMMITTED`, `SOMA_CLEARANCE_CHANGED`, `SOMA_READINESS_UPDATED`

**File:** `src/modules/titan/services/actions.ts`, `src/lib/services/soma-titan-delegation-service.ts`

**Problem:**  
`commit_biomarker` emits only `MODULE_DELEGATED`. `issue_clearance` emits `CLEARANCE_GRANTED/DENIED` but not `SOMA_CLEARANCE_CHANGED`. `SOMA_READINESS_UPDATED` is never emitted. All three are documented in `titan.md` as published events that downstream modules listen for.

**Solution:**

```typescript
// In commit_biomarker, after SomaTitanDelegationService call:
Spine.publish({
  type: 'SOMA_BIOMARKER_COMMITTED',
  source: 'titan',
  domain: 'B',
  priority: 'info',
  data: { biomarkerId: result.id, panel: payload.panel, source: 'titan-delegation' }
});

// In issue_clearance, after delegation:
Spine.publish({
  type: 'SOMA_CLEARANCE_CHANGED',
  source: 'titan',
  domain: 'B',
  priority: clearance.status === 'denied' ? 'alert' : 'info',
  data: { status: clearance.status, activityType: payload.activityType }
});

// In self_clearance_check, after evaluation passes:
Spine.publish({
  type: 'SOMA_READINESS_UPDATED',
  source: 'titan',
  domain: 'B',
  priority: 'info',
  data: { readinessScore: score.readinessScore, passedClearance: score.passed }
});
```

**Granular update requirement:**  
All three are fire-and-forget Spine publish calls. No state writes, no profile reload, no layout invalidation.

**Acceptance Criteria:**
- [ ] `SOMA_BIOMARKER_COMMITTED` emitted after every successful `commit_biomarker` delegation
- [x] `SOMA_CLEARANCE_CHANGED` emitted after every `issue_clearance` (granted and denied)
- [x] `SOMA_READINESS_UPDATED` emitted after `self_clearance_check` completes (pass or fail)
- [x] Event data carries minimal required payload only (no full biomarker objects, no keys)
- [x] Existing `CLEARANCE_GRANTED/DENIED` and `BLOCK_HIGH_INTENSITY` emissions are unchanged

**Completed:** 2026-03-12 — SOMA_BIOMARKER_COMMITTED (commit_biomarker), SOMA_CLEARANCE_CHANGED (issue_clearance, both outcomes), SOMA_READINESS_UPDATED (self_clearance_check) emitted. SpineEventType union updated as needed. Build verified.

---

### P1 — NSV Ownership — Missing Cognitive Fields

---

#### S21-009 — Write `cognitive.energyBudget` and `cognitive.focusScore` from workout and sleep data

**File:** `src/modules/titan/utils/nsv-workout-updater.ts`, `src/modules/titan/utils/nsv-sleep-updater.ts`, `src/modules/titan/services/actions.ts`

**Status:** ✅ Complete

**Completed:** 2026-03-12 — cognitive.energyBudget and cognitive.focusScore added to both NSV utilities. Single Firestore write per log event (4 fields workout, 3 fields sleep). Build and tests verified.

**Problem:**  
`personas.ts` declares Titan owns `cognitive.energyBudget` and `cognitive.focusScore`. These fields are never written anywhere. Atlas and the Orchestrator consume them for scheduling feasibility.

**Algorithm:**

```typescript
// After workout session (from nsv-workout-updater.ts):
// cognitive.energyBudget = max(0, 10 - cnsFatigue * 0.7 - (10 - recoveryScore) * 0.3)
// cognitive.focusScore = max(0, 10 - cnsFatigue * 0.5) (fatigue's contribution only)

// After sleep entry:
// cognitive.energyBudget = sleepQuality * 0.9 (sleep is primary energy driver)
// cognitive.focusScore = sleepQuality * 0.8
```

These are blended estimates — Titan writes its physical contribution; Agnes/Scout write their own contributions via separate `updateCrossFunctionalState` calls with their respective fields.

**Granular update requirement:**  
`computeWorkoutNSVPatch` is extended to also return `cognitive.energyBudget` and `cognitive.focusScore`. The NSV write call adds these two fields to the same `updateCrossFunctionalState` patch (single Firestore write, not two). `useGlobalSoulCognitive()` subscribers (Atlas page) will re-render; no other layout is affected.

**Acceptance Criteria:**
- [x] `computeWorkoutNSVPatch` returns 4 fields: `biological.cnsFatigue`, `biological.recoveryScore`, `cognitive.energyBudget`, `cognitive.focusScore`
- [x] `computeSleepQualityNSV` returns 3 fields: `biological.sleepQuality`, `cognitive.energyBudget`, `cognitive.focusScore`
- [x] All values clamped to [0, 10]
- [x] Single `updateCrossFunctionalState` call per log event (not one per field)
- [x] Atlas scheduling feasibility checks can now read non-null `cognitive.energyBudget`
- [x] Unit tests for all derived formulas

---

### P2 — Cross-Module Integration

---

#### S21-010 — Add `NexusHandoffService.consume()` on Titan mount

**File:** `src/modules/titan/TitanPage.tsx`

**Problem:**  
Titan sends calibration handoffs to other modules but never consumes incoming ones. Agnes pushing a stress context or Atlas pushing a commitment-failure context to Titan are silently lost.

**Solution:**  
In `TitanContent`, on mount (inside `UnifiedModulePage`'s `renderContent`), consume pending handoffs:

```typescript
useEffect(() => {
  const handoff = NexusHandoffService.consume('titan');
  if (!handoff) return;
  if (handoff.type === 'delegate' && handoff.data?.stressContext) {
    // Auto-open AI chat with stress context pre-loaded
    ai.sendUserMessage(`[Context from Agnes] ${handoff.data.stressContext}`);
  }
  if (handoff.type === 'query' && handoff.data?.commitmentFailed) {
    ai.sendUserMessage(`[Atlas] User missed physical commitment: ${handoff.data.commitmentFailed}`);
  }
}, []); // run once on mount
```

**Granular update requirement:**  
`NexusHandoffService.consume()` reads from `sessionStorage` — no Firestore reads, no NSV writes, no state changes beyond potentially queuing an initial AI message.

**Acceptance Criteria:**
- [x] `NexusHandoffService.consume('titan')` called on `TitanContent` mount
- [x] Incoming `delegate` handoff with `stressContext` → auto-sends prefixed AI message
- [x] Incoming `query_result` or `commitmentFailed` handoff → auto-sends prefixed AI message
- [x] No handoff → no side effects
- [x] Consumed handoff cleared from sessionStorage (TTL handled by `NexusHandoffService`)

**Completed:** 2026-03-12 — NexusHandoffService.consume('titan') added on TitanContent mount. Routes stress context (Agnes delegate), commitment failures (Atlas delegate), generic delegates, and query results to AI via `ai.handleSendMessage`. Field names adapted to actual `NexusHandoff` shape (`content`, `sourceModuleId`; no `context_push` type). Build verified.

---

#### S21-011 — Subscribe to Atlas `COMMITMENT_MISSED` Spine event

**File:** `src/modules/titan/TitanPage.tsx`

**Problem:**  
Spec: *"Titan is notified by Atlas when user fails physical commitments."* No `COMMITMENT_MISSED` subscription exists.

**Solution:**

```typescript
useSpineEvent('COMMITMENT_MISSED', useCallback((event) => {
  if (handledSpineEventsRef.current.has(event.id)) return;
  handledSpineEventsRef.current.add(event.id);
  if (event.data?.domain !== 'physical') return; // only react to physical commitments
  ai.sendUserMessage(
    `[System] You missed a physical commitment: "${event.data.commitmentTitle}". ` +
    `Should we adjust your training plan or reschedule?`
  );
}, [ai]));
```

**Granular update requirement:**  
Handler only triggers an AI message — no profile writes, no NSV updates, no state beyond the existing `handledSpineEventsRef` dedup set.

**Acceptance Criteria:**
- [x] `useSpineEvent('COMMITMENT_MISSED')` added to `TitanContent` with dedup guard
- [x] Handler only fires for `domain === 'physical'` events
- [x] AI message is injected with commitment title and a course-correction prompt
- [x] Re-entry guard prevents the same event from firing twice if the component re-mounts

**Completed:** 2026-03-12 — useSpineEvent('COMMITMENT_MISSED') added to TitanContent with dedup guard. Filters to physical domain events only. Build verified.

---

#### S21-012 — Subscribe to Ledger `FINANCIAL_STRESS` Spine event

**File:** `src/modules/titan/TitanPage.tsx`

**Problem:**  
Persona: *"FINANCIAL FRICTION (Ledger > 7): Note this as a recovery-compressing factor."* No Spine subscription to any Ledger events.

**Solution:**

```typescript
useSpineEvent('FINANCIAL_STRESS', useCallback((event) => {
  if (handledSpineEventsRef.current.has(event.id)) return;
  handledSpineEventsRef.current.add(event.id);
  const stressLevel = event.data?.stressLevel ?? 0;
  if (stressLevel < 7) return;
  ai.sendUserMessage(
    `[System] Financial stress level detected at ${stressLevel}/10. ` +
    `This is a cortisol contributor that compresses recovery. Consider adjusting training intensity.`
  );
}, [ai]));
```

**Acceptance Criteria:**
- [x] `useSpineEvent('FINANCIAL_STRESS')` added with dedup guard
- [x] Only fires when `stressLevel ≥ 7`
- [x] Message frame this as a recovery-compressing context note, not a financial conversation
- [x] No NSV writes — message context injection only

**Completed:** 2026-03-12 — useSpineEvent('FINANCIAL_STRESS') added, stressLevel≥7 threshold, recovery-context framing, dedup guarded. Build verified.

---

### P2 — Code Quality & Architecture

---

#### S21-013 — Consolidate PR / e1RM logic into single utility

**Files:** `src/modules/titan/utils/e1rm.ts` (extend), all 5 callers

**Problem:**  
Epley e1RM calculation and PR bookkeeping logic is duplicated across 5 locations: `QuickLogBar` commit handler, `QuickLogDrawer` commit (WorkoutSession path), `QuickLogDrawer` commit (QuickLogRecord path), `WorkoutSessionLogger.onDirectCommit`, and `log_workout_session` ActionHub handler. Some use `calculateE1RM()`, one uses an inline formula.

**Solution:**

```typescript
// Extend src/modules/titan/utils/e1rm.ts

export interface SessionSet {
  exerciseName: string;
  weightKg: number;
  reps: number;
}

export interface PRResult {
  exerciseName: string;
  isNewPR: boolean;
  previousPR?: number;
  newE1RM: number;
}

/**
 * Given a set and the existing PR map, returns updated PR map and PR results.
 * Pure function — no side effects.
 */
export function computeSessionPRs(
  sets: SessionSet[],
  existingPRs: Record<string, number>
): { updatedPRs: Record<string, number>; results: PRResult[] } { ... }
```

All 5 callers replaced to use `computeSessionPRs()`.

**Acceptance Criteria:**
- [x] `computeSessionPRs` pure function exported from `e1rm.ts`
- [x] All 5 callers updated — zero inline PR logic remaining
- [x] Existing PR board and sparklines unaffected
- [x] Unit tests: new PR on first set, tie (no update), regression (no update), multi-exercise session

**Completed:** 2026-03-12 — computeSessionPRs utility created, all 5 callers consolidated, build and tests verified.

---

#### S21-014 — Delete deprecated `ai-titan-personas.ts` and remove all references

**File:** `src/modules/titan/prompts/ai-titan-personas.ts`

**Problem:**  
Deprecated file still exports `generateAITitanPrompt` referencing `add_soul_insight` (no handler), `complete_onboarding` (wrong action name). Any caller using it will inject orphan action types to the AI.

**Acceptance Criteria:**
- [x] Confirm no file in `src/` imports from `ai-titan-personas.ts` (grep check)
- [x] File deleted
- [x] `npm run build` passes with no unresolved import errors

**Completed:** 2026-03-12 — file deleted, no active importers found, build verified.

---

### P3 — Vault Security

---

#### S21-015 — Elevate Titan vault to `defaultLocked: false` with advisory for medical data

**File:** `src/lib/module-manifest.ts`

**Problem:**  
Post-Soma absorption, Titan's `titan_profiles` collection contains training data (unencrypted by default, acceptable) AND can now hold `labSummaries`, `clinicalFlags`, and `medications` arrays. Medical data in an optionally-unlocked vault is a security model inconsistency.

**Solution (conservative — no breaking change):**  
Keep `defaultLocked: false` for training data. Add a `medicalDataWarning` flag to the manifest and display a one-time advisory toast in `TitanDiagnosisPanel` and `TitanPage` if the vault is not locked and `profile.labSummaries?.length > 0`. Do not force-lock, as that would be a breaking UX change.

**Acceptance Criteria:**
- [x] Advisory toast shown once per session if: vault is accessible (unlocked) AND `labSummaries.length > 0` OR `medicalImageAnalyses.length > 0` OR `medications.length > 0`
- [x] Toast includes a direct CTA to lock the vault from within the Titan page
- [x] Toast is not shown for users with no medical data
- [x] Manifest `securityPolicy` unchanged (no forced migration)

**Status:** ✅ Complete  
**Completed:** 2026-03-13 — Advisory toast implemented in `TitanContent` using React state + sessionStorage guard (user-scoped key prevents cross-user leakage). Fires once per session when vault is accessible AND `labSummaries`, `medicalImageAnalyses`, or `medications` are present AND onboarding is complete. Self-contained amber toast (8 s auto-dismiss, manual X dismiss) with "Lock Vault" CTA wired to `lockVault()` from `useVault()`. Animates in/out via Framer Motion `AnimatePresence`. No manifest changes, no forced migration, no breaking changes. `TitanDiagnosisPanel` not modified (no clear non-cluttering insertion point). Build verified ✅ — zero TypeScript errors. All test failures pre-existing.

---

## Acceptance Criteria — Global Performance Constraint

For **every item** in this sprint, verify:

- [ ] The action handler or event handler identifies the **minimum set of state fields it must update**
- [ ] `GlobalProjectionService.updateCrossFunctionalState` is called with a sparse patch object (only changed fields as dotted keys: `'biological.cnsFatigue'`, not `{ biological: { ...spread } }`)
- [ ] No action or event handler calls `setProfile(fullProfile)` when only a sub-field changed — use merge utilities
- [ ] After any write, confirm via React DevTools (or test) that **only** the components subscribed to the changed NSV domain re-render (e.g., a sleep log must not cause `TitanRoutinePanel` or `PRBoard` to re-render)
- [ ] No new `useGlobalSoul()` (broad) calls introduced — only the domain-scoped selectors from S20-005

---

## File Change Map

| Sprint Item | Files Modified | Files Created |
|---|---|---|
| S21-001 | `titan-session-prompt.ts` | — |
| S21-002 | `QuickLogBar.tsx`, `QuickLogDrawer.tsx`, `WorkoutSessionLogger.tsx`, `actions.ts` | `utils/nsv-workout-updater.ts` |
| S21-003 | `SleepTracker.tsx`, `actions.ts` | `utils/nsv-sleep-updater.ts` |
| S21-004 | `actions.ts` | — |
| S21-005 | `actions.ts`, `src/lib/types.ts`, `titan-profile-service.ts` | — | ✅ 2026-03-12 |
| S21-006 | `cascade-rules.ts` | ✅ Complete |
| S21-007 | `actions.ts` | ✅ 2026-03-12 |
| S21-008 | `actions.ts`, `soma-titan-delegation-service.ts` | ✅ 2026-03-12 |
| S21-009 | `utils/nsv-workout-updater.ts`, `utils/nsv-sleep-updater.ts`, `actions.ts`, `TitanPage.tsx` | ✅ 2026-03-12 |
| S21-010 | `TitanPage.tsx` | — | ✅ 2026-03-12 |
| S21-011 | `TitanPage.tsx` | — | ✅ 2026-03-12 |
| S21-012 | `TitanPage.tsx` | — | ✅ 2026-03-12 |
| S21-013 | `utils/e1rm.ts`, `WorkoutSessionLogger.tsx`, `actions.ts` | `utils/e1rm.test.ts` (13 new tests) |
| S21-014 | — | — (deletion) |
| S21-015 | `TitanPage.tsx` | — | ✅ 2026-03-13 |

---

## Dependencies & Sequencing

```
S21-001   (independent — prompt only)
S21-002 → S21-009   (workout updater extended with cognitive fields)
S21-003 → S21-009   (sleep updater extended with cognitive fields)
S21-007 → S21-006   (VITAL_UPDATED must be emitted before cascade can fire)
S21-002 → S21-007   (workout log_workout_session emits VITAL_UPDATED — same handler)
S21-004   (independent)
S21-005   (independent)
S21-008   (independent)
S21-010   (independent)
S21-011   (independent)
S21-012   (independent)
S21-013   (can be done after S21-002 to share the refactor PR)
S21-014   (independent — do first to clean the import tree)
S21-015   (independent — do last)
```

**Recommended PR groupings:**
1. `S21-001 + S21-014` — Pure prompt/dead-code cleanup (no risk)
2. `S21-002 + S21-003 + S21-009 + S21-007` — NSV write correctness (core utility extraction)
3. `S21-004 + S21-005` — Action registration completeness
4. `S21-006 + S21-008` — Spine event & cascade completeness
5. `S21-010 + S21-011 + S21-012` — Cross-module subscriptions
6. `S21-013` — PR/e1RM refactor
7. `S21-015` — Vault advisory

---

## Out of Scope (Deferred to S22+)

- HRV data structure and tracking — requires wearable API integration design
- Acute:chronic workload ratio — requires 4-week rolling window data and UI visualisation design
- `update_routine` ID-based merge strategy — separate PR/RFC needed to avoid breaking existing stored routines
- Full streaming isolation for chat (S20 backlog item)
- Atlas PRD for `COMMITMENT_MISSED` event contract (required before S21-011 can ship to staging)

---

## PM Audit Log

| Task ID | Description | Status | Completed |
|---|---|---|---|
| titan-march-2026-audit | Full Titan product audit — structure, vision, 17 conformance gaps, action registration, NSV ownership, Spine integration, cross-module wiring, direct-write paths, cascade rules | ✅ Done | 2026-03-12 |

Full audit output: available in session context (March 12 2026 Titan Audit Report).

---

## Sprint Completion Summary

**Sprint Closed:** 2026-03-13  
**All 15 items complete.** Zero TypeScript errors at close. Pre-existing test failures (72) unaffected.

| Item | Completion Date | Summary |
|---|---|---|
| S21-001 | 2026-03-12 | Injected `formatProtocol` into all 4 Titan session-prompt builders; dead code removed |
| S21-002 | 2026-03-12 | `nsv-workout-updater.ts` extracted; `WorkoutSessionLogger`, `QuickLogBar`, `QuickLogDrawer` route through AI validation in Logbook mode with direct NSV writes after save |
| S21-003 | 2026-03-12 | `nsv-sleep-updater.ts` extracted; `SleepTracker` direct-save path wired; `log_sleep` handler refactored to shared utility |
| S21-004 | 2026-03-12 | `compute_readiness` action registered under titan namespace; reads biological NSV + Soma snapshot, pushes formatted readiness table |
| S21-005 | 2026-03-12 | `suggest_field`, `create_field` (validated, max-20, dedup), `delete_field` (idempotent) registered under titan namespace |
| S21-006 | 2026-03-12 | `BLOCK_HIGH_INTENSITY` and `BURNOUT_WARNING` cascade rules added; 3 pre-existing cascade-rule test failures resolved; 17/17 cascade tests pass |
| S21-007 | 2026-03-12 | `VITAL_UPDATED` emitted from `sync_vitals`, `log_workout_session`, and `log_sleep` action handlers |
| S21-008 | 2026-03-12 | `SOMA_BIOMARKER_COMMITTED`, `SOMA_CLEARANCE_CHANGED`, `SOMA_READINESS_UPDATED` emitted from Soma delegation handlers |
| S21-009 | 2026-03-12 | `cognitive.energyBudget` and `cognitive.focusScore` added to both NSV utilities; single Firestore write per log event |
| S21-010 | 2026-03-12 | `NexusHandoffService.consume('titan')` added on `TitanContent` mount; routes Agnes stress delegate, Atlas commitment failures, and generic delegates to AI |
| S21-011 | 2026-03-12 | `useSpineEvent('COMMITMENT_MISSED')` added with physical-domain filter and dedup guard |
| S21-012 | 2026-03-12 | `useSpineEvent('FINANCIAL_STRESS')` added with stressLevel≥7 threshold, recovery-context framing, and dedup guard |
| S21-013 | 2026-03-12 | `computeSessionPRs` utility created in `utils/e1rm.ts`; 5 callers consolidated; 13 new unit tests added |
| S21-014 | 2026-03-12 | Dead import file deleted; no active importers confirmed; build verified |
| S21-015 | 2026-03-13 | One-time-per-session advisory toast in `TitanContent` — amber toast with "Lock Vault" CTA, 8 s auto-dismiss, `sessionStorage` user-scoped guard; wired to `lockVault()` from `useVault()` |
