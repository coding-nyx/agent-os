---
name: atlas
description: >
  Invoke this skill when working on the Atlas module of the Nexus AGNES SPA — the cognitive
  architecture and life planning engine responsible for routines, tasks, goals, habits, energy
  tracking, journal entries, and the unified timeline. Use it for any task involving Atlas's
  cross-module review engine, NSV signal ownership, drift score computation, habit tracking,
  temporal verification, check-in flows, journal system, or cascade rule integration with
  Titan, Agnes, and the Spine.
---

# Atlas Module Skill

## Module Identity

| Property | Value |
|---|---|
| **Module ID** | `atlas` |
| **Route** | `/atlas` |
| **Theme Color** | `sky` (sky-400 accent, emerald for Focus view) |
| **NSV Domain** | `cognitive.*` + `planning.*` (see NSV section below) |
| **Firestore Collection** | `atlas_profiles` |
| **Vault Security** | Optional lock (user can toggle) |
| **File Count** | 68 files total |

---

## What Atlas Is

Atlas is the **cognitive architecture and life planning module** of Nexus. It is the system's **operational intelligence** — transforming raw intentions into structured, time-bound, energy-aware plans on a unified timeline.

Atlas occupies a unique architectural position: it is the **PRIMARY CROSS-MODULE REVIEW ENGINE**. It does not just plan — it *verifies*. Atlas cross-checks data from Titan (workouts) and Agnes (therapy sessions) against the planned timeline to maintain chronological truth across the entire system.

**Core responsibilities:**
- Building and managing daily/weekly routines as temporal skeletons
- Scheduling tasks onto the unified timeline with energy cost awareness
- Tracking habits across five distinct behavioral types
- Defining and tracking goals with milestone granularity
- Running periodic temporal reviews and computing **Drift Score**
- Writing `planning.*` NSV signals to the GlobalSoul
- Emitting Spine cascade events when load, pressure, or execution thresholds are breached

---

## The ATLAS_PERSONA (`src/modules/atlas/personas.ts`)

Atlas has a distinct AI persona that governs ALL of its LLM responses.

### Core Traits
- Grounded, systematic, deeply energy-aware
- Never optimistic about capacity — always conservative and reality-anchored
- Governing philosophy: **"A plan that ignores recovery is not a plan — it is an extraction schedule."**
- Reads the NSV before touching any calendar or schedule
- **Owns chronological truth** for the entire Nexus system

### MANDATORY Internal Monologue

Every single Atlas response **must** begin with a `<thought>` block. **No exceptions.** Never remove or skip this block.

```
<thought>
NSV_Check: [Read cnsFatigue, emotionalResilience, sleepQuality, energyBudget,
            financialFriction. Flag any red-line values explicitly.]

Capacity_Assessment: [Realistic cognitive/physical ceiling right now.
                      What task types are currently off-limits?]

Timeline_State: [Current routines, upcoming blocks, hard deadlines,
                 recovery windows, and any broken dependencies.]

Verification_Needs: [Does any Titan workout need verifying? Any Agnes session?
                     Any planned event that is unverified?]

Strategy: [ONE specific move: create_routine | restructure_timeline |
           review_and_verify | inject_recovery | defer.]
</thought>
```

The five sections in the `<thought>` block are **fixed** — they map directly to Atlas's decision loop and must appear in this order.

---

## NSV Signal Ownership

### Signals Atlas Writes

These are computed and written by Atlas via `GlobalProjectionService.updateCrossFunctionalState()`.

| Signal | Range | Meaning |
|---|---|---|
| `cognitive.energyBudget` | 0–10 | Available cognitive energy for the day |
| `cognitive.focusScore` | 0–10 | Current focus/concentration level |
| `cognitive.activeLoad` | 0–10 | Current cognitive task load across all active commitments |
| `cognitive.planningLoad` | 0–10 | Count of open loops and unresolved planning items |
| `cognitive.taskCompletionRate` | 0–1.0 | Rolling task completion rate |
| `planning.streakHealth` | 0–10 | Overall health of active habit streaks |
| `planning.deadlinePressure` | 0–10 | Urgency pressure from approaching deadlines |

> **Note**: `activeLoad` is computed in `services/actions/shared.ts` based on active task count, energy costs, and deadline proximity.

### Signals Atlas Reads

