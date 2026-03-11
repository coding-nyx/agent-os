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

The AI agent persona is defined in `personas.ts`. Key traits:

- **Tone**: Grounded, precise, performance-focused. Not a bro-coach.
- **Archetype**: Veteran strength-and-conditioning specialist with deep psyche-body link awareness.
- **Coaching domains**:
  - Strength & Power
  - Conditioning (aerobic / anaerobic)
  - Recovery science
  - Sleep architecture
  - Hormonal context
  - Injury prevention & prehab
  - Periodization & mesocycle design

> **Rule**: Titan never dismisses psychological or emotional state as irrelevant to physical performance. Agnes signals always factor into training recommendations.

---

## 4. File Structure

```
src/modules/titan/
├── TitanPage.tsx                    — Top-level route component (/titan)
├── components/
│   ├── TitanDashboard.tsx           — Readiness gauge, recovery metrics, training history overview
│   ├── TitanWorkspace.tsx           — Tabbed workspace container
│   ├── WorkoutLogger.tsx            — Log workouts: exercises, sets, reps, perceived effort
│   ├── ReadinessPanel.tsx           — Daily readiness check-in UI
│   ├── SleepTracker.tsx             — Sleep quality & duration logging
│   ├── PRTracker.tsx                — Personal records tracking (per lift / movement)
│   ├── ProgramBuilder.tsx           — Mesocycle / workout program creation
│   └── FieldsTab.tsx                — Custom extension fields (biometrics, supplements, etc.)
├── onboarding/
│   └── TitanOnboarding.tsx          — First-run onboarding flow (populates TitanProfile)
├── services/
│   ├── titan-profile-service.ts     — Firestore CRUD for titan_profiles collection
│   └── actions.ts                   — Action tag handlers (compute_readiness, log_workout, etc.)
├── personas.ts                      — TITAN_PERSONA definition
└── types.ts                         — All TypeScript interfaces (TitanProfile, WorkoutSession, etc.)
```

---

## 5. Data Model

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
  currentProgram?: WorkoutProgram;
  workoutLog: WorkoutSession[];
  readinessHistory: ReadinessEntry[];
  sleepLog: SleepEntry[];
  prTracking: PersonalRecord[];
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
}
```

### Supporting Types

```typescript
interface WorkoutSession {
  id: string;
  date: string;                     // ISO 8601
  exercises: ExerciseLog[];
  duration: number;                 // minutes
  perceivedEffort: number;          // RPE 1-10
  notes?: string;
  readinessAtStart?: number;        // readiness score when session began
}

interface ExerciseLog {
  name: string;
  sets: SetLog[];
  notes?: string;
}

interface SetLog {
  reps: number;
  weight?: number;
  unit?: 'kg' | 'lbs';
  rpe?: number;
  isWarmup?: boolean;
}

interface ReadinessEntry {
  date: string;                     // ISO 8601
  score: number;                    // 0-10
  tier: 'GREEN' | 'AMBER' | 'RED';
  inputs: {
    restingHeartRate: number;
    sleepQuality: number;           // 0-10
    energyLevel: number;            // 0-10
    stressPhysical: number;         // 0-10
  };
  cnsFatigue: number;               // 0-10
  recommendation: string;
}

interface SleepEntry {
  date: string;                     // ISO 8601
  duration: number;                 // hours
  quality: number;                  // 0-10 composite
  deepSleep?: number;               // hours or %
  remSleep?: number;                // hours or %
  notes?: string;
}

interface PersonalRecord {
  exercise: string;
  weight: number;
  reps: number;
  unit: 'kg' | 'lbs';
  date: string;                     // ISO 8601
  notes?: string;
}

interface WorkoutProgram {
  id: string;
  name: string;
  weeks: ProgramWeek[];
  currentWeek: number;
  phase: 'accumulation' | 'intensification' | 'realization' | 'deload';
  startDate: string;
}

interface ProgramWeek {
  weekNumber: number;
  sessions: PlannedSession[];
}

