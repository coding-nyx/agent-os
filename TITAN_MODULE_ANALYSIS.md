# AGNES TITAN Module - Comprehensive Analysis

## 📋 Quick Overview

**Titan** is the Physical Authority module within the Neural Sanctuary—a complete fitness coaching and biomedical advisory system that integrates:
- Workout routine building and logging
- Sleep tracking and analysis
- Recovery/readiness scoring
- Training cycle management (supplement, workout, hormonal, nutrition, recovery)
- Medical clearance gating
- AI-powered training recommendations

**Key Path:** `/Users/raj-13766/Desktop/nexus/agnes/src/modules/titan/`

---

## 📂 Directory Structure

```
src/modules/titan/
├── TitanPage.tsx                    # Main page/orchestrator (100+ lines)
├── personas.ts                      # TITAN_PERSONA (520 lines) + TITAN_VARIANTS
├── utils.ts                         # Helper functions
│
├── prompts/
│   ├── ai-titan-personas.ts         # Dynamic persona builder with tone engine
│   ├── titan-session-prompt.ts      # Master session prompt builder (training/medical/diagnosis)
│   └── titan-onboarding-prompt.ts   # Onboarding prompt builder
│
├── components/
│   ├── TitanReadiness.tsx           # Readiness dashboard (CNS, Resilience, Sleep, Bio Sync)
│   ├── WorkoutSessionLogger.tsx     # Session logging with AI validation
│   ├── RoutineBuilder.tsx           # Drag-drop routine editor (70+ templates)
│   ├── SleepTracker.tsx             # Sleep logging (quality, duration, tags, advanced metrics)
│   ├── CycleManager.tsx             # Cycle management (supplement/workout/hormonal)
│   ├── RestPeriodCalculator.tsx     # Rest period recommendations by intensity/exercise
│   ├── TitanRoutinePanel.tsx        # Routine manager
│   ├── RoutineProgress.tsx          # Adherence tracking
│   ├── TitanDiagnosisPanel.tsx      # Medical diagnosis
│   └── CustomFieldManager.tsx       # Custom biomarker fields
│
├── services/
│   ├── titan-profile-service.ts     # Profile persistence (load/save/normalization)
│   └── actions.ts                   # Action registry (update_routine, log_sleep, etc.)
│
├── onboarding/
│   ├── TitanOnboarding.tsx          # Onboarding flow (907 lines)
│   └── intake-accumulator.ts        # Intake data accumulator (497 lines)
│
└── diagnosis/
    ├── titan-diagnosis-prompt.ts    # Diagnosis mode prompt builder
    ├── titan-diagnosis-spec.ts      # Spec registration
    ├── titan-diagnosis-merge.ts     # Result merging
    └── titan-diagnosis-extractor.ts # Structured data extraction
```

---

## 🧠 TITAN Persona & System Identity

**File:** `/src/modules/titan/personas.ts`

### Master Persona (TITAN_PERSONA)
The Physical Authority—strength-and-conditioning specialist, body coach, readiness gatekeeper.

**Identity Principles:**
- NOT a "bro coach"—data-driven, precise, performance-focused
- Understands psyche-body link: body cannot peak when mind is in crisis
- Gatekeeper of high-intensity work: never allows ambition to override physiology

**Authority Domains:**
1. **Strength & Power**: Progressive overload, 1RM estimation, rep-range periodization
2. **Conditioning**: Aerobic base, lactate threshold, cardiac output training
3. **Recovery**: CNS fatigue assessment, HRV trends, sleep quality impact
4. **Sleep Architecture**: Sleep debt tracking, REM/deep sleep targets, readiness impact
5. **Hormonal Context**: Cortisol/stress load, menstrual cycle periodization
6. **Injury Prevention**: Fatigue accumulation warnings, movement pattern balance
7. **Periodization**: Mesocycle design, deload recognition, peak-taper sequencing

### Cross-Module Awareness
Titan monitors and integrates with:
- **Agnes (Emotional)**: If stress load > 7 + emotional resilience < 4 → scale back intensity
- **Soma (CNS Fatigue)**: If CNS fatigue > 7 → enforce rest/active recovery only
- **Atlas (Cognitive)**: If focus score < 4 → substitute complex moves with simpler variants
- **Ledger (Financial)**: Note financial stress as recovery-compressing factor

