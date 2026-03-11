# AGNES TITAN & SOMA MODULE COMPREHENSIVE EXPLORATION

## EXECUTIVE SUMMARY

The Titan module is the **Physical Authority** of the Neural Sanctuary system, responsible for fitness coaching, biomarker tracking, recovery management, and medical clearance. Soma (biological readiness/biometrics) has been **absorbed into Titan** — both now operate from a unified Titan interface with a biomarkers tab.

- **Titan Files:** 26 TS/TSX files across components, services, prompts, diagnosis, onboarding, utils
- **Soma Files:** 22 TS/TSX files (mostly components & services, now mostly UI within Titan)
- **Total Lines:** ~6,000+ lines of TypeScript
- **Integration:** Dual-write pattern during migration; SomaProfile is sovereign but data is mirrored in TitanProfile
- **AI Integration:** useModuleAI hook with system prompts for 'training', 'medical', 'diagnosis' modes
- **NSV Ownership:** Titan owns 4 biological metrics; Soma owns none (absorbed)

---

## 1. TITAN MODULE STRUCTURE

### Root Directory: `/src/modules/titan/`

#### **A. Entry Point: TitanPage.tsx** (454 lines)
**Purpose:** Main page layout, tab management, profile loading, AI integration
**Key Features:**
- 6-tab system: Training | Biomarkers | Recovery | Sleep | Cycles | Diagnosis
- Soma→Titan profile merge (biomarkers/recovery tabs pull from SomaProfile)
- useModuleAI integration with mode-aware prompts ('training' vs 'medical')
- Spine event listeners for Agnes stress signals (COMPOUND_STRESS, BURNOUT_WARNING) → auto-suggest deload
- Handles tab routing via URL params (?tab=biomarkers)
- Profile sync via UnifiedModulePage wrapper

**Key Exports:**
- `TitanContent` — renders tabs + AI chat
- `TitanPage` — wraps in UnifiedModulePage for profile lifecycle

#### **B. Core Services:**

##### **`services/titan-profile-service.ts`** (150+ lines)
**Purpose:** Profile load/save/subscribe with E2E encryption
- `createEmptyTitanProfile()` — defaults with empty nested objects
- `normalizeTitanProfile(raw)` — sanitizes & bounds arrays (biomarkers ≤200, clearances ≤100)
- `loadTitanProfile({ userId, encryptionKey })` — returns TitanProfile or null
- `subscribeTitanProfile(ctx, onUpdate)` — realtime subscription
- `saveTitanProfile(profile, ctx)` — encrypts & persists
- **Guest Mode:** loadGuestTitanProfile() from localStorage
- **Sync:** syncGuestTitanProfileToUser() for guest→user migration

##### **`services/actions.ts`** (613 lines)
**Purpose:** Registers all Titan + absorbed Soma AI actions with ActionHub
**Allowed Actions** (14 total):
```
update_titan_profile, update_routine, commit_biomarker, parse_lab_report,
issue_clearance, analyze_medical_image, sync_vitals, self_clearance_check,
parse_health_report, parse_workout_log, parse_biometric_data, log_sleep,
create_cycle, advance_cycle_phase, complete_cycle, log_workout_session
```

**Key Actions:**
- `update_titan_profile` — merges partial updates into profile
- `update_routine` — creates/updates weekly routines (one per weekday)
- `commit_biomarker` — delegates to SomaTitanDelegationService
- `issue_clearance` — issues medical clearance, emits Spine events
- `analyze_medical_image` — OCR/extraction of medical documents → biomarkers + lab summaries
- `sync_vitals` — updates NSV biological metrics (cnsFatigue, sleepQuality, recoveryScore, hormonalContext)
- `self_clearance_check` — reads recovery score from NSV + clearance rules, blocks training if needed
- `log_sleep` — records sleep entry with quality/duration/deep%/REM%/awakenings
- `create_cycle` — creates periodization cycle with phases (Accumulation, Deload, Taper, Peak)
- `log_workout_session` — records actual vs planned performance (exercises, sets, reps, RPE)

#### **C. Prompts:**

##### **`prompts/titan-onboarding-prompt.ts`** (80 lines)
**Purpose:** System prompt for onboarding intake collection
**Mode:** Conversational intake collection in 3 steps:
1. Nutrition (supplements, macros, meal timing)
2. Physical Data (workouts/week, activity level, sleep, recovery)
3. History & Goals (training years, injuries, body comp targets)

**Output Actions:**
- `update_titan_profile` — incremental field updates
- `focus_nutrition/physical_data/history_goals` — UI focus directives
- `complete_titan_onboarding` — marks intake complete

##### **`prompts/titan-session-prompt.ts`** (100+ lines)
**Purpose:** Generates mode-aware system prompts
**Modes:**
- **training** (default) — strength/conditioning/recovery coaching
- **medical** — biomarker analysis, clearance review
- **diagnosis** — lab/medical document interpretation

**Context Injected:**
- routines (formatted as "weekday: N exercises")
- biomarkers (last 10, formatted "name: value unit (source, date)")
- clearances (last 5, formatted "activity: STATUS — reason (issued)")
- sleep logs
- cycles (active + recent)
- recovery score from NSV
- hormonal context from NSV

**Actions Allowed Per Mode:**
- general: all 16 allowed actions
- routine-edit: only update_routine
- field-crud: suggest_field, create_field, delete_field
- biomarker-review: commit_biomarker, parse_lab_report, parse_biometric_data

##### **`prompts/ai-titan-personas.ts`** — not viewed (companion to personas.ts)

##### **`personas.ts`** (217 lines)
**TITAN_PERSONA (core):**
- Identity: Physical Authority, veteran strength coach
- Domains: strength, conditioning, recovery, sleep, hormones, injury prevention, periodization
- **Cross-Module Awareness:**
  - High Agnes stress + low resilience → scale back intensity, prioritize parasympathetic work
  - High CNS fatigue (Soma > 7) → enforce rest or active recovery only
  - Low Atlas focus → substitute complex movements with simpler variants
  - High Ledger friction → note as recovery-compressing factor
  - Soma clearance gates high-intensity training
- **Readiness Scoring (0–10):**
  - GREEN (7–10): train as planned
  - AMBER (4–6): modify session, reduce volume 20–30%
  - RED (0–3): active recovery or rest only
- **NSV Outputs:**
  - biological.cnsFatigue, biological.sleepQuality, biological.recoveryScore
  - cognitive.energyBudget, cognitive.focusScore
- **Internal Monologue:** `<thought>` blocks for readiness checks, risk assessment, prescriptions
- **Behavioral Principles:**
  - Progressive overload (10% rule, no simultaneous volume+intensity increases)
  - Deload recognition (≥3 weeks fatigue or sleep decline)
  - Fatigue warnings (acute:chronic ratio > 1.3 yellow, > 1.5 red)
  - Data first (HRV, sleep, CNS metrics override subjective "I feel fine")
  - No motivation theater — precision earns trust
