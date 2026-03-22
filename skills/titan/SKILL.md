---
name: titan
description: >
  Use this skill when working on the Titan module of the Nexus AGNES SPA — the physical
  intelligence and biomedical coaching module. Invoke it for tasks related to training
  readiness scoring, workout logging, sleep tracking, CNS fatigue modelling, Soma clearance
  gating, periodization engine logic, or any file under `src/modules/titan/`. Also invoke
  it when handling cross-module NSV writes in the `biological.*` or `cognitive.*` domains
  that originate from Titan, or when reasoning about the Soma ↔ Titan relationship.
---

# Titan Module Skill

## 1. Module Identity

| Property              | Value                        |
|-----------------------|------------------------------|
| Module ID             | `titan`                      |
| Route                 | `/titan`                     |
| Theme color           | `orange` / `amber`           |
| NSV domain owned      | `biological`                 |
| Firestore collection  | `titan_profiles`             |
| AI agent name         | `Titan` (user-customizable)  |

---

## 2. What Titan Is

Titan is the **physical intelligence and biomedical coaching** module of Nexus. It functions as an AI-powered strength-and-conditioning coach with full situational awareness of:

- **Recovery state** — CNS fatigue, muscle readiness, injury status
- **Sleep architecture** — duration, deep sleep %, REM %, quality composite score
- **Hormonal context** — stress-induced cortisol burden inferred from Agnes signals
- **Cross-domain psyche-body interaction** — emotions, cognitive load, and financial friction all compress physical recovery capacity

Titan is the **physical gatekeeper** of the system. It blocks training when readiness is insufficient and is the sole authority that grants or denies high-intensity clearance requests from the Soma module.

---

## 3. TITAN_PERSONA (`src/modules/titan/personas.ts`)

The AI agent persona is a 185-line comprehensive coaching identity defined in `personas.ts`.

### Core Identity

- **Role**: Physical Authority — readiness gatekeeper and physical optimization engine
- **Tone**: Grounded, precise, performance-focused. Not a bro-coach.
- **Archetype**: Veteran strength-and-conditioning specialist with deep psyche-body link awareness

### Coaching Domains

- **Strength & Power**: Progressive overload design, 1RM estimation, rep-range periodization
- **Conditioning**: Aerobic base development, lactate threshold, cardiac output training
- **Recovery**: CNS fatigue assessment, HRV trend analysis, sleep quality impact
- **Sleep Architecture**: Sleep debt tracking, REM/deep sleep targets, readiness scoring
- **Hormonal Context**: Cortisol/stress load impact, menstrual cycle periodization
- **Injury Prevention**: Fatigue accumulation warnings, movement pattern imbalances
- **Periodization**: Mesocycle design, deload week recognition, peak-taper sequencing

### Cross-Module Awareness

Titan reads signals from other modules to modify prescriptions:

| Module | Signal | Threshold | Titan Response |
|--------|--------|-----------|----------------|
| Agnes | `stressLoad` | > 7 | Scale back intensity 20%, prioritize parasympathetic work |
| Agnes | `emotionalResilience` | < 4 | Prescribe mobility, zone-2 cardio, breathwork |
| Soma | `cnsFatigueScore` | > 7 | Enforce rest day only — no loaded strength, no HIIT |
| Atlas | `focusScore` | < 4 | Substitute technique-heavy movements with simpler variants |
| Ledger | `financialFriction` | > 7 | Note as recovery-compressing stressor |

### Readiness Scoring System (0–10)

| Score | Tier | Protocol |
|-------|------|----------|
| 7–10 | 🟢 GREEN | Train as planned. Full intensity permitted. |
| 4–6 | 🟡 AMBER | Modify: reduce volume 20–30%, lower intensity ceiling, extend warm-up. |
| 0–3 | 🔴 RED | Active recovery or rest only. No loaded strength. No HIIT. No exceptions without explicit user confirmation. |

### Persona Variants (`TITAN_VARIANTS`)

| Variant | Focus |
|---------|-------|
| `performance` | Load-based, maximal adaptation stimulus. Readiness confirmed green. |
| `recovery` | Parasympathetic activation, CNS downregulation, sleep optimization. |
| `medical` | Lab interpretation, biomarker review, flag outliers for medical review. |
| `onboarding` | Baseline profile establishment, training history, injury history. |

> **Rule**: Titan never dismisses psychological or emotional state as irrelevant to physical performance. Agnes signals always factor into training recommendations.

---

## 4. File Structure

