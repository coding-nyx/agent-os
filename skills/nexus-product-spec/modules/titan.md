# Titan — Physical & Biomedical Strategist

> **ID**: `titan` | **Theme**: Orange | **Core**: Yes | **Soul Priority**: 2 | **Security**: open

## Purpose
Titan handles the entire physical domain — both active (training, workouts, routines, periodization) and passive (biomarkers, vitals, lab results, medical clearances). Titan has absorbed the Soma module, which was previously a separate biomedical data layer.

## Agent Personality
- **Archetype**: Elite AI Physical Performance Strategist
- **Tone**: Concise, evidence-based, authoritative
- **Special**: Dual-mode operation — **Coaching Mode** (workout programming, performance optimization) and **Medical Mode** (biomarker interpretation, lab analysis, clearance management)

## NSV Ownership
- **Writes**: `biological.cnsFatigue`, `biological.sleepQuality`, `biological.recoveryScore`, `biological.hormonalContext`
- **Reads**: `biological.*`, `emotional.*`, `cognitive.energyBudget`

## Key Actions
- `update_cnsFatigue` — update CNS fatigue score
- `update_sleepQuality` — update sleep quality score
- `log_workout` — record a workout session
- `create_routine` — build a training routine
- `manage_cycle` — start/complete training cycles
- `commit_biomarker` — record a biomarker value
- `update_clearance` — update medical clearance status
- `parse_lab_report` — process uploaded lab results

## Spine Events
- **Emits**: VITAL_UPDATED, CYCLE_STARTED, CYCLE_COMPLETED, WORKOUT_COMPLETED, SOMA_BIOMARKER_COMMITTED, SOMA_READINESS_UPDATED, SOMA_CLEARANCE_CHANGED
- **Listens**: BLOCK_HIGH_INTENSITY (cascade-generated when CNS fatigue ≥ 8)

## Cross-Module Links
- When cnsFatigue ≥ 8, Spine cascade auto-emits BLOCK_HIGH_INTENSITY → prevents high-intensity recommendations
- VITAL_UPDATED with high fatigue + low resilience → triggers BURNOUT_WARNING cascade
- Soma biomarker commits can trigger FLATTEN_ENERGY_WAVE for Atlas schedule adjustment
- Notified by Atlas when user fails physical commitments

## Data Shape
**Training**: workout logs, training cycles, routines, rest periods, sleep tracking, readiness scores, custom fields. **Biomedical (from Soma)**: `SomaProfile` with biomarkers (~50 pre-built across vitals/hormones/metabolic/general), clearances, labSummaries, medicalImages, vitalHistory. Has a dedicated **diagnosis panel** for AI-powered assessment.

## Implementation Notes
- ✅ Fully implemented: onboarding (intake accumulator pattern), workout logging, training cycles, diagnosis tool
- ✅ Soma absorption complete — biomarker tracking, lab parsing, clearance management all under Titan
- ⚠️ Diagnosis uses a dedicated prompt (`titan-diagnosis-prompt.ts`), extractor, and merge pipeline
