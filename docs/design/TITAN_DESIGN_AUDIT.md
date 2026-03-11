# TITAN MODULE — DESIGN AUDIT REPORT

**Author:** UI/UX Design Agent (Orchestrator Nexus)
**Date:** 2026-03-14
**Status:** FINAL
**Scope:** Full module audit — onboarding, training, logging, analytics, AI-gated writes, IA, visual design

---

## EXECUTIVE SUMMARY

Titan is the most architecturally ambitious module in AGNES and is also the most unresolved from a UX perspective. It has a strong foundation: the AI-gated write path is a sound pattern in theory, the glassmorphism visual language is consistent, and the split-pane layout is the right interaction model. However, the module suffers from three systemic problems:

1. **Identity crisis** — Titan is trying to be a trainer, a dashboard, a medical record, and a diagnostic tool simultaneously. Medical and clinical features that belong in Soma are embedded inside Titan, creating a Frankenstein module with an incoherent mental model.
2. **AI-gate misapplication** — The pattern of routing every write through AI is correct for structural data (routines, cycles) but is actively harmful for time-sensitive micro-logging (sleep, workout sets). Applying the same gating model to all operations creates frustrating latency for power users.
3. **Missing core fitness UX primitives** — No live session timer, no PR tracking, no previous-session reference during logging, no calendar view, no e1RM trend. These are table-stakes features for any serious fitness tracker.

---

## SECTION 1 — FORM & FIELD USABILITY

### 1.1 Fast-Track Onboarding Form

**What works:**
- Goal selection as chips (strength/hypertrophy/weight loss/endurance/general fitness) is clean and scannable. Zero typing required for the most common decision.
- Experience level as chips (beginner/intermediate/advanced) follows the same pattern correctly.
- Fast-track placement inside a collapsible `prelude` section of `GuidedIntakeFrame` is clever — it doesn't block the chat path.

**Critical Issues:**

**[F-01] Privacy gate fires BEFORE fast-track is visible.**
The user is forced to choose "Basic Data" vs "Complete Data" before they have seen any content, context, or explanation of what those modes do. This is inverted. New users have no frame of reference for "complete data includes biological and intimate factors." The consequence is users choosing the wrong mode, then finding out what it meant after the fact. The privacy level choice should either be deferred to settings or surfaced mid-intake with a contextual explanation ("I'd like to ask about hormonal context — would you like to enable that?").

**[F-02] Supplements field is a freeform comma-separated string.**
`fastSupplements` is a plain `<input>` with placeholder "Supplements (comma-separated, optional)". Supplements are medical-adjacent data that affects AI recommendations. Freeform text produces messy data (users type "creatine, 5g" or "Creatine Monohydrate" or "creatine monohydrate 5g daily" for the same supplement). This should be a pill/chip entry pattern with autocomplete for common supplements (creatine, protein, BCAA, fish oil, caffeine, pre-workout).

**[F-03] Injuries field is a single text input.**
`fastInjuries` is a plain text input. Injuries drive exercise exclusions and training modifications. An input of "bad knee" is meaningless to a program generator. This field needs structured options (multi-select) or at minimum clear guidance: "Be specific: 'left knee ACL (recovered)', 'lower back herniated disc (L4-L5)'."

**[F-04] No height/weight in fast-track.**
`activity.baselineWeight` and `activity.baselineHeight` are in the profile model but absent from fast-track. Without weight data, the AI cannot calibrate load percentages, estimate maintenance calories, or compute BMI context. These two fields should be optional additions to fast-track.

**[F-05] No baseline strength fields.**
For users with a goal of "strength" or "hypertrophy", the single most important calibration datum is their current working weights (e.g., "I squat ~100kg for 5×5"). Without this, AI-generated routines must assume generic beginner loads. An optional "current approximate lifts" field (squat/bench/deadlift) would dramatically improve plan quality.

**[F-06] "Execute" button label is polarizing.**
The CTA to submit fast-track is "Execute." This is on-brand for Titan's intense persona but will confuse first-time users not yet acculturated to the system. A/B candidate: "Start Training" or "Build Profile." "Execute" implies running a command, not beginning a fitness journey.

**[F-07] Fast-track validation is fully async with no graceful fallback.**
`validateFastTrack()` makes an AI call. If the AI is unavailable, `setFastTrackError('Fast-track validation failed. Continue guided onboarding...')` is shown. There is no retry button, no "try anyway" bypass, and no offline-capable validation. Since fast-track is used for urgent entry, the validation should be client-side for basic fields (goal + experience) and AI-optional for enrichment.

---

### 1.2 Full Chat-Guided Intake (4 Trainer Steps)

**[F-08] Step 1 is "Nutrition Intake" — wrong opening topic.**
The guided intake starts by asking "what do you typically eat and which supplements do you take?" But the user has already selected their goal. The natural opening for a fitness intake is activity level and training history, not diet. Nutrition as step 1 front-loads the most tedious data entry before the user is emotionally committed. Resequence: Activity → History/Goals → Nutrition → Sync.

**[F-09] "Routine Sync" (Step 4) label is opaque.**
Users don't know what "Routine Sync" means before experiencing it. Labels should be action-outcome-based: "Generate Plan" or "Activate Profile" would be more motivating and clear.