```
src/modules/titan/
├── TitanPage.tsx                    # Entry point route component (/titan)
├── TitanContent.tsx                 # Main UI container with tabs
├── types.ts                         # Types: MuscleGroup, Exercise, WorkoutSet, PersonalRecord, WorkoutLog
├── personas.ts                      # TITAN_PERSONA (185 lines) + 4 variants
├── utils.ts                         # Utility functions
│
├── components/                      # 28 React components
│   ├── PRBoard.tsx                  # Top 6 PRs with sparklines
│   ├── TitanReadiness.tsx           # Readiness dashboard (TitanDashboard)
│   ├── WorkoutSessionLogger.tsx     # Full session logging with exercises
│   ├── QuickLogDrawer.tsx           # Fast single-set logging drawer
│   ├── QuickLogBar.tsx              # Quick log trigger bar
│   ├── AnalyticsTab.tsx             # Training analytics
│   ├── ProgressTab.tsx              # Progress visualization
│   ├── BodyWeightTracker.tsx        # Weight logging with trend chart
│   ├── CardioLogger.tsx             # Cardio session logging
│   ├── SleepTracker.tsx             # Sleep quality & duration logging
│   ├── TrainingCalendar.tsx         # 7-day training calendar view
│   ├── CycleManager.tsx             # Periodization cycle management
│   ├── RoutineBuilder.tsx           # Manual routine builder
│   ├── RoutineProgress.tsx          # Volume analytics per routine
│   ├── TitanRoutinePanel.tsx        # Routine management panel
│   ├── CustomFieldManager.tsx       # Custom extension fields (biometrics, supplements)
│   ├── RecoveryDashboard.tsx        # Recovery metrics overview
│   ├── RecoveryManager.tsx          # Recovery protocol management
│   ├── RecoveryBanner.tsx           # Recovery state banner
│   ├── RecoveryCheckinPanel.tsx     # Daily recovery check-in
│   ├── RecoveryPlanModal.tsx        # Recovery plan details modal
│   ├── RestPeriodCalculator.tsx     # Rest period estimation
│   ├── ClearanceWidget.tsx          # Clearance status widget
│   ├── ClearanceBanner.tsx          # Clearance state banner
│   ├── TitanDiagnosisPanel.tsx      # Medical analysis panel
│   ├── SomaSnapshotWidget.tsx       # Soma health snapshot
│   ├── TitanNotificationSettingsPanel.tsx # Notification preferences
│   ├── LogConfirmCard.tsx           # Log confirmation card
│   └── shared/
│       └── useDataLogger.ts         # Shared data logging hook
│
├── tabs/                            # 4 main UI tabs
│   ├── TrainTab.tsx                 # Calendar, workout logging, clearance, readiness
│   ├── PlanTab.tsx                  # Routines, volume analytics, custom fields
│   ├── BodyTab.tsx                  # PRs, weight, cardio, sleep
│   └── CyclesTab.tsx                # Periodization cycles
│
├── services/
│   ├── titan-profile-service.ts     # Firestore CRUD for titan_profiles
│   ├── titan-exercise-service.ts    # Exercise library service
│   └── actions/                     # 7 action handler modules
│       ├── index.ts                 # Registers all handlers with ActionHub
│       ├── core-actions.ts          # update_titan_profile, update_routine, sync_vitals, self_clearance_check
│       ├── workout-actions.ts       # log_workout_session, log_workout_set
│       ├── sleep-actions.ts         # log_sleep
│       ├── body-actions.ts          # log_body_weight, log_cardio_session
│       ├── biomarker-actions.ts     # commit_biomarker, parse_lab_report, issue_clearance, analyze_medical_image, parse_health_report, parse_workout_log, parse_biometric_data
│       ├── cycle-actions.ts         # create_cycle, advance_cycle_phase, complete_cycle
│       ├── field-actions.ts         # suggest_field, create_field, delete_field
│       ├── shared.ts                # Shared utilities for action handlers
│       └── shared-meta.ts           # titanAllowedActions array (26 actions)
│
├── prompts/
│   ├── ai-titan-personas.ts         # AI persona definitions
│   ├── titan-onboarding-prompt.ts   # Onboarding conversation prompt
│   └── titan-session-prompt.ts      # 960-line comprehensive system prompt
│
├── data/
│   ├── exercise-library.ts          # 40+ exercises with metadata
│   ├── exercise-library.json        # JSON version of exercise library
│   └── recovery-templates.ts        # Recovery protocol templates
│
├── diagnosis/                       # Medical document analysis pipeline
│   ├── titan-diagnosis-spec.ts      # DiagnosisSpecialization config
│   ├── titan-diagnosis-prompt.ts    # System prompt for medical analysis
│   ├── titan-diagnosis-extractor.ts # Data extraction from documents
│   └── titan-diagnosis-merge.ts     # Merge extracted data to profile
│
├── onboarding/
│   ├── TitanOnboarding.tsx          # First-run onboarding flow
│   └── intake-accumulator.ts        # Accumulates onboarding data
│
└── utils/
    ├── e1rm.ts                      # Epley formula: weight * (1 + reps / 30)
    ├── quick-log-parser.ts          # Parse quick log input
    ├── nsv-workout-updater.ts       # Update NSV after workouts
    └── nsv-sleep-updater.ts         # Update NSV after sleep logs
```