- **Session Types:** Strength (≥ readiness 6), Conditioning (≥ readiness 4), Mobility (always), Recovery, Hybrid
- **Safety Boundaries:**
  - Medical escalation for cardiac/injury/illness symptoms
  - Eating disorder risk flags → route to Agnes
  - Overtraining syndrome (fatigue + performance decline + mood drop for >2 weeks) → professional eval
  - Supplement stacking warnings for hormonal/cardiac compounds

**TITAN_VARIANTS:**
- `performance` — maximal adaptation stimulus, push where data supports
- `recovery` — parasympathetic focus, gentle & restorative
- `medical` — biomarker data review mode, clinical precision
- `onboarding` — neural link initialization, structured baseline collection

#### **D. Onboarding System:**

##### **`onboarding/TitanOnboarding.tsx`** (400+ lines)
**Purpose:** Multi-step intake flow with privacy level gating
**Privacy Levels:**
- `basic` — surface-level, non-intrusive questions
- `complete` — include intimate/biological questions (menstrual cycle, sex life, gender-dependent factors)

**Step Sequence:**
1. **TRAINER_STEPS** (4 steps): Nutrition → Activity → History & Goals → Sync
2. **MEDICAL_STEPS** (5 steps): Health Gate → Conditions → Medications → Allergies → Consent

**Features:**
- GuidedChatIntake + NexusChat for conversational collection
- Fast-track validation (detect sufficient data early)
- Protocol violation counter (if user refuses sections too many times)
- Global base context sync (name, pronouns, occupation, typical sleep hours)
- Medical disclaimer acknowledgment
- NSV calibration prompts for missing metrics

##### **`onboarding/intake-accumulator.ts`** (200+ lines)
**Purpose:** Incremental accumulation of intake data from chat messages
**Accumulator Schema:**
```typescript
TitanIntakeAccumulator = {
  nutrition: { dietNotes?, supplements[], calories?, proteinGrams?, carbGrams?, fatGrams?, mealsPerDay? }
  activity: { activityLevel?, workoutsPerWeek?, sleepHours?, dayToDayNotes?, occupation? }
  history: { yearsTraining?, injuries[], goals[], bodyGoals? }
  summary?: string
  routines: Routine[]
  lastUpdatedAt: string
}
```

**Key Functions:**
- `normalizeTitanProfilePatch(input)` — coerces input into valid TitanProfile patch
- `appendFromUserMessage(accumulator, message)` — extract data from user text
- `appendProfilePatch(accumulator, patch)` — merge AI-extracted data
- `toProfilePatchFromAccumulator(acc)` — convert to TitanProfile partial
- `getMissingSectionsFromAccumulator(acc)` — identify incomplete sections

#### **E. Diagnosis System:**

##### **`diagnosis/titan-diagnosis-spec.ts`** (49 lines)
**Purpose:** DiagnosisSpecialization for document analysis
**Spec Details:**
- Module ID: 'titan'
- Label: 'Medical Analysis'
- Supported Files: PDF, PNG, JPEG, WebP, CSV, TXT, Markdown
- Allowed Actions: parse_lab_report, parse_health_report, analyze_medical_image, commit_biomarker, issue_clearance
- Theme Color: orange
- Empty State Examples: "I have persistent headaches", "Analyze my blood panel", "Compare to previous labs"

##### **`diagnosis/titan-diagnosis-prompt.ts`** — builds diagnosis-mode system prompt
##### **`diagnosis/titan-diagnosis-extractor.ts`** — extracts structured data from documents
##### **`diagnosis/titan-diagnosis-merge.ts`** — merges extracted data into TitanProfile

#### **F. Components** (10 files, ~100+ lines each):

| Component | Purpose |
|-----------|---------|
| `TitanReadiness.tsx` | Dashboard with CNS Load, Resilience, Sleep REC, BIO SYNC metrics |
| `TitanRoutinePanel.tsx` | Manage weekly routines, analyze, generate plans |
| `RoutineBuilder.tsx` | Manual routine construction UI |
| `WorkoutSessionLogger.tsx` | Log actual workout performance (sets, reps, RPE) |
| `RoutineProgress.tsx` | Volume analytics (weekly/monthly load trends) |
| `SleepTracker.tsx` | Sleep log visualization + AI analysis |
| `CycleManager.tsx` | Periodization cycle creation & phase progression |
| `CyclePhase.tsx` (implied) | Individual cycle phase details |
| `CustomFieldManager.tsx` | Custom tracking fields (nutrition, biomarkers, performance) |
| `RestPeriodCalculator.tsx` | Rest day recommendations |
| `TitanDiagnosisPanel.tsx` | Diagnosis document upload & analysis |

#### **G. Utilities:**

##### **`utils.ts`** (63 lines)
**Functions:**
- `getTodayWeekday()` — returns current day name (monday, etc.)
- `getTodayIso()` — returns YYYY-MM-DD
- `normalizeRoutines(raw)` — validate routine structure
- `mergeTitanProfile(base, patch)` — deep merge for profile updates

---

## 2. SOMA MODULE STRUCTURE (ABSORBED INTO TITAN)

### Root Directory: `/src/modules/soma/`

**Status:** Soma has been **absorbed into Titan** operationally. It retains:
- Sovereign SomaProfile Firestore collection
- Specialized services (biomarker handling, clearance logic)
- Duplicated types in soma/types.ts
- Legacy SomaPage redirect to /titan?tab=biomarkers

### A. Entry Point & Page:

#### **`SomaPage.tsx`** (92 lines)
**Purpose:** Standalone page (now primarily redirected from /soma route)
**Features:**
- Uses UnifiedModulePage wrapper
- Loads SomaProfile independently
- Builds system prompt in-page (SOMA_MEDICAL_DISCLAIMER + capabilities)
- Renders SomaDashboard component
- Currently serves as read-only health monitoring

#### **`README.md`** (254 lines)
Comprehensive documentation covering:
- Component overview (6 components listed)
- Data types (SomaProfile, VitalReading, PhysicalAssessment)
- Features (readiness score algorithm, AI insights, visualization)
- Integration patterns (DynamicFormBuilder, viz components, E2EE)
- Success criteria & next steps

### B. Core Services:

#### **`services/soma-profile-service.ts`** (150+ lines)
**Purpose:** Profile CRUD with E2E encryption (mirrors titan-profile-service.ts)
- `createEmptySomaProfile(userId)` — initialization
- `normalizeSomaProfile(userId, raw)` — sanitization & bounding
- `loadSomaProfile({ userId, encryptionKey })` — load from Firestore
- `saveSomaProfile(profile, { userId, encryptionKey })` — persist encrypted
- `subscribeSomaProfile(ctx, onUpdate)` — realtime subscription
- `syncGuestSomaProfileToUser()` — placeholder (not yet implemented)

#### **`services/soma-data-service.ts`** (80+ lines viewed)
**Purpose:** Cross-module health API (singleton)
**Features:**
- In-memory cache (CACHE_TTL_MS = 60s)
- Deduplicates concurrent loads
- `toHealthSnapshot(profile)` — converts SomaProfile to read-only snapshot
- `getHealthSnapshot(userId, encryptionKey)` — returns SomaHealthSnapshot