**[F-10] No "captured data" side panel during intake.**
As the AI extracts data from conversation, the user cannot see what has been captured. There is a `TitanIntakeAccumulator` tracking state, but it's not visualized for the user. This creates trust anxiety: "Did it understand what I said? Did it get my injury right?" A lightweight sidebar showing captured data in real-time (like a form being filled in as you chat) would dramatically increase confidence.

---

### 1.3 Medical Gate & Intake (5 Steps)

**[F-11] Consent appears at the END of medical intake.**
The medical disclaimer and consent checkbox appear at step 3 (the last step), after the user has already entered conditions, medications, and allergies. From a UX and legal perspective, consent must precede data entry. Reorder: Consent → Conditions → Medications → Allergies → Confirmation.

**[F-12] Conditions/medications/allergies as comma-separated textareas.**
Three separate textareas asking for comma-separated medical data. Modern health apps use structured list inputs. At minimum, this should be a tag/chip input that creates a visual list. Free text produces malformed data: "asthma, Type 2 diabetes, knee replacement (2019)" all become a single string. When migrating this data to SomaProfile it will need cleanup.

**[F-13] "Skip All" as back-button label in medical intake.**
At step 0 of medical intake, the back button is labeled "Skip All." The back button semantically means "go back one step." Labeling it "Skip All" and making it skip the entire medical intake is a hidden destructive action. Split these: a separate "Skip All" link below the navigation, and a back button that goes back one step.

**[F-14] Medical intake is form-based inside a chat-first onboarding flow.**
The user spends steps 1-4 in a rich AI chat conversation, then suddenly hits a stepped HTML form for medical data. This is a jarring modality switch. The medical intake should either be fully form-based (consistent) or AI-chat-guided (consistent). Currently it's neither — it's a hybrid that signals the system wasn't designed holistically.

**[F-15] Medical gate in Titan should be removed entirely.**
The medical profile fields (`knownConditions`, `medications`, `allergies`) are `@deprecated` on `TitanProfile` and are migrating to `SomaProfile`. The medical gate during Titan onboarding is carrying forward a deprecated model. This entire phase should be removed from Titan's onboarding. When a user first opens Soma, they'll complete the medical intake there. A cross-module prompt ("Complete your health profile in Soma for better Titan recommendations") is sufficient.

---

### 1.4 RoutineBuilder Form

**What works:**
- Drag-and-drop reordering with `@hello-pangea/dnd` and explicit `GripVertical` handle is the correct implementation.
- Template library with Push/Pull/Legs/Arms/Core categorization provides excellent scaffolding.
- Volume estimate and duration estimate in the sidebar are useful meta-feedback.
- Duplicate exercise function is power-user appropriate.

**Critical Issues:**

**[F-16] Native `alert()` for validation errors.**
```typescript
if (!name.trim()) {
  alert('Please provide a routine name');
  return;
}
```
A browser-native `alert()` inside a dark glassmorphism AI application is a design system violation. All validation errors must use inline error states with NeuralInput error styling or a toast notification via `SpineToast`.

**[F-17] Template library is a modal nested inside a modal.**
`showTemplateLibrary` renders a `NeuralModal` inside `RoutineBuilderModal` which is itself a `NeuralModal`. This creates double-layered modal overlay. The template library should be implemented as a slide-over panel on the right side of the RoutineBuilder, or an inline filterable accordion within the builder's own layout.

**[F-18] Duration estimate formula is wrong.**
```typescript
const estimatedDuration = exercises.length * 5; // Rough estimate: 5 min per exercise
```
A 5-minute-per-exercise estimate is inaccurate by an order of magnitude for compound movements. 4 sets of back squats with 3-minute rest periods = ~16 minutes for one exercise. This estimate misleads users into underestimating workout duration. Remove this estimate or replace with: `sets × restPeriod + sets × setDuration` per exercise.

**[F-19] Reps field accepts range strings without guidance.**
The `reps` field (type: `string`) accepts formats like "8-10", "AMRAP", "60s". The volume calculation extracts `parseInt(repsStr.match(/\d+/)[0])`, which silently takes the first number. Users who enter "10-12" get volume calculated as if reps=10. There should be clear field guidance: "Enter reps or a range (e.g. 10 or 8-12)."

**[F-20] No per-exercise rest period field.**
Rest periods are exercise-specific (compound: 2-4 min, isolation: 60-90 sec). The `RoutineBuilder` has no rest period input per exercise. The `RestPeriodCalculator` widget exists separately but is disconnected from exercise authoring.

**[F-21] No exercise category tag.**
Exercises have no category label (push/pull/legs/core) once saved. After creation, there's no way to see muscle group distribution. A `category` field added to the `Exercise` type and shown in the routine detail view would enable the muscle group analysis currently missing.

---

### 1.5 WorkoutSessionLogger

**What works:**
- Today's routine prominently surfaced and auto-selected is good progressive disclosure.
- Progress bar (completed sets / total sets) is a micro-motivation mechanic.
- RPE slider is appropriately placed at the end of the session.
- Stale session warning (>240 min) is a thoughtful edge case.

**Critical Issues:**

**[F-22] No live rest timer.**
Every major fitness tracking app (StrongLifts 5×5, Hevy, RepCount, Strong) has a countdown timer between sets. Titan has no timer whatsoever. Rest periods are the most time-sensitive part of a workout session. This is a missing core feature.

