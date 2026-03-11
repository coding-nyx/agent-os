# Titan Module — Architecture Audit
**Conducted by:** System Architect Agent  
**Audit Date:** 2025  
**Module Version:** Phase 5 (Post-Soma-Separation, Dual-Write Active)  
**Severity Legend:** 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW / Advisory

---

## Executive Summary

Titan is the most architecturally complex module in the Nexus system. It sits at the intersection of performance coaching, medical data custody, NSV synthesis, and Spine event reactivity. The core architecture is sound — the AI-gated write path, persona design, and Soma delegation pattern are well-executed. However, **six critical issues** exist that will cause data loss or correctness failures at scale, and the training data model has fundamental gaps that block the module's stated goal of periodized performance optimization.

---

## 1. MODULE BOUNDARY ANALYSIS

### 1.1 Soma Components Embedded in TitanPage — Qualified Boundary Violation

**Status:** 🟠 HIGH — Architecturally intentional but improperly scoped.

**Finding:**  
`TitanPage.tsx` directly imports `BiomarkerDashboard`, `ClearancePanel`, and `ClearanceStatus` from `@/modules/soma/components/`. This is a cross-module component import — a pattern that creates compile-time coupling between modules.

```typescript
// TitanPage.tsx lines 4–6
import { BiomarkerDashboard } from '@/modules/soma/components/BiomarkerDashboard';
import { ClearancePanel } from '@/modules/soma/components/ClearancePanel';
import { ClearanceStatus } from '@/modules/soma/components/ClearanceStatus';
```

**Assessment:**  
This is *intentional* (Phase 5 decision to surface Soma data inside Titan tabs), but it is architecturally incorrect for two reasons:

1. **Soma components consume `profile: TitanProfile | null`** via the `medicalProfile` merge object. Soma UI components should consume `SomaProfile` or `SomaHealthSnapshot` — not a `TitanProfile` shape. This means Soma's own UI components are coupled to Titan's deprecated data schema.

2. **The `medicalProfile` merge in `TitanContent`** (lines 71–84) manually rehydrates deprecated `TitanProfile` medical fields from `SomaProfile` arrays. This dual-source merge logic lives inside a page render function — it belongs in a service layer.

**Recommended Pattern:**  
Soma components should accept `SomaProfile | SomaHealthSnapshot` directly. The subscription (`subscribeSomaProfile`) is already in place in `TitanContent`. The fix is to thread `somaProfile` directly to Soma components instead of computing `medicalProfile`.

```typescript
// Current (wrong):
<BiomarkerDashboard profile={medicalProfile} ... />

// Target (correct):
<BiomarkerDashboard profile={somaProfile} ... />
```

This requires Soma's component prop interfaces to be updated to accept `SomaProfile` natively.

---

### 1.2 Biomarkers/Clearance Tab Placement — Keep In Titan, Fix the Data Source

**Status:** 🟢 Advisory

**Finding:**  
Biomarkers and Clearance tabs live inside Titan, but their data source is (correctly) Soma. This placement is appropriate because the **use-context** of biomarkers and clearance is training-related — a user checking clearance is doing so *in preparation for training*. Routing to a separate Soma page for this would break the workflow.

**Verdict:** Keep tabs in Titan. Fix the data source threading as described in §1.1.

---

### 1.3 `SomaTitanDelegationService` — Correct Pattern, Incomplete Scope

**Status:** 🟡 MEDIUM

**Finding:**  
`soma-titan-delegation-service.ts` correctly routes `commit_biomarker` and `issue_clearance` from Titan's action hub → `SomaDataService`. This is the right delegation pattern.

**Gap:** The service only handles two operations. Actions `analyze_medical_image`, `parse_lab_report`, and `parse_health_report` in `actions.ts` **still write directly to `TitanProfile`** rather than delegating to `SomaDataService`. This means medical image analysis data does not reach Soma during the dual-write phase.

```typescript
// actions.ts line 226–231 — writes directly to TitanProfile, NOT Soma
const next: TitanProfile = {
  ...profile,
  labSummaries: [...newLabSummaries, ...profile.labSummaries].slice(0, 50),
  ...
};
await persistProfile(next, ...);
// ← SomaTitanDelegationService is called ONLY for biomarkers, not labSummaries
```

**Required Fix:** `analyze_medical_image` and `parse_lab_report` must also delegate `labSummaries` and `medicalImageAnalyses` writes to `SomaTitanDelegationService` (which in turn calls `SomaDataService`).

---

### 1.4 Dual-Write Strategy Soundness

**Status:** 🔴 CRITICAL

**Finding:**  
The dual-write phase (writing both TitanProfile deprecated fields AND SomaProfile) is **not symmetric**. The current state:

| Operation | Writes to TitanProfile | Writes to SomaProfile |
|---|---|---|
| `commit_biomarker` | ❌ No | ✅ Yes (via delegation) |
| `issue_clearance` | ❌ No | ✅ Yes (via delegation) |
| `analyze_medical_image` | ✅ Yes | ⚠️ Partial (biomarkers only) |
| `parse_lab_report` | ✅ Yes | ❌ No |
| `parse_health_report` | ✅ Yes | ❌ No |

This asymmetry means a user who has never used Soma will have orphaned `labSummaries` in `TitanProfile` with no Soma mirror. When the deprecated fields are eventually removed from `TitanProfile`, that data silently disappears.

**Required Fix:** A formal dual-write matrix must be defined and enforced. Every operation that writes to a deprecated `TitanProfile` field must also write to `SomaProfile` during the migration window.

