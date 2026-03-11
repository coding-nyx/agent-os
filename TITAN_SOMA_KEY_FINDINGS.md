# TITAN & SOMA MODULES - KEY FINDINGS & QUICK REFERENCE

## 📊 QUICK STATS

- **Total Files:** 48 (26 Titan, 22 Soma)
- **Lines of Code:** ~6,000+ TypeScript
- **Titan Actions:** 14 registered (includes absorbed Soma actions)
- **NSV Ownership:** Titan owns 4 biological metrics; Soma owns 0 (absorbed)
- **Integration Type:** Dual-write during migration (Soma canonical, Titan mirrors)
- **AI Mode Count:** 3 (training, medical, diagnosis)

---

## 🏗️ ARCHITECTURE HIGHLIGHTS

### 1. **TITAN IS THE CENTRAL HUB**
- Physical Authority that gates all medical/training decisions
- Reads from Soma (biomarkers, clearances, medical data)
- Updates NSV (central cross-module state)
- Receives cascade signals from Agnes (stress), Atlas (focus)
- Issues clearances + blocks high-intensity training when needed

### 2. **SOMA IS NOW ABSORBED BUT SOVEREIGN**
- Soma Profile still owned independently in Firestore (`soma_profiles` collection)
- But TitanProfile mirrors medical fields for backward compatibility
- All decisions are made by Titan, which reads Soma data
- Eventually: Soma fields will be removed from TitanProfile

### 3. **MODE-AWARE PROMPTING**
```
Training Tab        → TITAN_PERSONA + training context
Biomarkers Tab      → TITAN_PERSONA + SOMA_MEDICAL_DISCLAIMER + biomarker context
Recovery Tab        → Same as biomarkers
Diagnosis Tab       → buildTitanDiagnosisPrompt (lab/doc analysis)
```

### 4. **READINESS GATING FLOW**
```
User requests high-intensity training
    ↓
Titan checks: self_clearance_check action
    ↓
Reads from NSV: recoveryScore, cnsFatigue, sleepQuality
Reads from Soma: medicalImageAnalyses, clearances, knownConditions
    ↓
If any gate fails (recovery < 4 OR clearance denied)
    ↓
Emit BLOCK_HIGH_INTENSITY Spine event
    ↓
Cascade to Atlas: FLATTEN_ENERGY_WAVE
    ↓
User gets: "❌ High-intensity blocked. Recovery [X]/10 insufficient."
```

---

## 📁 CRITICAL FILES

### Must-Know Titan Files
| File | LOC | Purpose |
|------|-----|---------|
| `TitanPage.tsx` | 454 | Main page, tab routing, profile sync, Spine listeners |
| `services/actions.ts` | 613 | All 14 Titan + Soma AI actions |
| `personas.ts` | 217 | TITAN_PERSONA (217 lines of coaching philosophy) |
| `prompts/titan-session-prompt.ts` | 100+ | Mode-aware system prompt builder |
| `onboarding/TitanOnboarding.tsx` | 400+ | 9-step intake (trainer + medical phases) |
| `components/TitanReadiness.tsx` | - | NSV readiness dashboard |

### Must-Know Soma Files
| File | Purpose |
|------|---------|
| `services/soma-profile-service.ts` | Sovereign profile CRUD + E2EE |
| `services/soma-data-service.ts` | Cross-module health API (singleton) |
| `services/clearance-service.ts` | Medical clearance evaluation logic |
| `field-templates.ts` | 25 pre-built health extension fields |

### Critical Integration Files (in `/src/lib/`)
| File | Purpose |
|------|---------|
| `services/soma-titan-delegation-service.ts` | Titan→Soma delegation (biomarker, clearance) |
| `services/nsv-ownership.ts` | Metric ownership matrix + read permissions |
| `spine/cascade-rules.ts` | Event transformation (stress→deload) |
| `module-manifest.ts` | Module routing (Soma redirects to Titan) |

---

## 🔑 KEY DATA STRUCTURES