**[F-23] No previous session reference.**
When logging a set, there is no display of "Last session: 80kg × 8 reps" next to each field. Progressive overload — the fundamental principle of strength training — requires knowing what you lifted last time. Without prior session data visible, users must remember from memory, which defeats the purpose of tracking. The `recentSessions` prop is available; the last matching session's set data should be shown as placeholder or reference text.

**[F-24] Weight unit hard-coded to "kg".**
The weight placeholder is "kg" with no unit toggle. A majority of users in North America use pounds. No unit preference system exists in the current code. This needs `lbs/kg` toggle persisted in user preferences.

**[F-25] Two-step set completion (enter data + tap circle) is redundant.**
Entering both weight and reps in a set and then manually tapping the completion circle is two steps for a single logical action. The set should auto-complete when both weight and reps are entered (with ability to uncheck). The tap-to-complete model is appropriate for bodyweight exercises (no weight entry), but not for weighted sets.

**[F-26] Session modal has 50vh max-height constraint.**
For routines with 7+ exercises, the `max-h-[50vh]` on the exercise list creates a scroll-within-a-modal pattern that is particularly bad on mobile. The session logging experience should be a full-screen view, not a constrained modal.

**[F-27] "Finish & Send to Titan" copy is insider jargon for new users.**
New users don't know who or what "Titan" is as an agent vs the module they're using. This should be "Log Session" with a small sub-label: "Titan will review and save your performance data."

---

### 1.6 SleepTracker

**What works:**
- Bedtime + wake time → auto-derived duration with midnight crossing support is correct.
- Sleep factors tags (8 options: stress, alcohol, caffeine, etc.) are well-chosen.
- 7-night quality bar chart is effective at-a-glance.
- MetricCard grid with average quality, average duration, last night score is good.

**Critical Issues:**

**[F-28] "Save & Analyze" creates an AI message, not a direct write.**
Sleep logging is a quick daily operation. Sending it through `onAnalyze(prompt)` means every sleep entry spawns an AI conversation. A user who wants to log last night's sleep quickly and move on cannot do so. Sleep logging must have a **direct save path** alongside the AI analysis option. The button should split into "Save" (silent commit) and "Save & Analyze" (commit + AI feedback).

**[F-29] Sleep quality slider allows 0.**
Sleep quality slider goes `min={0} max={10}`. A quality score of 0 is semantically nonsensical (it would imply no sleep at all). The slider should start at `min={1}`. The current `qualityLabel(0)` returns "Very Poor" which is misleadingly mild.

**[F-30] Cyan theme inside an orange module.**
`themeColor="cyan"` is applied to the SleepTracker's modal, buttons, MetricCards, and border accents. Every other Titan component uses orange. This is a module-level visual inconsistency. Sleep is a recovery metric but it lives in Titan, and Titan's color is orange. Use orange (or accept a neutral/white theme for sleep) but not a competing accent color.

**[F-31] No bedtime consistency visualization.**
The bar chart shows quality scores. Duration is shown as a single average metric. But there is no visualization of bedtime variance or wake consistency — which are the actual predictors of sleep quality. Even a simple "your average bedtime was 11:32pm, variance ±47min" line would be informative.

---

### 1.7 CycleManager

**What works:**
- 6 cycle types with distinct icons and label colors is well-differentiated.
- Active/completed/paused separation in the list view is correct.
- Phase list in CycleDetailModal with current/done/upcoming visual states is clear.
- Advance phase goes through AI — correct for complex cycle types.

**Critical Issues:**

**[F-32] No direct-create path for simple cycles.**
"New Cycle" fires an AI conversation. A user who wants a 4-week creatine loading protocol (a common, well-understood supplement cycle) must describe it to the AI and wait. Power users should have a form-based cycle creator for standard cycle types. AI creation should be offered as an alternative ("Not sure? Let AI guide you"), not the only path.

**[F-33] Progress bar measures phase position, not time elapsed.**
```typescript
const progress = cycle.phases.length > 0
  ? Math.round(((cycle.currentPhaseIndex) / cycle.phases.length) * 100)
  : 0;
```
This shows 0% until you've advanced past the first phase, regardless of how many days you've been on it. Replace with time-based progress: `daysElapsed / phase.durationDays * 100` for the current phase, with an overall cycle progress using total days.

**[F-34] Heart icon for hormonal cycle type.**
`Heart` (the Lucide heart icon) is semantically associated with "favorites" and "likes" in modern UI. For a hormonal tracking category that may include sensitive cycle data, this icon sends the wrong message. Use `Activity`, `Droplets`, or `FlaskConical` instead.

**[F-35] Completed and paused cycles visually grouped.**
```typescript
const completed = cycles.filter(c => c.status !== 'active');
```
Paused cycles (temporarily stopped, user may resume) and completed cycles (finished, historical) are lumped into the same list. These are meaningfully different states and should be separate sections.

---

### 1.8 CustomFieldManager

**[F-36] The "Custom" label is a misnomer — fields are hardcoded.**
The `CustomFieldManager` presents itself as a custom field system but contains fixed fields with hardcoded IDs like `customBiomarker_glucose`, `customExercise_1_name`, and `customGoal_strength`. True custom fields would let users define field name, type, and category. The current implementation is "Additional Hardcoded Fields" masquerading as customization.

**[F-37] "Custom Biomarkers" category duplicates the Biomarkers tab.**
Blood glucose, body fat %, VO2 max, resting HR, and HRV all appear in the `CustomFieldManager` under "Custom Biomarkers." These same metrics belong in (and often also exist in) the Biomarkers tab via `BiomarkerDashboard`. Users can enter glucose in two places with no reconciliation. This must be eliminated.