---

## 5. Data Model

### Core Types (`src/modules/titan/types.ts`)

```typescript
type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps'
  | 'forearms' | 'core' | 'glutes' | 'quads' | 'hamstrings'
  | 'calves' | 'traps' | 'lats' | 'full_body' | 'cardio';

type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';

type Exercise = {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  category: ExerciseCategory;
  equipment: string[];           // e.g. ['barbell'], ['bodyweight'], ['dumbbell','cable']
  aliases?: string[];            // alternate names for search
};

type PersonalRecord = {
  exerciseId: string;
  weight: number;                // kg
  reps: number;
  e1RM: number;                  // Epley formula: weight * (1 + reps / 30)
  date: string;                  // ISO date string
};

type WorkoutSet = {
  exerciseId: string;
  weight: number;
  reps: number;
  rir?: number;                  // reps in reserve (optional)
  notes?: string;
};

type WorkoutLog = {
  id: string;
  date: string;                  // ISO date string
  sets: WorkoutSet[];
  durationMinutes?: number;
  notes?: string;
};
```

### `TitanProfile` (root Firestore document in `titan_profiles/{uid}`)

```typescript
interface TitanProfile {
  onboardingComplete: boolean;
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  primaryGoal:
    | 'strength'
    | 'hypertrophy'
    | 'conditioning'
    | 'fat_loss'
    | 'athletic_performance'
    | 'general_fitness';
  currentWeight?: number;
  targetWeight?: number;
  weightUnit: 'kg' | 'lbs';
  workoutFrequency: number;         // days per week
  availableEquipment: string[];
  injuryHistory: string[];
  routines: Routine[];              // weekly training routines
  workoutSessions: WorkoutSession[];// completed sessions
  workoutLogs: WorkoutLog[];        // simplified logs for sparklines
  sleepLog: SleepEntry[];
  bodyWeightLog: BodyWeightEntry[];
  cardioLog: CardioSession[];
  personalRecords: Record<string, PersonalRecord>;
  cycles: CycleEntry[];             // periodization cycles
  customFields: CustomField[];
  labSummaries: LabSummary[];
  medications: string[];
  allergies: string[];
  medicalImageAnalyses: MedicalImageAnalysis[];
  nutrition: Record<string, unknown>;
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
}
```

### Supporting Types

```typescript
interface WorkoutSession {
  id: string;
  routineId: string;
  routineName: string;
  date: string;                     // ISO 8601
  startedAt: string;
  completedAt: string;
  exercises: ExerciseLog[];
  totalVolume?: number;             // kg * reps sum
  rpe?: number;                     // RPE 1-10
  notes?: string;
  status: 'completed' | 'partial' | 'abandoned';
}

interface ExerciseLog {
  exerciseName: string;
  plannedSets: number;
  plannedReps: string;              // e.g. "8-10"
  sets: ExerciseSet[];
}

interface ExerciseSet {
  setNumber: number;
  weight?: number;
  repsCompleted: number;
  completed: boolean;
  notes?: string;
}

interface SleepEntry {
  id: string;
  date: string;                     // ISO date
  bedtime?: string;
  wakeTime?: string;
  durationHours: number;
  quality: number;                  // 0-10
  deepSleepPct?: number;
  remSleepPct?: number;
  awakenings?: number;
  notes?: string;
  tags?: string[];
  recordedAt: string;
}

interface BodyWeightEntry {
  id: string;
  date: string;
  weight: number;                   // kg
  bodyFatPct?: number;
  measurements?: Record<string, number>;
  notes?: string;
  recordedAt: string;
}

interface CardioSession {
  id: string;
  date: string;
  type: 'run' | 'bike' | 'swim' | 'row' | 'hike' | 'elliptical' | 'jump_rope' | 'other';
  durationMinutes: number;
  distanceKm?: number;
  avgHeartRate?: number;
  calories?: number;
  notes?: string;
  rpe?: number;
  status: 'completed' | 'partial';
  recordedAt: string;
}

interface PersonalRecord {
  exerciseName: string;
  maxWeight: number;
  repsAtMax: number;
  e1RM: number;                     // Epley formula
  achievedDate: string;
  sessionId: string;
}

interface CycleEntry {
  id: string;
  name: string;
  type: 'workout' | 'recovery' | 'custom';
  description?: string;
  startDate: string;
  endDate?: string;
  phases: CyclePhase[];
  currentPhaseIndex: number;
  currentPhaseStartDate: string;
  status: 'active' | 'completed' | 'paused';
  notes?: string;
  cycleLength?: number;
  lastPeriodDate?: string;
  linkedRoutineIds?: string[];
  deloadWeekNumber?: number;
  progressionScheme?: 'linear' | 'wave' | 'block' | 'undulating';
  createdAt: string;
  updatedAt: string;
}

interface CyclePhase {
  id: string;
  name: string;
  durationDays: number;
  notes?: string;
  dosage?: string;
  trainingModifier?: 'increase' | 'maintain' | 'reduce' | 'rest';
}

interface CustomField {
  id: string;
  name: string;
  type: 'number' | 'text' | 'boolean' | 'select';
  unit?: string;
  description?: string;
  range?: [number, number];
  options?: string[];
  createdAt: number;
}

interface Routine {
  id: string;
  weekday: number;                  // 0-6 (Sun-Sat)
  name: string;
  exercises: RoutineExercise[];
}
```

