# Atlas — Life Planning & Cross-Module Review Engine

> **ID**: `atlas` | **Theme**: Sky | **Core**: No (Extended) | **Soul Priority**: 3 | **Security**: Optional lock (user toggleable)

## Purpose
Atlas is the cognitive architecture and life planning module — the system's operational intelligence. It transforms raw intentions into structured, time-bound, energy-aware plans on a unified timeline. Uniquely, Atlas serves as the **primary cross-module review engine**: it verifies data from Titan (workouts) and Agnes (therapy sessions) against the planned timeline to maintain chronological truth across the entire system.

## Agent Personality
- **Archetype**: Cognitive architect and life planner
- **Tone**: Grounded, systematic, deeply energy-aware — never optimistic about capacity
- **Philosophy**: "A plan that ignores recovery is not a plan — it is an extraction schedule."
- **Internal Monologue**: NSV_Check → Capacity_Assessment → Timeline_State → Verification_Needs → Strategy
- **Special**: Owns chronological truth for the entire Nexus system

## NSV Ownership
- **Writes**: `cognitive.energyBudget`, `cognitive.focusScore`, `cognitive.activeLoad`, `cognitive.planningLoad`, `cognitive.taskCompletionRate`, `planning.streakHealth`, `planning.deadlinePressure`
- **Reads**: `biological.cnsFatigue`, `biological.sleepQuality`, `biological.recoveryScore`, `emotional.emotionalResilience`, `emotional.stressLoad`, `emotional.moodTrend`, `resource.financialFriction`

## Key Actions

### Task Actions
- `create_task` — Create new task (enters 'queued' status)
- `update_task` — Mutate any field on existing task
- `complete_task` — Mark done, record actual energy cost

### Goal Actions
- `create_goal` — Create goal with milestones
- `update_goal_progress` — Record milestone completions

### Habit Actions
- `create_habit` — Create habit (boolean/counter/timer/sober/learning types)
- `update_habit_streak` — Update streak state after completion or relapse
- `log_habit_metric` — Log value for counter/timer/sober/learning habits

### Energy & Routine Actions
- `update_routine` — Upsert active routine with block configuration
- `schedule_block` — Place discrete block on timeline
- `move_task` — Move scheduled task to new time slot
- `set_daily_intention` — Set day's thematic intention
- `sync_vitals` — Write planning NSV signals to GlobalSoul

### Review Actions
- `temporal_review` — Run review and emit drift score (daily/weekly/monthly)
- `delegate_to_module` — Hand off task to another module

### Journal Actions
- Journal entry CRUD via `journal-actions.ts`

### Check-in Actions
- Morning/evening check-in flows via `checkin-actions.ts`

## Spine Events

### Outbound Events (15)
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

### Inbound Events (8)
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

## Prompt Modes (5)
| Mode | Kind | Context Provided | Use Case |
|---|---|---|---|
| **General** | `general` | Full profile, NSV state, timeline, all entities | Default chat, planning discussions |
| **Task Focus** | `task-focus` | Single task details, dependencies, deadline context | Task-specific questions, breakdown requests |
| **Habit Review** | `habit-review` | Array of habits with streaks, recent records | Habit coaching, streak recovery |
| **Goal Planning** | `goal-planning` | Single goal, milestones, linked tasks/habits | Goal strategy, milestone planning |
| **Field CRUD** | `field-crud` | Schema only (FieldDefinition[]), no user data | Adding/editing extension fields |

## Cross-Module Links
- **Agnes → Atlas**: `emotionalResilience` and `stressLoad` gate schedule additions; sessions imported for verification
- **Titan → Atlas**: `cnsFatigue` and `recoveryScore` constrain task scheduling; workouts cross-verified against planned blocks
- **Ledger → Atlas**: `financialFriction > 8` triggers emergency posture; income-critical tasks elevated
- **Scout → Atlas**: Shares partial ownership of `cognitive.interestDiversity`; surfaces learning opportunities for scheduling
- **Atlas → Nexus Orchestrator**: Emits `PLAN_COMPRESSION_NEEDED`, `DEADLINE_CRUNCH` for priority coordination

## Data Shape

### AtlasProfile
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
  createdAt: string;
  updatedAt: string;
}
```

### Key Entities
- **Tasks**: title, priority (1-5), deadline, energyCost (1-10), status (queued/active/paused/completed/deferred), dependencies, scheduledSlot, actualEnergyCost
- **Goals**: title, deadline, milestones[], linkedHabits[], linkedTasks[]
- **Habits**: title, frequency (daily/weekly/custom), type (boolean/counter/timer/sober/learning), targetStreak, currentStreak, energyCost, minimumViableVersion
- **Routines**: blocks with startTime, endTime, daysOfWeek, category (deep_work/admin/exercise/learning/social/recovery/other), energyCost
- **Journal Entries**: Rich text entries with 5 tone templates (grounding, self-compassion, perspective, ambition, reflective)

### Habit Types
| Type | Behaviour |
|---|---|
| `boolean` | Done/not done each period |
| `counter` | Integer count per period |
| `timer` | Duration in minutes |
| `sober` | Consecutive day counter; relapses reset to zero |
| `learning` | Captures explicit text notes on daily progress |

### Extension Field Templates (10)
deep-work-hours, pomodoro-count, distraction-count, flow-state-achieved, energy-budget-available, decision-fatigue-level, mental-clarity, cognitive-recovery-needed, routine-adherence, daily-reflection-score

## Features

### Journal System
- Rich text editor for entries
- 5 AI-assisted tone templates
- Vault lock authentication gate
- Paginated entry history

### Check-in System
- **Morning Check-In**: Daily brief, energy assessment, intention setting
- **Evening Check-In**: Reflection, completion review, next-day prep
- Manual energy logging with EnergyWaveChart visualization

### Temporal Review Engine
- Drift Score computation (0-10): measures execution vs plan deviation
- Cross-module verification (Titan workouts, Agnes sessions)
- Behavioral pattern detection and insight generation
- Daily/weekly/monthly review scopes

### Recovery Windows
- Blocks with `category: 'recovery'` are **non-negotiable boundaries**
- Cannot be overwritten, shrunk, or moved without explicit user consent
- Enforced at service layer, not just UI

## Implementation Notes
- ⚠️ Cross-module review infrastructure exists (Spine events, NSV reads) but full prediction engine (predicting burnout from Agnes+Titan data) needs deepening
- ⚠️ Atlas → Agnes/Titan failure notifications: Spine supports it but specific cascade rules and agent handling aren't fully wired
- ⚠️ Predictive analytics (generating predictions from historical Agnes/Titan patterns) not yet implemented
- 68 files total in module structure