#### **`services/clearance-service.ts`** (not fully viewed, inferred from usage)
**Purpose:** Medical clearance logic
- `evaluate(profile, activity)` — returns { status, reason }
- Checks recovery score, CNS fatigue, sleep quality
- Integrates with NSV signals

#### **`services/lab-import-service.ts`** (referenced but not viewed)
**Purpose:** Lab file parsing

### C. Prompts:

#### **`prompts/soma-prompt-builder.ts`** (100+ lines viewed)
**Purpose:** Builds biomedical system prompts
**Context Modes:**
- biomarker-review — analyze trends, explain lab values
- recovery-analysis — readiness scoring, recovery recommendations
- field-crud — extension field management

**Medical Disclaimer (mandatory):**
```
⚠ MEDICAL DISCLAIMER
This AI provides general health information and data analysis only.
It is NOT medical advice and does NOT constitute professional diagnosis...
```

**Capabilities:**
- Analyze biomarker trends & flag notable changes
- Explain lab values in plain language with reference ranges
- Correlate biomarkers to surface patterns
- Suggest areas for doctor discussion
- Extract data from lab reports & medical images

### D. Field System:

#### **`field-templates.ts`** (460 lines)
**Purpose:** Pre-built extension field suggestions for health tracking
**Field Categories:**
```
vitals, hormones, metabolic, general
```

**Example Fields:**
- cortisol-level (ng/dL, normal 6–23)
- testosterone-level (ng/dL, normal 300–1000)
- thyroid-tsh (mIU/L, normal 0.4–4.0)
- iron-ferritin (ng/mL, normal 24–336)
- blood-glucose (mg/dL, normal 70–100)

**Limits:**
- Max 25 extension fields per user
- LLM is sole domain validator
- Structural validation via SchemaRegistry

#### **`types.ts`** (51 lines)
**Purpose:** Type definitions for Soma module
**Exports:**
- `SomaProfile` — re-export from @/lib/types
- `SomaHealthSnapshot` — read-only cross-module view
- `SomaReadinessInput` — inputs for readiness scoring
- Sub-types: BiomarkerRecord, ClearanceRecord, LabSummaryRecord, MedicalImageAnalysis

### E. Actions:

#### **`actions/soma-field-actions.ts`** (80+ lines viewed)
**Purpose:** Soma-specific action registration & spine events
**Spine Events:**
```
SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED,
SOMA_FIELD_CREATED/UPDATED/DELETED, SOMA_VITAL_LOGGED, SOMA_LAB_REPORT_PARSED,
SOMA_PROFILE_UPDATED
```

**Readiness Weights:**
- Vitals (40%) — heart rate proximity to 60 bpm
- Sleep (30%)
- Energy (20%)
- Stress (10%)

### F. Components (9 files):

| Component | Purpose |
|-----------|---------|
| `SomaDashboard.tsx` | Main health dashboard (vitals, assessments, history, AI panel) |
| `SomaViewSwitcher.tsx` | Tab navigation (Dashboard, Vitals, Assessments, History) |
| `VitalsEntryForm.tsx` | Quick vitals input (HR, BP, temp, SpO2, weight) |
| `PhysicalAssessmentForm.tsx` | Strength/flexibility/endurance assessment input |
| `BiometricHistory.tsx` | Timeline view of vitals + assessments |
| `CollapsibleAIPanel.tsx` | AI-powered health insights (readiness, risk alerts, recovery suggestions) |
| `BiomarkerDashboard.tsx` | Biomarker display + trend charts |
| `BiomarkerCharts.tsx` | Trend visualization (time series) |
| `ClearanceStatus.tsx` | Medical clearance requirements checklist |
| `ClearancePanel.tsx` | Clearance issuance UI |

---

## 3. TITAN/SOMA INTEGRATION PATTERNS

### A. Dual-Write Phase (Path C+)
**Current State:** SomaProfile is independent; TitanProfile mirrors medical fields during migration
- SomaProfile owns: knownConditions, medications, allergies, biomarkers, labSummaries, clearances, medicalImageAnalyses, medicalSummary
- TitanProfile "absorbs" these fields for backward compatibility
- Both are writable; reads prefer SomaProfile when available (see TitanPage medicalProfile merge)

**Example Merge (TitanPage.tsx lines 71–84):**
```typescript
const medicalProfile = useMemo((): TitanProfile | null => {
  if (!profile) return null;
  if (!somaProfile) return profile;
  return {
    ...profile,
    knownConditions: somaProfile.knownConditions.length ? somaProfile.knownConditions : profile.knownConditions,
    biomarkers: somaProfile.biomarkers.length ? somaProfile.biomarkers : profile.biomarkers,
    // ... etc for medications, allergies, labSummaries, clearances
  };
}, [profile, somaProfile]);
```

### B. LLM Integration (useModuleAI)

#### **System Prompt Selection:**
- **Training Tab** → mode: 'training' → TITAN_PERSONA + optional TITAN_VARIANTS[session]
- **Biomarkers/Recovery Tab** → mode: 'medical' → TITAN_PERSONA + SOMA_MEDICAL_DISCLAIMER + biomarker context
- **Diagnosis Tab** → mode: 'diagnosis' → buildTitanDiagnosisPrompt

#### **Context Injection:**
- TitanPage passes profile + NSV signals (recoveryScore, hormonalContext) to buildTitanSessionPrompt
- Session prompt includes recent routines, biomarkers, clearances, cycles, sleep logs
- Mode-aware action restrictions (TITAN_ALLOWED_ACTIONS per context)

### C. Spine Event Bus Integration

#### **Cascade Rules (cascade-rules.ts):**
1. **Agnes → Titan Stress Cascades:**
   - COMPOUND_STRESS (stressLoad ≥ 8) → auto-suggest deload
   - BURNOUT_WARNING (cnsFatigue ≥ 8 + resilience ≤ 3) → block high-intensity + flatten energy wave

2. **Titan → Atlas Cascades:**
   - BLOCK_HIGH_INTENSITY → FLATTEN_ENERGY_WAVE (focus reduction during recovery)
   - CLEARANCE_DENIED → BLOCK_HIGH_INTENSITY

#### **Titan Event Emissions:**
- `CLEARANCE_GRANTED` / `CLEARANCE_DENIED` — medical clearance decision
- `BLOCK_HIGH_INTENSITY` — CNS fatigue threshold exceeded
- `MEDICAL_ALERT` — severe flags in medical image analysis
- `MODULE_DELEGATED` — biomarker or clearance handed to Soma

### D. NSV (Neural State Vector) Integration

#### **Titan NSV Ownership:**
Titan owns **4 biological metrics**:
```
biological.cnsFatigue (0–10)
biological.sleepQuality (0–10)
biological.recoveryScore (0–10)
biological.hormonalContext (string, e.g., "luteal phase")
```

#### **NSV Read Permissions (Titan):**
Reads all its own metrics PLUS:
```
emotional.emotionalResilience (from Agnes)
emotional.stressLoad (from Agnes)
emotional.moodTrend (from Agnes)
cognitive.energyBudget (from Atlas)
```