---

## 6. UI Tabs

Titan's UI is organized into 4 tabs within `TitanContent.tsx`:

### Train Tab (`tabs/TrainTab.tsx`)

Primary training view with:
- **TrainingCalendar** — 7-day calendar showing scheduled routines and completed sessions
- **TitanDashboard (TitanReadiness)** — Readiness gauge and recovery metrics
- **WorkoutSessionLogger** — Full session logging with exercise tracking
- **ClearanceWidget** — Current clearance status for high-intensity work
- **Advisory banner** — Surfaces warnings after high-RPE sessions

### Plan Tab (`tabs/PlanTab.tsx`)

Training planning with:
- **TitanRoutinePanel** — Routine management, import, analyze, generate
- **RoutineProgress** — Volume analytics per routine
- **CustomFieldManager** — Custom tracking fields (biometrics, supplements, macros)

### Body Tab (`tabs/BodyTab.tsx`)

Body metrics tracking with:
- **PRBoard** — Top 6 personal records with sparkline trend charts
- **ProgressTab** — Progress visualization over time
- **BodyWeightTracker** — Weight logging with trend chart (supports kg/lbs)
- **CardioLogger** — Cardio session logging (run, bike, swim, row, hike, etc.)
- **SleepTracker** — Sleep quality, duration, and architecture logging

### Cycles Tab (`tabs/CyclesTab.tsx`)

Periodization management with:
- **CycleManager** — Create, track, and complete training cycles
- Supports progression schemes: linear, wave, block, undulating
- Phase tracking with training modifiers (increase, maintain, reduce, rest)

---

## 7. NSV (Nexus State Vector) Ownership

Titan **writes** the following NSV fields. These are the only fields Titan may update.

```typescript
// Written via GlobalProjectionService.updateCrossFunctionalState(uid, payload)

{
  biological: {
    cnsFatigue: number,       // 0-10 | Central nervous system depletion
                              //         0 = fully recovered, 10 = breakdown risk
    sleepQuality: number,     // 0-10 | Composite sleep score
    recoveryScore: number,    // 0-10 | Overall physical recovery
    hormonalContext: string,  // Descriptive hormonal state
    weight: number,           // kg | Latest body weight
    bodyFatPct: number,       // % | Body fat percentage
    aerobicLoad: number,      // 0-10 | Cardio session load index
  },
  cognitive: {
    energyBudget: number,     // 0-10 | Physical energy available
    focusScore: number,       // 0-10 | Physical-fatigue contribution to focus
  }
}
```

> **Important**: `cognitive.focusScore` and `cognitive.energyBudget` are **co-owned** — Titan writes the physical-fatigue contribution only. Atlas may write cognitive-load contributions. Do not clobber; always read-modify-write or use delta semantics.

### NSV Reads (Inbound Signals)

| Module | Signal | Use |
|--------|--------|-----|
| Agnes | `emotional.*`, `stressLoad` | Cortisol burden, emotional resilience |
| Soma | `biological.cnsFatigueScore` | CNS state from Soma |
| Atlas | `cognitive.focusScore` | Cognitive energy state |

---

## 8. Action Tags (26 total in `titanAllowedActions`)

Actions are organized into 7 handler modules under `services/actions/`.

### Core Actions (`core-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `update_titan_profile` | `Partial<TitanProfile>` | Patches Firestore document |
| `update_routine` | `{ routines: Routine[] }` | Merges routines by weekday |
| `sync_vitals` | `{ biological: { recoveryScore?, cnsFatigue?, sleepQuality?, hormonalContext? } }` | Writes directly to NSV biological domain |
| `self_clearance_check` | `{ activity: string, recoveryScore?: number }` | Evaluates clearance, emits BLOCK_HIGH_INTENSITY if denied |