interface PlannedSession {
  day: number;                      // 1-7
  focus: string;                    // e.g. "Lower - Squat Focus"
  exercises: PlannedExercise[];
}

interface PlannedExercise {
  name: string;
  sets: number;
  reps: string;                     // e.g. "5" or "8-10"
  intensityNote?: string;           // e.g. "RPE 8"
}
```

---

## 6. NSV (Nexus State Vector) Ownership

Titan **writes** the following NSV fields. These are the only fields Titan may update. Never write to fields owned by other modules.

```typescript
// Written via GlobalProjectionService.updateCrossFunctionalState(uid, payload)

{
  biological: {
    cnsFatigue: number,       // 0-10 | Central nervous system depletion
                              //         0 = fully recovered, 10 = breakdown risk
    sleepQuality: number,     // 0-10 | Composite sleep score
    recoveryScore: number,    // 0-10 | Overall physical recovery
  },
  cognitive: {
    energyBudget: number,     // 0-10 | Physical energy available for cognitive + physical tasks
    focusScore: number,       // 0-10 | Physical-fatigue contribution to focus
  }
}
```

> **Important**: `cognitive.focusScore` and `cognitive.energyBudget` are **co-owned** — Titan writes the physical-fatigue contribution only. Atlas may write cognitive-load contributions. Do not clobber; always read-modify-write or use delta semantics.

---

## 7. Training Readiness Scoring System

This is Titan's most critical feature. Readiness governs what training is permitted each day.

### Tiers

| Score | Tier      | Protocol                                                                 |
|-------|-----------|--------------------------------------------------------------------------|
| 7–10  | 🟢 GREEN  | Train as planned. Full intensity permitted.                              |
| 4–6   | 🟡 AMBER  | Modify: reduce volume 20–30%, lower intensity ceiling, extend warm-up.   |
| 0–3   | 🔴 RED    | Active recovery or rest only. No loaded strength. No HIIT. No exceptions without explicit user confirmation. |

### Computation Inputs

| Input              | Type    | Source                     |
|--------------------|---------|----------------------------|
| `restingHeartRate` | number  | User check-in / wearable   |
| `sleepQuality`     | 0–10    | SleepTracker log           |
| `energyLevel`      | 0–10    | User self-report           |
| `stressPhysical`   | 0–10    | User self-report + Agnes   |

### Action Tag

```xml
<action type="compute_readiness">
  {
    "restingHeartRate": 58,
    "sleepQuality": 7,
    "energyLevel": 6,
    "stressPhysical": 3
  }