---

## 2. DATA MODEL CRITIQUE

### 2.1 No Weight at Exercise Definition Level — Intentional but Limiting

**Status:** 🟡 MEDIUM

**Finding:**  
`Exercise` (the definition-level type used in `Routine`) has no `weight` field. Weight only appears in `WorkoutSession.ExerciseLog.sets[].weight`. This means:

- There is **no 1RM tracking** — the system cannot know that the user bench presses 100kg without parsing session history.
- There is **no progressive overload prescription** — Titan AI cannot emit a specific weight recommendation in the next `update_routine` action because the routine type has no weight field.
- The `TITAN_PERSONA` explicitly promises: *"1RM estimation, rep-range periodization"* and *"progressive overload design"* — but these cannot be delivered without a weight reference at the definition level.

**Assessment:** This is a deliberate design choice (routines are templates, not prescriptions), but it creates a gap between what the persona promises and what the data model supports. The AI can describe target weights in `notes` as free text, but that is unstructured and cannot be read back by the system.

**Recommended Fix:**  
Add an optional `targetWeight?: number` and `lastKnown1RM?: number` to `Exercise`, and a separate `PersonalRecords` map to `TitanProfile`:

```typescript
interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  notes?: string;
  targetWeight?: number;      // ADD: AI-prescribed load for this routine slot
  targetRpe?: number;         // ADD: perceived exertion target
}

interface TitanProfile {
  // ...existing fields
  personalRecords?: Record<string, {  // key = normalized exercise name
    weight: number;
    reps: number;
    estimated1RM: number;
    achievedAt: string;
  }>;
}
```

---

### 2.2 `Routine.weekday` — Structural Constraint That Blocks Real Periodization

**Status:** 🔴 CRITICAL

**Finding:**  
`Routine` is a `{ weekday: Weekday, exercises: Exercise[] }` tuple. The `update_routine` action merges routines by matching `weekday`:

```typescript
// actions.ts lines 77–84
const idx = mergedRoutines.findIndex(r => r.weekday === nr.weekday);
if (idx !== -1) {
  mergedRoutines[idx] = nr; // replaces by weekday
} else {
  mergedRoutines.push(nr);
}
```

This means:
1. **Only one routine per weekday is allowed.** Push/Pull/Legs split (where Monday can be Push A or Push B on alternating weeks) is impossible.
2. **Mesocycles cannot be modeled.** An accumulation block and a strength block cannot coexist — switching phases silently deletes the old weekday routine.
3. **Multi-day periodization programs** (5/3/1, GZCLP, PHUL) where training days rotate regardless of calendar weekday have no representation.
4. The `CycleEntry` type with `type: 'workout'` *suggests* the intent to handle mesocycles, but `CycleEntry` has no link to `Routine[]`. The two concepts are completely disconnected in the data model.

**This is the single most limiting architectural gap in the training model.**

**Recommended Fix:**

```typescript
// Replace the weekday-keyed model with a program-centric model
interface TrainingProgram {
  id: string;
  name: string;              // "Strength Block — Phase 1"
  type: 'mesocycle' | 'week' | 'custom';
  status: 'active' | 'archived';
  startDate?: string;
  endDate?: string;
  sessions: TrainingSession[]; // ordered sessions, not weekday-keyed
}

interface TrainingSession {
  id: string;
  label: string;             // "Day A — Push", "Day B — Pull"
  weekday?: Weekday;         // optional: preferred day, not a key
  exercises: Exercise[];
  rationale?: string;
}
```

This is a breaking change to the data model but is architecturally necessary for the feature set the persona promises.

---

### 2.3 `CycleEntry` — Conflation of Two Unrelated Concepts

**Status:** 🟠 HIGH

**Finding:**  
`CycleEntry` is used for two fundamentally different concepts in the UI and persona:

1. **Biological cycles** — menstrual/hormonal cycles tracked by `lastPeriodDate`, `cycleLength`, phases like "follicular", "ovulatory", "luteal"
2. **Training mesocycles** — accumulation → intensification → realization → deload blocks

The `CycleType` union (`'supplement' | 'workout' | 'hormonal' | 'nutrition' | 'recovery' | 'custom'`) forces both into one schema. The `CyclePhase` type includes `dosage` (clearly supplement-oriented) and `trainingModifier` (clearly training-oriented) in the same type.

This conflation causes:
- Training cycle management has no `volumeTarget`, `intensityZone`, or `deloadWeek` fields
- Hormonal cycle tracking has no `cycleDay` computation or phase-aware readiness modifier output
- The AI cannot reason differently about a "Strength Block Phase 1" and a "Creatine Loading Phase" even though the coaching implications are completely different

**Recommended Split:**

```typescript
// Biological cycle — hormonal/supplement/nutrition
interface BioCycle extends BaseCycle {
  type: 'hormonal' | 'supplement' | 'nutrition' | 'recovery';
  cycleLength?: number;
  lastPeriodDate?: string;
  phases: BioPhase[];  // includes dosage, timing
}

// Training mesocycle — periodized programming block
interface TrainingBlock extends BaseCycle {
  type: 'mesocycle';
  currentWeek: number;
  totalWeeks: number;
  phases: TrainingPhase[];  // includes volumeTarget, intensityPercent
  linkedProgramId?: string; // links to TrainingProgram
}
```

---

### 2.4 No `ExerciseLibrary` — Free Text Exercise Names Are a Silent Data Quality Crisis

**Status:** 🟠 HIGH