### TitanProfile (Comprehensive)
```typescript
{
  // Training
  routines: Routine[] (weekday-based)
  workoutSessions: WorkoutSession[] (logged sessions)
  sleepLog: SleepEntry[] (max 365)
  cycles: CycleEntry[] (periodization blocks)
  
  // Nutrition/Activity
  nutrition: { supplements, calories, macros? }
  activity: { workoutsPerWeek, sleepHours, activityLevel }
  history: { yearsTraining, injuries, goals }
  
  // Absorbed Medical (mirrors SomaProfile)
  knownConditions, medications, allergies
  biomarkers, labSummaries, clearances
  medicalImageAnalyses, medicalSummary
  
  // Metadata
  onboardingComplete, medicalOnboardingComplete
  privacyLevel: 'basic' | 'complete'
  trackingLevel: 'standard' | 'indepth'
}
```

### SomaProfile (Sovereign)
```typescript
{
  // Medical Authority
  knownConditions: string[]
  medications: string[]
  allergies: string[]
  biomarkers: BiomarkerRecord[] (max 200)
  labSummaries: LabSummaryRecord[] (max 50)
  clearances: ClearanceRecord[] (max 100)
  medicalImageAnalyses: MedicalImageAnalysis[] (max 100)
  medicalSummary: string
  medicalOnboardingComplete: boolean
}
```

### Routine (Weekly Training Template)
```typescript
{
  id: string
  name: string (e.g., "Upper Power")
  weekday: 'monday' | 'tuesday' | ... (one per day)
  exercises: Exercise[] // { name, sets, reps, notes }
  rationale: string
  timeframe: string (e.g., "4 weeks")
  status?: string
}
```

### CycleEntry (Periodization Block)
```typescript
{
  id: string
  name: string (e.g., "Strength Block")
  type: 'training' | 'recovery' | 'competition'
  startDate: YYYY-MM-DD
  status: 'active' | 'completed' | 'paused'
  phases: CyclePhase[] // { name, durationDays, rpe, focusAreas }
}
```

---

## 🎯 THE 14 TITAN ACTIONS (AI TOOLING)

### Profile & Routine
1. **`update_titan_profile`** — merge partial profile
2. **`update_routine`** — create/update weekly routines

### Medical Data
3. **`commit_biomarker`** — log biomarker (delegates to Soma)
4. **`parse_lab_report`** — extract from medical docs
5. **`issue_clearance`** — grant/deny training clearance
6. **`analyze_medical_image`** — OCR medical scans

### Biomarkers & Vitals
7. **`sync_vitals`** — update NSV biological metrics
8. **`self_clearance_check`** — evaluate training clearance
9. **`parse_health_report`** — generic health doc parsing
10. **`parse_workout_log`** — import external training data
11. **`parse_biometric_data`** — process CSV biomarkers

### Logging & Periodization
12. **`log_sleep`** — record sleep entry + sync to NSV
13. **`create_cycle`** — start periodization cycle
14. **`log_workout_session`** — record actual workout performance

### Also Present (but not in main list)
- `advance_cycle_phase` — move to next phase
- `complete_cycle` — finalize cycle
- `suggest_field`, `create_field`, `delete_field` — extension fields

---

## 🔌 SYSTEM PROMPT SECTIONS

### TITAN_PERSONA (Core Identity)
- **Tone:** Grounded, precise, performance-focused; NOT a "bro coach"
- **Expertise:** 8 coaching domains (strength, conditioning, recovery, sleep, hormones, injury prevention, periodization)
- **Philosophy:** Data-first, progressive overload, no motivation theater, deload recognition
- **Safety:** Medical escalation, eating disorder flags, overtraining detection

### Mode-Specific Overlays
- **`performance`** — maximal adaptation, push where data supports
- **`recovery`** — parasympathetic, gentle, restorative
- **`medical`** — biomarker precision, clinical reserve
- **`onboarding`** — warm but structured, sequential questions

### Cross-Module Awareness (Injected)
```
HIGH STRESS (Agnes > 7) + LOW RESILIENCE (< 4)
  → Scale back training 20%, prioritize parasympathetic work

HIGH CNS FATIGUE (Soma > 7)
  → Enforce rest or active recovery only; no loaded strength, no HIIT

LOW FOCUS (Atlas < 4)
  → Substitute complex movements with simpler, lower-risk variants

HIGH FINANCIAL FRICTION (Ledger > 7)
  → Note as recovery-compressing factor; acknowledge and plan around

SOMA CLEARANCE DENIAL
  → Gate high-intensity; emit BLOCK_HIGH_INTENSITY cascade
```

---