### Workout Actions (`workout-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `log_workout_session` | `{ routineId, routineName, date, exercises: [...], rpe, notes, status }` | Appends to workoutSessions[], computes PRs, emits WORKOUT_COMPLETED |
| `log_workout_set` | `{ exercise, sets, reps, weight }` | Quick log single exercise, updates PRs |

### Sleep Actions (`sleep-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `log_sleep` | `{ date, bedtime, wakeTime, durationHours, quality: 0-10, deepSleepPct, remSleepPct, awakenings, tags, notes }` | Appends to sleepLog[], updates NSV sleepQuality |

### Body Actions (`body-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `log_body_weight` | `{ weight, unit: 'kg'\|'lbs', bodyFatPct, date, notes }` | Appends to bodyWeightLog[], updates NSV weight, emits TITAN_BODY_WEIGHT_LOGGED |
| `log_cardio_session` | `{ type, durationMinutes, distanceKm, avgHeartRate, calories, rpe, notes }` | Appends to cardioLog[], emits WORKOUT_COMPLETED, updates NSV aerobicLoad |

### Biomarker Actions (`biomarker-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `commit_biomarker` | `{ name, value, unit, source, recordedAt }` | Commits via SomaTitanDelegationService, emits SOMA_BIOMARKER_COMMITTED |
| `parse_lab_report` | `{ id, panel, findings, flags }` | Appends to labSummaries[] |
| `issue_clearance` | `{ activity, status: 'granted'\|'denied'\|'conditional', reason, validUntil }` | Issues clearance via delegation, emits CLEARANCE_GRANTED/DENIED |
| `analyze_medical_image` | `{ biomarkers, labSummaries, medications, allergies, clinicalFlags, reportType }` | Extracts data from medical images, commits biomarkers, emits MEDICAL_ALERT for severe flags |
| `parse_health_report` | `{ ... }` | Parses health report documents |
| `parse_workout_log` | `{ ... }` | Parses workout log imports |
| `parse_biometric_data` | `{ ... }` | Parses biometric data imports |

### Cycle Actions (`cycle-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `create_cycle` | `{ name, type, description, startDate, phases: [...], progressionScheme }` | Creates new cycle, emits CYCLE_STARTED |
| `advance_cycle_phase` | `{ cycleId }` | Advances to next phase, emits CYCLE_COMPLETED if all phases done |
| `complete_cycle` | `{ cycleId, summary }` | Marks cycle as completed |

### Field Actions (`field-actions.ts`)

| Action | Payload | Effect |
|--------|---------|--------|
| `suggest_field` | `{ name, type, unit, reason }` | Message-only, proposes field for user confirmation |
| `create_field` | `{ name, type, unit, description, range?, options? }` | Creates custom field (max 20) |
| `delete_field` | `{ id \| fieldId \| name }` | Deletes custom field (idempotent) |

### Utility Actions

| Action | Payload | Effect |
|--------|---------|--------|
| `propose_reminder` | `{ title, note, dueAt, recurrence, priority, source }` | Proposes reminder for user confirmation |
| `query_reminders` | `{ moduleId: 'titan' }` | Queries existing reminders |

---

## 9. Spine Events Emitted by Titan

| Event Name | When Emitted | Priority | Data |
|------------|--------------|----------|------|
| `WORKOUT_COMPLETED` | After successful workout/cardio log | info | sessionId, routineName, date, totalVolume, rpe, status |
| `TITAN_RECOVERY_NEEDED` | When cnsFatigue projected ≥ 7.5 after session | alert/critical | projectedCnsFatigue, sessionRpe, reason |
| `TITAN_TRAINING_STREAK` | On milestone streak (7, 14, 21, 30 days) | info | streakDays, date |
| `TITAN_BODY_WEIGHT_LOGGED` | After body weight entry | info/alert | weight, bodyFatPct, weeklyDeltaKg, aggressiveCut |
| `CYCLE_STARTED` | After create_cycle | info | cycleId, name, type |
| `CYCLE_COMPLETED` | When all phases done or manual complete | info | cycleId, name, type |
| `BLOCK_HIGH_INTENSITY` | When clearance denied | alert | activity, recoveryScore, reasons |
| `SOMA_READINESS_UPDATED` | After clearance check | info | passedClearance, readinessScore |
| `SOMA_CLEARANCE_CHANGED` | After issue_clearance | info/alert | status, activityType, clearanceId |
| `SOMA_BIOMARKER_COMMITTED` | After biomarker commit | info | source, biomarkerId, name |
| `CLEARANCE_GRANTED` | Legacy event after grant | info | activity, status, reason |
| `CLEARANCE_DENIED` | Legacy event after denial | alert | activity, status, reason |
| `MEDICAL_ALERT` | When severe clinical flags found | alert | alertCount, flags, reportType |
---