</action>
```

### Algorithmic Rules

1. **Always** factor in the last **3 days** of readiness history — a single night's data is insufficient.
2. CNS fatigue is **cumulative**. Log every session and compute a rolling 7-day trend.
3. **Never** override a RED readiness state without explicit user confirmation dialog.
4. If CNS fatigue rolling 7-day average exceeds 7, emit `flag_overtraining` regardless of today's readiness score.

---

## 8. Action Tags

Titan's LLM agent emits structured action tags. The handler in `services/actions.ts` parses and executes them.

| Action Tag                    | Payload Fields                                                               | Effect                                                               |
|-------------------------------|------------------------------------------------------------------------------|----------------------------------------------------------------------|
| `update_titan_profile`        | Any `TitanProfile` top-level field                                           | Patches Firestore document                                            |
| `compute_readiness`           | `restingHeartRate`, `sleepQuality`, `energyLevel`, `stressPhysical`         | Computes score, stores in `readinessHistory[]`, updates NSV          |
| `log_workout_session`         | `exercises[]`, `duration`, `perceivedEffort`, `notes?`                      | Appends to `workoutLog[]`, emits `WORKOUT_LOGGED` Spine event        |
| `update_sleep_entry`          | `date`, `duration`, `quality`, `deepSleep?`, `remSleep?`                    | Appends/updates `sleepLog[]`, updates NSV `sleepQuality`             |
| `update_pr`                   | `exercise`, `weight`, `reps`, `date`                                         | Upserts entry in `prTracking[]`                                      |
| `create_workout_program`      | `name`, `weeks[]`, `sessions[]`                                              | Creates and sets `currentProgram`                                     |
| `update_workout_program`      | Partial `WorkoutProgram` fields                                               | Modifies active program weeks/sessions                               |
| `suggest_deload`              | Optional `reason`                                                            | Emits `DELOAD_SUGGESTED` Spine event, marks next week as deload      |
| `sync_vitals`                 | `biological: { cnsFatigue, sleepQuality, recoveryScore }`                   | Writes directly to NSV biological domain                             |
| `flag_overtraining`           | Optional `severity`, `trend`                                                 | Emits `OVERTRAINING_FLAG` Spine event, escalates to user             |
| `grant_soma_clearance`        | `granted: boolean`, `reason`, `restrictions?: string[]`                     | Responds to Soma's clearance request via NexusHandoffService         |
| `complete_titan_onboarding`   | *(none)*                                                                     | Sets `onboardingComplete: true`                                      |

### Example — Log Workout

```xml
<action type="log_workout_session">
  {
    "exercises": [
      {
        "name": "Back Squat",
        "sets": [
          { "reps": 5, "weight": 120, "unit": "kg", "rpe": 8 },
          { "reps": 5, "weight": 120, "unit": "kg", "rpe": 8.5 },
          { "reps": 4, "weight": 120, "unit": "kg", "rpe": 9 }
        ]
      },
      {
        "name": "Romanian Deadlift",
        "sets": [
          { "reps": 8, "weight": 100, "unit": "kg", "rpe": 7 }
        ]
      }
    ],
    "duration": 65,
    "perceivedEffort": 8,
    "notes": "Knees slightly tracking in on 3rd squat set. Monitor."
  }
</action>
```

---

## 9. Spine Events Emitted by Titan

| Event Name           | When Emitted                                                      | Subscribers            |
|----------------------|-------------------------------------------------------------------|------------------------|
| `WORKOUT_LOGGED`     | After successful `log_workout_session`                           | Agnes, Soma, Ledger    |
| `READINESS_COMPUTED` | After successful `compute_readiness`                             | Agnes, Soma, Atlas     |
| `OVERTRAINING_FLAG`  | When 7-day CNS fatigue rolling avg > 7                           | Agnes, Soma, user UI   |
| `DELOAD_SUGGESTED`   | When accumulation threshold hit or fatigue accumulates           | Agnes, user UI         |

---

## 10. Cross-Module Intelligence (Inbound Reads)

Titan reads the following NSV signals from other modules to modify training prescriptions. Titan **reads only** — it never writes these fields.

| Module   | Signal                     | Threshold | Titan Response                                                       |
|----------|----------------------------|-----------|----------------------------------------------------------------------|
| Agnes    | `stressLoad`               | > 7       | Scale back training intensity automatically (cortisol burden model)  |
| Agnes    | `emotionalResilience`      | < 4       | Prioritize parasympathetic work (yoga, walking, breathwork)          |
| Soma     | `cnsFatigueScore`          | > 7       | Enforce rest day only — no exceptions                                |
| Atlas    | `focusScore`               | < 4       | Substitute technique-heavy movements with simpler variants            |
| Ledger   | `financialFriction`        | > 7       | Note as recovery-compressing stressor; reduce intensity targets       |

### Cascade Rule — Agnes Stress Override

When `agnes.stressLoad > 7`, Titan must:
1. Reduce planned volume by 25–40%
2. Cap RPE ceiling at 7
3. Extend warm-up by 50%
4. Communicate the override to the user with cortisol context

---

## 11. Soma ↔ Titan Relationship (Critical)

This is the most complex inter-module relationship in Nexus.

### Roles

| Module | Role                                                                |
|--------|---------------------------------------------------------------------|
| **Soma** | Neurological/physiological monitoring. Reads biological state signals, tracks CNS load at a physiological level. |
| **Titan** | Physical training decisions. Consumes Soma's biological data to govern what training is safe and productive. |

### Data Flow

```
Soma monitors CNS state → writes biological.cnsFatigueScore to NSV
     ↓
Titan reads cnsFatigueScore → factors into readiness computation
     ↓
