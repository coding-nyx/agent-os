# TITAN MODULE — PRODUCT STRATEGY REVIEW

> **Author:** PM Agent (Nexus Orchestrator)  
> **Date:** 2025  
> **Status:** Authoritative — supersedes ad-hoc Titan feature discussions  
> **Scope:** Full product strategy analysis covering feature audit, gap classification, scope creep identification, vision clarity, Soma boundary, MVP definition, and sprint planning input  
> **References:** `TITAN_SOMA_KEY_FINDINGS.md`, `TITAN_SOMA_EXPLORATION_REPORT.md`, `BACKLOG.md`, `NEXUS_PRODUCT_DEFINITION.md`

---

## PRODUCT VISION STATEMENT

> **Titan is the user's physical authority** — the one AI that knows their body better than they do. It translates raw effort (reps, sleep hours, cycle phases) into an adaptive, intelligent physical plan that evolves with their life. The module UI is a control panel; the Titan AI agent is the coach. Users who never touch a form get coached. Users who obsess over every set get validated. Both paths lead to the same outcome: a living, coherent physical record that drives better decisions.

**One-sentence product promise:**  
*"Titan knows what your body needs today, even when you don't."*

---

## EXECUTIVE SUMMARY OF FINDINGS

| Area | Status | Severity |
|------|--------|----------|
| Core workout tracking loop | Functional but data-model-shallow | High |
| Soma boundary confusion | Structurally unresolved | Critical |
| Exercise identity & PR tracking | Missing entirely | Critical |
| Periodization data model | Weak — CycleEntry ≠ mesocycle | Critical |
| Three-persona UX support | Not designed for; partially works | High |
| Onboarding depth vs time | Overcollects upfront | Medium |
| Training calendar visibility | Absent | High |
| Nutrition logging | Absent (only baseline profile) | Medium |
| Wearable integration | Absent (mentioned in README only) | Medium |
| Sleep as Titan feature | Misplaced (should be Soma/health) | Medium |
| Diagnosis tab | Scope creep | Medium |

---

## 1. FEATURE AUDIT: WHAT EXISTS AND IS IT RIGHT?

### 1.1 Scorecard

| Feature | Rating | Rationale |
|---------|--------|-----------|
| Fast-track onboarding form | ⚠️ Needs work | Collects too much too early. Weight/macros/supplement goals should be optional day-one. |
| Full AI chat-guided onboarding | ✅ Core | Excellent path for passive users. TITAN_VARIANTS `onboarding` persona is well-configured. Should be the **default** path. |
| Routine management (AI-generated) | ✅ Core | AI-generated plans via `update_routine` action are sound. Exercises as free text is the problem, not the plan generation. |
| Routine management (manual RoutineBuilder) | ⚠️ Needs work | Builder exists but is not fully mounted/wired per backlog. Free-text exercise names mean no PR lookup possible. |
| Workout session logger | ⚠️ Needs work | Core mechanic is correct (actual vs planned sets/reps/weight/RPE). Blocked by lack of Exercise identity — no PR baseline to compare against. |
| RoutineProgress volume analytics | ⚠️ Needs work | Volume math is surface-level. No acute:chronic workload ratio (ACWR). No exercise-level trend. Useful but incomplete. |
| CustomFieldManager (nutrition custom fields) | ⚠️ Needs work | The field system is architecturally solid (25 fields, LLM-validated). The nutrition preset fields (calories, protein, water, meals) are useful. However, custom fields are not in LLM context — AI can't act on what users input here. This is a critical gap. |
| Sleep tracker | 🔄 Misplaced | Sleep is a **biological health metric** owned by Soma's domain (recovery, circadian health). Titan should receive sleep data as NSV context (`sleepQuality`), not manage an independent `SleepEntry[]` array. Migration: move sleep logging to Soma; Titan reads NSV `sleepQuality`. |
| Cycle manager | 🔄 Misplaced (partially) | **Workout cycles** (periodization blocks) belong in Titan. **Supplement/hormonal/nutrition cycles** belong in Soma. The `CycleEntry.type` enum mixes domains. Split required. |
| Biomarkers tab (Soma data in Titan) | ❌ Scope creep | Biomarkers are Soma's sovereign data. Showing them as a Titan tab creates identity confusion ("Is this my trainer or my health dashboard?"). Titan should consume biomarkers as invisible context only. |
| Recovery/Clearance tab (Soma data in Titan) | ❌ Scope creep | Same as biomarkers. Clearance gating is a **mechanism** that Titan enforces internally, not a tab users browse. The clearance status should surface as a banner/signal in the Training tab, not a separate tab. |
| Diagnosis tab | ❌ Scope creep | Lab report analysis and medical diagnosis are Soma's domain. Titan should be able to *receive* a diagnosis result as context, but should not be the interface for it. |
| Readiness dashboard | ✅ Core | The NSV-derived readiness score (`cnsFatigue`, `sleepQuality`, `recoveryScore`) is exactly right. This is Titan's "pre-flight check" before training. Keep. Needs richer visualization. |
| Spine cross-module reactivity (Agnes→Titan) | ✅ Core | Agnes stress cascade → Titan deload recommendation is one of the most valuable cross-module behaviors in Nexus. Solidly designed. Extend to Atlas and Ledger cascades (already in cascade-rules). |