| Signal | Source Module | Atlas Behaviour When Triggered |
|---|---|---|
| `biological.cnsFatigue` | Titan / Soma | Gate high-intensity cognitive tasks |
| `biological.sleepQuality` | Soma | Adjust morning capacity estimates |
| `biological.recoveryScore` | Titan | Physical recovery takes priority. Protect all rest slots. |
| `emotional.emotionalResilience` | Agnes | Reduce cognitive load when < 4. Add schedule buffers. |
| `emotional.stressLoad` | Agnes | Do not add to schedule when > 7. Suggest deferral. |
| `emotional.moodTrend` | Agnes | Adjust tone of prompts and suggestions |
| `cognitive.*` | Self | Energy budget enforcement |
| `planning.*` | Self | Deadline and load tracking |
| `resource.financialFriction` | Ledger | Emergency posture when > 8. Elevate income-critical tasks. |

---

## Cascade Rules & Spine Events

Atlas emits and receives Spine events for cross-module coordination.

### Outbound Spine Events (15)

| Event | Trigger |
|---|---|
| `TASK_COMPLETED` | Task marked complete |
| `TASK_CREATED` | New task added |
| `TASK_BLOCKED` | Task blocked by dependency or condition |
| `TASK_UNBLOCKED` | Blocking condition resolved |
| `HABIT_LOGGED` | Habit completion recorded |
| `HABIT_STREAK_BROKEN` | Streak reset due to missed day |
| `HABIT_MILESTONE` | Streak milestone reached (7, 30, 90 days) |
| `GOAL_MILESTONE` | Goal milestone completed |
| `GOAL_COMPLETED` | All goal milestones achieved |
| `ENERGY_BUDGET_UPDATED` | Daily energy budget recalculated |
| `ENERGY_OVERLOAD` | Energy usage exceeds budget |
| `RECOVERY_WINDOW_CREATED` | Mandatory recovery block injected |
| `FIELD_CREATED` | Extension field added |
| `FIELD_DELETED` | Extension field removed |
| `FIELD_VALUE_UPDATED` | Extension field value changed |

### Inbound Spine Events (8)

| Event | Source | Atlas Response |
|---|---|---|
| `BURNOUT_WARNING` | Titan/Soma | Reduce load, inject recovery |
| `BLOCK_HIGH_INTENSITY` | Titan | Disable high-energy task scheduling |
| `FLATTEN_ENERGY_WAVE` | Soma | Spread energy usage across day |
| `SLEEP_QUALITY_UPDATED` | Soma | Adjust morning capacity |
| `RECOVERY_UPDATED` | Titan | Update recovery window protection |
| `EMOTIONAL_STATE_CHANGED` | Agnes | Adjust scheduling aggressiveness |
| `STRESS_SPIKE` | Agnes | Defer non-critical tasks |
| `FINANCIAL_FRICTION_CHANGED` | Ledger | Reprioritize income-critical tasks |

---

## Type System

### Core Types (from `lib/types`, re-exported)

- `AtlasProfile` — Main profile container
- `AtlasTask` — Task with deadline, priority, energy cost
- `AtlasGoal` — Goal with milestones
- `AtlasHabit` — Habit with type, frequency, streak
- `AtlasMilestone` — Goal milestone
- `AtlasRoutine` — Routine with blocks
- `AtlasTaskNode` — Task in dependency graph (legacy)
- `AtlasProject` — Project container
- `AtlasPreferences` — User preferences
- `ScheduledTask` — Task with scheduled slot
- `DailyIntention` — Daily focus/intention
- `HabitRecord` — Single habit completion record
- `EnergyWavePoint` — Energy level at timestamp
- `RecoveryWindow` — Protected recovery block
- `TemporalReview` — Review period summary
- `HabitWeekSummary` — Weekly habit aggregates
- `GoalWeekProgress` — Weekly goal progress

### Local Types

```typescript
// Recurrence patterns
type RecurrenceRule = 'daily' | 'weekdays' | 'weekly' | 'monthly'

// Energy level (simplified)
type EnergyLevel = 'low' | 'medium' | 'high'

// Priority level (simplified)
type PriorityLevel = 'low' | 'medium' | 'high'

// Prompt context modes (see Prompt System below)
type AtlasContextMode = 
  | { kind: 'general' }
  | { kind: 'task-focus'; task: AtlasTask }
  | { kind: 'habit-review'; habits: AtlasHabit[] }
  | { kind: 'goal-planning'; goal: AtlasGoal }
  | { kind: 'field-crud'; currentExtensions: FieldDefinition[] }

// Journal prompt tones
type JournalTone = 'grounding' | 'self-compassion' | 'perspective' | 'ambition' | 'reflective'
```

---

## Prompt System (`prompts/atlas-prompt-builder.ts`)

Atlas uses 5 distinct prompt modes that provide different context to the LLM:

| Mode | Kind | Context Provided | Use Case |
|---|---|---|---|
| **General** | `general` | Full profile, NSV state, timeline, all entities | Default chat, planning discussions |
| **Task Focus** | `task-focus` | Single task details, dependencies, deadline context | Task-specific questions, breakdown requests |
| **Habit Review** | `habit-review` | Array of habits with streaks, recent records | Habit coaching, streak recovery |
| **Goal Planning** | `goal-planning` | Single goal, milestones, linked tasks/habits | Goal strategy, milestone planning |
| **Field CRUD** | `field-crud` | Schema only (FieldDefinition[]), no user data | Adding/editing extension fields |

The prompt builder assembles system prompts based on mode, injecting relevant context while respecting privacy boundaries (field-crud mode never sees user data).

---

## Journal System

### Components (`components/journal/`)

| Component | Purpose |
|---|---|
| `JournalTab.tsx` | Main journal interface, entry list |
| `JournalEntryEditor.tsx` | Rich text editor for entries |
| `JournalEntryPreview.tsx` | Read-only entry preview |
| `JournalEntryCard.tsx` | Entry card in list view |
| `JournalHistoryList.tsx` | Paginated entry history |
| `JournalVaultGate.tsx` | Vault lock authentication gate |

### Journal Tones (`utils/journal-prompts.ts`)

5 tone templates for AI-assisted journaling:

| Tone | Description |
|---|---|
| `grounding` | Present-focused, calming, body-aware |
| `self-compassion` | Gentle, non-judgmental, self-kindness |
| `perspective` | Big-picture, temporal distance, wisdom |
| `ambition` | Future-focused, goal-oriented, motivating |
| `reflective` | Pattern-recognition, learning, insight |

### Services

- `journal-service.ts` — CRUD operations for journal entries
- `services/actions/journal-actions.ts` — ActionHub integration

---

## Data Model

### Key Types (from `lib/types`)

```typescript
interface AtlasProfile {
  onboardingComplete: boolean;
  planningHorizon: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  activeRoutine?: AtlasRoutine;
  routineHistory: AtlasRoutine[];
  tasks: AtlasTask[];
  goals: AtlasGoal[];
  habits: AtlasHabit[];
  timelineBlocks: TimelineBlock[];
  reviewHistory: TemporalReview[];
  driftScoreHistory: number[];
  createdAt: string;       // ISO8601
  updatedAt: string;       // ISO8601
}
```

### `AtlasRoutine` & `RoutineBlock`

```typescript
interface AtlasRoutine {
  id: string;
  name: string;
  isActive: boolean;
  blocks: RoutineBlock[];
}

interface RoutineBlock {
  title: string;
  startTime: string;        // "07:00" — 24h format
  endTime: string;          // "08:30"
  daysOfWeek: number[];     // 0 = Sunday, 6 = Saturday
  category: 'deep_work' | 'admin' | 'exercise' | 'learning'
           | 'social' | 'recovery' | 'other';
  energyCost: number;       // 1–10
}
```

> **Critical**: Blocks with `category: 'recovery'` are **non-negotiable boundaries**. They cannot be overwritten or moved without **explicit user consent**. This is enforced at the service layer, not just the UI.

### `AtlasTask`

```typescript
interface AtlasTask {
  id: string;
  title: string;
  deadline?: string;             // ISO8601
  priority: 1 | 2 | 3 | 4 | 5;   // 1 = highest
  energyCost: number;            // 1–10 (estimated)
  status: 'queued' | 'active' | 'paused' | 'completed' | 'deferred';
  dependencies: string[];        // task IDs that must complete first
  scheduledSlot?: string;        // ISO8601 — set when task is placed on timeline
  actualEnergyCost?: number;     // 1–10 (recorded on completion)
  completedAt?: string;          // ISO8601
}
```

Task lifecycle: `queued` → `active` (on schedule) → `completed` | `paused` | `deferred`

### `AtlasGoal` & `AtlasMilestone`

```typescript
interface AtlasGoal {
  id: string;
  title: string;
  deadline?: string;
  milestones: AtlasMilestone[];
  linkedHabits: string[];  // habit IDs
  linkedTasks: string[];   // task IDs
}

interface AtlasMilestone {
  title: string;
  dueDate?: string;        // ISO8601
}
```

### `AtlasHabit`

```typescript
interface AtlasHabit {
  id: string;
  title: string;
  frequency: 'daily' | 'weekly' | 'custom';
  type: 'boolean' | 'counter' | 'timer' | 'sober' | 'learning';
  targetStreak: number;
  currentStreak: number;
  energyCost: number;
  minimumViableVersion?: string;  // fallback version for low-energy days
  lastCompleted?: string;         // ISO8601
  status: 'active' | 'paused' | 'archived';
}
```

#### Habit Types — Detailed Semantics