**[F-38] "Custom Exercises" category should not exist.**
Exercises are managed in `RoutineBuilder`. `customExercise_1_name` / `customExercise_1_notes` are vestigial exercise slot overflow fields that have no connection to the routine system. Remove the Exercises category from `CustomFieldManager` entirely.

**[F-39] All `CustomFieldManager` writes go through AI.**
Water intake, calorie goal, and protein goal all require AI validation before commit. A user setting their daily water intake to 2L should not need AI review of that number.

---

## SECTION 2 — INFORMATION ARCHITECTURE

### 2.1 The 6-Tab Problem

**Current:** Training | Biomarkers | Recovery | Sleep | Cycles | Diagnosis

**[IA-01] Sleep is over-elevated to a top-level tab.**
Sleep is a recovery input — it's contextually subordinate to the Recovery tab, not a peer of the entire Training domain. The current placement implies Sleep is as significant as all of Training (routines, sessions, progress, custom fields). Recommended structure:

```
Training | Cycles | Recovery (contains: Sleep + Clearances + Readiness) | Biomarkers | Diagnosis
```

**[IA-02] Biomarkers and Recovery tabs are Soma's domain rendered inside Titan.**
```tsx
case 'biomarkers':
  return <BiomarkerDashboard profile={medicalProfile} ... />;
case 'recovery':
  return <ClearancePanel profile={medicalProfile} ... />;
```
The user is inside the Titan module but looking at components imported from `@/modules/soma/`. There is no label, transition, or navigation affordance indicating they've crossed a module boundary. This creates a "Frankenstein module" that is neither Titan nor Soma — it's both, with no clear identity.

**Recommended approach:** Replace Biomarkers/Recovery with deep-links to Soma. Show a summary widget in Titan ("Your last 3 biomarkers" or "Current clearance status") with a "→ Open in Soma" link. This preserves context without embedding another module's entire UI.

**[IA-03] Diagnosis tab is entirely the wrong module.**
The `TitanDiagnosisPanel` performs:
- Medical document analysis
- Biomarker extraction from lab PDFs
- Medical clearance issuance

None of these are physical performance coaching activities. The `titanDiagnosisSpec.label` is "Medical Analysis." The Titan module's identity is physical performance coaching. This tab belongs in Soma's navigation, not Titan's.

The only Titan-adjacent use case is "analyze lab report to inform training load" — which could be a single AI prompt in the chat panel, not an entire tab with a separate diagnosis engine.

**[IA-04] Training tab carries five distinct functional areas.**
The Training tab scrolls through: `TitanDashboard` → `TitanRoutinePanel` → `WorkoutSessionLogger` → `RoutineProgress` → `CustomFieldManager`. These are five distinct UX contexts stacked vertically. The tab needs sub-navigation or a recommended split:

```
Training tab → sub-tabs: [Plan] [Log] [Analytics]
```

- Plan: TitanDashboard + TitanRoutinePanel
- Log: WorkoutSessionLogger
- Analytics: RoutineProgress

**[IA-05] No "Today" or unified daily dashboard.**
There is no dedicated view that answers the question: "What should I do today?" A user opening Titan needs: today's workout (from routine), readiness score (from GlobalSoul), last night's sleep quality, current cycle phase, and recovery status — all in one screen. Currently, this information is scattered across Training (readiness), Sleep (sleep quality), Cycles (phase), and Recovery (clearance). A `TodayView` component at the top of Training tab is the right entry point.

**[IA-06] Tab ordering prioritizes medical data over performance data.**
Order: Training | **Biomarkers** | **Recovery** | Sleep | Cycles | Diagnosis

A performance-focused user cares about Training > Cycles > Sleep > Recovery > Biomarkers > Diagnosis. The current order puts medical tabs 2nd and 3rd, which are the least frequently used tabs for the core persona (fitness enthusiast, not medical patient).

Recommended order: **Training | Cycles | Sleep | Recovery | Biomarkers | Diagnosis**

### 2.2 Mental Model Incoherence

Titan is simultaneously trying to be:
- A **personal trainer** (AI agent, routine generation, coaching)
- A **workout logger** (session tracking, set/rep/weight logging)
- A **health dashboard** (biomarkers, clearances, vitals)
- A **medical analyst** (lab document processing, diagnosis)

The first two are coherent as a fitness module. The last two belong in Soma. The current design attempts to merge all four, resulting in a module without a clear identity.

**Titan's definition should be:** *"Your AI-powered training coach. Build your routine, log your sessions, track your progress."*
**Soma's definition should be:** *"Your health intelligence layer. Monitor biomarkers, manage clearances, analyze lab data."*

Everything in Titan that doesn't fit the first definition should be moved to Soma.

---

## SECTION 3 — TRACKING & LOGGING UX

### 3.1 Workout Session Logging

**[L-01] No live rest timer between sets.**
This is a P0 missing feature. The session logger opens a modal with exercise sets, but once a set is checked off there is no countdown timer for rest periods. Every mature fitness tracking application (StrongLifts, Hevy, RepCount, Strong) includes automatic rest timers that trigger on set completion. Without a timer, the logger is a data entry form rather than a training companion.