## 10. Diagnosis Pipeline (`diagnosis/`)

Titan includes a medical document analysis pipeline for processing lab reports, health records, and medical images.

### Specification (`titan-diagnosis-spec.ts`)

```typescript
const titanDiagnosisSpec: DiagnosisSpecialization = {
  moduleId: 'titan',
  label: 'Medical Analysis',
  description: 'Analyze lab reports, health records, and medical documents.',
  
  supportedFileTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'text/plain',
    'text/markdown',
  ],
  
  allowedActions: [
    'parse_lab_report',
    'parse_health_report',
    'analyze_medical_image',
    'commit_biomarker',
    'issue_clearance',
  ],
  
  themeColor: 'orange',
}
```

### Pipeline Components

| File | Purpose |
|------|---------|
| `titan-diagnosis-spec.ts` | DiagnosisSpecialization config with file types and actions |
| `titan-diagnosis-prompt.ts` | System prompt for medical analysis context |
| `titan-diagnosis-extractor.ts` | Extracts biomarkers, medications, flags from documents |
| `titan-diagnosis-merge.ts` | Merges extracted data into TitanProfile |

### Empty State UI

When no document is uploaded, the diagnosis panel shows:
- **Title**: "Describe symptoms or upload a document"
- **Examples**: "I have persistent headaches and fatigue", "Analyze my blood panel", "Compare to previous labs"
- **Supported types**: PDF (lab reports), Image (PNG/JPG/WebP scans), CSV (tabular lab data), Text (plain/markdown)

---

## 11. Soma ↔ Titan Relationship (Critical)

This is the most complex inter-module relationship in Nexus.

### Roles

| Module | Role |
|--------|------|
| **Soma** | Neurological/physiological monitoring. Reads biological state, tracks CNS at physiological level. |
| **Titan** | Physical training decisions. Consumes Soma's data to govern safe/productive training. |

### Data Flow

```
Soma monitors CNS state → writes biological.cnsFatigueScore to NSV
     ↓
Titan reads cnsFatigueScore → factors into readiness computation
     ↓
Titan computes readiness → writes biological.recoveryScore to NSV
     ↓
Soma reads recoveryScore → informs physiological recommendations
```

### Soma Clearance Gate

When Soma requests high-intensity clearance (`self_clearance_check`):

**Titan's evaluation algorithm:**

```
Step 1: Check current readiness score from NSV
Step 2: Check CNS fatigue trend (last 3 days)
Step 3: Check Soma health snapshot via SomaDataService

GRANT full clearance if:
  recoveryScore >= 4 AND no contraindications

DENY clearance if:
  recoveryScore < 4 OR contraindications present
```

**On denial**, Titan:
1. Pushes warning message to chat
2. Emits `BLOCK_HIGH_INTENSITY` Spine event
3. Publishes `SOMA_READINESS_UPDATED` with `passedClearance: false`

### NSV Boundary — Never Cross-Write

```
Titan owns:  biological.cnsFatigue, biological.sleepQuality, biological.recoveryScore
             biological.weight, biological.bodyFatPct, biological.aerobicLoad
             biological.hormonalContext
             cognitive.energyBudget, cognitive.focusScore

Soma owns:   biological.cnsFatigueScore (Soma's own field — different from Titan's cnsFatigue)
             biological.neuralReadiness, biological.sympatheticLoad

Rule: Titan NEVER writes Soma's fields. Soma NEVER writes Titan's fields.
```

---

## 12. Periodization Engine

Titan understands mesocycle design and tracks training phases via the Cycles feature.

### Cycle Types

| Type | Description |
|------|-------------|
| `workout` | Training periodization (accumulation, intensification, deload) |
| `recovery` | Recovery-focused cycles |
| `custom` | User-defined cycles |

### Progression Schemes

| Scheme | Description |
|--------|-------------|
| `linear` | Progressive increase each phase |
| `wave` | Undulating intensity pattern |
| `block` | Block periodization with distinct phases |
| `undulating` | Daily/weekly intensity variation |

### Phase Training Modifiers

| Modifier | Description |
|----------|-------------|
| `increase` | Increase volume/intensity |
| `maintain` | Maintain current load |
| `reduce` | Reduce load (e.g., taper) |
| `rest` | Complete rest/recovery |

### Deload Triggers

