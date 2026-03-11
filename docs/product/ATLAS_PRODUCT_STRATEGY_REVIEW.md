# Atlas: Product Strategy Review
**Agent:** Product Manager (Nexus Orchestrator Debate)  
**Date:** 2026-03-11  
**Status:** Final — `todos: atlas-pm → done`  
**Preceded by:** `docs/design/ATLAS_DESIGN_AUDIT.md` (UX/UI audit, bug inventory)

---

## Table of Contents
1. [Core Product Thesis](#1-core-product-thesis)
2. [Feature Completeness Audit by Archetype](#2-feature-completeness-audit-by-archetype)
3. [The AI-First vs Forms-First Tension](#3-the-ai-first-vs-forms-first-tension)
4. [Daily Life Planning — The Full Workflow](#4-daily-life-planning--the-full-workflow)
5. [Goal & Work Tracking](#5-goal--work-tracking)
6. [Productivity Review — World-Class Standard](#6-productivity-review--world-class-standard)
7. [The "Just Use Atlas" Vision](#7-the-just-use-atlas-vision)
8. [Critical Missing User Stories](#8-critical-missing-user-stories)
9. [Prioritization Matrix](#9-prioritization-matrix)
10. [Anti-Features — What Atlas Must NOT Be](#10-anti-features--what-atlas-must-not-be)

---

## 1. Core Product Thesis

### What Atlas Is Fundamentally Trying to Be

Atlas is the **cognitive executive function layer** of Nexus. Where Agnes processes emotion and Titan processes physicality, Atlas processes *intention* — converting what a person wants to do with their life into an executable, living plan that adapts to their real-time biological and emotional state.

The core thesis, restated simply: **Atlas is the AI that makes you reliably do what you actually care about, without burning you out in the process.**

This resolves into three primary jobs:
1. **Capture** — Take intentions (goals, tasks, habits) from natural language at zero friction
2. **Organize** — Structure those intentions into a realistic, energy-aware schedule
3. **Execute** — Guide the user through their day, adapt to deviations, and run weekly reviews

### Is the Current Implementation Aligned?

**Partially.** The data model and AI vocabulary are genuinely excellent — they represent a sophisticated, holistic view of planning. The types system (EnergyWave, RecoveryWindow, PredictiveState, TemporalReview) shows real architectural ambition. However, the *execution layer* drifts from the thesis in three critical ways:

**Drift #1: The dashboard is read-heavy, not action-heavy.**  
Atlas has a TaskManager, HabitTracker, GoalTracker, EnergyWaveChart — all views of data. But the user has no obvious "what do I do right now?" entry point. A planning tool that doesn't guide you into action has failed at its third job.

**Drift #2: The AI agent exists but isn't proactive.**  
The ATLAS persona has a rich decision framework (emotionalResilience < 4, cnsFatigue > 7) but it *waits* for the user. There's no AI-initiated daily check-in, no proactive "Hey, you have 3 deep work blocks today but your energy is in Recovery mode — want me to reschedule?" This is the gap between a reactive chatbot and a cognitive operating system.

**Drift #3: The predictive service is the heart of the product — and it's a 466-line scaffold.**  
The state machine (Normal → Compressed → Overloaded → Recovery) is the feature that makes Atlas meaningfully different from Todoist. It's 0% implemented. Everything else is table stakes.

### The Revised Thesis Statement (for alignment)

> Atlas is an AI-native executive function system that proactively organizes, schedules, and reviews a user's intentions — adapting in real time to their biological capacity — so they can focus on execution, not planning.

---

## 2. Feature Completeness Audit by Archetype

### Archetype 1: The Overwhelmed Professional
*"Has too many tasks, needs help prioritizing and protecting their cognitive budget"*

| Need | Status | Gap |
|------|--------|-----|
| Task capture (fast) | ❌ Missing | No quick-capture flow. Must navigate to TaskManager, open form |
| Priority ordering | 🟡 Partial | Priority field exists on tasks; no "what should I do now?" surface |
| Cognitive budget protection | ❌ Missing | RecoveryWindow data model exists; no enforcement logic, no UI prompt |
| Schedule flattening when overloaded | ❌ Missing | `flatten_schedule` AI action exists; PredictiveService (the trigger) is a stub |
| "Focus mode" — single-task view | 🟡 Partial | FocusView component exists; `noop` wired to chat button (design audit finding) |
| Overload warning | ❌ Missing | PredictiveService scaffold only; no active state machine |

**Verdict:** 1 of 6 core needs meaningfully met. The Overwhelmed Professional would find Atlas prettier but no more useful than a notes app.

---

### Archetype 2: The Goal-Setter
*"Has big life goals, needs milestone tracking and regular progress reviews"*

| Need | Status | Gap |
|------|--------|-----|
| Goal creation with milestones | ✅ Built | AtlasGoal + milestones array, full CRUD |
| Goal → task decomposition | 🟡 Partial | AI can do it via chat; no structured flow or visual hierarchy |
| Progress visualization | 🟡 Partial | GoalTracker component exists; no trend data over time |
| Weekly review against goals | 🟡 Partial | WeeklyReviewModal exists; never triggered from UI (audit finding) |
| Goal-level analytics (velocity, completion rate) | ❌ Missing | No historical aggregates stored |
| Goal stall detection & re-engagement | ❌ Missing | ReviewService emits alerts; no AI-proactive check-in |

**Verdict:** 2 of 6 meaningfully met. Goal-Setter gets the structure but no intelligence around it.

---

### Archetype 3: The Habit Builder
*"Wants to build consistent habits, needs streak tracking and accountability"*

| Need | Status | Gap |
|------|--------|-----|
| Habit creation (5 types) | ✅ Built | boolean/counter/timer/sober/learning — complete |
| Streak tracking | ✅ Built | streak + longestStreak on AtlasHabit |
| Daily habit check-in | ❌ Missing | No proactive prompt; user must navigate to HabitTracker |
| Habit failure → cross-module alert | 🟡 Partial | Spine event defined; listener loop partial |
| Habit analytics (completion rate, heatmap) | ❌ Missing | No historical storage |
| Habit stacking / routine linking | 🟡 Partial | AtlasRoutine exists; no habit → routine visual link |

**Verdict:** 2 of 6 meaningfully met. The data model is correct but the daily experience loop is broken.

---

### Archetype 4: The AI-Native User
*"Prefers conversation over forms, wants zero manual input"*

| Need | Status | Gap |
|------|--------|-----|
| Full task CRUD via chat | ✅ Built | 15+ AI actions, complete vocabulary |
| Natural language quick capture | ❌ Missing | No dedicated "just tell me what's on your mind" capture flow |
| AI reads from NSV / adapts to state | ✅ Built | Decision thresholds implemented in persona |
| AI-initiated daily check-in | ❌ Missing | All conversations user-initiated |
| AI-proactive weekly review | ❌ Missing | WeeklyReviewModal is modal-triggered only |
| Field creation via chat | ❌ Missing | `create_field` action exists; handler is a `console.log` stub |
| Goal decomposition via chat | ✅ Built | AI can decompose goals into tasks conversationally |

**Verdict:** 3 of 7 met. The AI-Native user is underserved by lack of proactive surfaces. The chat interface itself works well but sits behind a navigation model designed for form users.

---

### Archetype 5: The Data Nerd
*"Wants dashboards, visualizations, trends, and productivity analytics"*

| Need | Status | Gap |
|------|--------|-----|
| Energy wave chart | ✅ Built | EnergyWaveChart with 48-slot visualization |
| Task completion rate over time | ❌ Missing | No historical aggregates |
| Habit streaks & heatmap | 🟡 Partial | Current streak shown; no historical heatmap |
| Goal velocity / milestone completion rate | ❌ Missing | No time-series data |
| Burnout risk gauge | 🟡 Partial | Weekly review modal has gauge; PredictiveService not running |
| Custom productivity metrics | 🟡 Partial | Extension fields exist (up to 15); values not persisted over time |
| Weekly/monthly summary reports | ❌ Missing | No report generation |

**Verdict:** 1.5 of 7 met. The Data Nerd is the most underserved archetype. No analytics infrastructure exists.

---

## 3. The AI-First vs Forms-First Tension

### The Problem Stated Clearly

The current Atlas implementation has a split personality. The component layer (TaskManager, HabitTracker, GoalTracker, QuickAddForm) is built around **forms-first** assumptions — the user navigates to a tab, finds a create button, fills a form. The AI persona (ATLAS) and its 15+ action vocabulary was built assuming **AI-first** usage. These two surfaces do not coherently combine into a single product experience.

The result: the user faces a choice between using the AI (powerful, high-friction to discover) or the forms (immediately visible, low cognitive power). Neither is the right answer in isolation.

### The Right Product Philosophy

**Resolution: AI as the front door; forms as the escape hatch.**

The mental model should be:
1. **Every session starts with AI conversation.** Atlas opens in a chat view, not a dashboard. The first thing the user sees is ATLAS asking: *"Good morning. Your energy looks compressed today. You have 6 tasks scheduled — want me to show you the critical path?"*
2. **The dashboard is a read-only output of AI actions.** Data Nerds can live there. But it is never the primary input mechanism.
3. **Forms exist as power-user overrides.** If a user wants to manually set a deadline, they can. But no feature requires it.

### Precedent From the Titan Parallel

The Titan module solved this same tension with the **AI Mode / Logbook Mode toggle** (S7-005: `preferenceMode: 'coach' | 'logbook'`). Atlas needs the same pattern — but inverted. Titan defaults to Logbook (structured input) with AI as enhancement. Atlas should default to AI (conversational) with dashboard as enhancement, because Atlas's domain (intentions, goals, energy) is inherently fuzzy and benefits far more from natural language expression.

**Recommendation:** Implement `preferenceMode: 'conversational' | 'structured'` on AtlasProfile. Default: `'conversational'`. This is a one-sprint feature that resolves the entire tension architecturally.

---

## 4. Daily Life Planning — The Full Workflow

### What a Complete Daily Planning Workflow Looks Like

A world-class daily planning experience for Atlas has three moments:

**Morning Check-In (06:00–09:00)**
- Atlas proactively opens (or sends a notification) with a morning brief: energy forecast, scheduled tasks for today, habit reminders, any overload warnings
- User confirms or modifies the day's priorities through conversation
- Atlas adjusts the schedule based on current NSV state (if cnsFatigue > 7, deep work blocks are shortened)
- Result: a "today's plan" that the user has co-created with AI, optimized for their actual biological state

**Mid-Day Pulse (12:00–13:00)**
- Atlas checks in: "You completed 2 of 4 tasks this morning. Energy seems to be dropping. Want to defer the afternoon deep work block?"
- User answers in natural language; Atlas updates the schedule
- Habit check-in embedded here if any afternoon habits are scheduled

**Evening Review (21:00–22:00)**
- Atlas triggers a micro-review: 3-5 questions about what was accomplished, what was blocked, how energy actually felt
- Feeds data into historical aggregates, updates streak counts, flags goal progress
- Sets tomorrow's top 3 priorities

### What's Missing From This Workflow

| Missing Element | Current State | Impact |
|----------------|---------------|--------|
| AI-initiated check-in (any of the 3 moments) | ❌ | None of the 3 moments exist |
| NSV-driven schedule adjustment | ❌ PredictiveService stub | Energy data is collected but does nothing |
| "Today's Plan" view (correct data source) | 🟡 Bug | TodaysPlanCard reads `taskGraph` not `tasks` (audit finding) |
| Mid-day task completion update | ❌ | User must manually check tasks |
| Evening micro-review | ❌ | Weekly review modal exists, no daily equivalent |
| Time-slot scheduling (calendar view) | ❌ | `scheduledAt` field exists; no visual calendar |
| Recurrence logic | ❌ | Field exists; no behavior implemented |

**Biggest gap: the proactive loop.** Without AI-initiated check-ins, Atlas is a passive information store, not a planning system.

---

## 5. Goal & Work Tracking

### Are Goals, Milestones, and Task-to-Goal Linkage Sufficient?

**Data model: Yes. Experience: No.**

The `AtlasGoal` type is complete — title, category, target date, milestones, progress (0-100), emotion, linked task IDs. The structure is correct. The experience breaks down in these specific ways:

**Gap 1: Visual hierarchy is missing.**  
Users cannot see "Goal → Milestone → Task" as a visual tree. `projectId` connects tasks to projects but there's no project management view. Goal linkage exists in the data model but is invisible in the UI.

**Gap 2: Goal-to-task decomposition has no structured surface.**  
The AI can decompose a goal into tasks conversationally. But there's no confirmation step — the user says "break down my book project" and tasks appear in the task list with no visual connection back to the goal. The AI-native user may be okay with this; the Goal-Setter archetype needs to *see* the hierarchy.

**Gap 3: No velocity intelligence.**  
If a goal is 30% complete with 14 days to target, is the user on track? Behind? Atlas doesn't know — no time-series data is stored. The `estimatedCompletion` field is designed for this but nothing populates it.

**Gap 4: Stalled goals have no surface.**  
A goal with no task completions in 14 days is invisible. ReviewService can detect this and emits a Spine event, but there's no UI surface and no AI-proactive reengagement.

### What's Needed

- **Goal decomposition flow:** After AI decomposes a goal, show the user the resulting task tree in a confirmation panel before committing
- **Goal detail view:** Dedicated view showing Goal → Milestones → Linked tasks + estimated completion date based on velocity
- **Velocity calculation in ReviewService:** Compute tasks-per-week rate and project goal completion date; store as `estimatedCompletion`
- **Stalled goal alert:** If no goal-linked task completed in >10 days, ATLAS proactively surfaces it in next check-in

---

## 6. Productivity Review — World-Class Standard

### What World-Class Looks Like

A world-class weekly/monthly review has three layers:

**Layer 1: Quantitative Summary**
- Tasks: Created vs Completed vs Deferred vs Deleted this week
- Habits: Streak status for every active habit; completion rate vs 4-week average
- Goals: Progress delta per goal; estimated completion date updates
- Energy: Actual energy pattern vs scheduled energy wave (were you right about your energy?)
- Time: estimatedMinutes vs actualMinutes per task category (requires time tracking)

**Layer 2: Qualitative Reflection**
- 3-5 open questions surfaced by ATLAS (not a static template — AI-generated based on what happened)
- Examples: "You deferred 4 tasks from Monday to Friday — what's the pattern there?" / "Your deep work habit broke this week — was this intentional or circumstantial?"
- User answers in conversation; responses stored as episodic memory for RAG

**Layer 3: Forward Planning**
- Atlas proposes adjustments: reschedule overdue tasks, flag at-risk goals, suggest habit modifications
- User approves/modifies via conversation
- Next week's energy wave is adjusted based on this review

### What Atlas Has Today vs World-Class

| Element | Current State | Gap to World-Class |
|---------|---------------|-------------------|
| Review modal | ✅ Exists (not triggered from UI) | Fix UI trigger; add Layer 2 & 3 |
| Quantitative task summary | 🟡 Basic | No time-tracking data, no completion rate trend |
| Habit completion rates | 🟡 Current streak only | No weekly completion rate; no 4-week comparison |
| Goal progress delta | 🟡 Current % only | No velocity; no estimated completion |
| AI-generated reflection questions | ❌ Missing | Static template vs AI-personalized |
| Forward planning proposals | ❌ Missing | Review ends at summary; no next-week setup |
| Monthly rolled-up review | ❌ Missing | Weekly only |
| Time tracking (actual vs estimated) | ❌ Missing | `actualMinutes` field unused |

**The review modal needs to evolve from a summary panel into a structured 3-step AI conversation.** This is the highest-value single feature that makes the Habit Builder and Goal-Setter archetypes truly sticky.

---

## 7. The "Just Use Atlas" Vision

### What "Just Use Atlas" Means

The user wakes up. They open Atlas. They never open Todoist, Notion, Google Calendar, or a notes app. Atlas handles everything. What does this require?

**Morning (60-second interaction):**
> ATLAS: "Good morning. Yesterday you finished 5 of 7 tasks. Energy forecast today: high morning, low afternoon — I've moved your deep work block to 9-11am. Habit reminders: daily journaling at 7am, workout at 6pm. Top 3 priorities: [X], [Y], [Z]. Ready?"
> User: "Yes, also add 'call dentist' to today"
> ATLAS: [creates task, schedules it in low-energy slot] "Done. Anything else?"

**Captured in conversation:**
- Quick tasks ("remind me to call dentist")
- Goal updates ("I finished chapter 3 of the book")
- Habit logs ("I did my morning run")
- Schedule changes ("push my afternoon meeting to Thursday")

**Visible in dashboard:**
- Today's plan (read-only)
- Goal progress bars
- Habit streaks
- Energy wave with scheduled tasks overlaid

### What Still Needs to Be Built for "Just Use Atlas"

1. **Quick capture** — Natural language task/habit/goal capture in one text field, always accessible (command palette style)
2. **Proactive check-ins** — AI-initiated morning brief, mid-day pulse, evening review
3. **Calendar view with task overlay** — Visual time-based scheduling; tasks land in slots, not just a list
4. **Time tracking** — "I spent 90 minutes on the report" → updates `actualMinutes`; feeds velocity data
5. **Recurrence engine** — "Every weekday, block 30 minutes for email at 9am" → creates recurring tasks
6. **Priority inbox** — "What should I do right now?" → AI considers energy, deadlines, goal importance, context
7. **Completion analytics** — Over time, show trends: are you getting better at completing what you plan?
8. **Goal decomposition confirmation** — AI proposes, user approves, tasks are visually linked to goal

**Estimated total work:** 4-5 sprints. None of these are architecturally complex — the data model mostly supports them. They are execution and surface work.

---

## 8. Critical Missing User Stories

### US-001: Morning AI Brief (Proactive Check-In)
**As** an overwhelmed professional  
**I want** Atlas to proactively open a morning brief when I open the app in the morning  
**So that** I start my day with a co-created plan rather than a blank slate

**Given** the user opens Atlas between 05:00–10:00 and has no active conversation  
**When** the app loads  
**Then** ATLAS automatically initiates a morning check-in conversation, surfaces today's scheduled tasks, reads NSV energy forecast, and proposes the day's top 3 priorities

**Acceptance Criteria:**
- [ ] Check-in fires once per calendar day (not on every page visit)
- [ ] ATLAS reads current NSV: if `cnsFatigue > 7`, proposes fewer tasks; if `emotionalResilience < 4`, routes to Agnes before planning
- [ ] User can confirm ("looks good"), modify ("drop task X"), or snooze ("not now, ask in 30 min")
- [ ] If snoozed, re-triggers after snooze period
- [ ] Conversation is stored in episodic memory for RAG context

---

### US-002: Quick Capture
**As** an AI-native user  
**I want** to capture a task, habit log, or goal update in one natural language input from anywhere in the app  
**So that** I never lose an intention because the UI was in the wrong place

**Given** the user is anywhere in the Atlas module  
**When** they press `Cmd+K` (or tap a floating action button) and type natural language  
**Then** ATLAS parses the input and creates the appropriate entity (task, habit log, or goal update) with AI-extracted metadata

**Acceptance Criteria:**
- [ ] Accessible from any Atlas tab via keyboard shortcut and floating button
- [ ] AI correctly classifies input as task, habit log, or goal update (>90% accuracy on test set)
- [ ] Extracted fields shown in a confirmation toast: user can dismiss or edit before commit
- [ ] Confirmation is optional — user can set "instant commit" in preferences
- [ ] Input history saved for 24 hours in case of accidental dismiss

---

### US-003: Priority Inbox — "What Now?"
**As** an overwhelmed professional  
**I want** to ask Atlas "what should I do right now?" and get a single, confident recommendation  
**So that** I stop wasting decision energy on meta-tasks (deciding what to work on)

**Given** the user has active tasks, goals, and a known energy state  
**When** they ask "what should I do now?" (or tap the "Focus" button)  
**Then** ATLAS surfaces one recommended task, explains why, and opens FocusView for that task

**Acceptance Criteria:**
- [ ] Algorithm weighs: deadline proximity, goal importance, estimated cognitive cost vs current energy, task dependencies
- [ ] ATLAS provides a 1-2 sentence rationale in natural language ("This report is due tomorrow and your energy is high right now")
- [ ] User can reject and get next recommendation ("not that, what else?")
- [ ] Selection opens FocusView with working timer active
- [ ] Recommendation is blocked if `cnsFatigue > 9` — ATLAS proposes rest instead

---

### US-004: Calendar / Time-Block View
**As** a goal-setter  
**I want** to see my tasks overlaid on a time-block calendar view  
**So that** I can visualize whether my plans are realistic for the hours I have

**Given** tasks have `scheduledAt` and `estimatedMinutes` populated  
**When** the user switches to "Calendar" view  
**Then** tasks render as time blocks in a day/week grid, color-coded by project or goal

**Acceptance Criteria:**
- [ ] Day view and week view supported
- [ ] Energy wave overlaid as a background gradient (low energy = cooler color, high = warmer)
- [ ] Tasks can be dragged to reschedule (updates `scheduledAt` via AI action)
- [ ] Overlapping tasks shown visually with a conflict indicator
- [ ] Unscheduled tasks appear in a sidebar "inbox" for drag-in scheduling
- [ ] Recurrent tasks rendered from recurrence rules (not just `scheduledAt`)

---

### US-005: Goal Decomposition Confirmation Flow
**As** a goal-setter  
**I want** to review and approve AI-generated task breakdowns before they're committed  
**So that** I don't end up with 20 tasks I didn't intend to create

**Given** the user asks ATLAS to "break down" a goal into tasks  
**When** ATLAS generates the decomposition  
**Then** a confirmation panel shows the proposed task tree (goal → tasks, with dates and estimates) before committing

**Acceptance Criteria:**
- [ ] Confirmation panel shows all proposed tasks with title, estimated effort, and suggested date
- [ ] User can delete any proposed task before committing
- [ ] User can edit task title or date inline in the confirmation panel
- [ ] Committing creates all tasks with `goalId` linked to the source goal
- [ ] A "start over" option re-runs the decomposition with additional user guidance
- [ ] Committed tasks appear in Goal detail view under the goal they were linked to

---

### US-006: Time Tracking (Actual vs Estimated)
**As** a data nerd  
**I want** to track how long tasks actually took vs how long I estimated  
**So that** I can improve my planning accuracy over time

**Given** a task has `estimatedMinutes` set  
**When** the user completes a task (via FocusView timer stop or manual completion)  
**Then** `actualMinutes` is recorded; the delta is displayed in task history

**Acceptance Criteria:**
- [ ] FocusView timer auto-populates `actualMinutes` when user stops timer and marks complete
- [ ] Manual completion prompts: "How long did this take?" (optional, dismissible)
- [ ] Task history shows estimated vs actual as a simple bar comparison
- [ ] Weekly review includes average estimation error (e.g., "You underestimated tasks by 23% this week")
- [ ] Over time, AI uses historical estimation accuracy to suggest more realistic estimates

---

### US-007: Proactive Weekly Review Trigger
**As** a goal-setter  
**I want** Atlas to automatically initiate my weekly review on Sunday evening  
**So that** I never skip it because I forgot

**Given** it is Sunday between 17:00–21:00 and the user has not completed a weekly review this week  
**When** the user opens Atlas (or receives a scheduled notification)  
**Then** ATLAS initiates the weekly review flow as a guided 3-step conversation

**Acceptance Criteria:**
- [ ] Trigger fires at most once per week (idempotent)
- [ ] User can set their preferred review day/time in Atlas preferences
- [ ] Review flow is conversational (3 steps): Quantitative Summary → AI Reflection Questions → Forward Planning
- [ ] User can pause and resume the review (state persisted)
- [ ] Completed review data stored as `TemporalReview` with full quantitative snapshot
- [ ] If user skips, ATLAS acknowledges and reschedules for Monday morning

---

### US-008: Habit Completion Heatmap
**As** a habit builder  
**I want** to see a GitHub-style heatmap of my habit completions over the past 90 days  
**So that** I can see my consistency patterns visually

**Given** the user has active habits with historical completion data  
**When** they view a habit's detail  
**Then** a 90-day heatmap shows daily completion status (complete/partial/missed)

**Acceptance Criteria:**
- [ ] Heatmap shows 90 days minimum; toggleable to 180 days
- [ ] Each day is color-coded: completed (full color), partial (half color), missed (empty), rest day (gray)
- [ ] Tapping a day shows what was logged that day
- [ ] Heatmap is computed from stored daily `HabitLog` events (requires historical storage architecture)
- [ ] Summary stats visible: completion rate (last 30/90 days), current streak, longest streak

---

### US-009: Recurrence Engine for Tasks
**As** an overwhelmed professional  
**I want** to set tasks as recurring (daily, weekly, on specific days)  
**So that** regular commitments are auto-populated without manual re-entry

**Given** a task has a recurrence rule (e.g., "every Monday, Wednesday, Friday")  
**When** the current instance of the task is completed or the scheduled date passes  
**Then** the next instance is automatically created with the same metadata

**Acceptance Criteria:**
- [ ] Recurrence patterns supported: daily, weekly (specific days), bi-weekly, monthly (by date or day-of-week)
- [ ] Recurrence set via AI ("make this task repeat every Monday") or inline form
- [ ] Completed recurring tasks show in history; the series continues
- [ ] User can "end series" to stop future recurrences
- [ ] "Skip this occurrence" available without breaking the series
- [ ] Recurring tasks appear in Calendar view across future weeks

---

### US-010: Predictive State Machine — Live Overload Warning
**As** an overwhelmed professional  
**I want** Atlas to detect when my plan exceeds my actual capacity and warn me before I burn out  
**So that** I can adjust before I'm already exhausted

**Given** the PredictiveService is running and monitoring NSV + task load  
**When** the system computes `planningLoad > 8` OR `cnsFatigue > 7` AND 3+ high-energy tasks remain today  
**Then** ATLAS proactively surfaces an overload warning and proposes schedule adjustments

**Acceptance Criteria:**
- [ ] PredictiveService evaluates state on every NSV update and on task CRUD events
- [ ] State machine transitions: Normal → Compressed → Overloaded → Recovery (as designed in `atlas-predictive-service.ts`)
- [ ] Warning shown as an ambient banner (not a modal interrupt) in Atlas dashboard
- [ ] ATLAS proposes concrete action: "Defer 2 low-priority tasks to tomorrow and add a 30-min recovery window at 3pm?"
- [ ] User can accept (AI executes via action tags) or dismiss
- [ ] State logged for weekly review ("You were in Overloaded state 3 days this week")
- [ ] Spine event `BURNOUT_WARNING` emitted when entering Overloaded state (already designed; needs PredictiveService to fire it)

---

### US-011: Project Management View
**As** a goal-setter running complex projects  
**I want** to see all tasks grouped under their project with progress tracking  
**So that** I can manage multi-task initiatives without losing the big picture

**Given** tasks have `projectId` set  
**When** the user navigates to the Projects section  
**Then** tasks are grouped by project, with project-level completion percentage and estimated completion date

**Acceptance Criteria:**
- [ ] Projects view shows: project name, task count (complete/total), completion %, target date, days remaining
- [ ] Tasks within a project show in priority order with completion status
- [ ] Filtering: show only overdue, in-progress, or blocked tasks
- [ ] Project creation via AI ("create a project for my home renovation") or quick-add form
- [ ] Project-level "complete" action archives the project and all its tasks
- [ ] Projects linked to goals show goal badge (visual connection between project and parent goal)

---

### US-012: Field Creation via AI (Wired)
**As** an AI-native user  
**I want** to create custom tracking fields by asking Atlas  
**So that** I can track what matters to me without touching settings menus

**Given** the user asks "track my reading pages per day"  
**When** ATLAS interprets this as a custom field request  
**Then** the `create_field` action executes (not the current `console.log` stub) and the field appears in the Fields tab

**Acceptance Criteria:**
- [ ] `handleAddField` stub replaced with real implementation calling `addExtensionField` in AtlasProfileService
- [ ] AI validates field type (counter, boolean, timer, rating) from natural language description
- [ ] Field appears immediately in Fields tab after creation
- [ ] Field is injectable into LLM context for tracking
- [ ] User can delete via AI: "stop tracking reading pages"
- [ ] Maximum 15 extension fields enforced with graceful AI message when limit reached

---

### US-013: Completion Productivity Analytics
**As** a data nerd  
**I want** to see trends in my task completion rate, habit consistency, and goal velocity over time  
**So that** I can identify patterns and improve my planning

**Given** historical completion data has been stored (requires historical aggregates architecture)  
**When** the user visits the Analytics tab  
**Then** they see charts for: weekly task completion rate (12-week trend), habit completion rates, goal velocity, and time estimation accuracy

**Acceptance Criteria:**
- [ ] Charts show minimum 12-week rolling window
- [ ] Exportable as CSV (data portability commitment)
- [ ] ATLAS provides a natural language summary of the most significant trend ("Your deep work habit has 73% completion vs 45% 4 weeks ago — strong improvement")
- [ ] Charts compare "planned" vs "actual" for time-tracked tasks
- [ ] Clickable data points drill down to specific week's tasks/habits

---

### US-014: Cross-Module Failure Notification (Atlas → Agnes)
**As** an emotionally aware user  
**I want** Atlas to notify Agnes when I repeatedly fail the same goal or habit  
**So that** the therapy module can explore the emotional/psychological blockers with me

**Given** a user fails the same habit 3+ times in a week OR a goal makes zero progress for 14 days  
**When** ReviewService detects this pattern  
**Then** a Spine event fires to Agnes with context ("user has missed meditation habit 3 days in a row")

**Acceptance Criteria:**
- [ ] Spine event `COMMITMENT_FAILURE` defined with payload: `{moduleSource: 'atlas', entityType: 'habit'|'goal', entityId, failureCount, patternDescription}`
- [ ] Agnes persona receives this event and prepares a gentle opening prompt for next Agnes session
- [ ] Atlas UI shows a subtle bridge indicator: "This pattern may be worth exploring with Agnes"
- [ ] User can opt out of cross-module sharing in privacy settings
- [ ] Event fires at most once per 7-day window per entity (no spam)

---

### US-015: Evening Micro-Review
**As** a habit builder  
**I want** a 60-second evening check-in with Atlas  
**So that** I end every day with logged completions and tomorrow's top 3 set

**Given** it is after 19:00 and the user has unchecked tasks/habits for today  
**When** the user opens Atlas (or a notification triggers)  
**Then** ATLAS runs a 3-question micro-review: completions, blockers, tomorrow's top 3

**Acceptance Criteria:**
- [ ] Fires once per evening (idempotent), configurable time in preferences
- [ ] 3 questions maximum (respect evening energy state)
- [ ] Responses update: habit completion logs, task completion status, tomorrow's priority field
- [ ] Micro-review data feeds into weekly review aggregate
- [ ] If user skips 3+ days, ATLAS acknowledges without guilt-tripping ("No pressure — want me to stop the evening check-ins?")

---

## 9. Prioritization Matrix

### Scoring: Impact (1-5) × Effort (1-5, inverted — lower effort = higher score)

| Feature | Archetype(s) Served | User Impact | Dev Effort | Priority Score | Sprint Target |
|---------|--------------------|-----------| -----------|---------------|---------------|
| **Fix existing bugs** (audit findings: TodaysPlanCard, FocusView chat btn, field creation stub, WeeklyReview modal trigger) | All | 5 | 1 | **25** | S8 (immediate) |
| **Quick Capture** (US-002) | AI-Native, Overwhelmed | 5 | 2 | **20** | S8 |
| **Priority Inbox / "What Now?"** (US-003) | Overwhelmed | 5 | 2 | **20** | S8 |
| **Proactive Weekly Review Trigger** (US-007) | Goal-Setter, Habit Builder | 5 | 2 | **20** | S8 |
| **Predictive State Machine — Live Overload** (US-010) | Overwhelmed, AI-Native | 5 | 3 | **15** | S9 |
| **Morning AI Brief** (US-001) | All | 5 | 3 | **15** | S9 |
| **Field Creation via AI — Wired** (US-012) | AI-Native | 4 | 1 | **16** | S8 |
| **Goal Decomposition Confirmation** (US-005) | Goal-Setter | 4 | 2 | **16** | S8 |
| **Recurrence Engine** (US-009) | Overwhelmed | 4 | 3 | **12** | S9 |
| **Project Management View** (US-011) | Goal-Setter | 4 | 3 | **12** | S9 |
| **Cross-Module Failure Notification** (US-014) | AI-Native, Habit Builder | 4 | 2 | **16** | S9 |
| **Evening Micro-Review** (US-015) | Habit Builder | 4 | 2 | **16** | S9 |
| **Calendar / Time-Block View** (US-004) | Goal-Setter, Data Nerd | 4 | 4 | **10** | S10 |
| **Time Tracking** (US-006) | Data Nerd, Overwhelmed | 3 | 3 | **9** | S10 |
| **Habit Completion Heatmap** (US-008) | Habit Builder, Data Nerd | 3 | 3 | **9** | S10 |
| **Completion Analytics** (US-013) | Data Nerd | 3 | 4 | **7** | S11 |
| **External Calendar Integration** (Google Cal) | All | 3 | 5 | **5** | Icebox |

### Sprint Recommendation Summary

**Sprint 8 (Atlas Bug Fixes + AI-First Foundation):**
- Fix all 6 design audit bugs (TodaysPlanCard, FocusView chat, field creation, weekly review trigger, week view content, first-run experience)
- Wire `handleAddField` to real implementation (US-012)
- Implement Quick Capture (US-002)
- Implement Priority Inbox (US-003)
- Implement Goal Decomposition Confirmation (US-005)
- Implement `preferenceMode: 'conversational' | 'structured'` toggle

**Sprint 9 (The Intelligent Loop):**
- Morning AI Brief, proactive weekly review trigger, evening micro-review (US-001, US-007, US-015)
- PredictiveService implementation — state machine goes live (US-010)
- Atlas → Agnes failure notification (US-014)
- Recurrence engine (US-009)
- Project Management View (US-011)

**Sprint 10 (Power User Surface):**
- Calendar / time-block view (US-004)
- Time tracking integration (US-006)
- Habit completion heatmap (US-008)
- Historical aggregates storage architecture (prerequisite for analytics)

**Sprint 11 (Analytics & Polish):**
- Completion productivity analytics (US-013)
- Monthly review roll-up
- Export / data portability

---

## 10. Anti-Features — What Atlas Must NOT Be

These are explicit product constraints. If someone proposes these features, the PM position is: reject or defer to Icebox.

### ❌ Anti-Feature 1: External Calendar Sync (Google Calendar, iCal)
**Why not:** External calendar sync is a feature tax — it requires OAuth flows, conflict resolution logic, real-time bi-directional sync, error handling for API rate limits, and ongoing maintenance as calendar APIs change. More importantly, it solves the wrong problem. The reason users want calendar sync is to see their commitments in one place — Atlas *is* that place. Build the internal calendar view first. If 60%+ of active users explicitly request external sync after the calendar view ships, revisit.

**Exception:** Read-only import at onboarding ("import your Google Calendar events to see your week's existing commitments") is lower risk. Even then, defer until S12+.

### ❌ Anti-Feature 2: Team / Shared Task Management
**Why not:** Nexus is a personal operating system. The moment Atlas supports shared tasks, it becomes a project management tool (Notion, Asana, Linear). The entire data model, AI persona, and NSV integration is premised on a single user's biology and psychology. Multi-user state is architecturally incompatible with the NSV-driven adaptive planning thesis.

**Exception:** "Share a goal update" as a social/accountability feature (read-only export to a friend) is a future consideration only after core solo UX is complete.

### ❌ Anti-Feature 3: Gamification (Points, Badges, Leaderboards)
**Why not:** Gamification for productivity tools creates extrinsic motivation loops that displace intrinsic motivation. Users start optimizing for the streak counter, not the underlying habit. This is directly contrary to Atlas's identity as a system that respects the user's actual capacity. Streaks as informational data points (current streak: 7 days) are fine. Badges, point systems, and leaderboards are explicitly out of scope.

**Exception:** If Agnes determines (via therapeutic framework) that a specific user benefits from positive reinforcement loops, the cross-module architecture could theoretically enable this — but only as an Agnes-driven intervention, never as a default Atlas feature.

### ❌ Anti-Feature 4: Detailed Financial Planning
**Why not:** Tasks have no business tracking budget or spend. Any feature that maps tasks to money (e.g., "this project will cost $500") bleeds into Ledger's domain. Atlas can read financial stress indicators from the NSV (e.g., `financialStress > 7 → defer non-essential goal`), but it never owns financial data.

### ❌ Anti-Feature 5: Full Workout / Training Logging
**Why not:** Titan owns physical training. If a user says "log my workout" in Atlas, ATLAS should route to Titan. Atlas can read `cnsFatigue` from NSV and factor it into task scheduling, but it never creates workout sessions, logs sets/reps, or tracks exercise performance. Energy recovery windows in Atlas are planning concepts (block 60 min for rest) not health data.

### ❌ Anti-Feature 6: Chat History as Primary Navigation
**Why not:** The chat interface is the *input mechanism*, not the organizational system. Users should not need to scroll through chat history to find their goals or check their habits. All actionable data surfaces through the dashboard views. Chat history is available for RAG context but is never the primary navigation paradigm.

### ❌ Anti-Feature 7: AI That Makes Decisions Without User Confirmation
**Why not:** Atlas should never autonomously reschedule, delete, or modify a user's tasks without their awareness. The Predictive Service can *propose* schedule flattening; it must never execute it silently. User agency is non-negotiable. Even when ATLAS is confident an action is beneficial, the confirmation step exists. The only exception: if the user explicitly enables "autopilot mode" (a future opt-in preference, not a default).

---

## Appendix: Architecture Decisions Required Before Sprint 8

Before implementing the proactive features (US-001, US-007, US-015), two architectural decisions must be resolved:

**Decision 1: Proactive Check-In Trigger Mechanism**  
Options: (A) Client-side scheduling with browser Notification API; (B) Firebase Cloud Function scheduled trigger + push notification; (C) App-load detection with time-window heuristic. Recommendation: Start with (C) for MVP — "if user opens Atlas and it's morning and no check-in has fired today, trigger it." Add push notifications in S10.

**Decision 2: Historical Aggregates Storage Schema**  
Required for US-008, US-013, and Layer 1 of world-class weekly review. The `AtlasProfile` document model stores point-in-time data. Historical analytics require time-series storage. Options: (A) Sub-collection `atlas_history/{userId}/daily/{date}` with a daily snapshot document; (B) Append-only event log in Firestore; (C) Firebase Analytics custom events (limited queryability). Recommendation: (A) daily snapshot — simple, queryable, privacy-preserving. Snapshot triggered by evening micro-review completion or midnight Cloud Function.

---

*Document authored by Product Manager Agent in Nexus Orchestrator multi-agent debate.*  
*Preceded by: `docs/design/ATLAS_DESIGN_AUDIT.md`*  
*To be followed by: Sprint 8 work item definitions in `workitems/sprints/SPRINT_8.md`*