### 1.2 Summary Counts

- ✅ Core (keep, strengthen): 3 features  
- ⚠️ Needs work (keep, fix): 6 features  
- ❌ Scope creep (cut or move): 3 features  
- 🔄 Misplaced (right feature, wrong place): 2 features  

---

## 2. MISSING FEATURES: CRITICALITY CLASSIFICATION

### 2.1 Classification Table

| Missing Feature | Classification | Rationale |
|-----------------|----------------|-----------|
| **Exercise library with identity** | 🔴 CRITICAL | Without a canonical Exercise entity, there is no PR tracking, no 1RM baseline, no progress trending per movement, no program templates, and no form-cue recommendations. Every other advanced feature depends on this. |
| **1RM / e1RM estimation and history** | 🔴 CRITICAL | A strength coach with no PR awareness is not a strength coach. The `log_workout_session` action captures sets/reps/weight but cannot surface "you just hit a PR" without e1RM history. |
| **Personal Records (PR) board** | 🔴 CRITICAL | Directly follows from Exercise library gap. PRs are the most motivating output of any strength training app. Absence is a glaring product hole. |
| **Training calendar / weekly schedule view** | 🔴 CRITICAL | Users have no visual representation of "what am I doing this week." Routines are assigned to weekdays but there is no rendered calendar. This is table stakes for any training app. |
| **Body weight / body composition log over time** | 🟡 IMPORTANT | Weight exists in Soma vitals (custom field `Weight: NUMBER kg`) but there is no dedicated, trend-visible body composition log. Goal: `70kg by Aug 1` with trend line. Soma vitals is the right place to store it; Titan needs a reading widget. |
| **Goal tracking with milestones** | 🟡 IMPORTANT | `history.goals` is a free-text string. Goals should be structured: `{ type: 'strength' \| 'weight' \| 'endurance' \| 'habit', target, deadline, current, milestones[] }`. Without this, Titan AI cannot report progress toward goals or auto-celebrate wins. |
| **Periodization program templates** | 🟡 IMPORTANT | 5/3/1, GZCLP, PHUL, PPL, NSCA linear periodization — users should be able to say "start me on 5/3/1" and have Titan generate the full mesocycle structure. Templates live in a library; Titan instantiates them. |
| **Acute:chronic workload ratio (ACWR) auto-calculation** | 🟡 IMPORTANT | Industry-standard injury-risk metric. Requires `WorkoutSession.volume` history. Already partially computable from logged sessions — just not computed. |
| **Deload auto-scheduling** | 🟡 IMPORTANT | Titan AI can *suggest* deload verbally. A deload week should be a first-class event in the data model: trigger conditions (ACWR > 1.5, CNS fatigue > 7, consecutive high-RPE sessions), duration, and reduced-volume prescription. |
| **Training program library (preset programs)** | 🟡 IMPORTANT | Companion to periodization templates. Power users want "load GZCLP"; passive users want "give me a beginner program." A curated library of 8-12 canonical programs (strength, hypertrophy, endurance, beginner) covers 80% of use cases. |
| **Wearable data integration (HRV, HR zones, steps)** | 🟡 IMPORTANT | HRV is the single best real-world readiness signal. Apple Health/Garmin/Whoop data flowing into `biological.cnsFatigue` and `biological.recoveryScore` would make the readiness dashboard actionable instead of manual. This is a platform-level capability, not just a Titan feature. |
| **Nutrition logging (daily food log)** | 🟢 NICE TO HAVE | The nutrition baseline profile (calories/macros/supplement goals) is the right scope for Titan. Full daily food logging (MyFitnessPal territory) is out of scope for MVP — it's a product in itself. A simplified "did you hit your protein today?" check-in via chat is sufficient. |
| **Progress photos** | 🟢 NICE TO HAVE | Valuable for body composition awareness. Can be implemented as a media attachment on body composition log entries. Not MVP. |

### 2.2 CRITICAL GAP: Exercise Identity

This deserves its own sub-section because it is foundational:

**Current state:** `Routine.exercises[]` is typed as `{ name: string, sets: number, reps: string, notes?: string }`. The `name` is free text. There is no `Exercise` entity with a canonical ID.

**Impact of this gap:**
1. No PR tracking — can't say "your bench has gone from 135lbs to 205lbs over 6 months"
2. No e1RM calculation — can't estimate max from working sets
3. No form cue memory — can't remember "you need to cue hip hinge on Romanian deadlift"
4. No program templates — templates reference exercises by name; free text creates matching hell
5. No muscle group analytics — can't compute weekly volume per muscle group without exercise taxonomy
6. No exercise substitution — Titan AI can't suggest "replace barbell row with cable row if gym is crowded" without knowing which muscle group each serves