Titan computes readiness → writes biological.recoveryScore to NSV
     ↓
Soma reads recoveryScore → informs its physiological recommendations
```

### Soma Clearance Gate

When Soma requests high-intensity clearance for a user session:

**Titan's evaluation algorithm:**

```
Step 1: Check current readiness score (today)
Step 2: Check CNS fatigue trend (last 3 days)
Step 3: Check sleep quality (last night + rolling 7-day average)

GRANT full clearance if:
  readiness >= 7 AND cnsFatigue <= 5

GRANT conditional clearance (with restrictions) if:
  readiness >= 5 AND cnsFatigue <= 7

DENY clearance if:
  readiness < 5 OR cnsFatigue > 7
```

**Clearance grant action:**

```xml
<action type="grant_soma_clearance">
  {
    "granted": true,
    "reason": "Readiness score 8.1, CNS fatigue 4.2 (3-day trend stable). Sleep avg 7.4h.",
    "restrictions": []
  }
</action>
```

**Clearance denial action:**

```xml
<action type="grant_soma_clearance">
  {
    "granted": false,
    "reason": "CNS fatigue 7.8 over 3-day trend. High-intensity work risks overreaching.",
    "restrictions": ["no_loaded_strength", "no_hiit", "active_recovery_only"]
  }
</action>
```

### NSV Boundary — Never Cross-Write

```
Titan owns:  biological.cnsFatigue, biological.sleepQuality, biological.recoveryScore
             cognitive.energyBudget, cognitive.focusScore

Soma owns:   biological.cnsFatigueScore (Soma's own field — different from Titan's cnsFatigue)
             biological.neuralReadiness, biological.sympatheticLoad