**[L-02] No previous session reference visible during logging.**
When entering weight and reps for a set, the user sees no reference to what they lifted last time. The `recentSessions` array is passed as a prop but is only used to show total volume in the summary. The last matching session's per-exercise per-set data should appear as muted "last time: Xkg × N reps" reference text.

**[L-03] Session logger is modal-based with 50vh constraint.**
For serious workout logging with 6-10 exercises × 4 sets each, the `max-h-[50vh] overflow-y-auto` on the exercise list creates a scroll-within-modal that is unusable in a gym context, especially on mobile. The session logger needs to be either a full-screen dedicated view or a persistent slide-over panel, not a constrained modal.

**[L-04] No date override for backdated sessions.**
`date` in the session prompt is always `getTodayIso()`. There is no UI to log a session from yesterday or earlier. Athletes who forget to log mid-session have no recovery path.

**[L-05] No offline resilience.**
Session logging sends data via `ai.handleSendMessage()`. In a gym with poor cellular coverage, this will fail silently (the modal closes, data is lost). Session logs should be queued locally and synced when connectivity returns.

### 3.2 Sleep Tracking

**[L-06] Every sleep entry creates an AI conversation message.**
The `handleSave` function sends a prompt via `onAnalyze()`. Quick nightly sleep logging becomes a chat message requiring AI processing. This is architecturally wrong. A direct save path (`log_sleep_entry` action or direct Firestore write) must exist, with AI analysis as an opt-in.

**[L-07] Sleep and HRV are disconnected.**
HRV (Heart Rate Variability) is the single most scientifically validated sleep recovery metric. It appears in `CustomFieldManager` → Custom Biomarkers → "Heart Rate Variability (ms)" as a separate unconnected field. HRV should be a first-class field in the sleep log entry alongside quality, duration, and stages.

**[L-08] No bedtime consistency metric.**
Sleep science is clear: bedtime consistency (variance in when you fall asleep each night) matters as much as duration. No visualization exists for this. A simple standard deviation of bedtime over 14 days would be valuable.

### 3.3 Cycles

**[L-09] No direct-create path for simple, well-defined cycles.**
See F-32. Adding: the 6 cycle types have very different creation complexity. Supplement cycles (e.g., creatine 4-week protocol) are fully parameterizable in a simple form. Hormonal cycles genuinely benefit from AI guidance. A tiered creation UX (form for simple types, AI for complex types) would serve both user groups.

**[L-10] No cycle calendar visualization.**
There is no way to see the timeline of cycle phases on a calendar. Users need to know "my deload week starts Week of Nov 10." A horizontal phase timeline or calendar integration is missing.

**[L-11] Completed cycles capped at 3 in list view.**
```typescript
{completed.slice(0, 3).map(c => <CycleCard ... />)}
```
No "show more" / "view history" link. Completed cycle history is effectively invisible after 3 entries.

### 3.4 RoutineProgress Analytics

**[L-12] Weekly schedule chart is a binary 0/1 chart.**
The "Weekly Schedule" bar chart renders a bar of height 1 for days with a routine and 0 for rest days. This chart communicates only presence/absence and carries no information about volume, intensity, or muscle groups. It should be replaced with a volume bar chart (planned sets by day) or a muscle group heatmap by weekday.

**[L-13] "Planned Volume" measured in reps, not meaningful units.**
Pre-session planned volume shows `N planned reps`. Volume in strength training is `weight × reps × sets`. Without weight data, planned volume in reps is a meaningless metric. The planned volume display should either be removed or replaced with "Planned Total Sets" (which is actually useful) and a note that volume will show kg once sessions are logged.

**[L-14] Zero PR (Personal Record) tracking.**
There is no PR detection anywhere in the codebase. No celebration, no history, no chart. This is one of the highest-motivation features in fitness apps. When a user logs a set with higher weight or more reps than any previous session for that exercise, a PR should be detected and highlighted.

**[L-15] No estimated 1-rep max (e1RM) trend.**
The Epley formula (`weight × (1 + reps/30)`) or Brzycki formula can estimate 1RM from working sets. This trend over time is the gold standard metric for strength progress. Not a single e1RM calculation exists in the codebase.

---

## SECTION 4 — AI vs MANUAL POWER USER TENSION

### 4.1 AI-Gated Write Path Assessment

The current implementation routes all mutations through AI:

| Operation | AI Gate | Assessment |
|---|---|---|
| Build/edit routine | ✅ Required | CORRECT — AI can catch imbalanced programming |
| Create cycle | ✅ Required | CORRECT for complex types, OVERKILL for simple |
| Log workout session | ⚠️ Optional should exist | PROBLEMATIC — latency in gym context |
| Log sleep entry | ❌ Direct save needed | WRONG — purely data logging |
| Update custom fields | ❌ Direct save needed | WRONG — logging water intake needs no AI review |
| Advance cycle phase | ⚠️ Optional should exist | ACCEPTABLE but needs direct-advance override |

### 4.2 Failure Modes

**[AI-01] AI unavailability blocks all writes.**
If the AI is rate-limited, offline, or returning errors, users cannot commit any data to the system. Sleep logs, session data, and custom field values are all blocked. There is no local-first queue or direct-write fallback. For time-sensitive gym logging, this is a P0 reliability risk.

**[AI-02] No AI override / "trust me" path.**
If the AI disagrees with user-entered data (flags a 220kg squat as unusually high, or flags a nutrition custom field value), there is no "I confirm this is correct, override AI" path. Users are entirely at the AI's mercy. Advanced users with legitimate edge-case data have no recourse.