**Required data model addition:**
```typescript
interface Exercise {
  id: string                          // canonical ID
  name: string                        // "Barbell Back Squat"
  aliases: string[]                   // ["Back Squat", "High Bar Squat"]
  category: 'compound' | 'isolation' | 'cardio' | 'mobility'
  primaryMuscles: MuscleGroup[]       // ['quadriceps', 'glutes']
  secondaryMuscles: MuscleGroup[]     // ['hamstrings', 'erectors']
  equipment: EquipmentType[]          // ['barbell', 'rack']
  movementPattern: MovementPattern    // 'squat' | 'hinge' | 'push' | 'pull' | 'carry'
  formCues: string[]                  // AI-populated coaching cues
  isCustom: boolean                   // user-created vs library
}

interface PersonalRecord {
  exerciseId: string
  date: string
  weight: number
  reps: number
  e1RM: number                        // Epley/Brzycki formula
  sessionId: string                   // reference to WorkoutSession
}
```

---

## 3. SCOPE CREEP IDENTIFICATION

### 3.1 What Should Leave Titan

| Feature Currently in Titan | Decision | Destination |
|---------------------------|----------|-------------|
| **Sleep tracker** (`SleepEntry[]`, `log_sleep` action, Sleep tab) | **Move to Soma** | Sleep is a biological health metric. Soma owns `biological.sleepQuality` in NSV. Titan reads `biological.sleepQuality` from NSV as context for readiness scoring. |
| **Biomarkers tab** | **Move to Soma** | Soma is the biomarker authority. Remove from Titan tabs entirely. |
| **Recovery/Clearance tab** | **Refactor** | Clearance *status* surfaces as a banner in the Titan Training tab. The full clearance management UI lives in Soma. |
| **Diagnosis tab** | **Move to Soma** | Lab parsing, medical image analysis, and diagnosis are medical-domain features. Titan receives diagnosis *output* as a clearance signal, not as a browseable interface. |
| **Hormonal/supplement/nutrition CycleEntry types** | **Move to Soma** | Hormonal tracking and supplement cycling are medical/biological domain. Keep only `'training'` and `'recovery'` cycle types in Titan. |
| **Medical onboarding (5 steps: conditions, meds, allergies, consent)** | **Move to Soma** | Medical history collection is Soma's responsibility. Titan onboarding should end at the trainer phase (nutrition, activity, history+goals). |

### 3.2 Net Effect on Titan Tabs

**Before (6 tabs):** Training · Biomarkers · Recovery · Sleep · Cycles · Diagnosis

**After (3 tabs):** Training · Progress · Cycles

| New Tab | Content |
|---------|---------|
| **Training** | Active routine, workout session logger, readiness banner (clearance status + NSV scores), upcoming session preview |
| **Progress** | PR board, body comp trend, volume analytics (RoutineProgress), ACWR chart, goal milestones |
| **Cycles** | Periodization cycles (training/recovery types only), program library, mesocycle builder |

This is a cleaner, focused product. Soma gets its own full-featured module for health/medical tracking.

### 3.3 Justification: Why Sleep Belongs to Soma

Sleep is not a training variable — it is a recovery and biological health variable. The fact that it *affects* training does not mean Titan should *own* it. By the same logic, Titan would need to own stress (Agnes), cognitive load (Atlas), and financial anxiety (Ledger) because they all affect training performance. The Spine architecture exists precisely so Titan can *consume* signals from those domains without owning them.

Concretely: moving `SleepEntry[]` to `SomaProfile` and having `log_sleep` delegate to Soma (same pattern as `commit_biomarker`) creates a clean separation. Titan's readiness dashboard continues to read `biological.sleepQuality` from NSV, unchanged.

---

## 4. PRODUCT VISION CLARITY

### 4.1 The Three-Persona UX Problem

The three personas defined in the product concept create fundamentally different expectations:

| Persona | What They Want | Current Experience |
|---------|---------------|-------------------|
| **Passive User (AI-first)** | Talk to Titan, get a plan, never see a form | ⚠️ Works, but the tab UI is the first thing they see — form-heavy, overwhelming |
| **Power User (manual-first)** | Use forms directly, AI validates in background | ⚠️ Forms exist but AI-gated write path adds friction they didn't ask for |
| **Hybrid User** | Sometimes chat, sometimes form | ✅ Best-served by current design |

### 4.2 What a New User Should See First

**Current:** 6-tab interface immediately after onboarding completes, with Training tab active.

**Recommended:** The Titan AI chat is the landing surface. The tabs are revealed progressively:

```
New User Journey:
1. Titan chat says: "Hey [name], I'm Titan — let's figure out what your body needs."
2. AI-guided onboarding via chat (5 min, 6-8 questions max).
3. After onboarding: Training tab loads with AI-generated plan already visible.
4. "Your plan is ready. Want me to walk you through it, or start logging today's workout?"
5. Tabs become visible naturally as user engages with their content.
```