Rule: Titan NEVER writes Soma's fields. Soma NEVER writes Titan's fields.
```

---

## 12. Periodization Engine

Titan understands mesocycle design and automatically tracks which training phase the user is in.

### Phases

| Phase           | Description                                          | Volume    | Intensity | Duration    |
|-----------------|------------------------------------------------------|-----------|-----------|-------------|
| Accumulation    | Progressive volume increase, moderate intensity      | ↑ High    | Moderate  | 3–4 weeks   |
| Intensification | Volume reduces, intensity increases                  | ↓ Medium  | ↑ High    | 2–3 weeks   |
| Realization     | Peak performance phase, minimum volume               | ↓ Low     | ↑ Maximum | 1–2 weeks   |
| Deload          | Mandatory recovery week                              | ↓↓ Low   | ↓ Low     | 1 week      |

### Deload Triggers

A deload must be suggested when **any** of the following are true:

- 4–6 weeks have elapsed since last deload
- 7-day rolling CNS fatigue average exceeds 7.0
- Readiness score has been AMBER or RED for 4+ consecutive days
- User reports persistent joint soreness or sleep degradation trend

---

## 13. Daily Interaction Patterns

### Morning Check-In Flow

```
1. User reports: sleep hours, sleep quality (1-10), energy level (1-10), any soreness
2. Titan fetches: last 3 days readiness history + CNS fatigue trend
3. Titan reads: Agnes stressLoad, Soma cnsFatigueScore
4. Titan computes: today's readiness score and tier
5. Titan prescribes: today's training (or rest/recovery) with specific modifications
6. Action emitted: compute_readiness → updates readinessHistory[] + NSV
```

### Pre-Workout Validation Flow

```
1. User signals intent to train
2. Titan checks: current day's readiness tier
3. If GREEN → confirm planned session, proceed
4. If AMBER → present modified session (reduced volume, lower intensity cap)
5. If RED → block session, offer active recovery alternatives only
6. If override attempted at RED → require explicit "I understand the risk" confirmation
```

### Post-Workout Flow

```
1. User (or auto-prompt) logs workout via WorkoutLogger
2. Action: log_workout_session → appended to workoutLog[]
3. Titan estimates session CNS cost based on volume, intensity, perceivedEffort
4. NSV update: increments cnsFatigue, adjusts recoveryScore for next day
5. Titan provides recovery prescription: nutrition timing, sleep target, next session timing
6. Spine event: WORKOUT_LOGGED emitted
```

### Weekly Review Flow

```
1. Titan aggregates: training load, CNS fatigue trend, sleep 7-day avg, readiness history
2. Evaluates: deload need, phase progression, PR opportunities
3. Recommends: next week's mesocycle phase, volume targets, intensity ranges
4. If overtraining detected: emits flag_overtraining, notifies Agnes
```

---

## 14. Extension Fields (FieldsTab)

Custom user-defined fields managed via `FieldsTab.tsx`. These store domain-specific metrics not covered by the core profile.

| Field ID                  | Type         | Unit           | Notes                                  |
|---------------------------|--------------|----------------|----------------------------------------|
| `one-rep-max-squat`       | number       | kg or lbs      | Back squat 1RM                        |
| `one-rep-max-bench`       | number       | kg or lbs      | Bench press 1RM                       |
| `one-rep-max-deadlift`    | number       | kg or lbs      | Conventional deadlift 1RM             |
| `weekly-mileage`          | number       | miles or km    | Running volume tracker                |
| `hrv-score`               | number       | ms             | Heart rate variability (morning)      |
| `resting-heart-rate`      | number       | bpm            | Morning resting HR                    |
| `body-fat-percentage`     | number       | %              | Body composition metric               |
| `creatine-cycle`          | select       | —              | Options: loading / maintenance / off  |
| `supplement-stack`        | multi-select | —              | Active supplements                    |
| `grip-strength-pr`        | number       | kg or lbs      | Grip dynamometer PR                   |
| `vo2-max`                 | number       | ml/kg/min      | Aerobic capacity metric               |

Extension field values are validated by the LLM at input time against domain-appropriate ranges.

---

## 15. Common Development Tasks

### Task 1: Log a Workout

```
User input → WorkoutLogger.tsx (UI collection)
     → LLM emits: <action type="log_workout_session">{ ... }</action>
     → actions.ts handler:
         1. Validates payload shape
         2. Calls titan-profile-service.ts → appendWorkoutSession(uid, session)
         3. Firestore: push to workoutLog[] array field
         4. Computes session CNS cost
         5. Updates NSV: biological.cnsFatigue (+=delta), biological.recoveryScore (-=delta)
         6. Emits Spine event: WORKOUT_LOGGED
```

### Task 2: Compute Readiness

```
Morning check-in → ReadinessPanel.tsx (UI collects inputs)
     → LLM emits: <action type="compute_readiness">{ restingHeartRate, sleepQuality, energyLevel, stressPhysical }</action>
     → actions.ts handler:
         1. Fetches last 3 days from readinessHistory[]
         2. Fetches last 7 days CNS fatigue rolling avg
         3. Reads Agnes stressLoad from NSV
         4. Computes composite score (algorithm in actions.ts)
         5. Assigns tier: GREEN / AMBER / RED
         6. Appends to readinessHistory[]
         7. Updates NSV: biological.recoveryScore, cognitive.energyBudget
         8. Emits Spine event: READINESS_COMPUTED