### Training Readiness Scoring (0–10)
- **GREEN (7–10)**: Train as planned, full intensity/volume
- **AMBER (4–6)**: Modify session, reduce volume 20-30%, lower intensity, extend warm-up
- **RED (0–3)**: Active recovery or rest only—no loaded strength, no HIIT

**Readiness Components:**
- Sleep quality/duration
- HRV (Heart Rate Variability)
- CNS fatigue level
- Energy level
- Physical stress

### NSV (Neural Sanctuary Vector) Outputs
Titan maintains:
- `biological.cnsFatigue` (0–10): CNS depletion
- `biological.sleepQuality` (0–10): Sleep score
- `biological.recoveryScore` (0–10): Overall physical recovery
- `cognitive.energyBudget` (0–10): Physical energy available
- `cognitive.focusScore` (0–10): Physical-fatigue contribution to focus

### TITAN_VARIANTS (Persona Overlays)
```typescript
type PersonaVariant = 'performance' | 'recovery' | 'medical' | 'onboarding';
```

- **performance**: High-performance coaching, readiness ≥ green, maximal adaptation
- **recovery**: Recovery management, parasympathetic activation, gentle prescriptions
- **medical**: Biomarker/medical data review, NO diagnoses, coach-not-clinician
- **onboarding**: Neural Link Initialization, establish baseline, gather info conversationally

### Behavioral Principles
1. **Progressive Overload Logic**: Never add volume & intensity simultaneously, obey 10% rule
2. **Deload Recognition**: Trigger after 3+ weeks fatigue, 6+ days soreness, 5+ nights poor sleep
3. **Fatigue Accumulation**: Track 7-day load, yellow flag @ 1.3 ratio, red @ 1.5
4. **Data First**: HRV/sleep override "I feel fine" when metrics diverge
5. **No Motivation Theater**: Precision earns trust, brevity over performance

### Session Types & Prescriptions
- **STRENGTH**: Load-based, comp moves, 1–8 reps, 3–5 min rest (readiness ≥ 6, CNS ≤ 6)
- **CONDITIONING**: Aerobic/mixed, HR zones 2–4 (readiness ≥ 4)
- **MOBILITY**: Always prescribable, no readiness floor
- **RECOVERY**: Contrast therapy, breathwork, sauna/cold (readiness red)
- **HYBRID**: Strength first to preserve neural drive (readiness ≥ 7)

---

## 📊 Data Model / TypeScript Types

**Location:** `/src/lib/types.ts` (lines 300–558)

### TitanProfile (Main)
```typescript
interface TitanProfile {
  onboardingComplete: boolean;
  privacyLevel: 'basic' | 'complete';          // Controls bio/cycle tracking depth
  trackingLevel: 'standard' | 'indepth';       // Deep health tracking
  nutrition: TitanNutrition;
  activity: TitanActivity;
  history: TitanHistory;
  summary: string;                              // AI-generated profile summary
  routines: Routine[];
  sleepLog?: SleepEntry[];
  cycles?: CycleEntry[];
  workoutSessions?: WorkoutSession[];
  createdAt: string;
  updatedAt: string;
  traits?: string[];
  
  // Absorbed from Soma (dual-write, deprecated)
  knownConditions: string[];
  medications: string[];
  allergies: string[];
  biomarkers: BiomarkerRecord[];
  labSummaries: LabSummaryRecord[];
  clearances: ClearanceRecord[];
  medicalImageAnalyses: MedicalImageAnalysis[];
  medicalSummary?: string;
}
```

### TitanNutrition
```typescript
interface TitanNutrition {
  dietNotes?: string;
  supplements?: TitanSupplement[];
  macroEstimate?: TitanMacroEstimate;
  mealsPerDay?: number;
}

interface TitanSupplement {
  name: string;
  category?: string;
}

interface TitanMacroEstimate {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  source?: string;
}
```

### TitanActivity
```typescript
interface TitanActivity {
  activityLevel?: string;                       // e.g., "sedentary", "lightly active", "very active"
  workoutsPerWeek?: number;
  sleepHours?: number;
  dayToDayNotes?: string;
  occupation?: string;
  baselineWeight?: number;
  baselineHeight?: number;
}
```

### TitanHistory
```typescript
interface TitanHistory {
  yearsTraining?: number;
  injuries?: string[];
  goals?: string[];
  bodyGoals?: string;
}
```