## 🧠 NSV (NEURAL STATE VECTOR) INTEGRATION

### Metrics Titan OWNS
```
biological.cnsFatigue (0–10)           — Central nervous system depletion
biological.sleepQuality (0–10)         — Sleep composite score
biological.recoveryScore (0–10)        — Physical recovery readiness
biological.hormonalContext (string)    — Cycle phase, hormonal state
```

### Metrics Titan READS (from other modules)
```
emotional.emotionalResilience (0–10)   — from Agnes
emotional.stressLoad (0–10)            — from Agnes
emotional.moodTrend (string)           — from Agnes
cognitive.energyBudget (0–10)          — from Atlas
cognitive.focusScore (0–10)            — from Atlas
cognitive.activeLoad (0–10)            — from Atlas
cognitive.planningLoad (0–10)          — from Atlas
```

### How Titan Updates NSV
```
log_sleep action
  → entry.quality synced to biological.sleepQuality

sync_vitals action
  → Titan AI emits: { cnsFatigue: 5, sleepQuality: 7, recoveryScore: 6, hormonalContext: "follicular" }

log_workout_session action
  → Recovery estimates synced after session logged
```

---

## 🌊 CASCADE EVENT FLOW

### Agnes → Titan Cascade
```
Agnes emits: COMPOUND_STRESS (stressLoad >= 8)
Cascade rule: Transform to BLOCK_HIGH_INTENSITY
Target: Titan
Titan receives via useSpineEvent hook
Titan auto-sends: "Agnes flagged critical stress. Review training load..."
```

### Titan Cascade Chain
```
Titan decides: recovery < 4 OR clearance denied
Emits: BLOCK_HIGH_INTENSITY
Cascade rule: Transform to FLATTEN_ENERGY_WAVE
Target: Atlas
Atlas reduces cognitive load in response
```

---

## 📝 ONBOARDING FLOW

### Trainer Phase (4 Steps)
1. **Nutrition** → supplements, macros, meal timing
2. **Physical Data** → workouts/week, activity, sleep, (+ hormonal if complete privacy)
3. **History & Goals** → training years, injuries, body comp targets
4. **Sync** → finalize profile, lock routine-ready state

### Medical Phase (5 Steps, Optional)
1. **Health Gate** — opt-in to medical tracking
2. **Conditions** — knownConditions[]
3. **Medications** — medications[]
4. **Allergies** → allergies[]
5. **Consent** → acknowledge medical disclaimer

### Privacy Gating
- **basic** — surface-level questions only
- **complete** — include menstrual cycle, sexual function, gender-dependent factors

---

## 🎨 CUSTOM TRACKING FIELDS

### Pre-Built Categories (4)
```
Nutrition Tracker
  ├─ Breakfast/Lunch/Dinner Details (TEXTAREA)
  ├─ Water Intake (NUMBER, 0–300 oz)
  ├─ Protein Goal (NUMBER, 0–500 g)
  └─ Calorie Goal (NUMBER, 0–10000)

Custom Biomarkers
  ├─ Blood Glucose (NUMBER, mg/dL)
  ├─ Blood Pressure (TEXTAREA)
  ├─ Weight (NUMBER, kg)
  ├─ Blood Oxygen (NUMBER, %)
  └─ Heart Rate (NUMBER, bpm)

Performance Metrics
  ├─ VO2 Max (NUMBER)
  ├─ Max Bench (NUMBER)
  ├─ Vertical Jump (NUMBER)
  └─ Muscle-Up Reps (NUMBER)

Recovery Markers
  ├─ Soreness (NUMBER, 0–10)
  ├─ Mood (NUMBER, 0–10)
  ├─ Motivation (NUMBER, 0–10)
  └─ Injury Notes (TEXTAREA)
```

### Field Limits
- Max 25 extension fields per user
- LLM is sole domain validator (no keyword gates)
- Structural validation via SchemaRegistry

---

## ⚠️ KNOWN ODDITIES & GAPS

### Oddities
1. **Soma has no NSV ownership** — can't update NSV directly, can only read & provide data
2. **TitanProfile absorbs medical data** — both Soma + Titan can write; undefined on conflict
3. **Soma page still exists but redirects** — dead code or future use case?
4. **Medical disclaimer in prompt, not UI** — weaker consent than explicit checkbox
5. **Cycle phases don't auto-advance** — must manually call `advance_cycle_phase`
6. **Custom fields not in LLM context** — user inputs them, but AI doesn't see them