**The Aha Moment for Titan:**  
*"Titan just built me a full training plan from a 5-minute conversation and already knows I can't train Mondays."*  
This happens when the AI-generated routine appears in the Training tab immediately after onboarding chat.

### 4.3 Power User Pain Point: AI-Gated Write Path

**Problem:** The product concept states "even manual form submissions go through Titan AI for review before being committed." A power user who wants to log "225lbs × 5, 225lbs × 5, 235lbs × 3" does not want to wait for LLM validation.

**Recommendation: Two-tier write path, not one.**

```
OPTIMISTIC PATH (Power User):
  Form submit → Instant local write → Background AI review
  If AI rejects: Show non-blocking warning banner
  "Titan flagged this session (RPE 10 + 7 exercises = overtraining risk). Continue anyway?"
  
AI-FIRST PATH (Passive User):
  Chat message → AI action tag → Write with explanation inline
  User sees AI rationale before data is committed
```

This gives power users speed while passive users get coaching. The "smart validation" layer becomes advisory-not-blocking for manual input.

### 4.4 AI Mode vs Direct Mode Toggle

**Recommended:** Yes, implement a **mode preference toggle** in Titan settings:

- **Coach Mode (default):** Titan AI mediates all interactions. Chat is primary. Forms exist as AI-generated outputs.
- **Logbook Mode:** Forms are primary. AI runs in background, surfaces alerts non-blockingly. No mandatory chat interaction for routine operations.

This is a single boolean in `TitanProfile.preferenceMode: 'coach' | 'logbook'` and a conditional render in `TitanPage.tsx`. Low implementation cost, high user satisfaction impact.

---

## 5. TITAN vs. SOMA — PRODUCT BOUNDARY DEFINITION

### 5.1 The Canonical Boundary

| Domain | Owner | Rationale |
|--------|-------|-----------|
| **Training plans & routines** | Titan | Performance coaching domain |
| **Workout session logs** | Titan | Training execution tracking |
| **Exercise library & PR tracking** | Titan | Performance metrics |
| **Periodization cycles (training/recovery types)** | Titan | Training programming |
| **Readiness score** | Titan (computes) / Soma (provides inputs) | Titan synthesizes; Soma supplies raw health data |
| **Body composition trends** | Shared read; Soma writes weight vitals; Titan reads trend | Weight is a vital; composition trend is a performance goal |
| **Sleep tracking** | **Soma** | Biological health metric |
| **Biomarkers (labs, blood work)** | **Soma** | Medical/clinical domain |
| **Medical clearance** | **Soma** (issues) / Titan (enforces as gate) | Soma has medical authority; Titan acts on clearance status |
| **Medical conditions, medications, allergies** | **Soma** | Clinical health record |
| **Diagnosis / lab report parsing** | **Soma** | Medical interpretation |
| **Hormonal tracking** | **Soma** | Biological/clinical |
| **Supplement cycles (medical/hormonal)** | **Soma** | Medical/clinical |
| **Supplement tracking (performance-focused)** | Titan | Creatine, pre-workout = performance supplements belong with the training context |
| **HRV / wearable data** | **Soma** (ingests) → NSV → Titan (reads) | Wearables produce health signals; Titan consumes them as readiness context |

### 5.2 How Soma Data Flows into Titan (Without Soma UI in Titan)

```
SOMA MODULE (sovereign)
    ↓ owns and writes
SomaProfile: { biomarkers, sleepLog, clearances, medicalHistory }
    ↓ Soma updates NSV after each change
NSV / GlobalSoul: { biological.sleepQuality, biological.recoveryScore, biological.cnsFatigue, biological.hormonalContext }
    ↓ Titan reads NSV continuously
TITAN MODULE:
    - Readiness Dashboard reads NSV biological metrics
    - Clearance banner reads Soma clearance snapshot (via soma-data-service)
    - TITAN_PERSONA system prompt receives biological context injection
    - No Soma UI is rendered inside Titan tabs
```

**Implementation contract:**  
`soma-titan-delegation-service.ts` already exists and implements part of this. The remaining work is:
1. Remove Biomarkers/Sleep/Recovery/Diagnosis tabs from Titan
2. Add Soma health snapshot injection into Titan's readiness widget (already partially done)
3. Ensure `log_sleep` action in Titan delegates to Soma service (same pattern as `commit_biomarker`)

### 5.3 When Should a User Visit Soma vs Titan?

| User Intent | Go To |
|-------------|-------|
| "Log my workout" | Titan |
| "See my training plan" | Titan |
| "Check my PR on deadlift" | Titan (after PR board is built) |
| "Start a strength program" | Titan |
| "Check my blood pressure trend" | Soma |
| "Upload my bloodwork" | Soma |
| "Am I cleared to train after injury?" | Soma (issues clearance) — Titan (shows clearance status as banner) |
| "How well did I sleep last week?" | Soma |
| "Is my recovery good enough to train hard today?" | Titan readiness dashboard (reads Soma data via NSV) |