#### **NSV Update Mechanisms:**
1. **sync_vitals action** — Titan AI emits biological metrics
2. **log_sleep action** — records sleep entry, syncs sleepQuality to NSV
3. **log_workout_session** — records session, updates recovery estimates

### E. Data Flow: Medical Image Analysis
```
1. User uploads file (PDF, image, CSV) to TitanDiagnosisPanel
2. LLM receives: buildTitanDiagnosisPrompt(profile, contextPolicy, extractedData)
3. LLM emits: analyze_medical_image action with:
   - biomarkers[] (extracted values)
   - labSummaries[] (parsed test results)
   - medications[] (identified drugs)
   - allergies[] (flagged contraindications)
   - clinicalFlags[] ({ flag, severity })
4. Titan action handler:
   a. Creates MedicalImageAnalysis record
   b. Appends biomarkers to profile.biomarkers
   c. Delegates biomarkers to SomaTitanDelegationService.commitBiomarker()
   d. Emits MEDICAL_ALERT if severe flags found
   e. Emits MODULE_DELEGATED to Spine
```

---

## 4. ONBOARDING FORMS & INTAKE FIELDS

### A. Titan Onboarding Sections

**Privacy-Gated:**
- `basic` — General fitness data only
- `complete` — Includes biology (menstrual cycle, sexual function, hormonal context)

#### **Trainer Phase (4 steps):**

1. **Nutrition Intake**
   - Fields: dietNotes, supplements[], calories, proteinGrams, carbGrams, fatGrams, mealsPerDay
   - Actions: update_titan_profile

2. **Physical Data**
   - Fields: activityLevel, workoutsPerWeek, sleepHours, dayToDayNotes, occupation
   - Conditional: menstrual cycle (if complete privacy level + female)
   - Actions: focus_physical_data

3. **History & Goals**
   - Fields: yearsTraining, injuries[], goals[], bodyGoals
   - Actions: focus_history_goals

4. **Sync**
   - Finalizes profile
   - Actions: complete_titan_onboarding

#### **Medical Phase (5 steps, optional):**

1. **Health Gate** — opt-in to medical tracking
2. **Conditions** — knownConditions[]
3. **Medications** — medications[]
4. **Allergies** — allergies[]
5. **Consent** — acknowledge medical disclaimer

### B. Custom Tracking Fields (CustomFieldManager.tsx)

**Categories:**

#### **Nutrition Tracker**
```
customMeal_breakfast (TEXTAREA)
customMeal_lunch (TEXTAREA)
customMeal_dinner (TEXTAREA)
dailyWaterIntake (NUMBER, 0–300 oz)
proteinGoal (NUMBER, 0–500 g)
calorieGoal (NUMBER, 0–10000)
```

#### **Custom Biomarkers**
```
customBiomarker_glucose (NUMBER, mg/dL)
customBiomarker_bloodPressure (TEXTAREA)
customBiomarker_weight (NUMBER, kg)
customBiomarker_bloodOxygen (NUMBER, %)
customBiomarker_heartRate (NUMBER, bpm)
```

#### **Performance Metrics**
```
performanceMetric_vo2Max (NUMBER)
performanceMetric_maxBench (NUMBER)
performanceMetric_verticalJump (NUMBER)
performanceMetric_muscleUpReps (NUMBER)
```

#### **Recovery Markers**
```
recoveryMarker_soreness (NUMBER, 0–10)
recoveryMarker_mood (NUMBER, 0–10)
recoveryMarker_motivation (NUMBER, 0–10)
recoveryMarker_injury (TEXTAREA)
```

---

## 5. TRACKING & LOGGING FEATURES

### A. Workout Session Logging

#### **Data Structure (WorkoutSession):**
```typescript
{
  id: string
  routineId: string
  routineName: string
  date: YYYY-MM-DD
  startedAt: ISO timestamp
  completedAt: ISO timestamp
  rpe: 1–10 (Rate of Perceived Exertion)
  notes: string
  status: 'completed' | 'abandoned' | 'modified'
  exercises: ExerciseLog[]
}

ExerciseLog = {
  exerciseId: string
  name: string
  plannedSets: number
  plannedReps: string
  completedSets: ExerciseSet[]
}

ExerciseSet = {
  setNumber: number
  weight: number (kg)
  repsCompleted: number
  completed: boolean
}
```

#### **Logging Flow:**
1. WorkoutSessionLogger component builds structured prompt
2. User enters: exercise sets, weight, reps completed, RPE (1–10), notes
3. Prompt sent to Titan: "I just completed my [day] workout..."
4. Titan action: `log_workout_session` validates & commits
5. Updates profile.workoutSessions (max 365 entries)
6. Syncs recovery estimates to NSV

### B. Sleep Tracking

#### **Data Structure (SleepEntry):**
```typescript
{
  id: string
  date: YYYY-MM-DD
  bedtime: HH:MM (optional)
  wakeTime: HH:MM (optional)
  durationHours: 0–24
  quality: 0–10
  deepSleepPct: 0–100 (optional, from wearable)
  remSleepPct: 0–100 (optional, from wearable)
  awakenings: number (optional)
  tags: string[] (e.g., ["stress", "caffeine", "alcohol"])
  notes: string
  recordedAt: ISO timestamp
}
```

#### **Logging Flow:**
1. SleepTracker component with form or manual entry
2. User enters: date, duration, quality, sleep stages, awakenings, tags, notes
3. Titan action: `log_sleep` validates (duration 0–24h, quality 0–10)
4. Updates profile.sleepLog (max 365 entries)
5. Syncs quality to NSV: `biological.sleepQuality = entry.quality`

### C. Periodization Cycles

#### **Data Structure (CycleEntry):**
```typescript
{
  id: string
  name: string (e.g., "Strength Block", "Competition Prep")
  type: 'training' | 'recovery' | 'competition'
  description: string
  startDate: YYYY-MM-DD
  status: 'active' | 'completed' | 'paused'
  phases: CyclePhase[]
  notes: string
  createdAt: ISO timestamp
  updatedAt: ISO timestamp
}

CyclePhase = {
  id: string
  name: string (e.g., "Accumulation", "Deload", "Taper", "Peak")
  durationDays: number
  startDate: YYYY-MM-DD (computed)
  endDate: YYYY-MM-DD (computed)
  focusAreas: string[] (e.g., ["strength", "conditioning"])
  rpe: 1–10 (rate of perceived exertion target)
  volumeTarget: number (weekly set volume)
  description: string
}
```

#### **Cycle Management:**
1. CycleManager UI: create cycle, add phases
2. Titan action: `create_cycle` registers periodization structure
3. Actions: `advance_cycle_phase`, `complete_cycle` for progression
4. Cycles inform readiness scoring & recovery recommendations

### D. Biomarker Tracking

#### **Data Structure (BiomarkerRecord):**
```typescript
{
  id: string
  name: string (e.g., "Hemoglobin", "Cortisol", "VO2 Max")
  value: number | string
  unit: string (e.g., "mg/dL", "ng/dL", "mL/kg/min")
  source: 'wearable' | 'lab' | 'manual' | 'medical_image_analysis'
  recordedAt: ISO timestamp
}
```