### Missing Features
1. **Wearable integration** — Apple Health, Fitbit mentioned in README but not implemented
2. **Biomarker trending UI** — can log biomarkers, but no comparison charts
3. **Predictive readiness** — no ML forecasting of recovery timeline
4. **Recovery prescription engine** — suggests deload but no specific modality integration (sauna, ice bath, massage)
5. **Soma medical onboarding** — no intake flow for conditions/meds entry
6. **Automated cycle progression** — phases must be advanced manually
7. **Field-CRUD completeness** — actions defined but UI not fully wired

---

## 🚀 USAGE EXAMPLE: LOGGING A WORKOUT

```typescript
// 1. User clicks "Log Workout" in WorkoutSessionLogger
// 2. Component builds structured prompt:
const prompt = `
  I just completed my Monday workout: "Upper Power".
  Date: 2025-01-15 | Duration: ~60 min | RPE: 7/10
  
  Performance:
    Bench Press (3/3 sets completed, planned 5 reps):
      Set 1: 185kg × 5 reps ✓
      Set 2: 185kg × 4 reps (failed on 5th)
      Set 3: 175kg × 5 reps ✓
  
  Please log this session using log_workout_session.
  Compare actual vs planned volume.
  Adjust my recovery estimate and flag any form-cue reminders if needed.
`;

// 3. Titan AI receives prompt + system prompt
// 4. AI emits action:
{
  type: "log_workout_session",
  payload: {
    routineId: "routine-123",
    routineName: "Upper Power",
    date: "2025-01-15",
    startedAt: "2025-01-15T06:00:00Z",
    completedAt: "2025-01-15T07:00:00Z",
    rpe: 7,
    status: "completed",
    exercises: [{
      exerciseId: "ex-1",
      name: "Bench Press",
      plannedSets: 3,
      plannedReps: "5",
      completedSets: [
        { setNumber: 1, weight: 185, repsCompleted: 5, completed: true },
        { setNumber: 2, weight: 185, repsCompleted: 4, completed: false },
        { setNumber: 3, weight: 175, repsCompleted: 5, completed: true }
      ]
    }]
  }
}

// 5. Action handler (services/actions.ts):
//    - Appends WorkoutSession to profile.workoutSessions
//    - Syncs recovery estimates to NSV
//    - Emits VITAL_UPDATED Spine event

// 6. Result: Next time user opens Titan, readiness is recomputed
//    based on recent session load + CNS fatigue + sleep quality
```

---

## 📚 FURTHER DOCUMENTATION

Full comprehensive report: `TITAN_SOMA_EXPLORATION_REPORT.md` (1,300 lines)

Key sections in full report:
- Section 3: Titan/Soma Integration Patterns (dual-write, delegation, merging)
- Section 5: Tracking & Logging Features (detailed schema)
- Section 7: AI Agent Prompting & Tools (action specs, prompt injection)
- Section 8: Spine Event Bus Integration (cascade rules, event emissions)
- Section 9: GlobalSoul & Cross-Module State (NSV consumption)
- Section 10: Architecture Patterns & Oddities
- Section 11: Missing Pieces & Future Work
- Section 12: File Manifest (complete directory listing)
- Section 14: Key Insights (10 high-level takeaways)

---

## ✅ VERIFICATION CHECKLIST

- [x] All Titan files documented (26 files)
- [x] All Soma files documented (22 files)
- [x] Onboarding forms/fields mapped
- [x] Tracking/logging features catalogued
- [x] AI actions documented (14 + variants)
- [x] System prompts deconstructed
- [x] NSV ownership & read permissions mapped
- [x] Spine cascade rules documented
- [x] GlobalSoul integration points identified
- [x] Titan/Soma data split clarified (training vs medical)
- [x] Cross-module awareness (Agnes, Atlas, Ledger) mapped
- [x] Custom field system explained
- [x] Medical image analysis flow documented
- [x] Readiness gating logic traced
- [x] Known oddities & gaps identified

---

**Report Generated:** 2025-01-15  
**Codebase:** `/Users/raj-13766/Desktop/nexus/agnes`  
**Total Analysis:** 48 files, ~6,000 LOC, comprehensive architecture review