### Sleep Tracking
```typescript
interface SleepEntry {
  id: string;
  date: string;                                 // ISO YYYY-MM-DD
  bedtime?: string;                             // HH:MM
  wakeTime?: string;                            // HH:MM
  durationHours: number;                        // Auto-derived from bedtime/wakeTime
  quality: number;                              // 0–10 subjective
  deepSleepPct?: number;
  remSleepPct?: number;
  awakenings?: number;
  notes?: string;
  tags?: string[];                              // 'stress', 'alcohol', 'late_meal', 'caffeine', 'exercise_pm', 'screen_time', 'travel', 'illness'
  recordedAt: string;
}
```

### Cycle Management
```typescript
type CycleType = 'supplement' | 'workout' | 'hormonal' | 'nutrition' | 'recovery' | 'custom';

interface CycleEntry {
  id: string;
  name: string;
  type: CycleType;
  description?: string;
  startDate: string;
  endDate?: string;
  phases: CyclePhase[];
  currentPhaseIndex: number;
  currentPhaseStartDate: string;
  status: 'active' | 'completed' | 'paused';
  notes?: string;
  cycleLength?: number;                         // For hormonal cycles
  lastPeriodDate?: string;                      // For hormonal cycles
  createdAt: string;
  updatedAt: string;
}

interface CyclePhase {
  id: string;
  name: string;
  durationDays: number;
  notes?: string;
  dosage?: string;                              // e.g., "20g/day" for creatine
  trainingModifier?: 'increase' | 'maintain' | 'reduce' | 'rest';
}
```

### Workout Logging
```typescript
interface WorkoutSession {
  id: string;
  routineId: string;
  routineName: string;
  date: string;                                 // ISO YYYY-MM-DD
  startedAt: string;
  completedAt?: string;
  exercises: ExerciseLog[];
  totalVolume?: number;                         // Sum of weight × repsCompleted
  rpe?: number;                                 // 1–10
  notes?: string;
  status: 'completed' | 'partial' | 'abandoned';
}

interface ExerciseLog {
  exerciseName: string;
  plannedSets: number;
  plannedReps: string;                          // e.g., "8-10"
  sets: ExerciseSet[];
}

interface ExerciseSet {
  setNumber: number;
  weight?: number;                              // kg or lbs
  repsCompleted: number;
  completed: boolean;
  notes?: string;
}
```

### Routines & Exercises
```typescript
type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

interface Routine {
  id: string;
  name: string;
  exercises: Exercise[];
  rationale: string;                            // Why this routine was designed
  weekday?: Weekday;
  timeframe?: string;                           // e.g., "daily"
  status?: string;                              // e.g., "active"
}

interface Exercise {
  name: string;
  sets: number;
  reps: string;                                 // e.g., "8-10", "5-6"
  notes?: string;
}
```

### Medical Records
```typescript
interface BiomarkerRecord {
  id: string;
  name: string;
  value: number | string;
  unit?: string;
  source?: string;
  recordedAt: string;
}

interface ClearanceRecord {
  id: string;
  activity: string;
  status: 'granted' | 'denied' | 'conditional';
  reason: string;
  issuedAt: string;
}

interface LabSummaryRecord {
  id: string;
  panel: string;
  findings: string[];
  flags: string[];
  recordedAt: string;
}

interface MedicalImageAnalysis {
  id: string;
  analyzedAt: string;
  reportType: string;
  sourceLabel: string;
  biomarkerCount: number;
  clinicalFlags: Array<{ flag: string; severity: string }>;
}
```

---

## 🚀 Onboarding Flow

**Files:**
- `/src/modules/titan/onboarding/TitanOnboarding.tsx` (907 lines)
- `/src/modules/titan/onboarding/intake-accumulator.ts` (497 lines)
- `/src/modules/titan/prompts/titan-onboarding-prompt.ts`

### Sequence

1. **Privacy Level Gate**
   - User selects 'basic' or 'complete'
   - 'complete' enables in-depth health tracking, bio questions

2. **TRAINER_STEPS** (4 required steps)
   - **Nutrition Intake**: Supplements, meal timing, macro baseline
   - **Physical Data**: Activity level, workouts/week, sleep hours, occupation, baseline weight/height
   - **History & Goals**: Years training, injury history, goals, body composition targets
   - **Routine Sync**: Finalize profile, ready for routines

3. **MEDICAL_STEPS** (5 optional steps if privacy='complete')
   - **Health Monitoring**: Opt-in for integrated health monitoring
   - **Conditions**: Known medical conditions
   - **Medications**: Current medications
   - **Allergies**: Allergies and contraindications
   - **Consent**: Medical disclaimer acknowledgment