#### **Recording Flow:**
1. Manual entry or wearable sync
2. Titan action: `commit_biomarker` or auto-delegation to SomaTitanDelegationService
3. Updates profile.biomarkers (max 200 entries)
4. Emits SOMA_BIOMARKER_COMMITTED Spine event

### E. Medical Clearance Tracking

#### **Data Structure (ClearanceRecord):**
```typescript
{
  id: string
  activity: string (e.g., "high_intensity", "olympic_lifting", "plyometrics")
  status: 'granted' | 'denied' | 'conditional'
  reason: string
  issuedAt: ISO timestamp
  expiresAt?: ISO timestamp
}
```

#### **Clearance Workflow:**
1. Titan AI evaluates: `self_clearance_check` action
2. Checks: recoveryScore ≥ 6, CNS fatigue ≤ 6, sleep quality, emotional resilience
3. Reads: SomaProfile clearances + knownConditions + medications
4. Issues: ClearanceRecord via `issue_clearance` action
5. Emits CLEARANCE_GRANTED or CLEARANCE_DENIED Spine event
6. CLEARANCE_DENIED triggers BLOCK_HIGH_INTENSITY cascade → Atlas FLATTEN_ENERGY_WAVE

---

## 6. SOMA VS. TITAN DOMAIN SPLIT

### **SOMA (Biological Authority)**
- **Medical Data Sovereignty:** knownConditions, medications, allergies, biomarkers, labSummaries, clearances, medicalImageAnalyses
- **Role:** Biomarker expert, lab interpreter, readiness scorer, clearance gatekeeper
- **Tone:** Objective, analytical, conservative, medically cautious
- **Scope:** "What does the biology tell us?"
- **NSV Ownership:** None (absorbed into Titan)
- **LLM Persona:** Health insights assistant, biomarker analyst
- **Key Actions:** parse_lab_report, analyze_medical_image, commit_biomarker, issue_clearance, compute_readiness
- **Read Permissions:** Reads its own medical data + Titan biological metrics + emotional context

### **TITAN (Physical Authority)**
- **Training Data Sovereignty:** routines, workoutSessions, sleepLog, cycles, nutrition
- **Role:** Coach, readiness gatekeeper, recovery optimizer, periodization designer
- **Tone:** Grounded, precise, performance-focused, no "bro coach"
- **Scope:** "What can the body handle today? How do we build adaptation?"
- **NSV Ownership:** biological.cnsFatigue, biological.sleepQuality, biological.recoveryScore, biological.hormonalContext
- **LLM Persona:** Elite strength coach, movement specialist, recovery expert
- **Key Actions:** update_routine, log_workout_session, log_sleep, create_cycle, sync_vitals
- **Read Permissions:** Reads all biological metrics (4 owned) + emotional (resilience, stress) + cognitive (energyBudget)
- **Cross-Domain Authority:**
  - Gates high-intensity training based on Soma clearance + NSV recovery score
  - Respects Agnes stress signals (cascade rules)
  - Coordinates with Atlas cognitive energy availability

### **Boundary Clarification:**

| Concern | Owner | Why |
|---------|-------|-----|
| "Do I have clearance for HIIT?" | **Titan** (reads Soma data) | Training gating decision |
| "What does my testosterone look like?" | **Soma** (owns biomarker data) | Medical data interpretation |
| "How should I structure my cycle?" | **Titan** | Training periodization expert |
| "Does my cortisol spike on leg day?" | **Soma** (owns biomarker) + **Titan** (owns session data) | Correlation analysis (both collaborate) |
| "Should I rest or train?" | **Titan** | Readiness decision |
| "Are my labs normal?" | **Soma** | Lab value interpretation |

---

## 7. AI AGENT PROMPTING & TOOLS

### A. System Prompt Architecture

#### **Titan Base Persona (TITAN_PERSONA, 217 lines):**
- Identity statement: "Physical Authority within the Neural Sanctuary"
- Coaching domains (8): Strength, Conditioning, Recovery, Sleep, Hormones, Injury Prevention, Periodization
- Cross-module awareness: Agnes stress → CNS fatigue → training intensity modulation
- NSV outputs: 4 biological metrics owned by Titan
- Internal monologue: `<thought>` blocks mandatory for every substantive response
- Behavioral principles (5): Progressive overload, deload recognition, fatigue warnings, data-first approach, no motivation theater
- Session types: Strength, Conditioning, Mobility, Recovery, Hybrid
- Safety boundaries: Medical escalation, eating disorder flags, overtraining detection
- Interaction protocols: Lead with data, be concise, ask one clarifying question, hold position on rest with evidence

#### **Variant Overlays:**
- `performance` — maximal stimulus, data-driven push
- `recovery` — parasympathetic activation, gentleness
- `medical` — biomarker precision, clinical reserve
- `onboarding` — warm but structured, sequential questioning

### B. Action Registry

**Titan's 14 Allowed Actions (from services/actions.ts):**

1. **`update_titan_profile`** — merge partial profile updates
   - Payload: Partial<TitanProfile> (nutrition, activity, history, routines, traits, etc.)

2. **`update_routine`** — create or replace weekly routines
   - Payload: { routines: Routine[] }
   - Merge logic: replace by weekday or append

3. **`commit_biomarker`** — record biomarker value
   - Delegates to SomaTitanDelegationService
   - Payload: { id, name, value, unit, source, recordedAt }

4. **`parse_lab_report`** — extract from medical documents
   - Payload: { id, panel, findings[], flags[] }
   - Creates LabSummaryRecord, appends to profile

5. **`issue_clearance`** — grant/deny medical clearance
   - Payload: { activity, status, reason }
   - Delegates to SomaTitanDelegationService
   - Emits Spine event: CLEARANCE_GRANTED or CLEARANCE_DENIED

6. **`analyze_medical_image`** — OCR + extraction of scans
   - Payload: { reportType, sourceLabel, biomarkers[], labSummaries[], medications[], allergies[], clinicalFlags[] }
   - Creates MedicalImageAnalysis, syncs to Soma

7. **`sync_vitals`** — update NSV biological metrics
   - Payload: { biological: { recoveryScore?, hormonalContext?, cnsFatigue?, sleepQuality? } }
   - Updates GlobalProjectionService NSV

8. **`self_clearance_check`** — read NSV + Soma clearances, block if needed
   - Payload: { activity }
   - Checks: recoveryScore ≥ 4, medical contraindications
   - Emits: BLOCK_HIGH_INTENSITY if denied

9. **`parse_health_report`** — generic health document parsing
   - Payload: { text, reportType }

10. **`parse_workout_log`** — import external training data
    - Payload: { text, routineName }

11. **`parse_biometric_data`** — process biometric CSV/JSON
    - Payload: { data, dataType }

12. **`log_sleep`** — record sleep entry
    - Payload: { date, bedtime?, wakeTime?, durationHours, quality, deepSleepPct?, remSleepPct?, awakenings?, tags?, notes? }
    - Syncs sleepQuality to NSV