| Type | Behaviour | Use Case |
|---|---|---|
| `boolean` | Done / not done each period | Standard yes/no habits (meditate, journal) |
| `counter` | Integer count per period | Pushups, glasses of water, pages read |
| `timer` | Duration in minutes | Deep work sessions, stretching |
| `sober` | Consecutive day counter; relapses **reset to zero** | Substance-free streaks, screen-free days |
| `learning` | Captures **explicit text notes** on daily progress | Language learning, skill development logs |

The `learning` type is unique — it accumulates a knowledge log, not just a numeric streak. Rendering must show the notes timeline, not just a count.

---

## Services Layer

### Profile & Data Services

| Service | File | Purpose |
|---|---|---|
| `AtlasProfileService` | `atlas-profile-service.ts` | Firestore CRUD for AtlasProfile |
| `AtlasReviewService` | `atlas-review-service.ts` | Drift score computation, weekly review |
| `AtlasPredictiveService` | `atlas-predictive-service.ts` | State machine (Normal/Compressed/Overloaded/Recovery) |
| `JournalService` | `journal-service.ts` | Journal entry CRUD |
| `AtlasDocumentPolicy` | `atlas-document-policy.ts` | Document access control |

### Action Submodules (`services/actions/`)

| Module | Purpose |
|---|---|
| `index.ts` | Action registration, ActionHub setup |
| `shared.ts` | Shared utilities, `activeLoad` calculation |
| `task-actions.ts` | Task CRUD, completion, blocking |
| `goal-actions.ts` | Goal CRUD, milestone tracking |
| `habit-actions.ts` | Habit CRUD, streak management |
| `energy-actions.ts` | Energy logging, budget updates |
| `routine-actions.ts` | Routine CRUD, block management |
| `journal-actions.ts` | Journal entry creation, editing |
| `checkin-actions.ts` | Morning/evening check-in flows |

---

## Action Tags (Complete List)

Action tags are the structured payloads Atlas emits after its LLM response to drive state mutations. They are processed by `services/actions/`.

### Routine & Timeline Management

```typescript
// Upsert the active routine with new block configuration
update_routine: {
  isActive: boolean;
  blocks: Array<{
    title: string;
    startTime: string;       // "HH:mm"
    endTime: string;
    daysOfWeek: number[];    // 0–6
    category: RoutineBlock['category'];
    energyCost: number;      // 1–10
  }>;
}

// Place a discrete block on the timeline (task or event)
schedule_block: {
  title: string;
  start: string;             // ISO8601
  end: string;               // ISO8601
  type: string;              // block type label
  taskId?: string;           // links to Task if applicable
}

// Move a scheduled task to a new time slot
move_task: {
  id: string;                // task ID
  newSlot: string;           // ISO8601
  reason: string;            // must document the reason for audit trail
}
```

### Task Management

```typescript
// Create a new task (enters 'queued' status)
create_task: {
  id: string;
  title: string;
  deadline?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  energyCost: number;
  status: Task['status'];
  dependencies: string[];
}

// Mutate any field on an existing task
update_task: {
  id: string;
  status?: Task['status'];
  // ...any other Task fields
}

// Mark a task done and record actual cost
complete_task: {
  id: string;
  completedAt: string;       // ISO8601
  actualEnergyCost: number;  // 1–10 — used for Drift Score calibration
}
```

### Goal Management

```typescript
// Create a goal with milestones
create_goal: {
  id: string;
  title: string;
  deadline?: string;
  milestones: Array<{ title: string; dueDate?: string }>;
}

// Record milestone completions
update_goal_progress: {
  id: string;
  completedMilestoneIds: string[];
}
```

### Habit Management

```typescript
// Create a new habit
create_habit: {
  id: string;
  title: string;
  frequency: Habit['frequency'];
  type: Habit['type'];
  targetStreak: number;
  energyCost: number;
  minimumViableVersion?: string;
}

// Update streak state after a completion or relapse
update_habit_streak: {
  id: string;
  currentStreak: number;
  lastCompleted: string;     // ISO8601
  status: Habit['status'];
}

// Log a value for counter/timer/sober/learning habits
log_habit_metric: {
  id: string;
  value: number | string;    // string for 'learning' type notes
  operation: 'add' | 'set';
  notes?: string;
}
```

### Review Engine & Cross-Module