**[AI-03] AI response verbosity mismatch.**
For simple operations (logging a session), the AI may respond with a 3-paragraph analysis when the user wanted a one-line confirmation. There is no "quiet commit" mode where the AI processes and saves without generating a chat message in the visible thread.

**[AI-04] Every session log clears from the modal immediately.**
The session modal closes after "Finish & Send to Titan" before the AI has confirmed receipt. If the AI is processing slowly or errors, the user has no indication whether their session was saved. The modal should remain in a "submitting" state until AI confirmation is received, or show a toast confirmation.

### 4.3 Recommended Power User Mode

Introduce a **Direct Write Mode** (toggle in Titan Settings):
- In this mode, `log_workout_session`, `log_sleep_entry`, and custom field updates write directly to the database without AI roundtrip.
- AI analysis remains available on-demand (button: "Analyze with Titan").
- Routine creation and cycle management remain AI-gated regardless of mode.

This creates a clean separation: AI-gated for **structural decisions** (routines, cycles), direct writes for **data capture** (sessions, sleep, fields).

---

## SECTION 5 — MISSING FEATURES

### 5.1 Progress & Analytics (P0)

**[MF-01] PR (Personal Record) Detection**
Required. When `setWeight > all previous sets for this exercise → showPR = true`. Surface as: badge in session summary, highlight in RoutineProgress, dedicated "PR Board" card.

**[MF-02] Estimated 1-Rep Max (e1RM) Trend**
Required for strength goals. Formula: `e1RM = weight × (1 + reps / 30)` (Epley). Compute per exercise per session, store trend, visualize as line chart.

**[MF-03] Body Weight Over Time**
`activity.baselineWeight` is a static snapshot. Weight tracking requires time-series data. Add a weight log (date, weight) alongside the workout session logger. Visualize as line chart with goal target line.

**[MF-04] Muscle Group Frequency / Volume Heatmap**
Using exercise-to-muscle-group mapping (which the template library already partially has via categories: Push/Pull/Legs/Arms/Core), calculate weekly volume per muscle group and display as a color-coded grid.

### 5.2 Calendar & Schedule (P1)

**[MF-05] Training Calendar View**
A monthly calendar showing: scheduled sessions (routine days), completed sessions (green checkmark), missed sessions (grey), rest days. Should be the primary entry point for history review.

**[MF-06] Cycle Phase Calendar Overlay**
Display cycle phases as color bands over calendar dates (similar to a Gantt chart). Users need to know when their deload week falls.

### 5.3 Active Session Experience (P1)

**[MF-07] Live Rest Timer**
Between-set countdown timer with configurable duration per exercise. Vibration/audio cue on completion. This single feature would make Titan viable as an active gym companion.

**[MF-08] Previous Session Prefill**
When opening a session, pre-populate weight fields with last session's data. Let users simply confirm or increment. This is the most impactful UX change for session logging.

### 5.4 Wearable Integration (P2)

**[MF-09] Health Data Import Surface**
A visible integration surface in Titan (and/or Soma) for connecting Apple Health, Google Fit, Garmin, WHOOP, or Oura. Even if full integration isn't built yet, a placeholder with "Connect Device" UX establishes the mental model for where this data enters the system.

**[MF-10] HRV as First-Class Sleep Metric**
HRV should be a field in the sleep log entry (not buried in CustomFieldManager). It's the bridge metric between sleep and training readiness.

---

## SECTION 6 — SCOPE CREEP / UNNECESSARY COMPLEXITY

### [CUT-01] Diagnosis Tab — Remove from Titan

**Verdict: Move to Soma. Remove from Titan entirely.**

The `TitanDiagnosisPanel` + `titanDiagnosisSpec` is medical document analysis infrastructure. Its `label = 'Medical Analysis'`, it handles `commit_biomarker` and `issue_clearance` actions, and its empty state says "Describe symptoms." None of this is physical performance coaching. Its presence in Titan:
- Confuses users ("Am I in a fitness app or a medical app?")
- Duplicates Soma's document analysis capabilities
- Adds 4 source files (`titan-diagnosis-*.ts`) to Titan's codebase with no Titan-unique value

**Replacement:** A single "Open Medical Analysis in Soma →" link from Titan's Biomarkers tab.

### [CUT-02] Medical Gate in Onboarding — Remove from Titan

**Verdict: Remove. Belongs in Soma onboarding.**

`TitanProfile.knownConditions`, `.medications`, `.allergies` are all `@deprecated`. The medical gate (5 steps adding conditions, medications, allergies, consent) should be fully removed from Titan's onboarding. Cross-module prompt instead: "Your Soma profile is incomplete. Complete your health data for personalized training clearances. [Set up Soma →]"

### [CUT-03] CustomFieldManager "Exercises" Category — Remove

**Verdict: Cut.**

`customExercise_1_name` / `customExercise_1_notes` etc. have no architectural purpose. Exercises are managed through RoutineBuilder. These fields represent an old "overflow slot" design that was superseded by the full RoutineBuilder implementation.

### [CUT-04] CustomFieldManager "Custom Biomarkers" Category — Move to Soma

**Verdict: Move to Soma's biomarker entry flow.**