13. **`create_cycle`** — start periodization cycle
    - Payload: { name, type, description, startDate, phases: [{ id, name, durationDays, ... }] }
    - Creates CycleEntry, appends to profile.cycles

14. **`log_workout_session`** — record actual workout performance
    - Payload: { routineId, routineName, date, startedAt, completedAt, rpe, status, exercises: [{ exerciseId, completedSets: [...] }], notes? }
    - Syncs recovery estimates to NSV

**Additional Actions** (implied but not in primary list):
- `advance_cycle_phase` — progress to next phase
- `complete_cycle` — finalize cycle
- `suggest_field` — suggest extension field
- `create_field` — add custom tracking field
- `delete_field` — remove custom tracking field

### C. Prompt Context Injection

**TitanPage.tsx buildTitanSessionPrompt() injects:**
- mode: 'training' | 'medical' | 'diagnosis'
- profile: TitanProfile
- recoveryScore: NSV biological.recoveryScore
- hormonalContext: NSV biological.hormonalContext

**Session prompt includes:**
- Recent routines (formatted)
- Last 10 biomarkers (name: value unit, source, date)
- Last 5 clearances (activity: STATUS — reason)
- Last 5 sleep logs
- Active cycles
- Latest workout sessions

### D. Mode-Aware Action Restriction

**TITAN_ALLOWED_ACTIONS (from titan-session-prompt.ts):**

```typescript
TITAN_ALLOWED_ACTIONS = {
  general: [
    'update_titan_profile', 'update_routine', 'commit_biomarker',
    'parse_lab_report', 'issue_clearance', 'analyze_medical_image',
    'sync_vitals', 'self_clearance_check', 'parse_health_report',
    'parse_workout_log', 'parse_biometric_data', 'log_sleep',
    'create_cycle', 'advance_cycle_phase', 'complete_cycle',
    'log_workout_session', 'suggest_field', 'create_field', 'delete_field'
  ],
  'routine-edit': ['update_routine'],
  'field-crud': ['suggest_field', 'create_field', 'delete_field'],
  'biomarker-review': ['commit_biomarker', 'parse_lab_report', 'parse_biometric_data']
}
```

**Enforcement:** useModuleAI silently filters out-of-scope actions

---

## 8. SPINE EVENT BUS INTEGRATION

### A. Cascade Rules Affecting Titan

**From cascade-rules.ts:**

#### **1. Stress-Driven Intensity Block**
```
Trigger: VITAL_UPDATED where cnsFatigue >= 8
Transform → BLOCK_HIGH_INTENSITY (target: titan, domain: B, priority: alert)
Effect: No loaded strength, no HIIT; enforce rest or mobility
```

#### **2. Burnout Warning**
```
Trigger: VITAL_UPDATED where cnsFatigue >= 8 AND emotionalResilience <= 3
Transform → BURNOUT_WARNING (target: orchestrator, domain: system, priority: critical)
Cascade → FLATTEN_ENERGY_WAVE (target: atlas, domain: C, priority: alert)
Effect: Critical burnout flag; Atlas reduces cognitive load
```

#### **3. Clearance-Driven Blocks (deprecated but active)**
```
Trigger: CLEARANCE_DENIED
Transform → BLOCK_HIGH_INTENSITY (target: titan)
Cascade → FLATTEN_ENERGY_WAVE (target: atlas)
Effect: Medical blocks + cognitive flattening
```

### B. Titan Event Emissions

**From services/actions.ts:**

#### **CLEARANCE_GRANTED / CLEARANCE_DENIED**
```javascript
Spine.emit({
  type: clearance.status === 'granted' ? 'CLEARANCE_GRANTED' : 'CLEARANCE_DENIED',
  source: 'titan',
  target: 'titan',
  domain: 'B',
  data: { activity, status, reason },
  priority: clearance.status === 'granted' ? 'info' : 'alert'
});
```

#### **BLOCK_HIGH_INTENSITY**
```javascript
Spine.emit({
  type: 'BLOCK_HIGH_INTENSITY',
  source: 'titan',
  domain: 'B',
  data: { activity, reason, recoveryScore, ... },
  priority: 'alert'
});
```

#### **MEDICAL_ALERT**
```javascript
Spine.emit({
  type: 'MEDICAL_ALERT',
  source: 'titan',
  domain: 'B',
  data: { alertCount, flags, reportType },
  priority: 'alert'
});
```

#### **MODULE_DELEGATED** (to Soma)
```javascript
Spine.emit({
  type: 'MODULE_DELEGATED',
  source: 'titan',
  target: 'soma',
  domain: 'B',
  data: { moduleId: 'titan', delegatedTo: 'soma', operation: 'commit_biomarker', biomarkerId, ... },
  priority: 'info'
});
```

### C. Spine Event Listeners in Titan

**From TitanPage.tsx (lines 109–130):**

#### **COMPOUND_STRESS Listener**
```typescript
useSpineEvent('COMPOUND_STRESS', useCallback((event) => {
  if (!profile?.onboardingComplete) return;
  const stressLoad = event.data?.stressLoad;
  const prompt = stressLoad >= 8
    ? `Agnes flagged critical stress (${stressLoad}/10). Recommend deload protocol...`
    : `Agnes flagged elevated stress. Should I scale back intensity?`;
  ai.handleSendMessage(prompt);
}, [profile?.onboardingComplete, ai.handleSendMessage]));
```

#### **BURNOUT_WARNING Listener**
```typescript
useSpineEvent('BURNOUT_WARNING', useCallback((event) => {
  if (!profile?.onboardingComplete) return;
  ai.handleSendMessage(
    'Agnes detected burnout. Reduce training volume immediately...'
  );
}, [profile?.onboardingComplete, ai.handleSendMessage]));
```

**Deduplication:** Uses handledSpineEventsRef Set to prevent duplicate processing of same event ID

---

## 9. GLOBAL SOUL & CROSS-MODULE STATE

### A. GlobalSoul Integration in Titan

**From TitanPage.tsx:**

```typescript
const { globalSoul } = useGlobalSoul();
const agentAlias = globalSoul?.displayNames?.titan || 'Titan';

// Build session prompt with NSV signals
const systemPrompt = useMemo(() => {
  if (!profile) return TITAN_PERSONA;
  return buildTitanSessionPrompt(profile, {
    mode: promptMode,
    recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
    hormonalContext: globalSoul?.crossFunctionalState?.biological?.hormonalContext ?? null,
  });
}, [profile, promptMode, globalSoul?.crossFunctionalState?.biological]);
```

### B. NSV Signals Consumed by Titan

**crossFunctionalState fields Titan reads:**

```typescript
biological: {
  cnsFatigue: 0–10,           // owned by Titan
  sleepQuality: 0–10,         // owned by Titan
  recoveryScore: 0–10,        // owned by Titan
  hormonalContext: string,    // owned by Titan
}
emotional: {
  emotionalResilience: 0–10,  // from Agnes
  stressLoad: 0–10,           // from Agnes
  moodTrend: string,          // from Agnes
}
cognitive: {
  energyBudget: 0–10,         // from Atlas
  focusScore: 0–10,           // from Atlas
  activeLoad: 0–10,           // from Atlas
  planningLoad: 0–10,         // from Atlas
}
```