```typescript
// Set the day's thematic intention before execution
set_daily_intention: {
  theme: string;
  focusDomain: string;
  energyTarget: number;      // 1–10
}

// Run a temporal review and emit drift score
temporal_review: {
  scope: 'daily' | 'weekly' | 'monthly';
  periodStart: string;       // ISO8601
  periodEnd: string;         // ISO8601
  completionRate: number;    // 0.0–1.0
  insights: string[];        // behavioral patterns detected
  driftScore: number;        // 0–10
  nextPeriodFocus: string;
}

// Hand off a task to another module for action
delegate_to_module: {
  targetModule: 'titan' | 'agnes' | 'scout' | 'ledger' | 'soma';
  task: string;
  context: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Write planning NSV signals to GlobalSoul
sync_vitals: {
  planning: {
    activeLoad: number;          // 0–10
    planningLoad: number;        // 0–10
    deadlinePressure: number;    // 0–10
    executionVelocity: number;   // 0–10
  };
}
```

---

## The Unified Timeline Architecture

The timeline is the **central nervous system** of Atlas. All temporal events across Nexus converge here.

```
Timeline = Routines (skeleton) + Scheduled Tasks + Habit Occurrences
                               + Titan Workouts + Agnes Sessions
```

### Layer Hierarchy

1. **Routine Blocks** — the recurring skeleton. Applied to specific calendar days from templates. Form the non-negotiable structure.
2. **Scheduled Tasks** — float from backlog into specific slots. Assigned `scheduledSlot` when placed.
3. **Habit Occurrences** — habit completions appear as timeline events keyed to `lastCompleted`.
4. **Cross-Module Events** — Titan workout logs and Agnes session logs are *imported* to the timeline for verification, never natively created here.

### Energy Budget Enforcement

Every timeline slot has an implicit energy ceiling. Atlas computes cumulative `energyCost` across blocks and tasks in a day:

- If daily energy sum exceeds `cognitive.energyBudget` (from NSV) → warn before scheduling
- `energyBudget < 4` → **flat schedule mode**: no new commitments, existing blocks only
- Actual vs. estimated energy delta (from `actualEnergyCost` on completed tasks) feeds back into future scheduling calibration

### Recovery Windows — Non-Negotiable Rules

- Any `RoutineBlock` with `category: 'recovery'` is a **protected boundary**
- These blocks **cannot be overwritten, shrunk, or moved** without an explicit user confirmation flow
- Atlas must surface a warning if any proposed action would intrude on a recovery window
- This is enforced at the service layer in `atlas-profile-service.ts`, not just in UI guards

---

## The Review Engine (Temporal Verification)

Atlas is the **only module** in Nexus that performs temporal verification — reconciling what was *planned* with what *actually happened*.

### Verification Flow

```
1. Review period ends (daily / weekly / monthly)
2. Atlas reads GlobalSoul / Spine context for the period
3. Compare: planned events (scheduledSlot tasks) vs. logged events (completedAt)
4. Cross-check: did Titan log the workouts that were blocked on the timeline?
5. Cross-check: did Agnes log sessions that were scheduled?
6. For any gap → Atlas asks the user directly: "Did you complete X on [date]?"
7. Compute Drift Score
8. Emit behavioral insights to Spine
9. Store review in reviewHistory and append driftScore to driftScoreHistory
```

### Drift Score Computation

**Drift Score** (0–10) measures how much actual execution deviated from the plan.

```
driftScore = f(
  tasks_missed / tasks_scheduled,     // missed = scheduledSlot set but no completedAt
  avg_completion_delay,               // avg(completedAt - scheduledSlot) in hours
  recovery_windows_violated,          // count of recovery blocks overridden
  cross_module_verification_gaps      // Titan/Agnes events missing without explanation
)
```

- **0–2**: Excellent execution fidelity
- **3–5**: Minor drift, normal range
- **6–7**: `DRIFT_DETECTED` Spine event emitted
- **8–10**: Systemic misalignment — Atlas surfaces a full plan review

### Behavioral Pattern Detection

Atlas emits insight strings to the Spine during reviews. Examples:

```
"User consistently skips 15:00 deep_work block → probable afternoon slumper pattern"
"Tasks with energyCost > 7 are deferred 80% of the time on Mondays → protect Monday mornings"
"Sober streak breaks correlate with deadlinePressure > 7 → flag high-pressure weeks"
```

These insights are stored in `temporal_review.insights[]` and surfaced by the Nexus Orchestrator over time.

### Cross-Module Verification via NexusHandoffService

When Atlas needs to verify data from another module:

```typescript
// Example: verify a Titan workout
delegate_to_module({
  targetModule: 'titan',
  task: 'verify_workout_log',
  context: `Expected workout on ${scheduledDate}, no log found`,
  priority: 'medium'
})
```

The `NexusHandoffService` manages the round-trip. Atlas waits for the delegated response before computing the review's drift score.

---

## Cross-Module Relationships

