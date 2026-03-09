# Atlas — Life Planning & Cross-Module Review Engine

> **ID**: `atlas` | **Theme**: Sky | **Core**: No (Extended) | **Soul Priority**: 3 | **Security**: locked

## Purpose
Atlas is the life planner — it knows everything the user plans to do and reviews what did and didn't go as planned. Uniquely, Atlas serves as a cross-module review engine: it analyzes data from Agnes (emotional state) and Titan (physical state) to make predictions, detect failures, and notify other agents when the user falls behind.

## Agent Personality
- **Archetype**: Cognitive architect and life planner
- **Tone**: Structured, supportive, energy-aware
- **Special**: Philosophy — "Great planning IS self-care. Plans that ignore recovery are extraction, not planning." Internal monologue: NSV_Check → Capacity_Assessment → Timeline_State → Verification_Needs → Strategy.

## NSV Ownership
- **Writes**: `cognitive.(energyBudget, focusScore, activeLoad, planningLoad, taskCompletionRate)`, `planning.(streakHealth, deadlinePressure)`
- **Reads**: ALL except `emotional.traumaMarkers`

## Key Actions
- `create_task` / `update_task` / `complete_task` — task CRUD
- `create_goal` / `update_goal_progress` — goal management
- `create_habit` / `update_habit_streak` / `log_habit_metric` — habit tracking
- `update_routine` — modify daily routines
- `schedule_block` — add time blocks to schedule
- `temporal_review` — weekly drift analysis (planned vs actual)
- `delegate_to_module` — cross-module queries

## Spine Events
- **Emits**: ATLAS_TASK_COMPLETED, ATLAS_HABIT_LOGGED, ATLAS_GOAL_MILESTONE, ATLAS_ENERGY_UPDATED, STREAK_BROKEN, DEADLINE_APPROACHING
- **Listens**: BLOCK_HIGH_INTENSITY, BURNOUT_WARNING, FLATTEN_ENERGY_WAVE, VITAL_UPDATED, FINANCIAL_STRESS

## Cross-Module Links
- Reads Agnes data → adjusts task recommendations when emotional resilience is low
- Reads Titan data → blocks cognitive overload when CNS fatigue is high
- On streak break / deadline miss → notifies Agnes (emotional impact) and Titan (if physical)
- Receives FLATTEN_ENERGY_WAVE → compresses schedule and reduces cognitive load

## Data Shape
Tasks (title, priority, deadline, status, dependencies), Goals (milestones, progress %), Habits (streak tracking, frequency, logged metrics), Routines (daily/weekly blocks), Energy Wave (real-time energy budget visualization). 10 extension field templates: deep-work-hours, pomodoro-count, distraction-count, flow-state-achieved, energy-budget-available, decision-fatigue-level, mental-clarity, cognitive-recovery-needed, routine-adherence, daily-reflection-score.

## Implementation Notes
- ⚠️ Cross-module review infrastructure exists (Spine events, NSV reads) but full prediction engine (predicting burnout from Agnes+Titan data) needs deepening
- ⚠️ Atlas → Agnes/Titan failure notifications: Spine supports it but specific cascade rules and agent handling aren't wired yet
- ⚠️ Predictive analytics (generating predictions from historical Agnes/Titan patterns) not yet implemented