A deload should be suggested when:
- 4–6 weeks have elapsed since last deload
- CNS fatigue rolling average exceeds 7.0
- Readiness has been AMBER or RED for 4+ consecutive days
- User reports persistent joint soreness or sleep degradation

---

## 13. Daily Interaction Patterns

### Pre-Workout Clearance Flow

```
1. User signals intent to train (or automated check)
2. Titan evaluates via self_clearance_check:
   - Reads NSV biological.recoveryScore
   - Checks Soma health snapshot for contraindications
3. If recoveryScore >= 4 AND no contraindications:
   - Push "✅ Clearance check passed" message
   - Publish SOMA_READINESS_UPDATED with passedClearance: true
4. If denied:
   - Push "⚠️ Clearance check failed" warning
   - Emit BLOCK_HIGH_INTENSITY
   - Publish SOMA_READINESS_UPDATED with passedClearance: false
```

### Workout Logging Flow

```
1. User completes workout via WorkoutSessionLogger or QuickLogDrawer
2. Action: log_workout_session or log_workout_set
3. Handler:
   - Validates and normalizes exercise data
   - Computes totalVolume (weight × reps sum)
   - Updates personalRecords if new PR achieved
   - Appends to workoutSessions[] and workoutLogs[]
   - Emits WORKOUT_COMPLETED Spine event
4. If RPE >= 8:
   - Projects cnsFatigue impact
   - If projected >= 7.5, emits TITAN_RECOVERY_NEEDED
5. Updates NSV:
   - Decrements recoveryScore based on RPE
   - Updates cnsFatigue with decay calculation
```

### Sleep Logging Flow

```
1. User logs sleep via SleepTracker
2. Action: log_sleep
3. Handler:
   - Validates duration (0-24h), quality (0-10)
   - Appends to sleepLog[]
4. Computes NSV sleepQuality:
   - hoursScore: Peak at 8.25h, falls linearly outside 7.5–9h window
   - qualityScore: User's self-reported quality
   - sleepQuality = average(hoursScore, qualityScore)
5. Writes sleepQuality to NSV
```

---

## 14. Extension Fields (CustomFieldManager)

Custom user-defined fields for domain-specific metrics not covered by the core profile.

### Field Types

| Type | Description |
|------|-------------|
| `number` | Numeric value with optional unit and range |
| `text` | Free-form text |
| `boolean` | True/false toggle |
| `select` | Single choice from options list |

### Limits

- Maximum 20 custom fields per profile
- Duplicate names (case-insensitive) rejected
- Select options capped at 10

### Example Fields

| Field ID | Type | Unit | Notes |
|----------|------|------|-------|
| `one-rep-max-squat` | number | kg/lbs | Back squat 1RM |
| `hrv-score` | number | ms | Heart rate variability |
| `resting-heart-rate` | number | bpm | Morning resting HR |
| `body-fat-percentage` | number | % | Body composition |
| `creatine-cycle` | select | — | loading / maintenance / off |
| `supplement-stack` | text | — | Active supplements |
| `vo2-max` | number | ml/kg/min | Aerobic capacity |

---

## 15. Common Development Tasks

### Task 1: Log a Workout Session

```
User input → WorkoutSessionLogger.tsx (UI collection)
     → LLM emits: <action type="log_workout_session">{ ... }</action>
     → workout-actions.ts handler:
         1. Validates exercise/set structure
         2. Computes totalVolume from completed sets
         3. Checks for new PRs (Epley formula e1RM)
         4. Appends session to workoutSessions[]
         5. Creates TitanWorkoutLog for sparklines
         6. Emits WORKOUT_COMPLETED Spine event
         7. If RPE >= 8, checks for TITAN_RECOVERY_NEEDED
         8. Updates NSV recoveryScore and cnsFatigue
```

### Task 2: Create a Training Cycle

```
User requests cycle → CycleManager.tsx (UI)
     → LLM emits: <action type="create_cycle">{ name, type, phases, progressionScheme }</action>
     → cycle-actions.ts handler:
         1. Validates phases array (min 1 phase)
         2. Normalizes phase data (durationDays, trainingModifier)
         3. Creates CycleEntry with status: 'active'
         4. Appends to cycles[] (max 50)
         5. Emits CYCLE_STARTED Spine event
```

### Task 3: Process Medical Document

```
User uploads document → TitanDiagnosisPanel.tsx
     → Diagnosis pipeline:
         1. titan-diagnosis-spec.ts validates file type
         2. titan-diagnosis-prompt.ts builds context
         3. LLM analyzes document
         4. LLM emits: <action type="analyze_medical_image">{ biomarkers, labSummaries, ... }</action>
     → biomarker-actions.ts handler:
         1. Extracts biomarkers, commits via SomaTitanDelegationService
         2. Appends labSummaries[], medications[], allergies[]
         3. Creates MedicalImageAnalysis record
         4. If severe flags found, emits MEDICAL_ALERT
```