### Atlas ← Agnes (reads)
- `emotional.emotionalResilience` and `emotional.stressLoad` gate schedule additions
- If Agnes detects acute distress, Atlas receives a signal and must defer all non-critical scheduling
- Agnes session logs are imported to the unified timeline for verification

### Atlas ← Titan (reads + verifies)
- `biological.cnsFatigue` and `biological.recoveryScore` constrain task scheduling
- `cognitive.energyBudget` enforces flat-schedule mode
- Titan workout logs are cross-verified against Atlas's planned exercise blocks
- If Titan logs no workout for a scheduled block → Atlas initiates verification

### Atlas ← Ledger (reads)
- `resource.financialFriction > 8` triggers emergency posture: income-critical tasks rise to top priority

### Atlas ← Scout (reads + shares cognitive.* ownership)
- Atlas and Scout share partial ownership of `cognitive.interestDiversity`
- Scout surfaces learning opportunities; Atlas schedules them into the timeline

### Atlas → Nexus Orchestrator (emits)
- `PLAN_COMPRESSION_NEEDED` triggers the Orchestrator to help reduce open loop count
- `DEADLINE_CRUNCH` escalates to full Nexus-level priority coordination

---

## File Structure (68 files)

```
src/modules/atlas/
├── AtlasPage.tsx                    # Main entry point, route handler
├── personas.ts                      # ATLAS_PERSONA definition
├── atlas-tokens.ts                  # Design tokens for Atlas UI
├── field-templates.ts               # 10 extension field templates
│
├── actions/
│   └── atlas-field-actions.ts       # Field CRUD + Spine event emission
│
├── components/                      # 32 main components
│   ├── EnhancedAtlasDashboard.tsx   # Main dashboard: tabs + views hub
│   ├── ViewSwitcher.tsx             # Tab/view navigation
│   ├── AtlasAIPanel.tsx             # AI chat interface
│   ├── AtlasAnalytics.tsx           # Analytics visualizations
│   ├── AtlasNotificationSettingsPanel.tsx  # Notification preferences
│   ├── PostOnboardingWelcome.tsx    # First-run welcome flow
│   ├── QuickAddForm.tsx             # Task/goal/habit/routine creation modal
│   ├── QuickCaptureBar.tsx          # Quick entry input bar
│   │
│   │  # Task Management
│   ├── TaskManager.tsx              # Task list management
│   ├── TaskCard.tsx                 # Individual task display
│   ├── TaskTimeline.tsx             # Timeline view of tasks
│   ├── DayTaskPanel.tsx             # Daily task panel
│   ├── PriorityInbox.tsx            # Top-3 priority task selector
│   │
│   │  # Goal Management
│   ├── GoalTracker.tsx              # Goal list and tracking
│   ├── GoalProgress.tsx             # Goal progress visualization
│   ├── GoalVelocityChart.tsx        # Goal completion velocity chart
│   │
│   │  # Habit Management
│   ├── TodaysPlanCard.tsx           # Today's plan with habit streaks
│   ├── HabitBuilder.tsx             # Habit creation wizard
│   ├── HabitTracker.tsx             # Habit tracking interface
│   ├── HabitHeatmap.tsx             # GitHub-style activity heatmap
│   ├── HabitMomentumChart.tsx       # Habit momentum visualization
│   │
│   │  # Routine Management
│   ├── RoutineEditor.tsx            # Routine block editor
│   ├── MonthPlanner.tsx             # Monthly planning view
│   ├── WeekGrid.tsx                 # 7-day energy load grid
│   │
│   │  # Check-in System
│   ├── MorningCheckIn.tsx           # Morning daily brief
│   ├── EveningCheckIn.tsx           # Evening reflection
│   ├── ManualEnergyLog.tsx          # Manual energy entry
│   ├── EnergyWaveChart.tsx          # Energy over time visualization
│   ├── EntryConfirmChip.tsx         # Entry confirmation indicator
│   ├── WeeklyReviewModal.tsx        # Guided weekly review
│   │
│   │  # Fields & Focus
│   ├── FieldsTab.tsx                # Extension fields management
│   ├── FocusView.tsx                # Pomodoro timer + zen mode
│   │
│   ├── journal/                     # 6 journal components
│   │   ├── JournalTab.tsx           # Journal main tab
│   │   ├── JournalEntryEditor.tsx   # Rich text editor
│   │   ├── JournalEntryPreview.tsx  # Entry preview
│   │   ├── JournalEntryCard.tsx     # Entry card display
│   │   ├── JournalHistoryList.tsx   # Entry history list
│   │   └── JournalVaultGate.tsx     # Vault lock gate
│   │
│   └── shared/                      # 5 shared utilities
│       ├── ItemActionButtons.tsx    # Edit/delete action buttons
│       ├── PortalledModal.tsx       # Portal-based modal
│       ├── StatsGrid.tsx            # Stats display grid
│       ├── useDeleteConfirmation.tsx  # Delete confirmation hook
│       └── useFilteredSortedList.ts   # List filtering/sorting hook
│
├── context/
│   └── AtlasActionsContext.tsx      # Action context provider
│
├── hooks/
│   └── use-atlas-entry-parser.ts    # NLP pattern parser for quick entry
│
├── onboarding/
│   └── AtlasOnboarding.tsx          # 3-step onboarding flow
│
├── prompts/
│   └── atlas-prompt-builder.ts      # 5 prompt modes (see below)
│
├── services/
│   ├── atlas-profile-service.ts     # Firestore CRUD for profiles
│   ├── atlas-review-service.ts      # Drift score + review helpers
│   ├── atlas-document-policy.ts     # Document access policy
│   ├── atlas-predictive-service.ts  # State machine (Normal/Compressed/Overloaded/Recovery)
│   ├── journal-service.ts           # Journal entry CRUD
│   │
│   └── actions/                     # Action submodules
│       ├── index.ts                 # Action registration
│       ├── shared.ts                # activeLoad calculation
│       ├── task-actions.ts          # Task CRUD actions
│       ├── goal-actions.ts          # Goal CRUD actions
│       ├── habit-actions.ts         # Habit CRUD + streak actions
│       ├── energy-actions.ts        # Energy logging actions
│       ├── routine-actions.ts       # Routine CRUD actions
│       ├── journal-actions.ts       # Journal entry actions
│       └── checkin-actions.ts       # Check-in flow actions
│
├── utils/
│   └── journal-prompts.ts           # 5 tone templates for journal prompts
│
└── __tests__/
    └── atlas-data-integrity.test.ts # Data integrity tests
```