---

## 6. REQUIRED TRACKING: MINIMUM VIABLE SET (TOP 10)

| # | What to Track | Currently Tracked? | Gap Priority |
|---|--------------|-------------------|--------------|
| 1 | **Workout sessions** (exercises, sets, reps, weight, RPE, date) | ✅ Yes — `WorkoutSession[]` | None |
| 2 | **Active training routine** (exercises per weekday, planned sets/reps) | ✅ Yes — `Routine[]` | Free-text exercise name is the gap |
| 3 | **Personal records by exercise** (best weight × reps, e1RM, date) | ❌ Missing | CRITICAL |
| 4 | **Readiness score** (composite: CNS fatigue, sleep quality, recovery) | ✅ Yes — NSV + TitanReadiness | Needs richer UI |
| 5 | **Training volume over time** (weekly tonnage, sets per muscle group) | ⚠️ Partial — RoutineProgress exists | No ACWR |
| 6 | **Body weight / composition trend** | ⚠️ Partial — Soma custom field | No Titan-side trend widget |
| 7 | **Sleep quality** (hours, quality score, recovery impact) | ✅ Yes — SleepEntry[] | Misplaced in Titan; move to Soma |
| 8 | **Periodization structure** (current mesocycle phase, week number, deload schedule) | ⚠️ Partial — CycleEntry exists but is weak | Data model redesign needed |
| 9 | **Goals with milestones** (structured goal type, target, deadline, progress) | ❌ Missing — only free-text `history.goals` | IMPORTANT |
| 10 | **Clearance status** (can I train? what restrictions?) | ✅ Yes — via Soma delegation | UI surface needs to move to banner in Training tab |

**Currently tracked: 5.5/10 (3 fully, 3 partially, missing 2 critical)**

---

## 7. TRAINING CYCLE CONFUSION: PERIODIZATION DATA MODEL

### 7.1 Current Problem

`CycleEntry` is used for: training blocks, supplement cycles, hormonal cycles, nutrition cycles, recovery phases, and custom cycles. This is the same entity serving wildly different domains with wildly different data requirements.

A "workout cycle" in the current model is supposed to represent a **mesocycle** (a training block, typically 4–8 weeks with specific focus: hypertrophy, strength, peaking). But `CycleEntry` has only:
```typescript
{
  phases: CyclePhase[] // { name, durationDays, rpe, focusAreas }
}
```
There is no reference to **which routines are active during each phase**, **what progressive overload scheme is in effect**, or **what the deload week looks like**.

**Meanwhile, `Routine` is a weekly training template:**
```typescript
{
  weekday: 'monday' | ... // one routine per day
  exercises: Exercise[]
}
```

The relationship between `Routine` and `CycleEntry` is undefined. They exist in parallel with no connection.

### 7.2 What the Periodization Hierarchy Should Be

```
PROGRAM (macro level — 16–24 weeks)
  └─ name: "5/3/1 BBB"
  └─ goal: 'strength' | 'hypertrophy' | 'peaking' | 'maintenance'
  └─ source: 'ai-generated' | 'library' | 'custom'
  └─ MESOCYCLE[] (4–8 weeks each)
       └─ name: "Accumulation Block"
       └─ focusAreas: ['squat', 'deadlift']
       └─ durationWeeks: 6
       └─ deloadWeek: 6  (which week is deload)
       └─ progressionScheme: 'linear' | 'wave' | 'block' | 'conjugate'
       └─ WEEK[] (7 days)
            └─ weekNumber: 1
            └─ isDeload: false
            └─ intensity: 'high' | 'moderate' | 'low'
            └─ SESSION[] (references Routine OR is ad-hoc)
                 └─ routineId?: string  (links to existing Routine)
                 └─ SET[] (planned)
                      └─ exerciseId, plannedSets, plannedReps, plannedWeight, rpe
```

### 7.3 Recommended Simplification for MVP

Don't implement the full 5-level hierarchy in Sprint 7. Implement:

**Phase 1 (Sprint 7–8):** Mesocycle as a named block with:
- `startDate`, `endDate`, `durationWeeks`
- `focus: 'strength' | 'hypertrophy' | 'endurance' | 'recovery'`
- `deloadWeekNumber: number`
- `linkedRoutineIds: string[]` (which routines are active in this block)
- `progressionScheme: string`

**Phase 2 (Sprint 9–10):** Program template library + full Program → Mesocycle linking

**Phase 3 (Sprint 11+):** Week-level plan generation with AI-driven progressive overload

### 7.4 What Changes to CycleEntry

1. **Rename:** `CycleEntry` → `TrainingBlock` (or keep `CycleEntry` with a strict type: only `'training' | 'recovery'`)
2. **Move to Soma:** `'supplement' | 'hormonal' | 'nutrition' | 'custom'` CycleEntry types
3. **Add:** `linkedRoutineIds`, `deloadWeekNumber`, `progressionScheme`
4. **Add:** Auto-advance logic — `advance_cycle_phase` should trigger when `currentDate > phaseEndDate`