Blood glucose, body fat %, VO2 max, resting HR, and HRV are health biomarkers managed by Soma. Having a second entry path in Titan creates divergent data. Remove this category from `CustomFieldManager` and surface a "Log Biomarker →" link to Soma.

### [CUT-05] RestPeriodCalculator as a Standalone Card — Demote

**Verdict: Inline hint, not a card.**

The `RestPeriodCalculator` is a lookup table rendered as a `SurfaceCard` in every routine detail view. It occupies substantial space for information that changes only when the user changes the selector. It should be:
- A collapsible inline info section within the routine detail (starts collapsed)
- OR moved to the RoutineBuilder as a tooltip on the exercise intensity field

A full card for static lookup data in every modal view is disproportionate to its utility.

### [CUT-06] "Biomarkers" and "Recovery" Tabs as Full Soma Embeds — Refactor

**Verdict: Replace with summary widgets + deep-links.**

Embedding complete Soma module components (`BiomarkerDashboard`, `ClearancePanel`) inside Titan creates the illusion that Titan owns medical data. Replace with:
- `TitanBiomarkerSummary` — a small widget showing last 3 biomarker readings with "→ Full Biomarker Dashboard in Soma"
- `TitanClearanceSummary` — a status indicator showing current clearance state with "→ Manage Clearances in Soma"

This keeps cross-module context without fragmenting Soma's UI across modules.

---

## SECTION 7 — VISUAL DESIGN NOTES

### 7.1 Consistency Issues

**[VD-01] Sleep tab uses cyan throughout an orange-themed module.**
`themeColor="cyan"` in `SleepTracker` creates a visually distinct sub-experience within Titan. The Log Sleep button, the modal title, the MetricCards, and the BarChart all render in cyan. This signals a different module. Standardize to orange or use a neutral theme if cyan is semantically required for sleep.

**[VD-02] Dynamic Tailwind class names in RestPeriodCalculator will be purged.**
```typescript
const cnsColor = cnsImpactColor[recommendation.cnsImpact]; // 'emerald' | 'amber' | 'rose'
// Used as:
`bg-${cnsColor}-500/10 border border-${cnsColor}-500/20 text-${cnsColor}-300`
```
Tailwind CSS purges classes that aren't statically detectable at build time. Dynamic class interpolation (`bg-${variable}-500/10`) will not survive the production build unless these class strings are added to `tailwind.config.js` `safelist`. This is a live production bug producing invisible/unstyled CNS impact badges.

**[VD-03] Sub-pixel text sizes fail WCAG AA contrast.**
Labels at `text-[8px]` and `text-[9px]` (approximately 6-7px rendered) are below WCAG 2.1 AA minimum of 4.5:1 contrast for normal text and below the practical readability threshold for users with minor visual impairments. Affected locations:
- Exercise set labels: `text-[8px] font-black uppercase tracking-[0.2em]`
- PanelLabel metadata: `text-[9px]`
- Status badges on cycles: `text-[9px] font-black uppercase`
- Recent session metadata: `text-[10px] text-white/40`

While `font-black` and `uppercase tracking` partially compensate, the baseline font size needs a floor of 10px for small labels and 12px for body text.

**[VD-04] Inconsistent horizontal padding between components.**
Within the Training tab:
- `TitanRoutinePanel` uses `px-6`
- `WorkoutSessionLogger` wrapper uses `px-8`
- `RoutineProgress` wrapper uses `px-8`
- `CustomFieldManager` wrapper uses `px-8`

The 2px discrepancy between RoutinePanel (`px-6`) and all other components (`px-8`) creates a subtle horizontal rhythm break. All Training tab components should share a single padding token (`px-8` or `px-6`), applied once by the parent layout, not individually by each component.

### 7.2 Loading & Empty States

**[VD-05] No skeleton states during profile load.**
When `TitanProfile` is loading (`profile === null`), all components receive null data and render empty states (zero sessions, zero routines, etc.) simultaneously. The existing `Skeleton.tsx` component is available but unused in Titan. First-paint on profile load should show skeleton placeholders rather than all-empty-state screens.

**[VD-06] WorkoutSessionLogger has no submission feedback.**
After "Finish & Send to Titan" the modal closes immediately. The user has no feedback that:
a) The session was received
b) The AI is processing
c) The session was successfully saved

The modal should either show a brief "submitting..." overlay before closing, or a toast notification should confirm receipt.

### 7.3 The Hormonal Synchronicity Panel

**[VD-07] "Hormonal Synchronicity Active" panel has no actionable state.**
The female-user conditional panel in `TitanDashboard` renders:
- "Current State: Awaiting data"
- "Metabolic Intensity: Baseline Optimization"

Both are placeholder strings with no real data. The panel occupies significant vertical space (full-width `rounded-3xl`) at the top of the Training tab with zero information value. Either populate it with real data from the hormonal context or hide it entirely when data is absent. A panel that says "Awaiting data" for a majority of its lifetime should default to hidden.

### 7.4 Accessibility Gaps

**[VD-08] Session logger set inputs have no labels.**
```tsx
<input type="number" placeholder="kg" ... />
<input type="number" placeholder="reps" ... />
```
These inputs use only `placeholder` for labeling. Placeholders disappear on focus and are not announced by screen readers as labels. All inputs need associated `<label>` elements or `aria-label` attributes.

