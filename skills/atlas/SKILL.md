---
name: atlas
description: Cognitive planning and executive function agent for task management, goal setting, and burnout prevention.
---

# Atlas Module

Atlas is the cognitive framework of Ara, optimizing for productivity, temporal management, and sustainable output through executive function support.

## Domain
Focuses on long-term strategy (Goals), recurring patterns (Habits), and tactical execution (Tasks/Blocks).

## Data Structures (NSV)
- **Cognitive Load**: Measures current mental bandwidth utilization.
- **Burnout Risk**: Probabilistic model of executive fatigue.
- **Habit Streaks**: Historical record of recurring behavior consistency.
- **Goal Progress**: Quantified advancement toward established long-term objectives.

## AI Action Tags
- `update_routine(id: string, definition: object)`: Modifies recurring daily/weekly schedules.
- `schedule_block(start: string, end: string, context: string)`: Allocates dedicated time for specific tasks.
- `move_task(id: string, new_time: string)`: Re-prioritizes task timing based on cognitive load.
- `create_task(title: string, priority: number, tags: string[])`: Appends a new tactical objective.
- `update_task(id: string, updates: object)`: Modifies task metadata or status.
- `complete_task(id: string)`: Records task finalization.
- `create_goal(title: string, metrics: object[])`: Establishes a strategic objective.
- `update_goal_progress(id: string, delta: number)`: Updates quantified progress toward a goal.
- `create_habit(name: string, frequency: string)`: Initiates a new behavioral feedback loop.
- `update_habit_streak(id: string, status: boolean)`: Records success/failure of a habit instance.
- `log_habit_metric(id: string, value: number)`: Quantifies habit performance (e.g., water intake).
- `temporal_review(period: "daily" | "weekly")`: Triggers an analysis of time allocation and efficiency.