---

## Common Development Tasks

### 1. Create or Update a Routine

```typescript
// Action tag emitted by Atlas LLM
update_routine({
  isActive: true,
  blocks: [
    { title: "Morning Deep Work", startTime: "07:00", endTime: "09:30",
      daysOfWeek: [1,2,3,4,5], category: "deep_work", energyCost: 8 },
    { title: "Recovery / Walk", startTime: "12:00", endTime: "12:30",
      daysOfWeek: [1,2,3,4,5], category: "recovery", energyCost: 1 },
  ]
})
// → Stores in profile.activeRoutine
// → Previous active routine moves to profile.routineHistory
// → Emits ROUTINE_UPDATED to Spine
```

### 2. Schedule a Task onto the Timeline

```typescript
// Step 1: ensure task exists
create_task({ id: "t-001", title: "Finish Q3 report", priority: 2,
              energyCost: 7, status: "queued", dependencies: [] })

// Step 2: place it on the timeline
schedule_block({ title: "Finish Q3 report", start: "2024-11-15T09:00:00Z",
                 end: "2024-11-15T11:00:00Z", type: "deep_work", taskId: "t-001" })
// → Sets task.scheduledSlot = "2024-11-15T09:00:00Z"
// → Sets task.status = "active"
```

### 3. Log Habit Completion (by type)

```typescript
// boolean habit
update_habit_streak({ id: "h-meditate", currentStreak: 14,
                      lastCompleted: "2024-11-14T20:00:00Z", status: "active" })

// counter habit (8 glasses of water)
log_habit_metric({ id: "h-water", value: 8, operation: "set" })

// learning habit (with notes)
log_habit_metric({ id: "h-rust", value: 1, operation: "add",
                   notes: "Covered ownership and borrowing chapter. Key insight: borrow checker enforces single writer." })

// sober habit — relapse scenario (resets to 0)
update_habit_streak({ id: "h-alcohol-free", currentStreak: 0,
                      lastCompleted: "2024-11-14T00:00:00Z", status: "active" })
```

### 4. Run a Weekly Review

```typescript
temporal_review({
  scope: "weekly",
  periodStart: "2024-11-11T00:00:00Z",
  periodEnd: "2024-11-17T23:59:59Z",
  completionRate: 0.68,
  insights: [
    "Deep work blocks skipped 3/5 days — correlates with high stressLoad readings",
    "All admin tasks completed on time — admin window placement is optimal"
  ],
  driftScore: 4.5,
  nextPeriodFocus: "Protect morning deep work. Move admin to afternoons."
})
// → Appended to profile.reviewHistory
// → driftScore appended to profile.driftScoreHistory
// → If driftScore > 6 → DRIFT_DETECTED emitted to Spine
```