### Data Collection

**Onboarding Actions:**
- `<action type="update_titan_profile">{...partialProfile}</action>` - Update during intake
- `<action type="update_global_base_context">{"name":"...","pronouns":"...","occupation":"...","typicalSleepHours":7}</action>`
- `<action type="sync_vitals">{"biological":{...},"emotional":{...}}</action>`
- `<action type="focus_nutrition">{}</action>` - Move to nutrition step
- `<action type="focus_physical_data">{}</action>`
- `<action type="focus_history_goals">{}</action>`
- `<action type="complete_titan_onboarding">{}</action>` - Mark complete

### TitanIntakeAccumulator Structure
```typescript
export type TitanIntakeAccumulator = {
  nutrition: {
    dietNotes?: string;
    supplements: string[];
    calories?: number;
    proteinGrams?: number;
    carbGrams?: number;
    fatGrams?: number;
    mealsPerDay?: number;
  };
  activity: {
    activityLevel?: string;
    workoutsPerWeek?: number;
    sleepHours?: number;
    dayToDayNotes?: string;
    occupation?: string;
  };
  history: {
    yearsTraining?: number;
    injuries: string[];
    goals: string[];
    bodyGoals?: string;
  };
  summary?: string;
  routines: Routine[];
  lastUpdatedAt: string;
};
```

---

## 💪 UI Components

### 1. TitanReadiness (Dashboard)
**File:** `/src/modules/titan/components/TitanReadiness.tsx`

Displays 4 key metrics:
- **CNS LOAD** (0–10): Central nervous system depletion
- **RESILIENCE** (0–10): Emotional resilience (from Agnes)
- **SLEEP REC** (0–10): Sleep quality score
- **BIO SYNC** (0–100): Overall wellness composite

Features:
- Real-time updates from NSV
- Shows last updated timestamp
- Indicates derived vs. user-logged metrics
- Calibration button for each metric

### 2. WorkoutSessionLogger (Session Logging)
**File:** `/src/modules/titan/components/WorkoutSessionLogger.tsx`

**AI-Gated Flow:**
1. User selects a planned routine
2. Logs per-exercise performance:
   - Weight (kg/lbs)
   - Reps completed per set
   - Set completion status
3. Enters RPE (1–10) and notes
4. Component builds structured prompt
5. Routes to Titan AI for validation & commit

**Data Collected:**
- Date (auto-today)
- Duration (start time auto-captured)
- Exercise-by-exercise breakdown
- Total volume calculated (∑ weight × reps)
- Form cues/reminders from Titan

### 3. RoutineBuilder (Routine Editor)
**File:** `/src/modules/titan/components/RoutineBuilder.tsx`

**Features:**
- Drag-and-drop reordering
- 70+ pre-loaded exercise templates organized by category:
  - **Push**: Bench, Incline Press, OHP, Dips, Flyes
  - **Pull**: Deadlift, Barbell Row, Pull-ups, Lat Pulldown, Face Pulls
  - **Legs**: Back Squat, RDL, Bulgarian Split Squat, Leg Press, Leg Curl
  - **Arms**: Barbell Curl, Tricep Pushdown, Hammer Curl, Skull Crushers
  - **Core**: Plank, Cable Crunches, Russian Twists
- Per-exercise editing: name, sets, reps, notes
- Routine metadata: weekday selection, timeframe, rationale entry

### 4. SleepTracker (Sleep Logging)
**File:** `/src/modules/titan/components/SleepTracker.tsx`

**Input Fields:**
- Date picker (default today)
- Bedtime/wake time (calculates duration auto)
- Quality slider (0–10)
- Advanced metrics: deep sleep %, REM sleep %, awakenings count
- Tag selection: stress, alcohol, late_meal, caffeine, exercise_pm, screen_time, travel, illness
- Text notes

**Display:**
- 14-day history with per-night detail
- Color-coded quality: excellent (≥8), good (≥6), poor (≥4), very poor (<4)
- Trend indicators (up/down/stable arrows)
- Duration vs. recommended (7.5–9 hours)
- Aggregate older nights summary

### 5. CycleManager (Cycle Tracking)
**File:** `/src/modules/titan/components/CycleManager.tsx`

