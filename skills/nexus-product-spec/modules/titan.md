# Titan — Physical & Biomedical Strategist

> **ID**: `titan` | **Theme**: Orange | **Core**: Yes | **Soul Priority**: 2 | **Security**: open

## Purpose
Titan handles the entire physical domain — both active (training, workouts, routines, periodization) and passive (biomarkers, vitals, lab results, medical clearances). Titan has absorbed the Soma module, which was previously a separate biomedical data layer.

## Agent Personality
- **Archetype**: Elite AI Physical Performance Strategist (Veteran strength-and-conditioning specialist)
- **Tone**: Grounded, precise, performance-focused. Not a bro-coach.
- **Special**: Dual-mode operation — **Coaching Mode** (workout programming, performance optimization) and **Medical Mode** (biomarker interpretation, lab analysis, clearance management)

## NSV Ownership
- **Writes**:
  - `biological.cnsFatigue` — CNS depletion (0–10)
  - `biological.sleepQuality` — Composite sleep score (0–10)
  - `biological.recoveryScore` — Overall physical recovery (0–10)
  - `biological.weight` — Latest body weight (kg)
  - `biological.bodyFatPct` — Body fat percentage (%)
  - `biological.aerobicLoad` — Cardio session load index (0–10)
  - `biological.hormonalContext` — Descriptive hormonal state
  - `cognitive.energyBudget` — Physical energy available (0–10, co-owned)
  - `cognitive.focusScore` — Physical-fatigue contribution (0–10, co-owned with Atlas)
- **Reads**: `emotional.*`, `biological.*`, `cognitive.*`

## Persona Variants (4)
| Variant | Focus |
|---------|-------|
| `performance` | Load-based, maximal adaptation stimulus. Readiness confirmed green. |
| `recovery` | Parasympathetic activation, CNS downregulation, sleep optimization. |
| `medical` | Lab interpretation, biomarker review, flag outliers for medical review. |
| `onboarding` | Baseline profile establishment, training history, injury history. |

## Key Actions (26 total)

### Core Actions
- `update_titan_profile` — patch Firestore document with partial TitanProfile
- `update_routine` — merge routines by weekday
- `sync_vitals` — write directly to NSV biological domain
- `self_clearance_check` — evaluate clearance, emit BLOCK_HIGH_INTENSITY if denied

### Workout Actions
- `log_workout_session` — record full session with exercises, compute PRs, emit WORKOUT_COMPLETED
- `log_workout_set` — quick log single exercise, update PRs

### Sleep Actions
- `log_sleep` — record sleep entry, update NSV sleepQuality

### Body Actions
- `log_body_weight` — record weight entry, update NSV weight/bodyFatPct
- `log_cardio_session` — record cardio, emit WORKOUT_COMPLETED, update NSV aerobicLoad

### Biomarker Actions
- `commit_biomarker` — commit via SomaTitanDelegationService, emit SOMA_BIOMARKER_COMMITTED
- `parse_lab_report` — append to labSummaries[]
- `issue_clearance` — issue clearance via delegation, emit CLEARANCE_GRANTED/DENIED
- `analyze_medical_image` — extract data from medical images, emit MEDICAL_ALERT for severe flags
- `parse_health_report` — parse health report documents
- `parse_workout_log` — parse workout log imports
- `parse_biometric_data` — parse biometric data imports

### Cycle Actions
- `create_cycle` — create new cycle, emit CYCLE_STARTED
- `advance_cycle_phase` — advance to next phase, emit CYCLE_COMPLETED if all done
- `complete_cycle` — mark cycle as completed

### Field Actions
- `suggest_field` — propose custom field for user confirmation (message-only)
- `create_field` — create custom field (max 20)
- `delete_field` — delete custom field (idempotent)

### Utility Actions
- `propose_reminder` — propose reminder for user confirmation
- `query_reminders` — query existing reminders

## UI Tabs (4)
| Tab | Components | Purpose |
|-----|------------|---------|
| **Train** | TrainingCalendar, TitanReadiness, WorkoutSessionLogger, ClearanceWidget | Primary training view |
| **Plan** | TitanRoutinePanel, RoutineProgress, CustomFieldManager | Training planning & routines |
| **Body** | PRBoard, BodyWeightTracker, CardioLogger, SleepTracker | Body metrics tracking |
| **Cycles** | CycleManager | Periodization cycle management |

## Spine Events
- **Emits**:
  - `WORKOUT_COMPLETED` — after successful workout/cardio log
  - `TITAN_RECOVERY_NEEDED` — when cnsFatigue projected ≥ 7.5 after session
  - `TITAN_TRAINING_STREAK` — on milestone streak (7, 14, 21, 30 days)
  - `TITAN_BODY_WEIGHT_LOGGED` — after body weight entry
  - `CYCLE_STARTED` / `CYCLE_COMPLETED` — cycle lifecycle events
  - `BLOCK_HIGH_INTENSITY` — when clearance denied
  - `SOMA_READINESS_UPDATED` — after clearance check
  - `SOMA_CLEARANCE_CHANGED` — after issue_clearance
  - `SOMA_BIOMARKER_COMMITTED` — after biomarker commit
  - `CLEARANCE_GRANTED` / `CLEARANCE_DENIED` — legacy clearance events
  - `MEDICAL_ALERT` — when severe clinical flags found
- **Listens**: BLOCK_HIGH_INTENSITY (cascade-generated when CNS fatigue ≥ 8)

## Cross-Module Links
- When cnsFatigue ≥ 8, Spine cascade auto-emits BLOCK_HIGH_INTENSITY → prevents high-intensity recommendations
- VITAL_UPDATED with high fatigue + low resilience → triggers BURNOUT_WARNING cascade
- Soma biomarker commits can trigger FLATTEN_ENERGY_WAVE for Atlas schedule adjustment
- Notified by Atlas when user fails physical commitments
- **Readiness Scoring**: 7–10 🟢 GREEN (train as planned), 4–6 🟡 AMBER (modify: reduce 20–30%), 0–3 🔴 RED (rest only)

## Soma ↔ Titan Relationship
- **Soma** monitors neurological/physiological state, tracks CNS at physiological level
- **Titan** makes physical training decisions, consumes Soma data for safe/productive training
- **NSV Boundary**: Titan owns `cnsFatigue`, Soma owns `cnsFatigueScore` — never cross-write
- **Clearance Gate**: Titan grants/denies high-intensity clearance based on recoveryScore ≥ 4 and no contraindications

## Data Shape
**Training**: workout logs (`workoutSessions[]`, `workoutLogs[]`), training cycles, routines, sleep tracking (`sleepLog[]`), readiness scores, personal records, custom fields (max 20). **Body**: `bodyWeightLog[]`, `cardioLog[]`. **Biomedical (from Soma)**: biomarkers (~50 pre-built across vitals/hormones/metabolic/general), clearances, `labSummaries[]`, `medicalImageAnalyses[]`, `medications[]`, `allergies[]`. Has a dedicated **diagnosis panel** for AI-powered assessment supporting PDF, PNG/JPG/WebP, CSV, and text files.

## Implementation Notes
- ✅ Fully implemented: onboarding (intake accumulator pattern), workout logging, training cycles, diagnosis tool
- ✅ Soma absorption complete — biomarker tracking, lab parsing, clearance management all under Titan
- ✅ 28 React components organized under `components/` and `tabs/`
- ✅ 7 action handler modules under `services/actions/`
- ⚠️ Diagnosis uses a dedicated prompt (`titan-diagnosis-prompt.ts`), extractor, and merge pipeline