---

## 8. ONBOARDING ANALYSIS

### 8.1 Current Onboarding Assessment

**Current:** Two paths — fast-track form (4 steps) OR full AI chat (9 steps: 4 trainer + 5 medical)

**Problems:**
- 9 steps is too long. Users don't have 10 minutes before their first workout.
- Medical onboarding (5 steps) belongs to Soma, not Titan. This is scope creep.
- Fast-track form asks for macros, supplement goals, and injury history on day one — data most users don't have memorized.
- After either path, the Training tab shows a blank state until a routine is generated — there's no "immediate value" moment.

### 8.2 What Data Is Truly Needed at Onboarding

**Minimum required (Day 1):**
- Name / primary goal (fat loss / strength / muscle / general fitness / athletic performance)
- Current experience level (beginner / intermediate / advanced)
- Training availability (days per week, time per session)
- Equipment access (home / gym / limited)

**Optional on Day 1 (collect over time):**
- Current body weight / height
- Macronutrient targets
- Supplement stack
- Injury history
- Medical conditions (Soma, not Titan)

**Never ask at onboarding:**
- Specific macro split percentages (derive from goal)
- Preferred rep ranges (derive from goal + experience)
- Exercise preferences (learned from first session feedback)

### 8.3 Recommended Onboarding Redesign

**Path A: Chat-first (default for new users)**
```
Titan AI: "Hey [name] — 3 quick questions before I build your plan."
Q1: "What's your main goal right now?"  [strength / muscle / fat loss / general fitness]
Q2: "How many days per week can you train, and do you have a gym or are you training at home?"
Q3: "How long have you been training consistently?"

→ Titan generates a starter routine immediately.
→ "Here's your Week 1 plan. Want me to explain the reasoning, or shall we log your first workout?"
```

**Path B: Quick form (for power users who dismiss the chat)**
```
3 fields: Goal | Days per week | Experience level
[Start Training] button → generates plan
```

**Incremental profile completion:**
- After Session 1: "How did that feel? (1-10) — this helps me calibrate your weights"
- After Week 1: "Want to track your body weight? I'll use it to monitor your progress"
- After Week 2: "Do you want to add your nutrition targets so I can factor in recovery?"

**Onboarding complete criteria (revised):**
- ✅ Goal set
- ✅ Availability set
- ✅ Experience level set
- ✅ First routine generated
- 🕐 Everything else: optional, collected progressively

### 8.4 Medical Onboarding

Remove from Titan entirely. When a user first visits Soma, Soma conducts its own medical intake. Titan receives clearance status from Soma as a signal, not as a result of its own onboarding flow.

---

## 9. USER STORIES — NEXT SPRINT PRIORITIES

### Story T-001: Exercise Library Foundation
**As a** power user who logs workouts manually,  
**I want** Titan to recognize the exercises I type as canonical entities,  
**so that** I can see my progress on each exercise over time.

**Acceptance Criteria:**
- Given: A user types "Bench Press" in the RoutineBuilder
- When: The exercise name is saved
- Then: It is matched to a canonical Exercise entity (or creates a custom one if unrecognized)
- And: All future sessions logging "Bench Press" are linked to the same Exercise ID
- And: The AI can retrieve PR history for that exercise

**Given:** User logs a session with weight higher than any previous session for that exercise  
**When:** The `log_workout_session` action completes  
**Then:** A PR flag is set on that session entry and surfaced in the next chat response as a celebration

---

### Story T-002: PR Board
**As a** strength-focused user,  
**I want** to see my personal records for each exercise,  
**so that** I can track my strength progress at a glance.

**Acceptance Criteria:**
- Given: A user has logged at least 1 workout session with a completed set
- When: They navigate to the Progress tab
- Then: They see a PR board listing their top 5-10 tracked exercises with: best weight, best reps, e1RM, and date achieved
- And: Each exercise shows a sparkline trend over the last 90 days
- And: A "PR" badge appears on the most recent PR for each exercise

---

### Story T-003: Training Calendar View
**As any** Titan user,  
**I want** to see my week's training schedule as a visual calendar,  
**so that** I know what I'm doing today and what's coming up.

**Acceptance Criteria:**
- Given: A user has an active Routine with weekday assignments
- When: They view the Training tab
- Then: A 7-day week grid shows each assigned training day with the routine name
- And: Today is highlighted; past sessions show "Completed ✓" or "Missed ✗"
- And: Tapping a future day shows the planned exercises for that session
- And: Tapping today shows [Log Workout] CTA

---

### Story T-004: AI Mode / Logbook Mode Toggle
**As a** power user who prefers direct data entry,  
**I want** to disable mandatory AI mediation for form submissions,  
**so that** I can log workouts quickly without waiting for AI review.