### C. Readiness Dashboard (TitanReadiness.tsx)

**Metrics Displayed:**
```
CNS LOAD          → biological.cnsFatigue (from NSV)
RESILIENCE        → emotional.emotionalResilience (from NSV)
SLEEP REC         → biological.sleepQuality (from NSV)
BIO SYNC          → overallWellnessScore (derived)
```

**Metric Staleness Checking:**
- Uses NSV_DERIVED_METRICS and isMetricStale() helper
- Flags if last update > 7 days old
- Allows manual calibration via onCalibrate callback → NexusHandoffService

---

## 10. ARCHITECTURE PATTERNS & ODDITIES

### A. Key Patterns

#### **1. Dual-Write Transience (Migration Pattern)**
- SomaProfile is canonical for medical data
- TitanProfile mirrors it for backward compatibility
- Reads merge: "prefer Soma if populated, else Titan"
- Eventually Soma will be fully sovereign and TitanProfile medical fields deprecated

#### **2. Module Delegation (Titan→Soma)**
```typescript
// Titan receives biomarker action
commit_biomarker → SomaTitanDelegationService.commitBiomarker()
// Delegates to Soma, emits MODULE_DELEGATED Spine event
```

#### **3. Mode-Aware Prompting**
- Same module (Titan), different system prompts by active tab
- 'training' mode includes TITAN_PERSONA + coaching domains
- 'medical' mode includes SOMA_MEDICAL_DISCLAIMER + biomarker context
- Actions filtered per mode via TITAN_ALLOWED_ACTIONS

#### **4. Cascade-Driven Auto-Suggestions**
- Agnes emits COMPOUND_STRESS → Spine cascade rules trigger
- Spine routes to Titan → Titan receives event via useSpineEvent hook
- Titan auto-sends prompt to AI: "Agnes flagged stress, recommend deload"
- All without user interaction

#### **5. Readiness Gating**
- Titan checks recovery score + CNS fatigue before approving high-intensity
- Reads NSV for bio signals + Soma for medical clearances
- Emits BLOCK_HIGH_INTENSITY if conditions not met
- Cascades to Atlas to flatten cognitive energy

### B. Notable Oddities

#### **1. Soma Has No NSV Ownership**
- Soma owns no NSV metrics (array is empty: `soma: []`)
- All biological metrics are owned by Titan
- This means Soma is "read-only" from NSV perspective
- Soma can issue clearances but cannot directly update NSV

**Implication:** Soma is a data store for medical facts; Titan is the decision-maker

#### **2. TitanProfile "Absorbs" Soma Data**
- TitanProfile has deprecated medical fields (knownConditions, medications, biomarkers, etc.)
- Both are writable during migration
- No conflict resolution logic in place (last-write-wins)
- UI merge prefers Soma if populated, but this is one-way read, not sync-back

**Oddity:** If Titan writes biomarker AND Soma writes same field → undefined behavior

#### **3. Soma Page Still Exists But Redirects**
- `/soma` route redirects to `/titan?tab=biomarkers`
- `SomaPage.tsx` still renders (not deleted) but is redundant
- Confusion: Module manifest shows soma: { route: '/titan?tab=biomarkers', hasPage: false }
- Yet SomaPage.tsx is maintained

**Oddity:** Dead code or future use case?

#### **4. Medical Disclaimer Embedded in LLM Prompt**
- Not a UI banner but a system prompt injection
- Every medical-mode response includes disclaimer in context
- User doesn't see a checkbox; they see it in AI responses
- This is weaker than formal UI consent flow

**Issue:** Compliance/documentation might expect explicit user acknowledgment

#### **5. Clearance Logic Split Between Titan & Soma**
- `self_clearance_check` action in Titan reads Soma clearance records
- `issue_clearance` action in Titan writes to Soma via delegation
- But ClearanceService evaluation is in soma/services/clearance-service.ts
- Titan calls: `ClearanceService.evaluate(healthSnapshot, activity)`
- Circular dependency: Titan needs to know Soma logic to gate itself

#### **6. NSV Update Timing**
- `log_sleep` syncs to NSV immediately
- `log_workout_session` syncs recovery estimate immediately
- But buildTitanSessionPrompt reads stale NSV (last hydration)
- If AI emits action and then reads NSV, might use old values
- No re-hydration after action execution

#### **7. Cycle Phases but No Enforcement**
- CycleManager creates phases with durationDays
- But there's no "auto-advance" or "phase ended, move to next" logic
- User must manually call `advance_cycle_phase`
- Phases are informational, not prescriptive

#### **8. Custom Fields But No LLM Awareness**
- CustomFieldManager allows 3–4 categories of custom fields
- But no integration with LLM to validate relevance
- Prompt builder doesn't inject custom fields into system prompt
- User inputs custom fields, but AI doesn't see them

---

## 11. MISSING PIECES & FUTURE WORK

### A. Incomplete Features

1. **Soma Standalone Onboarding**
   - SomaPage renders, but only dashboard
   - No intake flow for medical data (conditions, meds, allergies)
   - SomaPage doesn't have TitanOnboarding equivalent

2. **Wearable Integration**
   - Soma README mentions Apple Health, Fitbit, Garmin
   - No implementation in current codebase
   - `lab-import-service.ts` exists but not fully implemented

3. **Cycle Auto-Progression**
   - Phases have durationDays, but system doesn't auto-advance
   - No calendar integration or reminders
   - Manual `advance_cycle_phase` action required

4. **Predictive Readiness**
   - Readiness scores are computed from current state
   - No time-series forecasting (e.g., "HRV will recover by Friday")
   - No ML-based recovery prediction

5. **Comparative Biomarker Analysis**
   - Titan can log biomarkers, but no trending/comparison UI
   - BiomarkerDashboard referenced but implementation unclear
   - No "flag abnormal trends" logic

6. **Recovery Prescription Engine**
   - Titan suggests deload, but no specific prescriptions (sauna? ice bath? massage?)
   - No integration with recovery modalities
   - No submittable recovery plans

7. **Field-CRUD Completeness**
   - suggest_field, create_field, delete_field actions defined
   - But UI for managing custom fields not complete
   - SchemaRegistry integration not fully wired

### B. Known Gaps

1. **Soma Medical Onboarding** — no intake for conditions/meds/allergies entry
2. **Wearable Data Sync** — Apple Health / Fitbit integration not implemented
3. **Biomarker Trending UI** — no chart for historical biomarker comparisons
4. **Automated Cycle Progression** — phases must be advanced manually
5. **Recovery Prescriptions** — suggestions but no detailed modality integration
6. **Custom Field LLM Integration** — custom fields not injected into prompts
7. **Medical Image OCR** — analyze_medical_image action exists, but OCR details unclear

---

## 12. FILE MANIFEST