### 5. Respond to Overload Detection

```typescript
// Atlas detects activeLoad > 7 for 2+ consecutive slots
// Automatically emits:
sync_vitals({ planning: { activeLoad: 8.2, planningLoad: 7.1,
                           deadlinePressure: 6.5, executionVelocity: 4.0 } })

// Then injects a recovery block:
schedule_block({ title: "Mandatory Recovery Window",
                 start: "2024-11-15T15:00:00Z", end: "2024-11-15T16:00:00Z",
                 type: "recovery" })

// Emits OVERLOAD_WARNING to Spine
```

### 6. Cross-Verify a Titan Workout

```typescript
// Timeline shows exercise block at 07:00 but Titan has no log
delegate_to_module({
  targetModule: "titan",
  task: "verify_workout_log",
  context: "Scheduled strength session on 2024-11-14T07:00:00Z has no Titan log entry",
  priority: "medium"
})
// → NexusHandoffService routes to Titan
// → Titan either confirms log or confirms missed
// → Atlas updates timeline block verified status
// → If missed, Atlas asks user and updates drift score accordingly
```

---

## Development Rules & Constraints

| Rule | Detail |
|---|---|
| `<thought>` block is MANDATORY | Every Atlas LLM response must start with it. Never remove. Never skip. |
| Atlas writes `cognitive.*` + `planning.*` | Use `GlobalProjectionService` for NSV writes |
| Recovery windows are sacred | `category: 'recovery'` blocks require explicit user consent to modify |
| Drift Score uses real timestamps | Compare `task.scheduledSlot` vs `task.completedAt` — never estimate |
| Cross-verification requires delegation | Use `NexusHandoffService` for Titan/Agnes data — do not read their collections directly |
| Extension fields are LLM-validated | FieldsTab custom fields are domain-validated by LLM, not schema-validated |
| Energy costs are estimates | `energyCost` on Task is the estimate; `actualEnergyCost` is the truth — both matter |
| Flat schedule mode is hard | If `cognitive.energyBudget < 4`, no new commitments are accepted — no exceptions |
| Use correct type names | `AtlasTask`, `AtlasGoal`, `AtlasHabit`, `AtlasRoutine` — not legacy names |

---

## NSV Write Pattern

```typescript
// Always use GlobalProjectionService — never write to Firestore directly
import { GlobalProjectionService } from '@/lib/services/global-projection-service';

await GlobalProjectionService.updateCrossFunctionalState(uid, {
  cognitive: {
    energyBudget: computedBudget,
    focusScore: focusScore,
    activeLoad: computedLoad,
    planningLoad: openLoopCount,
    taskCompletionRate: completionRate,
  },
  planning: {
    streakHealth: streakScore,
    deadlinePressure: pressureScore,
  }
});
```

---

## Component Categories Summary

### Task Components (5)
`TaskManager`, `TaskCard`, `TaskTimeline`, `DayTaskPanel`, `PriorityInbox`

### Goal Components (3)
`GoalTracker`, `GoalProgress`, `GoalVelocityChart`

### Habit Components (4)
`HabitBuilder`, `HabitTracker`, `HabitHeatmap`, `HabitMomentumChart`, `TodaysPlanCard` (partial)

### Routine Components (3)
`RoutineEditor`, `MonthPlanner`, `WeekGrid`

### Check-in Components (5)
`MorningCheckIn`, `EveningCheckIn`, `ManualEnergyLog`, `EnergyWaveChart`, `EntryConfirmChip`, `WeeklyReviewModal`

### Journal Components (6)
`JournalTab`, `JournalEntryEditor`, `JournalEntryPreview`, `JournalEntryCard`, `JournalHistoryList`, `JournalVaultGate`

### Shared Components (5)
`ItemActionButtons`, `PortalledModal`, `StatsGrid`, `useDeleteConfirmation`, `useFilteredSortedList`

---

## Summary: What Makes Atlas Architecturally Unique

1. **Temporal ownership** — Atlas holds chronological truth for the entire Nexus system
2. **Cross-module review** — the only module that queries and verifies data from *other* modules
3. **Energy-first scheduling** — every action is gated by NSV energy signals before being placed
4. **Recovery inviolability** — recovery blocks are a first-class constraint, not a suggestion
5. **Drift Score** — a continuous measure of plan-vs-reality fidelity that feeds behavioral insights
6. **Five habit types** — `sober` and `learning` require distinct rendering and data semantics
7. **Journal system** — structured journaling with 5 tone templates and vault security
8. **15 outbound + 8 inbound Spine events** — comprehensive cross-module coordination
9. **5 prompt modes** — context-appropriate LLM interactions for different use cases