**Acceptance Criteria:**
- Given: A user sets their preference to "Logbook Mode" in Titan settings
- When: They submit a workout session via the WorkoutSessionLogger form
- Then: The data is committed immediately to their profile (optimistic write)
- And: AI analysis runs in background and surfaces a non-blocking advisory banner if concerns are detected
- And: The user can dismiss the advisory or tap to view AI feedback
- Given: The same user switches back to "Coach Mode"
- When: They submit a workout session
- Then: AI review must complete before data is committed, with AI explanation shown inline

---

### Story T-005: Soma Boundary Cleanup — Remove Out-of-Scope Tabs
**As a** user who visits Titan for training,  
**I want** Titan to be focused on my physical performance,  
**so that** I'm not confused by biomarker charts and diagnosis tools in my training app.

**Acceptance Criteria:**
- Given: A user opens the Titan module
- When: They view the tab navigation
- Then: They see only 3 tabs: Training | Progress | Cycles
- And: The Biomarkers, Recovery, Sleep, and Diagnosis tabs are no longer present in Titan
- And: A "Health & Recovery" link in Titan's readiness widget navigates to the Soma module
- And: Readiness scores still display correctly by reading from NSV (no Soma tab required)

---

### Story T-006: Mesocycle Data Model Upgrade
**As a** user starting a 6-week strength block,  
**I want** to create a training program that links to my routines and has a defined deload week,  
**so that** Titan knows my periodization structure and can auto-recommend recovery.

**Acceptance Criteria:**
- Given: A user creates a new training cycle
- When: They define it as a "Strength Block" with 6 weeks duration
- Then: They can specify which routines are active in this cycle
- And: They can designate Week 6 as the deload week
- And: Titan AI automatically reduces training volume/intensity guidance during the deload week
- And: On completion, the cycle archives with performance summary

---

### Story T-007: Incremental Onboarding Redesign
**As a** new user opening Titan for the first time,  
**I want** to start training with minimal setup,  
**so that** I can get value immediately without filling out a long intake form.

**Acceptance Criteria:**
- Given: A new user opens Titan
- When: Onboarding begins
- Then: They are presented with the AI chat path by default, not the form
- And: The AI asks no more than 4 questions before generating a starter routine
- And: A starter routine appears within 60 seconds of onboarding start
- And: The user can begin logging their first session immediately after seeing the plan
- And: Additional profile fields (body weight, macros, injury history) are collected progressively via context-triggered prompts over the first 2 weeks

---

## 10. MVP FEATURE LIST FOR NEXT SPRINT (SPRINT 7)

Based on criticality, user impact, and architectural dependency order:

### Sprint 7 Scope (Titan Module Review & Refinement)

| Priority | Feature | Type | Rationale |
|----------|---------|------|-----------|
| P0 | **Exercise identity data model** | Architecture | All other advanced features depend on this. Must ship first. |
| P0 | **Soma tab cleanup** (remove Biomarkers / Sleep / Recovery / Diagnosis from Titan) | Architecture + UX | Directly resolves product identity confusion. |
| P0 | **Training calendar (7-day view)** | Feature | Table-stakes UX that every competitor has. Highest user visibility gap. |
| P1 | **PR board** (top exercises + e1RM) | Feature | Most motivating visible output. Requires Exercise identity (P0 must land first). |
| P1 | **Mesocycle data model upgrade** (link routines to cycle, add deload week) | Architecture | CycleEntry is currently disconnected from Routine. |
| P1 | **AI Mode / Logbook Mode toggle** | Feature | Resolves power-user friction with AI-gated writes. |
| P1 | **Onboarding simplification** (3-question chat → instant plan) | UX | Highest drop-off risk in current product is the 9-step onboarding. |
| P2 | **Goal tracking (structured goals)** | Feature | Powers AI progress reporting and milestone celebrations. |
| P2 | **RoutineBuilder full mount + wire** | Bug/Feature | Currently exists but not fully mounted (per backlog). Required for power users. |
| P2 | **ACWR calculation** | Analytics | Injury-risk metric; computable from existing session data. |

### Explicitly OUT of Sprint 7 Scope

- Wearable integration (platform-level capability, separate track)
- Nutrition daily food logging (out of Titan scope)
- Progress photos (nice-to-have)
- Program template library (Phase 2 of periodization)
- Full Program → Mesocycle → Week hierarchy (Phase 2)
- Predictive readiness ML (future)

---

## 11. TITAN vs. SOMA — FINAL BOUNDARY DEFINITION