### Titan Module (26 files)
```
src/modules/titan/
├── TitanPage.tsx (454 lines) — Main entry, tab management, profile sync
├── personas.ts (217 lines) — TITAN_PERSONA + variants
├── utils.ts (63 lines) — Utility functions for date, routines, merging
├── prompts/
│   ├── titan-onboarding-prompt.ts (80 lines) — Onboarding system prompt
│   ├── titan-session-prompt.ts (100+ lines) — Mode-aware session prompts
│   └── ai-titan-personas.ts — Companion to personas.ts
├── services/
│   ├── titan-profile-service.ts (150+ lines) — Profile CRUD + E2EE
│   └── actions.ts (613 lines) — All Titan actions + Soma delegations
├── onboarding/
│   ├── TitanOnboarding.tsx (400+ lines) — Multi-step intake UI
│   └── intake-accumulator.ts (200+ lines) — Incremental data accumulation
├── diagnosis/
│   ├── titan-diagnosis-spec.ts (49 lines) — Diagnosis specialization
│   ├── titan-diagnosis-prompt.ts — Diagnosis mode system prompt
│   ├── titan-diagnosis-extractor.ts — Document → structured data
│   └── titan-diagnosis-merge.ts — Merge extracted data
└── components/
    ├── TitanReadiness.tsx — Readiness dashboard (CNS, resilience, sleep, sync)
    ├── TitanRoutinePanel.tsx — Manage & analyze routines
    ├── RoutineBuilder.tsx — Manual routine construction
    ├── WorkoutSessionLogger.tsx — Log actual performance
    ├── RoutineProgress.tsx — Volume analytics
    ├── SleepTracker.tsx — Sleep log + analysis
    ├── CycleManager.tsx — Periodization cycles
    ├── CustomFieldManager.tsx — Custom tracking fields
    ├── RestPeriodCalculator.tsx — Rest recommendations
    └── TitanDiagnosisPanel.tsx — Medical document analysis
```

### Soma Module (22 files)
```
src/modules/soma/
├── SomaPage.tsx (92 lines) — Standalone page (redirects to Titan)
├── types.ts (51 lines) — Type definitions
├── README.md (254 lines) — Documentation
├── field-templates.ts (460 lines) — Extension field suggestions
├── prompts/
│   └── soma-prompt-builder.ts (100+ lines) — Biomedical system prompts
├── services/
│   ├── soma-profile-service.ts (150+ lines) — Profile CRUD + E2EE
│   ├── soma-data-service.ts (80+ lines) — Cross-module health API
│   ├── clearance-service.ts — Medical clearance evaluation
│   └── lab-import-service.ts — Lab file parsing
├── actions/
│   └── soma-field-actions.ts (80+ lines) — Spine events & readiness scoring
├── diagnosis/
│   └── soma-diagnosis-merge.ts — Merge extracted medical data
└── components/
    ├── SomaDashboard.tsx — Health dashboard (vitals, assessments, history, AI)
    ├── SomaViewSwitcher.tsx — Tab navigation
    ├── VitalsEntryForm.tsx — Vital signs input
    ├── PhysicalAssessmentForm.tsx — Performance assessments
    ├── BiometricHistory.tsx — Timeline view
    ├── CollapsibleAIPanel.tsx — AI health insights
    ├── BiomarkerDashboard.tsx — Biomarker display
    ├── BiomarkerCharts.tsx — Trend charts
    └── ClearanceStatus.tsx — Clearance requirements checklist
    └── ClearancePanel.tsx — Clearance issuance UI
    └── index.ts — Component exports
```

### Cross-Module Integration (in `/src/lib/`)
```
src/lib/
├── services/
│   ├── soma-titan-delegation-service.ts — Titan→Soma delegation
│   ├── nsv-ownership.ts — Metric ownership & permissions
│   ├── global-projection-service.ts — NSV updates
│   └── intake-base-context-service.ts — Global onboarding context
├── spine/
│   ├── cascade-rules.ts — Event transformation rules
│   └── spine-event-bus.ts — Event emitter & listener
├── hooks/
│   └── use-module-ai.ts — useModuleAI hook for modules
├── module-manifest.ts — Module metadata (Titan + Soma entries)
└── types.ts — TitanProfile, SomaProfile, NSV types
```

---

## 13. SUMMARY TABLE

| Aspect | Titan | Soma |
|--------|-------|------|
| **Purpose** | Physical performance coaching | Biomarker tracking & medical authority |
| **Data Owner** | routines, workouts, sleep, cycles, nutrition | biomarkers, clearances, lab summaries, conditions |
| **NSV Ownership** | 4 metrics (cnsFatigue, sleepQuality, recoveryScore, hormonalContext) | 0 (absorbed into Titan) |
| **Routing** | /titan (main page) | /soma → /titan?tab=biomarkers (redirect) |
| **Onboarding** | 9-step (trainer + medical) | None (absorbed into Titan) |
| **AI Modes** | training, medical, diagnosis | Embedded in Titan medical mode |
| **Core Actions** | 14 registered | 0 (delegated to Titan) |
| **Components** | 10+ UI panels | 10 panels (mostly dashboard) |
| **Key Hook** | useModuleAI with session prompt | Embedded in SomaPage AI setup |
| **Cascade Role** | Emitter (clearance, alerts), Receiver (stress, burnout) | Receiver only (delegations) |
| **Status** | Core module | Absorbed (legacy structure retained) |

---

## 14. KEY INSIGHTS

1. **Titan is the Central Hub:** All physical/biometric decisions flow through Titan, which gates Soma operations
2. **Dual-Write Transience:** During migration, both TitanProfile and SomaProfile coexist; eventually Soma will be fully canonical
3. **NSV as Communication Layer:** Titan owns biological metrics; updates trigger cascades to other modules (Agnes, Atlas)
4. **Mode-Aware Prompting:** Same module, different LLM context by tab (training vs. medical vs. diagnosis)
5. **Cascade-Driven Reactivity:** Agnes stress signals auto-trigger Titan deload suggestions without user action
6. **Granular Readiness Gating:** Titan checks recovery, CNS, sleep, emotional signals before approving high-intensity training
7. **Medical Conservatism:** All health-related LLM responses include disclaimer in context (not UI)
8. **Action Filtering:** useModuleAI silently drops out-of-scope actions, enforcing mode boundaries
9. **Cross-Module Awareness:** Titan knows about Agnes stress, Atlas focus, Ledger friction—uses signals to adjust prescriptions
10. **Periodization Without Enforcement:** Cycles are informational; phases don't auto-advance or prescribe workouts

---

## CONCLUSION

The Titan module is a sophisticated **physical performance optimization engine** that integrates biomarker tracking (Soma), sleep monitoring, periodization, and AI-driven readiness assessment. It's deeply integrated with the Neural Sanctuary's cross-functional state (NSV), listening to psychological (Agnes) and cognitive (Atlas) signals to make holistic decisions about training intensity and recovery. Soma, while retained as a separate profile entity, is operationally absorbed—Titan gates all medical clearances, and both modules share the same LLM interface in the Titan page.

The architecture reflects an **ongoing migration** from separate modules to integrated sovereignty, with clear ownership boundaries (Titan owns training/cycles; Soma owns medical facts) while maintaining backward compatibility through dual-write patterns.