**Cycle Types:**
- **Supplement**: Creatine, vitamin stacking, loading protocols
- **Workout**: Periodized training blocks
- **Hormonal**: Menstrual cycle tracking, testosterone cycles
- **Nutrition**: Calorie cycles, macro rotations
- **Recovery**: Sauna/cold protocols, contrast therapy
- **Custom**: User-defined cycles

**Per-Cycle Display:**
- Type icon (color-coded)
- Status: active, completed, paused
- Current phase name & duration
- Progress bar
- Training modifiers (increase/maintain/reduce/rest)

### 6. RestPeriodCalculator (Rest Recommendations)
**File:** `/src/modules/titan/components/RestPeriodCalculator.tsx`

**Inputs:**
- Exercise type: compound, isolation, cardio, mobility
- Intensity: light, moderate, heavy, max

**Examples:**
- Heavy compound: 240s optimal (3–7 min range)
- Moderate compound: 120s optimal (1.5–3 min)
- Light isolation: 45s optimal (30–45s)
- Heavy cardio: Depends on zone

### 7. TitanRoutinePanel (Routine Manager)
**File:** `/src/modules/titan/components/TitanRoutinePanel.tsx`

**Display:**
- Today's routine highlighted
- All routines sorted by weekday order
- Routine card: name, weekday, exercise count
- Quick actions: edit, analyze, generate, import
- Routes to RoutineBuilder or Titan AI for generation

### 8. TitanDiagnosisPanel (Medical Diagnosis)
**File:** `/src/modules/titan/components/TitanDiagnosisPanel.tsx`

Integrates with diagnosis engine:
- Upload health documents
- Extract biomarkers
- Parse lab reports
- Issue medical clearances

---

## 🧬 Readiness System

**Implementation in:** `/src/modules/titan/personas.ts`, `/src/modules/titan/components/TitanReadiness.tsx`

### Readiness Inputs
1. **Sleep Quality/Duration**: Last night + 7-day rolling average
2. **HRV (Heart Rate Variability)**: 18%+ below baseline = reduced readiness
3. **CNS Fatigue**: Derived from Soma module (0–10)
4. **Energy Level**: Self-reported or derived from Soma
5. **Physical Stress**: Training load, soreness, injury flags

### Readiness Outputs
- **Score (0–10)**
- **Status (GREEN/AMBER/RED)**
- **Recommendation**: Training type and intensity modifier

### Readiness Thresholds
- **GREEN (7–10)**: Full intensity, full volume as programmed
- **AMBER (4–6)**: Modify session, reduce volume 20-30%, lower intensity ceiling, extend warm-up
- **RED (0–3)**: Active recovery or full rest only, no loaded strength, no HIIT

### Action: Compute Readiness
```
<action type="compute_readiness">{
  "restingHeartRate": 60,
  "sleepQuality": 7,
  "energyLevel": 6,
  "stressPhysical": 3
}</action>
```

### Clearance Gating
Before approving high-intensity activities:
1. Check current readiness score
2. Check CNS fatigue trend (last 3 days)
3. Check sleep quality (last night + 7-day avg)
4. Only grant full clearance when: readiness ≥ 7 AND CNS fatigue ≤ 5

**Action:** `<action type="self_clearance_check">{"activity":"high_intensity","recoveryScore":4}</action>`

---

## 😴 Sleep Tracking

**Implementation in:** `/src/modules/titan/components/SleepTracker.tsx`

### Sleep Data Model
```typescript
interface SleepEntry {
  id: string;
  date: string;              // ISO YYYY-MM-DD
  bedtime?: string;          // HH:MM (e.g., "23:00")
  wakeTime?: string;         // HH:MM (e.g., "07:00")
  durationHours: number;     // Auto-derived or manual
  quality: number;           // 0–10 subjective score
  deepSleepPct?: number;     // % of sleep in deep stages
  remSleepPct?: number;      // % of sleep in REM
  awakenings?: number;       // Number of nocturnal awakenings
  notes?: string;            // User notes
  tags?: string[];           // Context: stress, alcohol, caffeine, exercise_pm, etc.
  recordedAt: string;        // ISO timestamp
}
```

### UI Features
- **Quick Entry**: Date, bedtime, wake time (duration auto-calculated)
- **Quality Slider**: 0–10 with labels (Excellent, Good, Poor, Very Poor)
- **Advanced Metrics**: Deep sleep %, REM sleep %, awakening count (optional)
- **Context Tags**: Quick-select tags for sleep disruption factors
- **Notes Field**: Free-form notes on sleep quality/disturbances