**[VD-09] Interactive buttons without accessible names.**
The `+/-` buttons in the session modal (`addSet`, `removeSet`) use only icon children:
```tsx
<button type="button" onClick={() => removeSet(exIdx)}>
  <Minus className="w-3 h-3" />
</button>
```
No `aria-label`, no visible text. Screen readers announce these as "button" with no context. Add `aria-label="Remove last set"` / `aria-label="Add set"`.

**[VD-10] Color as sole status indicator.**
RPE colors (green = easy, orange = moderate, red = max), sleep quality colors, and cycle status colors all use color as the sole differentiator. Users with color vision deficiency cannot distinguish these states. Add a secondary indicator: text label, icon, or pattern alongside color.

---

## PRIORITY REDESIGN LIST

### Tier 1 — Critical (Block GA)

| ID | Issue | Effort | Impact |
|---|---|---|---|
| IA-03 | Remove Diagnosis tab from Titan, move to Soma | Medium | High — module identity |
| F-15 | Remove medical gate from Titan onboarding | Low | High — data model alignment |
| L-01 | Add live rest timer to session logger | Medium | High — core gym UX |
| L-02 | Show previous session data during logging | Medium | High — progressive overload |
| F-28 | Add direct save path for sleep logging | Low | High — AI-gate misapplication |
| F-16 | Replace `alert()` with inline validation errors | Low | Medium — design system |
| VD-02 | Fix dynamic Tailwind class interpolation (purge bug) | Low | High — production bug |

### Tier 2 — High Priority (Next Sprint)

| ID | Issue | Effort | Impact |
|---|---|---|---|
| IA-01 | Nest Sleep inside Recovery tab | Low | Medium — IA clarity |
| IA-04 | Split Training tab into Plan/Log/Analytics sub-tabs | Medium | High — scannability |
| IA-05 | Add "Today" dashboard as Training tab entry point | Medium | High — daily UX |
| MF-01 | PR detection in session logger | Medium | High — motivation |
| MF-02 | e1RM calculation and trend visualization | Medium | High — strength analytics |
| F-32 | Add direct form-based cycle creation for simple types | Medium | Medium — power users |
| F-17 | Refactor template library: slide-over instead of nested modal | Medium | Medium — depth |
| AI-01 | Add local queue for offline session/sleep logging | High | High — reliability |

### Tier 3 — Nice-to-Have (Future Sprint)

| ID | Issue | Effort | Impact |
|---|---|---|---|
| MF-05 | Training calendar view | High | High — discoverability |
| MF-06 | Cycle phase calendar overlay | Medium | Medium — planning |
| MF-03 | Body weight time-series tracking | Medium | Medium — body comp |
| MF-04 | Muscle group heatmap | Medium | Medium — analytics |
| MF-09 | Wearable integration surface (placeholder) | High | High — ecosystem |
| F-24 | lbs/kg unit toggle | Low | Medium — localization |
| F-22 | Per-exercise category tagging | Low | Medium — volume analysis |
| VD-01 | Unify Sleep tab to orange theme | Low | Low — polish |

---

## RECOMMENDED CUTS

The following features should be removed or fundamentally restructured rather than iteratively improved:

| Feature | Verdict | Replacement |
|---|---|---|
| Diagnosis tab in Titan | **CUT** — Move to Soma | Deep-link to Soma |
| Medical gate in Titan onboarding | **CUT** — Deprecated data model | Soma onboarding prompt |
| CustomFieldManager "Exercises" category | **CUT** — Superseded by RoutineBuilder | Remove |
| CustomFieldManager "Custom Biomarkers" | **MOVE** — Move to Soma biomarker entry | Soma deep-link |
| RestPeriodCalculator as standalone card | **DEMOTE** — Reduce to inline hint | Inline tooltip/accordion |
| Biomarkers/Recovery as full Soma embeds | **REFACTOR** — Summary widget + deep-links | TitanBiomarkerSummary |
| Hormonal panel with "Awaiting data" state | **HIDE** until data exists | Conditional render on real data |

---

## CONCLUSION

Titan has a strong technical foundation and several well-executed UX patterns (AI-gated routines, fast-track chip selectors, drag-and-drop builder, readiness dashboard). The core problems are structural, not cosmetic:

1. **Titan is doing Soma's job** — Remove the medical/clinical features (Diagnosis tab, Biomarkers tab, Recovery tab as full Soma embeds, medical onboarding gate) and Titan becomes a coherent, focused fitness module.

2. **The AI gate is applied too broadly** — Sleep logging and session logging need direct write paths. AI analysis should be opt-in for these operations.

3. **Missing table-stakes gym UX** — A rest timer, previous session reference during logging, and PR detection are not nice-to-haves. Without them, Titan cannot compete with basic free apps like StrongLifts or Hevy as a practical gym companion.

4. **Accessibility requires immediate attention** — Sub-pixel text sizes, missing ARIA labels on interactive controls, and color-only status indicators all need remediation before the module is production-ready for broad audiences.

The redesign priority should be: **Strip → Stabilize → Elevate**. Strip the medical features (1–2 days), stabilize the session logging UX with a timer and previous-data reference (1 sprint), then elevate with PR tracking and calendar view (subsequent sprint).

---

*Audit conducted by UI/UX Design Agent. All findings reference source files in `src/modules/titan/`. Issue IDs are prefixed: F (Forms), IA (Information Architecture), L (Logging), AI (AI Pattern), MF (Missing Feature), VD (Visual Design), CUT (Removal Recommendation).*