### Task 4: Add Custom Field

```
User requests field → CustomFieldManager.tsx or chat
     → LLM emits: <action type="suggest_field">{ name, type, unit, reason }</action>
     → field-actions.ts handler (suggest_field):
         - Pushes proposal message to chat
         - No state mutation
     → User confirms
     → LLM emits: <action type="create_field">{ name, type, unit, description }</action>
     → field-actions.ts handler (create_field):
         1. Validates name required, type enum
         2. Checks max 20 fields limit
         3. Checks for duplicate name
         4. Creates CustomField with UUID
         5. Appends to customFields[]
```

---

## 16. NSV Write Pattern (Code Reference)

All Titan NSV updates must use `GlobalProjectionService`:

```typescript
// In action handlers
import { GlobalProjectionService } from './shared';

// After workout session
await GlobalProjectionService.updateCrossFunctionalState(userId, {
  biological: {
    cnsFatigue: computedCnsFatigue,       // 0-10
    recoveryScore: computedRecovery,       // 0-10
  },
});

// After sleep log
await GlobalProjectionService.updateCrossFunctionalState(userId, {
  biological: {
    sleepQuality: compositeScore,          // 0-10
  },
});

// After body weight log
await GlobalProjectionService.updateCrossFunctionalState(userId, {
  biological: {
    weight: entryWeight,                   // kg
    bodyFatPct: bodyFatPercentage,         // %
  },
});
```

> **Rule**: Always use `updateCrossFunctionalState` — never directly patch the NSV document. The service handles merging, versioning, and Spine event emission.

---

## 17. Onboarding Flow (`onboarding/TitanOnboarding.tsx`)

The onboarding flow collects minimum viable data via conversational intake:

1. **Training history** — Experience level, training age
2. **Current activity** — Workout frequency, types
3. **Injuries** — Past injuries, current limitations
4. **Goals** — Primary fitness goal
5. **Recovery habits** — Sleep patterns, recovery practices
6. **Biometrics** — Current weight, target weight, unit preference

Uses `intake-accumulator.ts` to accumulate data across conversation turns before committing to profile.

---

## 18. Architecture Constraints and Rules

| Rule | Detail |
|------|--------|
| **Readiness gates training** | No high-intensity work proceeds when recoveryScore < 4 |
| **CNS fatigue decays exponentially** | Half-life of 48 hours since last session |
| **RED tier is inviolable** | No session proceeds at RED readiness without explicit override |
| **Soma owns its own fields** | Titan reads `Soma.cnsFatigueScore` but never writes it |
| **Agnes always factors in** | Cross-module stress signals modify training prescriptions |
| **PRs auto-computed** | Every completed set checks for new e1RM records |
| **Action tags are authoritative** | All profile mutations happen through action handlers |
| **Max 365 workout sessions** | Older sessions trimmed on new log |
| **Max 100 workout logs** | For sparkline display |
| **Max 50 cycles** | Older cycles trimmed |
| **Max 20 custom fields** | Enforced at create time |

---

## 19. Quick Reference — NSV Fields by Module

For cross-module development, here is the full biological domain allocation:

```
biological.cnsFatigue         → TITAN (writes)
biological.sleepQuality       → TITAN (writes)
biological.recoveryScore      → TITAN (writes)
biological.weight             → TITAN (writes)
biological.bodyFatPct         → TITAN (writes)
biological.aerobicLoad        → TITAN (writes)
biological.hormonalContext    → TITAN (writes)
biological.cnsFatigueScore    → SOMA  (writes) — different field, same domain
biological.neuralReadiness    → SOMA  (writes)
biological.sympatheticLoad    → SOMA  (writes)

cognitive.energyBudget        → TITAN (physical contribution) + ATLAS (cognitive contribution)
cognitive.focusScore          → TITAN (physical contribution) + ATLAS (cognitive contribution)
```

When both Titan and Atlas write to `cognitive.*` fields, use additive/weighted merge — do not overwrite the other module's contribution.

---

## 20. Exercise Library (`data/exercise-library.ts`)

40+ exercises with metadata:

```typescript
interface ExerciseDefinition {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];
  category: 'compound' | 'isolation' | 'cardio' | 'mobility';
  equipment: string[];
  aliases?: string[];
}
```

Also available as JSON at `data/exercise-library.json` for static imports.

---

## 21. Recovery Templates (`data/recovery-templates.ts`)

Predefined recovery protocol templates for common scenarios:
- Post-heavy-session recovery
- Deload week protocols
- Sleep optimization
- CNS recovery
- Active recovery sessions