### Analytics
- **14-Day Summary**: Avg quality, avg duration, trend
- **Per-Night Detail**: Last 7 nights with full metrics
- **Aggregate Older**: Nights 8–14+ rolled into summary
- **Color Coding**: Quality ranges to visual indicators (red/amber/green)
- **Trend Arrows**: Up (improving), down (declining), flat (stable)

### Integration with Readiness
- Sleep quality/duration heavily weighted in readiness calculation
- Poor sleep (< 6 hours or quality < 4) triggers AMBER/RED readiness
- Sleep debt accumulation over 5+ nights triggers deload recommendation

**Action:** 
```
<action type="log_sleep">{
  "date": "2025-01-15",
  "durationHours": 7.5,
  "quality": 8,
  "bedtime": "23:00",
  "wakeTime": "06:30",
  "deepSleepPct": 20,
  "remSleepPct": 25,
  "awakenings": 1,
  "tags": ["stress"],
  "notes": "Stressed about work but slept well."
}</action>
```

---

## 🔄 Cycle Tracking

**Implementation in:** `/src/modules/titan/components/CycleManager.tsx`

### Cycle Architecture
```typescript
interface CycleEntry {
  id: string;
  name: string;
  type: 'supplement' | 'workout' | 'hormonal' | 'nutrition' | 'recovery' | 'custom';
  description?: string;
  startDate: string;         // ISO YYYY-MM-DD
  endDate?: string;
  phases: CyclePhase[];      // Multi-phase progression
  currentPhaseIndex: number;
  currentPhaseStartDate: string;
  status: 'active' | 'completed' | 'paused';
  notes?: string;
  cycleLength?: number;      // For hormonal cycles (e.g., 28 days)
  lastPeriodDate?: string;   // For menstrual tracking
  createdAt: string;
  updatedAt: string;
}

interface CyclePhase {
  id: string;
  name: string;
  durationDays: number;
  notes?: string;
  dosage?: string;           // e.g., "20g/day", "5mg/day"
  trainingModifier?: 'increase' | 'maintain' | 'reduce' | 'rest';
}
```

### Cycle Examples

**Supplement Cycle (Creatine)**
```
Type: supplement
Phases:
  1. Loading: 20g/day, 5 days
  2. Maintenance: 5g/day, 30 days
```

**Workout Cycle (Periodization)**
```
Type: workout
Phases:
  1. Accumulation: 21 days, training: increase
  2. Intensification: 14 days, training: maintain
  3. Realization: 7 days, training: reduce
  4. Deload: 7 days, training: rest
```

**Hormonal Cycle (Menstrual)**
```
Type: hormonal
Phases:
  1. Menstrual: 5 days, notes: "Rest/mobility"
  2. Follicular: 9 days, training: increase
  3. Ovulation: 3 days, training: maintain
  4. Luteal: 11 days, training: reduce
cycleLength: 28
lastPeriodDate: "2025-01-01"
```

### UI Display
- **Active Cycles List**: One card per active cycle
- **Cycle Card**: Icon (type-specific), name, status, current phase, progress bar
- **Phase Details**: Name, duration days, dosage/modifier, start date
- **Actions**: Edit, advance phase, complete cycle, pause

### Actions
```
Create:
<action type="create_cycle">{
  "name": "Strength Block",
  "type": "workout",
  "description": "12-week periodized strength building",
  "startDate": "2025-01-15",
  "phases": [
    {
      "id": "acc",
      "name": "Accumulation",
      "durationDays": 21,
      "trainingModifier": "increase"
    },
    {
      "id": "int",
      "name": "Intensification",
      "durationDays": 14,
      "trainingModifier": "maintain"
    }
  ]
}</action>

Advance:
<action type="advance_cycle_phase">{"cycleId": "cycle_123"}</action>

Complete:
<action type="complete_cycle">{"cycleId": "cycle_123"}</action>
```

---

## 🏥 Services

### titan-profile-service.ts
**File:** `/src/modules/titan/services/titan-profile-service.ts`

**Functions:**
- `createEmptyTitanProfile()` - Default new profile
- `normalizeTitanProfile(raw)` - Validate & normalize from storage
- `loadTitanProfile({ userId, encryptionKey })` - Async load from encrypted store
- `saveTitanProfile(profile, { userId, encryptionKey })` - Async save with encryption
- `subscribeTitanProfile({ userId, encryptionKey }, callback)` - Real-time subscription
- `syncGuestTitanProfileToUser(guestProfile, userId, encryptionKey)` - Convert guest to user profile
- `saveGuestTitanProfile(profile)` - Save guest-mode profile (localStorage)