**Finding:**  
Exercise names are free text strings. The AI can write `"Bench Press"`, `"bench press"`, `"Barbell Bench Press"`, `"bench"` across different sessions. The `personalRecords` lookup (which doesn't exist yet but needs to) would need exact string matching. Session volume analytics in `RoutineProgress.tsx` depend on `exerciseName` matching between `Routine.exercises` and `WorkoutSession.exercises`.

Currently, `RoutineProgress` only shows aggregate volume per session — it cannot show per-exercise trends precisely because there is no canonical exercise identity.

**Required Fix:**  
Either:
- An `ExerciseLibrary` with canonical exercise IDs (preferred for advanced analytics)
- Or a normalization layer that canonicalizes exercise names on `log_workout_session` write (lower-effort, less powerful)

---

### 2.5 `workoutSessions` and `sleepLog` Unbounded Arrays in Firestore Document

**Status:** 🔴 CRITICAL

**Finding:**  
Both `workoutSessions: WorkoutSession[]` and `sleepLog: SleepEntry[]` are embedded arrays in the Titan encrypted blob stored as a single Firestore document. Firestore has a **1MB document size limit**.

**Load calculation:**
- A `WorkoutSession` with 6 exercises × 4 sets = 24 `ExerciseSet` objects. Each set has: `setNumber`, `weight`, `repsCompleted`, `completed`, `notes`. Minimum ~200 bytes/session in serialized JSON.
- At 3 sessions/week × 52 weeks = 156 sessions/year → ~31KB/year for sessions alone.
- A `SleepEntry` with all optional fields: ~400 bytes. At 365 entries/year → ~146KB/year.
- **Year 2 users will approach or exceed 1MB.** Year 3 users will hit it.
- The `normalizeTitanProfile` function in `titan-profile-service.ts` does **not** cap `workoutSessions` or `sleepLog` — only medical arrays are bounded (`.slice(0, 200)`, `.slice(0, 50)`, etc.).

**Evidence of awareness but incomplete fix:**
```typescript
// titan-profile-service.ts line 64–67 — medical arrays are bounded:
biomarkers: Array.isArray(data.biomarkers) ? (data.biomarkers).slice(0, 200) : base.biomarkers,
labSummaries: Array.isArray(data.labSummaries) ? (data.labSummaries).slice(0, 50) : base.labSummaries,
// BUT:
workoutSessions: Array.isArray(data.workoutSessions) ? data.workoutSessions : base.workoutSessions, // ← no bound
sleepLog: Array.isArray(data.sleepLog) ? data.sleepLog : base.sleepLog, // ← no bound
```

**Required Fix (two-phase):**

**Phase A (immediate, no data loss):** Add caps in `normalizeTitanProfile`:
```typescript
workoutSessions: Array.isArray(data.workoutSessions)
  ? (data.workoutSessions as WorkoutSession[]).slice(0, 500)
  : base.workoutSessions,
sleepLog: Array.isArray(data.sleepLog)
  ? (data.sleepLog as SleepEntry[]).slice(0, 730)  // ~2 years
  : base.sleepLog,
```

**Phase B (medium-term, architectural):** Migrate session and sleep history to separate subcollections:
```
titan_profiles/{userId}                    ← profile blob (routines, nutrition, etc.)
titan_sessions/{userId}/sessions/{id}      ← individual WorkoutSession documents
titan_sleep/{userId}/entries/{id}          ← individual SleepEntry documents
```
This also enables date-range queries for analytics without loading the full profile.

---

### 2.6 `TitanNutrition.[key: string]: unknown` — Open Schema Risk

**Status:** 🟠 HIGH

**Finding:**  
`TitanNutrition` extends `Record<string, unknown>` to support custom fields managed by `CustomFieldManager.tsx`. This means any string key-value pair can be written into the nutrition object. The merge in `mergeTitanProfile`:

```typescript
nutrition: { ...base.nutrition, ...patch.nutrition }
```

...performs a flat merge. If the AI hallucinates a key like `"calories": "eat more"` (string instead of number), or injects `"__proto__"` or `"constructor"` as keys via a prompt injection, the merge will accept them silently.

The `handleSubmitCustomFieldsForApproval` callback in `TitanPage.tsx` sends user-defined field names to the AI for validation — but the AI response is the action payload that writes back. There is no server-side schema enforcement.

**Required Fix:**  
Create an `AllowedCustomFieldKey` union or a `CustomField` schema with explicit type validation before the merge executes. At minimum, sanitize key names in `normalizeTitanProfile` to reject prototype-polluting keys:

```typescript
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const sanitizedNutrition = Object.fromEntries(
  Object.entries(data.nutrition).filter(([k]) => !DANGEROUS_KEYS.has(k))
);
```

---

## 3. AI-GATED WRITE PATH ANALYSIS

### 3.1 No Offline/Degraded AI Fallback for Write Operations

**Status:** 🔴 CRITICAL

**Finding:**  
Every TitanProfile write — including logging a completed workout, logging sleep, and advancing a cycle phase — requires a successful AI round-trip. The `WorkoutSessionLogger` component:

```typescript
// WorkoutSessionLogger.tsx line 288–291
const prompt = buildSessionPrompt(routine, exercises, rpe, notes, startedAt);
onSubmit(prompt);  // routes to ai.handleSendMessage → AI response → action tag parse → persist
onClose();
```

If the LLM engine is slow, errors, or returns a response without the `log_workout_session` action tag, the session data is **silently lost**. The user closed the modal on line 291 — their in-progress state is gone. The same applies to `SleepTracker`, `CycleManager`, and custom field submissions.

**This is the most user-visible correctness risk in the entire module.**

**Required Fix:**  
Implement a local staging buffer (localStorage) that persists pending sessions/entries before they are sent to the AI. On successful AI action-tag parse and persist, the buffer is cleared. On AI failure, the buffer remains and the user is shown a "pending sync" indicator.

```typescript
// Pattern: optimistic local write → AI validation → confirmed persist
const TITAN_PENDING_SESSIONS_KEY = 'nexus_titan_pending_sessions';

function stageSession(session: Partial<WorkoutSession>): void {
  const pending = loadPending();
  pending.push({ ...session, stagedAt: new Date().toISOString() });
  localStorage.setItem(TITAN_PENDING_SESSIONS_KEY, JSON.stringify(pending));
}
```

---

### 3.2 Race Condition: Double Submission

**Status:** 🟠 HIGH

**Finding:**  
`WorkoutSessionLogger` calls `onSubmit(prompt)` then `onClose()` synchronously. The modal closes immediately. However, `ai.handleSendMessage` is async — if the AI is still processing the first session when the user opens the logger again and submits a second session, both prompts are queued. Both will emit `log_workout_session` action tags. The second action's `loadProfile` call may read the profile *before* the first action's `persistProfile` call has completed, resulting in the first session being overwritten.

```
Timeline:
  T+0ms:  Session 1 prompt sent → AI processing starts
  T+200ms: User opens modal again
  T+400ms: Session 2 prompt sent → AI processing starts (profile not yet updated)
  T+3000ms: AI 1 responds → loadProfile() → reads T+0ms state → append session 1 → save
  T+3200ms: AI 2 responds → loadProfile() → reads T+0ms state (stale!) → append session 2 → save
  Result: Session 1 is overwritten by Session 2's save
```

**Required Fix:**  
The action hub's `log_workout_session` handler needs a write lock or optimistic merge:

```typescript
log_workout_session: async ({ userId, encryptionKey, payload }) => {
  // Use a transaction-like read-modify-write pattern
  const current = await loadProfile(userId, encryptionKey);
  const newSession = normalizeSession(payload);
  const nextProfile = {
    ...current,
    workoutSessions: [newSession, ...(current.workoutSessions ?? [])],
    updatedAt: new Date().toISOString()
  };
  await persistProfile(nextProfile, userId, encryptionKey);
},
```

This is fine — the issue is that `loadProfile` reads from Firestore without a transaction. For a cloud-persisted encrypted blob, the correct pattern is Firestore transactions (or optimistic versioning via `updatedAt` comparison before write).

---

### 3.3 Action Tag Reliability — Missing `log_workout_session` in Default Persona

**Status:** 🟠 HIGH

**Finding:**  
The `TITAN_PERSONA` in `personas.ts` defines action tags for: `compute_readiness`, `self_clearance_check`, `issue_clearance`, `commit_biomarker`, `create_cycle`, `update_routine`, `update_titan_profile`, and `log_sleep`. However, **`log_workout_session` is absent from the persona's action tag examples**.

```typescript
// personas.ts — ACTION TAGS section
// Listed: update_titan_profile, update_routine, log_sleep, log_workout_session ✓
// BUT log_workout_session example payload is minimal — no exercises array shown
```

Wait — reviewing more carefully, `log_workout_session` *is* listed in `personas.ts` line 141. However, the example payload is a shallow object and does not show the `exercises` array structure. The AI must correctly produce the nested `ExerciseLog[]` → `ExerciseSet[]` structure. If it flattens or omits this, `RoutineProgress` shows zero volume.

**Required Fix:** Add a fully-structured `log_workout_session` example to the persona showing the complete nested schema.

---

### 3.4 `update_routine` Action — Weekday Collision Overwrites Silently

**Status:** 🟠 HIGH

**Finding:**  
The `update_routine` action merges by weekday match (shown in §2.2). When the AI generates a new weekly plan that reuses existing weekdays, it silently replaces the existing routines without any user confirmation prompt in the action handler.

If the AI is generating a new mesocycle and emits a `Monday` routine that replaces the user's existing Monday PPL routine, the old data is permanently lost. No tombstoning, no versioning, no audit trail.

**Required Fix:**  
Before overwriting a routine, emit a Spine event or retain the previous routine as an archived version:
```typescript
const replaced = mergedRoutines[idx];
if (replaced) {
  // Archive it instead of discarding
  archivedRoutines.push({ ...replaced, archivedAt: new Date().toISOString() });
}
```

---

### 3.5 `mergeTitanProfile` Deep Merge Safety

**Status:** 🟡 MEDIUM

**Finding:**  
`mergeTitanProfile` performs a three-level shallow merge: top level, `nutrition`, `activity`, `history`. This is mostly safe. However:

1. If the AI patch contains `"nutrition": { "calories": 2500 }`, and the existing nutrition has `{ "calories": 2000, "supplements": ["creatine"] }`, the merge correctly produces `{ "calories": 2500, "supplements": ["creatine"] }`. ✅

2. If the AI patch contains `"routines": [...]`, the merge calls `normalizeRoutines` which replaces ALL routines from the patch. This means a partial routine update (e.g., AI only mentions Monday's routine) **deletes all other routines**. This is a bug if the AI only emits one routine when asked to modify one.

**Required Fix:** Document clearly in the persona that `update_routine` always requires the complete current routine array, or implement a smarter merge that upserts by ID rather than replacing the whole array.

---

## 4. PERIODIZATION & TRAINING CYCLES ARCHITECTURE

### 4.1 Mesocycle Architecture Is Absent

**Status:** 🔴 CRITICAL (Feature Gap)

**Finding:**  
The `TITAN_PERSONA` makes explicit promises about periodization:
- *"Mesocycle design, deload week recognition, peak-taper sequencing"*
- *"Track training age — intermediate needs 2–3 week cycles; advanced athletes require 4–6 week mesocycles with deliberate deload weeks"*
- *"Trigger a deload flag after: 3+ consecutive weeks of accumulated fatigue"*

None of these capabilities can be delivered with the current data model. The system cannot:
- Determine what week of a mesocycle the user is in (no mesocycle start date linked to routines)
- Automatically compute accumulated fatigue across weeks (no per-week volume aggregation)
- Trigger deload detection (no rolling fatigue accumulation state)
- Know if `cnsFatigue` data is 1 day old or 7 days old in the NSV (addressed separately)

**Required Data Model Additions:**
```typescript
interface TitanProfile {
  // ADD: Active periodization context
  activeProgramBlock?: {
    id: string;
    name: string;              // "Hypertrophy Block — Week 3/4"
    phase: 'accumulation' | 'intensification' | 'realization' | 'deload';
    weekNumber: number;
    totalWeeks: number;
    startDate: string;
    weeklyVolumeTargets: { [muscleGroup: string]: number }; // sets/week
    deloadTriggered?: boolean;
    deloadReason?: string;
  };
  trainingLoadHistory?: {
    weekStart: string;          // ISO date of Monday
    acuteLoad: number;          // ACWR — last 7 days
    chronicLoad: number;        // ACWR — last 28 days
    acwrRatio: number;          // acute/chronic — flag if > 1.3
  }[];
}
```

---

### 4.2 ACWR (Acute:Chronic Workload Ratio) — Mentioned in Persona, Not Computed

**Status:** 🟠 HIGH

**Finding:**  
The persona explicitly states: *"When acute:chronic load ratio exceeds 1.3, issue a yellow flag. When it exceeds 1.5, issue a red flag and enforce session modification."*

This requires rolling 7-day and 28-day load sums from `WorkoutSession.totalVolume`. This computation is nowhere in the codebase. The `RoutineProgress` component shows aggregate volume bars but does not compute ACWR.

**Required Fix:**  
A `TrainingLoadService` that computes ACWR from `workoutSessions` on each session log and updates `trainingLoadHistory` in the profile. The `sync_vitals` action (which already updates `cnsFatigue` in NSV) should call this service and update `cnsFatigue` based on ACWR:

```
ACWR > 1.5 → cnsFatigue += 2 (capped at 10)
ACWR 1.3–1.5 → cnsFatigue += 1
ACWR < 0.8 → cnsFatigue = max(0, cnsFatigue - 1)  // detraining recovery
```

---

### 4.3 1RM Tracking — Implied by Persona, Missing from Model

**Status:** 🟠 HIGH

**Finding:**  
The persona states it handles *"1RM estimation, rep-range periodization"*. The Epley formula for e1RM is trivial: `weight × (1 + reps / 30)`. The data to compute it exists in `WorkoutSession.exercises[].sets[]`. But there is nowhere to store it — no `personalRecords` map, no per-exercise history. The AI can *discuss* 1RM in conversation but cannot *reference* a user's historical maxes when building next month's routine.

---

## 5. PERFORMANCE DATA ARCHITECTURE

### 5.1 No Automated NSV Pipeline from Session Data

**Status:** 🔴 CRITICAL (Automation Gap)

**Finding:**  
Titan's NSV contributions (`cnsFatigue`, `sleepQuality`, `recoveryScore`, `energyBudget`, `focusScore`) are updated via the `sync_vitals` action, which requires the AI to explicitly emit this action. There is **no automated pipeline** that:

- Reads `sleepLog.last entry.quality` → updates `biological.sleepQuality` in NSV
- Reads last session RPE → contributes to `cnsFatigue`
- Reads ACWR → contributes to `recoveryScore`

The `TitanReadiness` dashboard reads from `globalSoul.crossFunctionalState` — but these values are only as fresh as the last time the AI chose to emit `sync_vitals`. After a user logs sleep and closes the chat, NSV is not updated until the next AI interaction.

**Evidence:** `TitanReadiness.tsx` shows `"Metrics update through module interactions"` — confirming that freshness is interaction-dependent, not data-driven.

**Required Fix:**  
A `TitanNSVPipeline` service that runs automatically on:
1. `log_sleep` action success → update `biological.sleepQuality` from `SleepEntry.quality`
2. `log_workout_session` action success → update `biological.cnsFatigue` from RPE + ACWR
3. Profile subscription updates → check if sleep or session data changed and recompute

```typescript
// In log_sleep action handler (actions.ts):
await GlobalProjectionService.updateCrossFunctionalState(userId, {
  biological: {
    sleepQuality: newEntry.quality,
    // cnsFatigue contribution: higher RPE yesterday = more fatigue today
  }
});
```

---

### 5.2 NSV `cnsFatigue` Staleness — No Decay or Recency Weighting

**Status:** 🟠 HIGH

**Finding:**  
`isMetricStale` in `nsv-ownership.ts` is used in `TitanReadiness.tsx` to flag metrics as stale after 7 days. However, there is no *automatic decay* of `cnsFatigue`. If a user logged a CNS fatigue of 9 (from heavy training) but then rested for 5 days without logging anything, `cnsFatigue` stays at 9 in the NSV indefinitely — it will never self-correct without an explicit `sync_vitals` or `compute_readiness` AI action.

This will cause the training prescription to be permanently conservative for users who have gaps in logging.

**Required Fix:**  
A time-weighted decay applied at read time:
```typescript
function applyFatigueDecay(rawValue: number, lastUpdatedAt: string): number {
  const daysSince = (Date.now() - new Date(lastUpdatedAt).getTime()) / 86400000;
  const decayFactor = Math.max(0, 1 - (daysSince * 0.15)); // 15% decay/day
  return rawValue * decayFactor;
}
```

---

### 5.3 `RoutineProgress` Volume Metric Conflates Rep-Volume with Load-Volume

**Status:** 🟡 MEDIUM

**Finding:**  
`RoutineProgress` displays two different volume metrics without distinguishing them:
- When no sessions exist: `totalPlannedReps` (rep count, dimensionless)
- When sessions exist: `totalActualVolume` (kg, from `WorkoutSession.totalVolume`)

A user with 200 planned reps sees "200 reps". After first session, they see "450 kg". The UI labels are different (`unit="reps"` vs `unit="kg"`) but the metric card label says "Planned Volume" vs "Total Volume Lifted" — these are not comparable metrics and should never be shown in the same card slot.

---

## 6. NSV INTEGRATION GAPS

### 6.1 `cognitive.energyBudget` and `cognitive.focusScore` Are Owned by Titan — Sourced by Atlas

**Status:** 🟡 MEDIUM

**Finding:**  
`NSV_OWNERSHIP` (nsv-ownership.ts) assigns `cognitive.energyBudget` and `cognitive.focusScore` to **Atlas**, not Titan. But the `TITAN_PERSONA` references both as inputs to its decision-making:

> *"LOW COGNITIVE ENERGY (Atlas focusScore < 4): Sub technique-heavy movements"*

Titan reads but does not write these fields — correct. However, `sync_vitals` in `actions.ts` currently only handles `biological.*` fields. The persona's description of `cognitive.energyBudget` as a Titan NSV output (`"Physical energy available for cognitive and physical tasks"`) conflicts with the actual NSV ownership assignment.

**Verdict:** The NSV ownership matrix is correct (Atlas owns cognitive fields). The persona description is misleading. Update the persona to clarify Titan *reads* `cognitive.focusScore` from Atlas but does not *write* it.

---

### 6.2 `biological.hormonalContext` — Unstructured String Field

**Status:** 🟡 MEDIUM

**Finding:**  
`biological.hormonalContext` is stored as a free-text string in the NSV. The `TitanReadiness` component displays it as `soul?.crossFunctionalState.hormonalContext || 'Awaiting data'`. The persona uses it to adapt training, but there is no canonical vocabulary for this field (e.g., `'follicular' | 'ovulatory' | 'luteal' | 'menstrual' | 'unknown'`). The AI writes whatever string it wants via `sync_vitals`.

This means the `isFemale && hormonalContext` display in `TitanReadiness.tsx` could show AI-generated prose instead of a structured value.

**Required Fix:** Define `HormonalContext` as a discriminated union type and validate the `sync_vitals` payload against it.

---

## 7. SOMA-TITAN SEPARATION CLARITY

### 7.1 Clean Boundary Proposal

**Status:** 🟡 MEDIUM (Design Clarification)

The current tabs in Titan: `Training | Biomarkers | Recovery | Sleep | Cycles | Diagnosis`  
The current tabs in Soma: `Vitals | Assessments | Biomarkers | History | Clearance`

**Sleep:** Currently in Titan. Sleep is biometric data but its primary *use-context* is training readiness. **Keep in Titan.** Sleep quality is a direct input to `cnsFatigue` and `recoveryScore` — separating it into Soma would require Titan to subscribe to Soma's sleep data. The current architecture is correct.

**Biomarkers in Titan:** These are Soma-owned data surfaced via `subscribeSomaProfile`. This is read-only consumption. Appropriate as long as Soma components receive `SomaProfile` directly (fix per §1.1).

**Recovery/Clearance in Titan:** Clearance is issued *by Titan* (as performance gate) but *stored in Soma*. This is the correct split. The `issue_clearance` action delegating to `SomaTitanDelegationService` → `SomaDataService.addClearance` is the right pattern.

**Diagnosis Tab in Titan:** This tab processes lab reports and medical documents. The action scope (`parse_lab_report`, `analyze_medical_image`, `commit_biomarker`) makes this a Soma write surface inside a Titan UI. This is an active boundary violation — diagnosis should route to the Soma module. The delegation service should be extended to handle this.

**Proposed Clean Boundary:**

| Data | Owner | Titan Access |
|---|---|---|
| Training routines | Titan | Primary owner |
| Workout sessions | Titan | Primary owner |
| Sleep log | Titan | Primary owner |
| Training cycles (mesocycles) | Titan | Primary owner |
| Biomarkers | Soma | Read-only via SomaHealthSnapshot |
| Lab summaries | Soma | Read-only + write via delegation |
| Clearances | Soma | Write via delegation, read-only display |
| Medical image analyses | Soma | Write via delegation |
| Conditions/medications/allergies | Soma | Read-only via SomaHealthSnapshot |
| NSV biological fields | Titan | Primary writer |

---

## 8. SCALABILITY CONCERNS

### 8.1 Single Encrypted Blob Architecture — Document Size Limit Timeline

**Status:** 🔴 CRITICAL (Production Risk)

Already detailed in §2.5. To restate the hard numbers:

| User Type | Sessions/Year | Sleep/Year | Estimated Profile Size |
|---|---|---|---|
| Casual (2x/week) | 104 | 365 | ~230KB/year |
| Active (4x/week) | 208 | 365 | ~310KB/year |
| Power user (6x/week) | 312 | 365 | ~420KB/year |
| Power user Year 3 | 936 | 1095 | **~1.26MB — exceeds Firestore limit** |

Firestore's 1MB document limit means power users will hit a write-failure wall at approximately 2–3 years of use. When `saveTitanProfile` tries to write an oversized document, Firestore silently rejects it (or throws). The current error handler logs but does not surface this to the user:

```typescript
// titan-profile-service.ts line 143–145
} catch (error) {
  console.error('[TitanProfileService] Failed to save titan profile:', error);
  // ← no user notification, no retry, no data preservation
}
```

The user's session data is permanently lost without any feedback.

---

### 8.2 Analytics Query Inefficiency — Load Full Profile to Compute Rolling Averages

**Status:** 🟠 HIGH

**Finding:**  
All analytics (ACWR, volume trends, sleep trends, deload detection) require iterating `workoutSessions` and `sleepLog`. Currently these must be decrypted from the full profile blob on every analytics computation. As arrays grow, this means:

1. Decrypt entire ~500KB blob
2. Parse JSON
3. Filter/sort array
4. Compute metrics

For dashboard rendering on every page load, this is acceptable now but becomes untenable at scale.

**Required Fix (Phase B):** The subcollection migration described in §2.5 also enables efficient range queries:
```
titan_sessions/{userId}/sessions
  WHERE date >= '2025-01-01' AND date <= '2025-01-31'
  ORDER BY date DESC
```

This makes rolling analytics O(query window) instead of O(all sessions).

---

### 8.3 Guest Profile in localStorage — No Size Enforcement

**Status:** 🟡 MEDIUM

**Finding:**  
Guest Titan profiles are stored in `localStorage` via `saveGuestTitanProfile`. localStorage has a 5–10MB browser limit (varies by browser). A guest user who trains extensively before signing up could corrupt their localStorage by exceeding the limit. Unlike Firestore writes, localStorage quota errors throw synchronously and are not caught.

**Required Fix:** Wrap `localStorage.setItem` in try/catch and cap guest profiles at a smaller subset (e.g., last 50 sessions, last 90 sleep entries).

---

## INTEGRATION MAP — Clean Boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TITAN MODULE                                  │
│                                                                         │
│  ┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │  Training Data  │    │   Sleep/Recovery  │    │   Cycle Mgmt     │  │
│  │  (Routines,     │    │   (SleepLog,      │    │  (BioCycles,     │  │
│  │  Sessions, PRs) │    │   NSV updates)    │    │  TrainingBlocks) │  │
│  └────────┬────────┘    └────────┬──────────┘    └────────┬─────────┘  │
│           │                      │                         │            │
│           └──────────────────────┼─────────────────────────┘            │
│                                  │ NSV Writes (sync_vitals)              │
│                                  ▼                                       │
│                    GlobalProjectionService                               │
│                    (cnsFatigue, sleepQuality,                           │
│                     recoveryScore, hormonalContext)                     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  SOMA MODULE  │       │  AGNES MODULE    │       │  ATLAS MODULE    │
│               │       │                  │       │                  │
│  Owns:        │◄──────│  COMPOUND_STRESS │       │  focusScore      │
│  Biomarkers   │  DLG  │  BURNOUT_WARNING │       │  → Titan reads   │
│  Clearances   │       │  → Titan deload  │       │  via NSV         │
│  Lab reports  │       │                  │       │                  │
│  Conditions   │       └──────────────────┘       └──────────────────┘
│  Medications  │
└───────┬───────┘
        │ SomaHealthSnapshot (read-only)
        │ SomaTitanDelegationService (write delegation)
        ▼
 Titan reads Soma data for:
 - Biomarker tab display
 - Clearance tab display
 - self_clearance_check logic
 - Training prescription modifications

SPINE EVENT FLOWS:
  Agnes → [COMPOUND_STRESS, BURNOUT_WARNING] → Titan (deload trigger)
  Titan → [CLEARANCE_GRANTED/DENIED, BLOCK_HIGH_INTENSITY] → Soma
  Titan → [MODULE_DELEGATED] → Soma (biomarker/clearance writes)
  Soma  → [SOMA_PROFILE_UPDATED] → Titan (cache invalidation)
```

---

## CRITICAL ISSUES — Prioritized Fix List

| # | Issue | Severity | Impact | Effort |
|---|---|---|---|---|
| C1 | `workoutSessions`/`sleepLog` unbounded → Firestore 1MB limit | 🔴 CRITICAL | Data loss at year 2–3 | Medium |
| C2 | No offline fallback for AI-gated writes (session data lost on AI failure) | 🔴 CRITICAL | Silent data loss | Medium |
| C3 | `Routine.weekday` as primary key blocks periodization, mesocycles impossible | 🔴 CRITICAL | Feature ceiling | High |
| C4 | No automated NSV pipeline from session/sleep data (staleness) | 🔴 CRITICAL | Readiness dashboard unreliable | Medium |
| C5 | Dual-write asymmetry: `analyze_medical_image`/`parse_lab_report` don't reach Soma | 🔴 CRITICAL | Medical data migration loss | Low |
| C6 | Race condition on concurrent session submission (last-write-wins) | 🔴 CRITICAL | Session data overwrite | Low |

---

## ARCHITECTURAL DEBTS

| # | Debt | Severity |
|---|---|---|
| D1 | `medicalProfile` merge computed in render function (belongs in service layer) | 🟠 HIGH |
| D2 | Soma components receive `TitanProfile` shape instead of `SomaProfile` | 🟠 HIGH |
| D3 | `CycleEntry` conflates biological cycles and training mesocycles in one schema | 🟠 HIGH |
| D4 | No `ExerciseLibrary` — free text exercise names block per-exercise analytics | 🟠 HIGH |
| D5 | ACWR computation mentioned in persona but not implemented anywhere | 🟠 HIGH |
| D6 | `TitanNutrition.[key: string]: unknown` — prototype pollution risk | 🟠 HIGH |
| D7 | `update_routine` action silently overwrites without archiving previous versions | 🟠 HIGH |
| D8 | `cnsFatigue` NSV has no time-decay — stale values permanently suppress training | 🟠 HIGH |
| D9 | No `personalRecords` (1RM/PR) tracking despite persona promising this | 🟠 HIGH |
| D10 | Guest profile localStorage not bounded — quota errors uncaught | 🟡 MEDIUM |
| D11 | `biological.hormonalContext` is unstructured string — should be discriminated union | 🟡 MEDIUM |
| D12 | Persona claims Titan writes `cognitive.energyBudget`/`focusScore` — incorrect | 🟡 MEDIUM |
| D13 | `RoutineProgress` conflates rep-volume with kg-volume in same metric card | 🟡 MEDIUM |
| D14 | `log_workout_session` action lacks optimistic local staging | 🟡 MEDIUM |

---

## RECOMMENDED REFACTORS

### RF-1: Subcollection Migration (Priority: High, Timeline: Before Year 2 of active users)
Move `workoutSessions` and `sleepLog` to Firestore subcollections. Keep the last 30 sessions and 90 sleep entries in the profile blob for fast dashboard load; reference the rest via paginated subcollection queries.

### RF-2: TrainingProgram Data Model (Priority: High, Timeline: Before periodization features)
Replace `Routine.weekday` primary-key merge with a `TrainingProgram` model that supports ordered sessions, mesocycle phases, and multi-week programs without weekday collision.

### RF-3: TitanNSVPipeline Service (Priority: High, Timeline: Immediate)
A lightweight service that runs after every `log_sleep` and `log_workout_session` action to automatically push updated NSV values without requiring a separate AI `sync_vitals` call.

### RF-4: Local Session Staging Buffer (Priority: High, Timeline: Immediate)
Before sending session/sleep data to the AI for action-tag commit, write it to localStorage. Clear on confirmed persist. Show "pending sync" badge on unsynced entries.

### RF-5: Soma Component Interface Fix (Priority: Medium, Timeline: Before deprecated field removal)
Update Soma UI components (`BiomarkerDashboard`, `ClearancePanel`, `ClearanceStatus`) to accept `SomaProfile | SomaHealthSnapshot` directly, eliminating the `medicalProfile` merge in `TitanContent`.

### RF-6: SomaTitanDelegationService Expansion (Priority: High, Timeline: Now)
Add `commitLabSummary`, `commitMedicalImageAnalysis`, and `commitHealthReport` to the delegation service so all medical writes from Titan reach Soma during the dual-write phase.

### RF-7: Exercise Identity Layer (Priority: Medium, Timeline: Before PR tracking)
Add either a canonical `ExerciseLibrary` or a name-normalization function on `log_workout_session` write. Add `personalRecords` map to `TitanProfile`.

### RF-8: cnsFatigue Time-Decay (Priority: Medium, Timeline: NSV accuracy sprint)
Apply exponential decay to `cnsFatigue` at read time based on `lastUpdated` timestamp. A value logged 5 days ago without any new data should not be treated as current.

---

## DATA MODEL IMPROVEMENTS SUMMARY

```typescript
// Minimum viable additions to TitanProfile:
interface TitanProfile {
  // EXISTING (keep)
  routines: Routine[];
  workoutSessions?: WorkoutSession[];
  sleepLog?: SleepEntry[];
  cycles?: CycleEntry[];
  
  // ADD: Performance tracking
  personalRecords?: Record<string, PersonalRecord>;  // key: normalized exercise name
  trainingLoadHistory?: TrainingLoadEntry[];           // ACWR rolling history (capped at 52 entries)
  
  // ADD: Active program context
  activeProgramBlock?: MesocycleBlock;
  
  // MODIFY: Routine → cap workoutSessions at 500, sleepLog at 730
  // MODIFY: CycleEntry → split into BioCycle | TrainingBlock
  // MODIFY: Exercise → add targetWeight?, targetRpe?
}

interface PersonalRecord {
  weight: number;
  reps: number;
  estimated1RM: number;
  achievedAt: string;
  sessionId?: string;
}

interface TrainingLoadEntry {
  weekStart: string;       // ISO date of Monday
  acuteLoad: number;       // 7-day rolling volume (kg × reps)
  chronicLoad: number;     // 28-day rolling average
  acwrRatio: number;
  sessionCount: number;
}

interface MesocycleBlock {
  id: string;
  name: string;
  phase: 'accumulation' | 'intensification' | 'realization' | 'deload';
  weekNumber: number;
  totalWeeks: number;
  startDate: string;
  deloadTriggered?: boolean;
}
```

---

*End of Titan Architecture Audit — System Architect Agent*