```

### Task 3: Grant Soma Clearance

```
Soma emits cross-module handoff request for high-intensity clearance
     → NexusHandoffService routes to Titan
     → Titan agent evaluates:
         1. readinessHistory[-1].score (today's score)
         2. cnsFatigue trend (last 3 entries)
         3. sleepLog[-1].quality + 7-day rolling avg
     → LLM emits: <action type="grant_soma_clearance">{ granted, reason, restrictions? }</action>
     → NexusHandoffService delivers response back to Soma
```

### Task 4: Add a Program Week

```
User requests week addition via ProgramBuilder.tsx
     → LLM emits: <action type="update_workout_program">{ weeks: [...existingWeeks, newWeek] }</action>
     → actions.ts handler:
         1. Validates week schema (sessions, exercises, sets/reps strings)
         2. Calls titan-profile-service.ts → updateProgram(uid, { weeks: [...] })
         3. Firestore: updates currentProgram.weeks[]
```

### Task 5: Detect and Flag Overtraining

```
Triggered on each compute_readiness call (and daily background check)
     → actions.ts reads: cnsFatigue for last 7 days from readinessHistory[]
     → Computes: rolling average
     → If rolling avg > 7.0 for 3+ consecutive days:
         → LLM emits: <action type="flag_overtraining">{ severity: "high", trend: [...] }</action>
         → actions.ts handler:
             1. Stores flag in TitanProfile
             2. Emits Spine event: OVERTRAINING_FLAG
             3. Notifies Agnes (via Spine) for stress-compounding context
             4. Prompts user with deload recommendation
```

---

## 16. NSV Write Pattern (Code Reference)

All Titan NSV updates must use `GlobalProjectionService`:

```typescript
// In actions.ts or titan-profile-service.ts
import { GlobalProjectionService } from '@/services/global-projection-service';

await GlobalProjectionService.updateCrossFunctionalState(uid, {
  biological: {
    cnsFatigue: computedCnsFatigue,       // 0-10
    sleepQuality: compositeSleeScore,     // 0-10
    recoveryScore: computedRecovery,      // 0-10
  },
  cognitive: {
    energyBudget: physicalEnergyBudget,   // 0-10
    focusScore: fatigueDrivenFocusImpact, // 0-10 (physical component only)
  },
});
```

> **Rule**: Always use `updateCrossFunctionalState` — never directly patch the NSV document. The service handles merging, versioning, and Spine event emission.

---

## 17. Onboarding Flow (`TitanOnboarding.tsx`)

The onboarding flow collects the minimum viable data to make Titan functional:

1. **Step 1 — Fitness level**: beginner / intermediate / advanced / elite
2. **Step 2 — Primary goal**: strength / hypertrophy / conditioning / fat_loss / athletic_performance / general_fitness
3. **Step 3 — Training frequency**: days per week (1–7)
4. **Step 4 — Available equipment**: multi-select (barbell, dumbbells, cables, bodyweight, bands, etc.)
5. **Step 5 — Injury history**: free-text, guided prompt (past injuries, current limitations)
6. **Step 6 — Biometrics**: current weight, target weight, unit preference (kg/lbs)
7. **Completion**: `complete_titan_onboarding` action emitted → `onboardingComplete: true` in Firestore

---

## 18. Architecture Constraints and Rules

| Rule | Detail |
|------|--------|
| **Readiness is always 3-day-aware** | Never compute readiness from a single data point. Always include prior 2 days' history. |
| **CNS fatigue is cumulative** | Every workout session must increment cnsFatigue. Never reset on a single good night's sleep alone. |
| **RED tier is inviolable** | No session proceeds at RED readiness without an explicit user override confirmation. Log the override. |
| **Soma owns its own fields** | Titan reads `Soma.cnsFatigueScore` but never writes it. Use `biological.cnsFatigue` (Titan's field) only. |
| **Agnes always factors in** | Titan must always read Agnes signals before finalizing a training prescription. Cortisol context is non-optional. |
| **Deload is mandatory** | The system must enforce deload suggestions — they cannot be silently skipped. User can decline but receives explicit warning. |
| **Action tags are authoritative** | All profile mutations happen through action tags processed by `actions.ts`. Never write directly to Firestore from UI components. |

---

## 19. Quick Reference — NSV Fields by Module

For cross-module development, here is the full biological domain allocation:

```
biological.cnsFatigue         → TITAN (writes)
biological.sleepQuality        → TITAN (writes)
biological.recoveryScore       → TITAN (writes)
biological.cnsFatigueScore     → SOMA  (writes) — different field, same domain
biological.neuralReadiness     → SOMA  (writes)
biological.sympatheticLoad     → SOMA  (writes)

cognitive.energyBudget         → TITAN (physical contribution) + ATLAS (cognitive contribution)
cognitive.focusScore           → TITAN (physical contribution) + ATLAS (cognitive contribution)
```

When both Titan and Atlas write to `cognitive.*` fields, use additive/weighted merge — do not overwrite the other module's contribution.