### actions.ts (Action Handlers)
**File:** `/src/modules/titan/services/actions.ts`

**Registered Actions:**
```
update_titan_profile     - Merge profile patch, timestamp update
update_routine           - Add/update weekly routines (merge by weekday)
commit_biomarker         - Record biomarker (delegates to Soma)
parse_lab_report         - Extract structured lab data
issue_clearance          - Grant/deny/conditional activity clearance
analyze_medical_image    - Analyze medical documents
sync_vitals              - Sync NSV vitals (biological, emotional)
self_clearance_check     - Evaluate readiness for activity
parse_health_report      - Parse health records into profile fields
parse_workout_log        - Parse workout data
parse_biometric_data     - Parse biometric readings
log_sleep                - Log sleep entry
create_cycle             - Create training/supplement cycle
advance_cycle_phase      - Progress cycle to next phase
complete_cycle           - Mark cycle complete
log_workout_session      - Log completed workout with exercise detail
suggest_field            - Suggest custom biomarker field
create_field             - Create custom tracked field
delete_field             - Delete custom tracked field
```

---

## 🤖 AI Prompt & System Instructions

### Session Modes
```typescript
export type TitanSessionMode = 'training' | 'medical' | 'diagnosis';

export type TitanContextMode =
  | { kind: 'general' }
  | { kind: 'routine-edit'; routine: Routine }
  | { kind: 'field-crud'; currentExtensions: FieldDefinition[] }
  | { kind: 'biomarker-review'; biomarkers: Record<string, unknown> };
```

### Master TITAN_PERSONA (520 lines)

**Core Identity:**
```
You are TITAN, the Physical Authority within the Neural Sanctuary system.
Your role is to govern physical readiness, training optimization, recovery management, and
biological resilience. You are the gatekeeper of high-intensity work — you do not allow
ambition to override physiology.
```

**Internal Monologue (Mandatory):**
```
<thought>
Readiness_Check: [Current composite readiness? Green/Amber/Red and why.]
Cross_Module_Signals: [Agnes stress? Atlas focus? Soma CNS? Ledger friction?]
Session_Context: [What is the user trying to accomplish?]
Risk_Assessment: [Injury/overtraining/hormonal risks?]
Prescription: [Most optimal intervention given all signals?]
</thought>
```

### Session Mode: TRAINING

**Focus:** Workout planning, exercise guidance, nutrition, recovery management

**Available Actions:**
- `update_titan_profile` - Update profile patch
- `update_routine` - Add/update routines
- `log_sleep` - Log sleep entry
- `create_cycle` - Create training/supplement cycle
- `advance_cycle_phase` - Progress cycle
- `complete_cycle` - Mark cycle complete
- `log_workout_session` - Log completed workout
- `self_clearance_check` - Check readiness for activity

**Routine Instructions:**
- Propose 7-day plan as daily entries (one per weekday)
- Include: weekday, timeframe "daily", status "active", rationale, exercises[]
- Exercises: name, sets, reps, notes
- Factor in medical conditions, medications, clearances

### Session Mode: MEDICAL

**Focus:** Biomarker interpretation, lab review, clearance decisions

**Medical Disclaimer:**
- NEVER provide diagnoses, prescribe meds, or recommend dosage changes
- NEVER fabricate biomarker values or lab results
- Be conservative on clearance (conditional when in doubt)
- Prefer observations over speculation
- For emergencies: instruct immediate local emergency care

**Available Actions:**
- `commit_biomarker` - Record biomarker
- `parse_lab_report` - Extract lab data
- `issue_clearance` - Grant/deny/conditional clearance
- `analyze_medical_image` - Analyze medical documents
- `compute_readiness` - Compute readiness score
- `create_field` - Create custom biomarker field
- `delete_field` - Delete custom biomarker field

### Session Mode: DIAGNOSIS

**Focus:** Analyze uploaded documents, extract structured biomarker data

**Document Analysis:**
1. Analyze document first—cite specific page numbers and values
2. Extract measurable biomarkers, flag out-of-range values
3. After doc-only analysis, offer to include base health context
4. Once biomarkers identified, offer to commit them
5. Use `parse_lab_report` for structured findings