```
┌─────────────────────────────────────────────────────────┐
│                      TITAN MODULE                        │
│                                                          │
│  OWNS:                                                   │
│  • Training routines (weekly templates)                  │
│  • Workout session logs                                  │
│  • Exercise library + PR tracking                        │
│  • Periodization cycles (training/recovery blocks)       │
│  • Readiness dashboard (computed from NSV inputs)        │
│  • Performance goals + milestones                        │
│  • Training program templates                            │
│  • Performance supplements (creatine, pre-workout)       │
│  • Volume analytics + ACWR                               │
│                                                          │
│  READS (via NSV, no Soma UI):                            │
│  • biological.sleepQuality                               │
│  • biological.cnsFatigue                                 │
│  • biological.recoveryScore                              │
│  • biological.hormonalContext                            │
│  • Clearance status snapshot (via soma-data-service)     │
│                                                          │
│  ENFORCES (but does not own):                            │
│  • Medical clearance gates (blocks high-intensity)       │
│  • Stress-driven deload (from Agnes via Spine)           │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                       SOMA MODULE                        │
│                                                          │
│  OWNS:                                                   │
│  • Sleep log + sleep quality computation                 │
│  • Biomarkers (blood work, labs, vitals)                 │
│  • Medical history (conditions, meds, allergies)         │
│  • Clearance issuance and management                     │
│  • Medical image analysis + diagnosis                    │
│  • Hormonal tracking + cycle phases                      │
│  • Supplement cycles (hormonal/medical context)          │
│  • Body weight vitals (raw measurement)                  │
│  • HRV + wearable data ingestion                         │
│                                                          │
│  WRITES TO NSV:                                          │
│  • biological.sleepQuality (after sleep log)             │
│  • biological.cnsFatigue (after HRV processing)          │
│  • biological.recoveryScore (after recovery calculation) │
│  • biological.hormonalContext (after cycle tracking)     │
│                                                          │
│  ISSUES TO TITAN (via Spine):                            │
│  • Clearance GRANTED / DENIED events                     │
│  • BLOCK_HIGH_INTENSITY cascade                          │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    SHARED / NEXUS                         │
│                                                          │
│  • NSV / GlobalSoul (cross-module state)                 │
│  • Spine event bus (cascades)                            │
│  • Exercise library (read by Titan; curated globally)    │
│  • Document intelligence (shared capability)             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 12. RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Exercise library migration breaks existing free-text exercises | High | High | Fuzzy-match existing exercise names to canonical library on first load; create custom exercise entries for unmatched names |
| Removing Sleep tab from Titan breaks `log_sleep` action | Medium | Medium | Delegate `log_sleep` to Soma service (same pattern as `commit_biomarker`). NSV still receives `sleepQuality`. |
| Power users reject AI Mode / accept Logbook Mode too eagerly (no AI coaching) | Medium | Low | Logbook Mode still runs AI in background; advisory banners keep coaching present without blocking |
| Mesocycle data model changes break existing `CycleEntry` records | Medium | High | Migration function: existing CycleEntry with `type: 'training'` → new TrainingBlock with defaults; other types → flag for Soma migration |
| Onboarding simplification loses important medical context | Low | Medium | Medical context is Soma's problem; Titan onboarding should never have been asking medical questions |
| Custom field values still not in LLM context (known gap) | High | Medium | Sprint 7 scope: inject active custom field values into session prompt context as "current user tracking" |

---

## APPENDIX: FEATURE SCORECARD SUMMARY

| Feature | Rating | Sprint 7? |
|---------|--------|-----------|
| Fast-track onboarding | ⚠️ Needs work | Yes — simplify |
| AI chat onboarding | ✅ Core | Yes — make default |
| AI routine generation | ✅ Core | No — already works |
| Manual RoutineBuilder | ⚠️ Needs work | Yes — full mount |
| Workout session logger | ⚠️ Needs work | Yes — after Exercise identity |
| RoutineProgress analytics | ⚠️ Needs work | Yes — add ACWR |
| CustomFieldManager | ⚠️ Needs work | Yes — inject into LLM context |
| Sleep tracker | 🔄 Misplaced | Yes — move to Soma |
| Cycle manager | 🔄 Misplaced (partial) | Yes — clean up types |
| Biomarkers tab | ❌ Scope creep | Yes — remove from Titan |
| Recovery/Clearance tab | ❌ Scope creep | Yes — remove, surface as banner |
| Diagnosis tab | ❌ Scope creep | Yes — remove from Titan |
| Readiness dashboard | ✅ Core | Yes — richer visualization |
| Spine cross-module reactivity | ✅ Core | No — already solid |
| Exercise library + PR tracking | 🔴 CRITICAL (missing) | Yes — P0 |
| Training calendar | 🔴 CRITICAL (missing) | Yes — P0 |
| 1RM/e1RM tracking | 🔴 CRITICAL (missing) | Yes — with Exercise library |
| Goal tracking (structured) | 🟡 IMPORTANT (missing) | Yes — P2 |
| ACWR calculation | 🟡 IMPORTANT (missing) | Yes — P2 |
| Deload auto-scheduling | 🟡 IMPORTANT (missing) | Partial — Sprint 7 data model |
| Periodization templates | 🟡 IMPORTANT (missing) | Phase 2 |
| Wearable integration | 🟡 IMPORTANT (missing) | Separate platform track |
| Nutrition daily log | 🟢 NICE TO HAVE | Out of scope |
| Progress photos | 🟢 NICE TO HAVE | Out of scope |

---

*This document is the authoritative product strategy reference for the Titan module. All sprint planning, architectural decisions, and design work on Titan should reference and update this document.*