**Available Actions:**
- `parse_lab_report`
- `parse_health_report`
- `analyze_medical_image`
- `commit_biomarker`
- `issue_clearance`

### TITAN_VARIANTS (Persona Overlays)

**performance** - High-performance coaching mode
- Maximal adaptation stimulus focus
- Readiness confirmed green
- No conservative prescriptions without data

**recovery** - Recovery management mode
- Parasympathetic activation
- Gentle, restorative prescriptions
- Focus on biological debt repayment

**medical** - Medical review mode
- Interpret labs, HRV, biometric data
- Flag findings outside normal athletic range
- Coach reviewing data, not clinician making diagnoses

**onboarding** - Neural Link Initialization
- Establish baseline physical profile
- Gather information naturally, one domain at a time
- Build profile baseline carefully

---

## 📝 File Path Reference

### Core
- `/src/modules/titan/TitanPage.tsx` - Main page/orchestrator
- `/src/modules/titan/personas.ts` - TITAN_PERSONA + TITAN_VARIANTS
- `/src/modules/titan/utils.ts` - Utilities

### Prompts
- `/src/modules/titan/prompts/ai-titan-personas.ts` - Dynamic persona builder
- `/src/modules/titan/prompts/titan-session-prompt.ts` - Session prompt builder
- `/src/modules/titan/prompts/titan-onboarding-prompt.ts` - Onboarding prompt

### Components
- `/src/modules/titan/components/TitanReadiness.tsx` - Readiness dashboard
- `/src/modules/titan/components/WorkoutSessionLogger.tsx` - Session logging
- `/src/modules/titan/components/RoutineBuilder.tsx` - Routine editor (70+ templates)
- `/src/modules/titan/components/SleepTracker.tsx` - Sleep logging
- `/src/modules/titan/components/CycleManager.tsx` - Cycle tracking
- `/src/modules/titan/components/RestPeriodCalculator.tsx` - Rest recommendations
- `/src/modules/titan/components/TitanRoutinePanel.tsx` - Routine manager
- `/src/modules/titan/components/RoutineProgress.tsx` - Adherence tracking
- `/src/modules/titan/components/TitanDiagnosisPanel.tsx` - Medical diagnosis
- `/src/modules/titan/components/CustomFieldManager.tsx` - Custom biomarker fields

### Services
- `/src/modules/titan/services/titan-profile-service.ts` - Profile persistence
- `/src/modules/titan/services/actions.ts` - Action handlers

### Onboarding
- `/src/modules/titan/onboarding/TitanOnboarding.tsx` - Onboarding flow
- `/src/modules/titan/onboarding/intake-accumulator.ts` - Intake accumulator

### Diagnosis
- `/src/modules/titan/diagnosis/titan-diagnosis-prompt.ts` - Diagnosis prompt
- `/src/modules/titan/diagnosis/titan-diagnosis-spec.ts` - Spec registration
- `/src/modules/titan/diagnosis/titan-diagnosis-merge.ts` - Result merging
- `/src/modules/titan/diagnosis/titan-diagnosis-extractor.ts` - Data extraction

### Types
- `/src/lib/types.ts` (lines 300–558) - TitanProfile & related types

---

## 🎯 Quick Start

1. **Onboarding a User**:
   - User selects privacy level (basic/complete)
   - AI guides through Nutrition → Activity → History → Routine Sync
   - Optional: Medical steps if complete privacy level selected

2. **Creating a Routine**:
   - RoutineBuilder component offers 70+ pre-templated exercises
   - User selects weekday, exercise names, sets/reps
   - Submit to Titan AI for validation & profile update

3. **Logging a Workout**:
   - WorkoutSessionLogger component
   - User selects routine, logs per-exercise performance
   - Titan AI validates & commits to profile

4. **Tracking Sleep**:
   - SleepTracker component
   - User logs bedtime, wake time, quality, tags
   - 14-day rolling history & trend analysis

5. **Managing Cycles**:
   - CycleManager component
   - Create supplement/workout/hormonal cycles with phases
   - Advance phases, complete cycles via Titan AI

6. **Checking Readiness**:
   - TitanReadiness dashboard shows current score
   - Green/Amber/Red status with recommendations
   - Gating mechanism for high-intensity activities

---

**End of Analysis**

For detailed code, see:
- `/tmp/titan_analysis.md` (Full comprehensive analysis)
- `/tmp/key_files.md` (Key file contents)
- Individual component files in `/src/modules/titan/`

