# Atlas Module — Design Agent Audit
**Debate-Quality UX/UI Analysis | Design Agent Report**  
*Date: 2026 | Auditor: Design Agent (Nexus Orchestrator)*

---

## Executive Position

Atlas has the right ambition — a dual-mode cognitive planner that works equally well for the natural-language power user and the structured form user. The data model is sophisticated. The Spine integration is real. The onboarding spec is thoughtful. But the **gap between the data model and the rendered UI is severe**. The components frequently display stale, wired-to-nothing, or placeholder data. Several "tracking" features track nothing. The AI-first design philosophy exists in documentation and system prompts, but barely in the interface itself. This audit will name every failure precisely and argue for what must change.

---

## 1. Current UX Strengths

### 1.1 The Dual-Mode Concept Is Architecturally Sound
The split between `SingleAgentLayout` (right panel AI chat) and `EnhancedAtlasDashboard` (left visual domain) is the correct pattern. A persistent chat pane means the power user never has to leave the conversation — they can ignore every tab and still accomplish everything. The guided onboarding as a pre-condition to full dashboard access is also correct: you cannot accidentally land on an empty dashboard with no data.

### 1.2 Accessibility Fundamentals Are Present
The codebase has consistent `role="meter"`, `aria-valuenow/min/max`, `aria-label`, `aria-expanded`, and focus-trap logic. `ViewSwitcher` implements ARIA tablist with proper arrow-key keyboard navigation. `QuickAddForm` has a full focus trap, Escape-to-close, and return-focus-to-trigger. `FocusView` uses `role="timer"` and `aria-live`. `useReducedMotion` is used in all animated components. This accessibility baseline is **above average** for internal SPA tooling.

### 1.3 Semantic Energy Language Is a Strong UX Hook
Energy cost (0-10) as a first-class concept on tasks, habits, and routine blocks is genuinely differentiated. It surfaces as a slider in `QuickAddForm`, as a bar in `TodaysPlanCard`, and as colored load indicators in `WeekGrid`. The tri-metric dashboard (Energy, Focus, Load) from `GlobalProjection.cognitive` creates a coherent cognitive-budget mental model that a user can internalize quickly.

### 1.4 HabitTracker Is The Strongest Component
`HabitTracker` is the most complete and well-designed component in the module. It has correct "done today" detection, streak-at-risk logic with proper hour-elapsed thresholds per frequency type, visible fire icons, best-streak revealed on hover, and pause/resume toggle. The at-risk warning with `role="alert"` is correct pattern. This component can be shipped.

### 1.5 GoalProgress Milestone Interaction
The expand-to-reveal milestone list with inline completion checkboxes is correct UX for a progressive disclosure pattern. The motion animation for height collapse is smooth. Deadline urgency coloring (rose → amber → neutral) is semantically clear.

### 1.6 FocusView Has a Functional Timer
The Pomodoro timer is actually wired. Play/pause/reset work. The progress bar depletes correctly. The energy gauge SVG is correctly sized and colored by threshold. This is one of the few features that is both built and functional. The ambient glow on the background is a good zen-mode signal.

### 1.7 WeeklyReviewModal Has Real Computation
`computeBurnoutRisk`, `computeWeeklyEnergy`, `computeWeeklyCompletion`, and the `PressureSource` logic are real signal extraction from the NSV — not just a display shell. The capacity slider tied to Spine events is thoughtful.

---

## 2. Critical UX Failures

### 2.1 [CRITICAL] TodaysPlanCard Is Wired to the Wrong Property
**Line 202 in TodaysPlanCard.tsx:**
```typescript
const tasks = profile?.taskGraph ?? [];
```
`AtlasProfile` has a `tasks[]` array. There is no `taskGraph` field on the profile. This means `TodaysPlanCard` **always renders an empty task list**, no matter how many tasks the user has created. The card always shows "Streaks will appear as you build habits" even when habits with active streaks exist — the habits section is also hardcoded to a placeholder paragraph, never reading from `profile.habits`. This is the most critical bug in the module. The card that a user sees **every single day** is lying to them.

### 2.2 [CRITICAL] EnergyWaveChart Is a Static SVG with No Interaction
`EnergyWaveChart` renders three lines using a fixed `viewBox="0 0 300 120"` SVG. There are no:
- Time axis labels (hours of day)
- Y-axis scale markers (0, 5, 10)
- Hover tooltip to inspect energy at a specific time slot
- Current time indicator
- Scheduled task overlays (backlog item in BACKLOG.md confirms this is missing)
- Recovery window shading (except the `isFlattened` rect which is applied but uses arbitrary Y coordinates, not actual energy level)
- Legend interaction (click to show/hide lines)

The legend text says "Energy (solid), Focus (dashed), Load (amber)" as a bare text string with no visual swatch. This is a chart from 2015 inside a 2026 product. A user cannot extract actionable scheduling intelligence from this rendering.

### 2.3 [CRITICAL] FocusView's Chat Button Receives `noop`
In `EnhancedAtlasDashboard.tsx` line 190:
```tsx
onOpenChat={noop}
```
The FocusView renders a floating chat button (`MessageCircle`) with `aria-label="Open chat with Atlas"`. Clicking it does **nothing**. This is the exact moment when a user in deep focus mode needs to communicate with the AI agent (ask for time extensions, report blockers, get encouragement), and the button is silently broken. There is no way for FocusView to surface the right AI panel without this being wired.

### 2.4 [CRITICAL] handleAddField Is a `console.log` Stub
In `AtlasPage.tsx` line 89:
```typescript
console.log('[Atlas] Add field triggered — use chat to create custom metrics');
```
The "Add Metric" button in `FieldsTab` and every `SuggestionCard` calls `onAddField`. This function does nothing visible. The user clicks "Add Metric", nothing happens. The comment says "use chat" but there is no chat prompt injection, no toast, no guidance — the user is left staring at a button that does nothing. This is a silent failure that trains users to distrust the product.

### 2.5 [CRITICAL] WeeklyReviewModal Is Never Triggered From the UI
`WeeklyReviewModal` is built with real computation logic, but it is **not mounted anywhere in `EnhancedAtlasDashboard`**. The Review tab shows a passive list of past reviews. The modal trigger exists nowhere in the rendered component tree. The empty state in the Review tab correctly says "Trigger a daily or weekly wrap-up in the Atlas chat" — but a new user does not know this, and a power user should be able to trigger it from the UI without going to chat. This is a dead feature.

### 2.6 [SERIOUS] TaskTimeline Shows an Empty Grid for Most Users
`TaskTimeline` renders hour slots from 6 AM to 10 PM and buckets `scheduledTasks` by hour. But `scheduledTasks[]` is almost never populated via the current action flows — tasks are created with `deadline` dates, not `scheduledAt` timestamps. The timeline is architecturally correct but will be blank for any user who created tasks through `QuickAddForm` or chat (which creates tasks without time-scheduling them). The unscheduled task backlog section exists at the bottom but requires toggling `showBacklog`. This is a visual false promise — you see a sophisticated calendar timeline, but it's empty.

### 2.7 [SERIOUS] WeekGrid's Energy Load Is Always 0% for Most Users
`WeekGrid` computes energy load from `scheduledTasks` (same problem as TaskTimeline). For users whose tasks are deadline-based rather than time-scheduled, every day shows "0%" load and no tasks. The 7-day grid looks like a placeholder. The habit dots only show if `lastCompleted` matches the exact day — there's no week history being stored, so dots only light up for today at best.

### 2.8 [SERIOUS] The "Week" Sub-View Does Nothing Special
In `EnhancedAtlasDashboard`, the "Week" view via `ViewSwitcher` does not render `WeekGrid`. Looking at the code (lines 200-403): both `today` and `week` views render the **same content** — daily intention, AI insights panel, stat cards, EnergyWaveChart, TaskTimeline, HabitTracker, GoalProgress. `WeekGrid` is defined and built but **never mounted in the dashboard**. A user clicking "Week" gets identical content to "Today". This makes `ViewSwitcher` misleading.

### 2.9 [SERIOUS] Backlog Tab Architecture Is Confused
The Backlog tab renders `TaskManager` and `GoalTracker` in a 2-column `lg:grid-cols-2` layout. This is wrong for three reasons:
1. Tasks and Goals are separate first-class entities — cramming them into a split-panel with no sizing balance creates visual competition
2. `GoalTracker` belongs in its own tab or the dashboard, not in the backlog (backlog = uncommitted queue, goals = persistent commitments)
3. Neither component has a way to cross-reference — you can see tasks and goals simultaneously but cannot assign a task to a goal, or see which goals have no associated tasks

### 2.10 [MODERATE] The TodaysPlanCard and Dashboard Section Overlap
The dashboard `today` view renders both `TodaysPlanCard` AND the stat cards + energy wave + TaskTimeline section in the same scroll area. `TodaysPlanCard` already shows energy budget, cognitive stats, and tasks. The parent dashboard then shows the same cognitive stats again via `StatCard` components. The user sees "Energy Budget: 6.0" twice on the same screen. This is redundant information architecture.

---

## 3. Form Usability Audit

### 3.1 QuickAddForm — Adequate but Incomplete

**What works:**
- Auto-focus on title input after open ✓
- Priority selector with colored buttons ✓
- Energy cost slider ✓
- Deadline date input ✓
- Focus trap and Escape-to-close ✓

**What's missing:**
- **Habit creation is critically underpowered**: When type=habit, only `title` and `energyCost` are collected. No `frequency` selector (daily/weekdays/weekends/weekly). A habit without a frequency is non-functional for the streak tracking logic. The `isStreakAtRisk` function switches on frequency — if it's never set, behavior is undefined.
- **Goal creation collects only title and deadline**: No `description`, no `successCriteria`, no milestones. A goal created via QuickAddForm has zero substance.
- **No description field for tasks**: Tasks support `description` in the data model but QuickAddForm omits it. Users are forced to the full TaskManager to add context.
- **No tags field**: Tags are searchable in TaskManager but not settable in QuickAddForm.
- **Priority labels are not explained**: Priority 1 means highest urgency (rose) but this is only conveyed by color. A label like "Critical/High/Medium/Low/None" would eliminate ambiguity.

### 3.2 TaskManager — Good Bones, Broken Dependency UI
The filter/sort/search bar is correct. The dependency graph toggle (`showDependencyGraph`) exists but there is no actual graph rendered — it's a feature flag over nothing. The task form inside TaskManager has proper fields (title, description, priority, energyCost, deadline, tags) and is the correct detailed form. However, editing is triggered by clicking an edit icon, and the form is rendered inline in a modal/panel pattern that is not consistently positioned. There is no bulk action support (complete all, delete all done tasks).

### 3.3 GoalTracker Form — Good but Milestone UX Is Fragile
The goal form correctly captures title, description, deadline, and successCriteria. The milestone add-flow uses a separate `newMilestone` state with a title + dueDate pair, submitted with a separate button. This is workable but:
- There is no visual indication of how many milestones you should have
- The milestone list in the form has no reordering
- Deleting a milestone requires finding the X button in a dense list
- `associatedTaskIds` is never set from the form UI — the task-goal relationship is entirely AI-driven

### 3.4 HabitBuilder — Relies on Templates, Bare Form for Custom Habits
Templates are a good pattern. But the custom habit form collects: title, energyCost, frequency, minimumViableVersion, targetStreak, type (boolean/counter/timer). This is actually a reasonably complete form. The problem is discoverability — the template grid is shown first, and the "custom" form path requires explicitly choosing not to use a template. The type field (`boolean` vs `counter` vs `timer` vs `sober` vs `learning`) has no explanation of what each means for tracking behavior. A user selecting `timer` expects different tracking UI than one selecting `counter`, but there's no preview of what that will look like.

### 3.5 RoutineEditor — Severely Underdeveloped
The RoutineEditor is the weakest form in the module. Each block is rendered as a `grid-cols-4` row with:
- A bare `<input type="text">` with `bg-transparent border-none` (no visible boundary)
- A `<select>` for category with minimal styling
- A start/end time input
- An energy cost number input
- A day-of-week selector (not visible in the code excerpt — needs verification)

Critical issues:
- The title input has `bg-transparent border-none text-sm font-bold` — it looks like static text. A user cannot tell it's editable without clicking.
- There are no `<label>` elements — only semantic via placeholder/value. This is an WCAG AA failure for the form inputs.
- Day-of-week selection for `daysOfWeek: number[]` is not visible in the component — if it's missing, blocks cannot be configured for specific days.
- "Active" toggle makes the entire routine active/paused, but individual blocks cannot be paused.
- No visual preview of what the week schedule looks like — just a list of text blocks.

---

## 4. Data Visualization Gaps

### 4.1 EnergyWaveChart — Must Be Rebuilt from Scratch

The current chart is a proof-of-concept, not a shipping visualization. Required additions:

**Must have:**
- Time axis labels (6AM, 9AM, 12PM, 3PM, 6PM, 9PM) — currently none
- Y-axis markers (0, 5, 10) — currently none
- SVG area fill beneath the energy curve (filled gradient, not just stroke line)
- Current time indicator (vertical line at "now")
- Hover tooltip showing time slot + energy/focus/load values
- Scheduled task dots/blocks overlaid on the chart at their time positions
- Recovery window shading (correct Y-range, not arbitrary bottom-quarter rectangle)

**Should have:**
- Click on a time slot to get AI scheduling suggestion for that slot
- Legend interaction (toggle individual lines)
- Week average baseline as a dashed reference line

**The `isFlattened` visualization is wrong**: The current code draws `<rect x="0" y={height * 0.55} width={width} height={height * 0.45} fill="rgba(56,189,248,0.12)">`. This shades the bottom 45% of the chart regardless of actual energy levels, which is meaningless. A flattened energy wave should show the actual wave being compressed/truncated to a lower ceiling.

### 4.2 GoalProgress — Missing a Portfolio View
Individual goal cards are fine. But when a user has 5+ goals, there is no overview: no portfolio progress ring, no "goals at risk" surface, no visualization of goal portfolio balance (career vs personal vs health). The GoalProgress component always shows individual cards in isolation. A user cannot answer "which of my goals is most behind?" without scanning each card manually.

### 4.3 HabitTracker — No Historical Pattern
`HabitTracker` shows current streak and best streak. But:
- No 30-day or 7-day completion calendar (the Github-style heat map or horizontal day-dots would be ideal)
- No trend visualization (is the user improving or declining in completion rate?)
- No comparison between habits (which habit has the highest completion rate this week?)
- The `completedDates[]` field exists in the data model and should drive a 7-day mini-calendar per habit

### 4.4 StatCards Show Raw Numbers Without Context
The four StatCards (Energy Budget, Focus Score, Active Load, Routine Status) display numbers like `6.3` with no baseline, no trend arrow, no color-coded threshold label. `TrendArrow` is imported in `TodaysPlanCard` but **not used** anywhere in the dashboard stats. A number without context is noise. "Energy Budget: 6.3" — is that good or bad for this user at this time of day? The stat needs: current value + trend direction + threshold color.

### 4.5 Review Tab Is a Read-Only Data Dump
The Review tab renders `review.insights[]` as an unstyled `<ul><li>` list. The insights are potentially the highest-value AI output in the entire module — they represent the agent's synthesis of a week's worth of cognitive data. They deserve:
- Highlighted callout cards with icons
- Actionable CTA per insight ("Act on this" → opens focused chat)
- Trend visualization (drift score over time, completion rate chart)
- Comparison to previous review period

---

## 5. The "AI-First, Zero-Forms" Ideal — Current Gaps

### 5.1 No Action Confirmation UI
When the AI creates a task, habit, or goal via action tags, there is no visible feedback in the dashboard. The user sees the AI say "I've created that task" in the chat, but the dashboard does not highlight the newly created entity, show a toast, or animate the card in. The user is left wondering if it worked. **The AI's outputs must be reflected in the visual domain with immediate feedback.**

### 5.2 No "AI Did This" Provenance on Cards
In `TaskManager`, `GoalTracker`, and `HabitTracker`, there is no indicator that a given entity was AI-created vs manually created. Power users who let Atlas drive everything cannot distinguish which items are AI-generated interpretations vs their own intent. A small `⚡ AI` badge or atlas-icon on AI-generated items would build trust.

### 5.3 No Predictive Scheduling Suggestions in the Timeline
When the timeline is empty (which it almost always is), it should proactively prompt: "You have 5 queued tasks. Want me to schedule your week based on your energy wave?" This is the fundamental AI-first interaction pattern — the system shows empty state + offers to fill it via conversation.

### 5.4 No Natural Language Entry in the Dashboard
A power user should be able to type "add task: review sprint proposals, priority 2, deadline Friday" into **any focused area of the dashboard** and have it handled. Currently, the only NL entry point is the chat panel. The `QuickAddForm` FAB is a form, not a natural language box. A simple `cmd+K` command palette or an inline NL input at the top of the task list would eliminate most form use.

### 5.5 The Chat Greeting Is Static and Context-Free
```typescript
`Cognitive link active. I am ${agentAlias}. Share task pressure, schedule constraints, or focus instability and I will reshape your wave.`
```
This fires every time `ai.messages.length === 0`. It is the same message every single day. A returning user on day 47 of using Atlas gets the same greeting as a day-1 user. The greeting should inject:
- Today's date and day of week
- Current predictive state (Normal/Compressed/Overloaded/Recovery)
- Pending habits that haven't been logged yet today
- Any overdue tasks
- A specific opening question like "You have 3 queued tasks. Which one are you starting with today?"

This is the highest-leverage change for AI-first feel. Every day should feel like the agent has been watching and has context.

### 5.6 No Inline Chat Context for Selected Entities
`FieldsTab` has the concept of "select a field card → opens scoped chat" via `useComponentSelection`. But this pattern is **not implemented for tasks, goals, or habits**. A user should be able to click a task card and have the chat panel shift context: "You've selected 'Review sprint proposals'. Tell me about the blockers or let me reschedule this for optimal energy." This contextual selection pattern is the defining UX feature of an AI-native planner, and it only half-exists (in Fields only).

---

## 6. Tracking & Input Friction

### 6.1 There Is No Daily Check-In Flow
The data model has `dailyIntentions[]` — this is the right concept. But there is no **proactive daily check-in ritual**. An AI-native life planner should present a morning check-in (configurable: 7AM, 8AM, or on-app-open) that asks:
1. Energy level right now (quick slider)
2. Today's focus domain (NL: "deep work on X" or "admin and emails")
3. Any blockers to declare?

This check-in data should seed the daily intention, update the NSV `energyBudget`, and pre-populate the TaskTimeline. Currently, all of this requires explicit chat interaction, which a busy user will skip.

### 6.2 Habit Completion Is Buried
The primary habit completion action (the checkbox in `HabitTracker`) is only visible if the user navigates to the Dashboard tab. A returning user who just wants to check off today's habits must navigate: Atlas → Dashboard → scroll past intention + AI panel + stat cards + energy chart + timeline → reach habits. This is 5+ cognitive steps. **Habits must be accessible from the first viewport** or via a persistent "Today" quick-action bar.

### 6.3 No Passive Tracking Hooks
The extension fields (Deep Work Hours, Pomodoro Count, Screen Time) are defined as manual-entry fields. There is no integration path for:
- FocusView timer completion → auto-increment Pomodoro Count field
- Active work session duration → auto-update Deep Work Hours
- The extension field system must be writable by other module actions, not just chat

Specifically: when a Pomodoro session completes in `FocusView`, it should call `onUpdateFieldValue('pomodoro_count', currentCount + 1)`. Currently, FocusView has no access to extension fields or field update callbacks.

### 6.4 Task Completion Has No Post-Completion Ritual
When a user marks a task as complete in `TodaysPlanCard` (or FocusView), nothing happens beyond a status update. There should be a micro-moment: a completion animation, an energy recalculation ("You freed up 6 energy units"), and an AI prompt suggestion ("Nice. You have 2.3h until your next energy valley. Want me to queue the next task?"). Completion moments are high-engagement touchpoints that reinforce the habit of using the planner.

---

## 7. Navigation & Information Architecture

### 7.1 The Current IA Creates Redundancy and Confusion

Current tab structure:
```
Dashboard → [Today | Week | Focus]
Backlog
Routines & Habits
Fields
Review
```

**Problems:**
- "Backlog" contains both Tasks AND Goals — two different concept classes
- "Routines & Habits" contains both Routine blocks AND Habit tracking — workable but dense
- Goals appear in Dashboard (GoalProgress) AND Backlog (GoalTracker) — the user cannot tell which is canonical
- "Review" is passive data; it needs an active trigger mechanism
- Projects have no tab at all despite being a first-class entity in the data model
- "Fields" is a power-user feature that doesn't belong at the same navigation level as "Dashboard"

### 7.2 Proposed IA Restructure

```
Today (default)
  ├── Morning check-in card (if not done)
  ├── Daily intention (set/edit)
  ├── Habit checklist (first viewport)
  ├── Focus tasks (top 3 AI-recommended)
  └── Energy wave (compact)

Plan (was: Dashboard > Week)
  ├── WeekGrid (7-day energy map)
  ├── Task scheduling drag interface
  └── Goal milestones timeline

Backlog
  ├── Tasks (filter/sort/search)
  └── Projects (no current UI)

Goals
  ├── Portfolio overview (rings/summary)
  └── Individual goal cards with milestones

Habits
  ├── Active habits (track/log)
  └── Habit builder (create/manage)

Review
  ├── [Trigger review] button → WeeklyReviewModal
  ├── Past reviews list
  └── Trend charts

Settings (bottom of nav)
  ├── Routine editor
  └── Custom fields (was: Fields tab)
```

This restructure:
- Puts habits at first viewport in "Today" (critical for daily retention)
- Separates Goals from Tasks properly
- Moves Fields and Routine to settings (power-user surface, not main nav)
- Makes Review tab an active trigger, not a passive viewer

### 7.3 The Two-Level Navigation Is Invisible
The `ViewSwitcher` (Today/Week/Focus) sits inside the Dashboard tab but is not visually distinct from the main tab navigation. A user landing on Atlas sees `NeuralTabGroup` tabs at the top, then a `ViewSwitcher` a few hundred pixels below. There is no visual hierarchy cue that these are two different levels of navigation. The `ViewSwitcher` should be inline in the Dashboard header with higher visual contrast.

---

## 8. Onboarding → Active Use Transition

### 8.1 The Onboarding Design Is Well-Structured
The 4-step chat intake (Energy Wave → Load Pressure → Recovery Constraints → Execution Baseline) is correctly sequenced. Going through cognitive baseline before scheduling commitments is the right order. The `GuidedIntakeFrame` with step progress indicators is the correct UI pattern. The `fast-track-validation` hook shows the architecture is ready for accelerated onboarding.

### 8.2 The Post-Onboarding Landing Is Cold
After onboarding completes, the user lands on the Dashboard with:
- The static AI greeting ("Cognitive link active...")
- Stat cards showing values from onboarding
- An empty TaskTimeline
- An empty EnergyWaveChart (if wave was set in onboarding, it shows; otherwise empty state)
- An empty Habits section
- An empty Goals section

There is no "first day" experience. No guided "Now that I know your energy wave, here's what I recommend for today" panel. No first-task creation prompt. The onboarding collects data and then drops the user in a blank canvas. **The handoff is abrupt.**

### 8.3 The Dashboard Does Not Adapt Post-Onboarding
Once `onboardingComplete = true`, the entire rendering path is identical for a day-1 user and a day-180 user. The same empty states, the same static greeting, the same layout. A day-1 experience should show:
- "Let's set your first goal" card
- "Add your first 3 tasks" card
- AI prompt: "Based on your energy wave, your peak focus window is 9-11 AM. Want to schedule your first task then?"

A day-180 experience should show:
- "You've completed 847 tasks" milestone
- "Your longest habit streak is 47 days (Meditation)"
- AI: "You tend to drift on Thursdays — want me to add a reflection block?"

### 8.4 The `initialProfile` Onboarding Path Has a Bug Risk
In `AtlasPage.tsx`, `renderOnboarding` receives `profile` which may already have `onboardingComplete = true` if the user is returning. The `UnifiedModulePage` logic gates on this, but if a user's profile is corrupted or partially initialized, they may re-enter onboarding and lose their energy wave data. There should be a "restart onboarding" option in settings rather than relying on this flag alone.

---

## 9. Top 10 Design Recommendations

> Ranked by user-facing impact. Each includes the specific file(s) to change.

---

### #1 [CRITICAL] Fix TodaysPlanCard.tsx — Wire to Real Data
**File:** `src/modules/atlas/components/TodaysPlanCard.tsx`

**Change:** Replace `profile?.taskGraph` with `profile?.tasks`. Wire the streaks section to read from `profile?.habits` (filtered to today-scheduled active habits, ordered by `atRisk` first). This single fix makes the most-viewed daily card actually useful.

```typescript
// Line 202 — change:
const tasks = profile?.taskGraph ?? [];
// to:
const tasks = profile?.tasks ?? [];

// Streaks section — replace placeholder <p> with actual habit streaks:
const habitsWithStreaks = (profile?.habits ?? [])
  .filter(h => h.status === 'active' && h.currentStreak > 0)
  .sort((a, b) => (isStreakAtRisk(b) ? 1 : 0) - (isStreakAtRisk(a) ? 1 : 0));
```

**Impact:** Turns the daily plan card from a lie into the module's most valuable feature. Zero risk.

---

### #2 [CRITICAL] Wire FocusView Chat Button
**File:** `src/modules/atlas/components/EnhancedAtlasDashboard.tsx`

**Change:** `onOpenChat={noop}` must be replaced with a function that programmatically activates the `SingleAgentLayout` chat panel. This requires the layout to expose an `openChat` callback or use a shared store.

```typescript
// In AtlasContent, add:
const [focusChatOpen, setFocusChatOpen] = useState(false);

// Pass to FocusView:
onOpenChat={() => {
  // Trigger chat panel to open and pre-populate with context
  ai.setMessages(prev => [...prev, {
    role: 'user',
    content: `I'm in focus mode working on: "${activeTask?.title}". I need help.`
  }]);
  // Open the chat overlay — this needs a shared ui-store action
}}
```

**Impact:** Focus mode is a high-retention feature. A broken chat button in the most intentional UI state is damaging to trust.

---

### #3 [CRITICAL] Replace handleAddField Console.log with Chat Injection
**File:** `src/modules/atlas/AtlasPage.tsx`

**Change:** Replace the stub with a function that injects a field-creation prompt into the active chat session.

```typescript
const handleAddField = useCallback(() => {
  // Inject a field-creation prompt into the Atlas chat
  ai.sendMessage(
    'I want to add a custom tracking metric to Atlas. Help me create a new field.'
  );
  // If chat panel is not visible, open it
}, [ai]);
```

Additionally, `SuggestionCard`'s "Add" button should pass the specific field name:
```typescript
onAdd={() => handleAddFieldByName(field.name)}
// which injects: "Add a field called 'Deep Work Hours' — type: number, daily tracking"
```

**Impact:** Turns a silent failure into the AI-first field creation experience Atlas was designed for.

---

### #4 [HIGH] Add Week View to Dashboard Tab — Mount WeekGrid
**File:** `src/modules/atlas/components/EnhancedAtlasDashboard.tsx`

**Change:** When `activeView === 'week'`, render `WeekGrid` as the primary content instead of the today-view components.

```tsx
{activeView === 'week' && (
  <div className="space-y-6">
    <WeekGrid
      tasks={tasks}
      scheduledTasks={profile?.scheduledTasks ?? []}
      habits={habits}
      onDaySelect={(date) => {
        // Switch to today view filtered to selected date
        onViewChange('today');
      }}
      selectedDate={new Date().toISOString().split('T')[0]}
    />
    {/* Task list filtered to selected week day */}
  </div>
)}
```

Also: `WeekGrid` must be updated to fall back to `deadline`-based task counts when `scheduledTasks` is empty, so it shows realistic data for most users.

**Impact:** Makes the Week view actually distinct and useful. Removes the most confusing UX lie in the navigation.

---

### #5 [HIGH] Add a Morning Check-In Card
**File:** New component `src/modules/atlas/components/MorningCheckIn.tsx`

**Design:** A dismissible card shown at the top of the Today view when:
- The current time is before 10 AM, AND
- `profile.dailyIntentions[0]?.date !== today`

The card contains:
- A 1-10 energy slider ("How's your energy right now?")
- A single-line NL input ("What's your focus for today?")
- One-tap submit that calls `onUpdateIntention` AND sends context to the AI

```typescript
// On submit:
onUpdateIntention({ 
  date: today, 
  theme: intention, 
  energyTarget: energyLevel 
});
ai.sendMessage(
  `Daily check-in: Energy ${energyLevel}/10, focus: "${intention}". What do you recommend I tackle first?`
);
```

**Impact:** Highest single change for daily retention. Turns Atlas from a passive planner into a daily ritual.

---

### #6 [HIGH] Rebuild EnergyWaveChart with Time Axis and Hover
**File:** `src/modules/atlas/components/EnergyWaveChart.tsx`

**Minimum viable rebuild:**
- Add time labels: distribute 6 hour labels across the X axis (6AM–10PM)
- Add Y-axis markers: 0, 5, 10 lines with white/5 color
- Add area fill: `<path>` with closing coordinates and gradient fill beneath energy line
- Add current time indicator: vertical `<line>` at the correct X position
- Add hover: `<rect>` overlay rows per time slot, `onMouseEnter` shows tooltip with time + energy/focus/load values

```typescript
// Time position calculation:
const hourToX = (hour: number) => ((hour - 6) / 16) * width;
const nowX = hourToX(new Date().getHours() + new Date().getMinutes() / 60);
```

The flattened window visualization should shade the area *above* the flattened ceiling, not shade the bottom of the chart.

**Impact:** Transforms the key architectural concept visualization from a placeholder into a functional scheduling tool.

---

### #7 [HIGH] Add Contextual AI Selection to Task and Habit Cards
**File:** `src/modules/atlas/components/TaskCard.tsx`, `HabitTracker.tsx`

**Pattern:** Mirror the `useComponentSelection` pattern from `FieldsTab`. When a task or habit card is clicked (not on an action button), call `select({ type: 'task', id, data: task })`. The `SingleAgentLayout` must respond to this selection by injecting a context message into the chat panel:

```typescript
// In AtlasContent, watch selectedEntity:
useEffect(() => {
  if (selectedEntity?.type === 'task') {
    const task = selectedEntity.data as AtlasTask;
    ai.setMessages(prev => [...prev, {
      role: 'system', // system message, not shown to user
      content: `User has selected task: "${task.title}" (priority ${task.priority}, energy ${task.energyCost}, status ${task.status}). Be ready to help them reschedule, break down, or complete this task.`
    }]);
  }
}, [selectedEntity]);
```

**Impact:** Delivers the core AI-first interaction pattern. This is what makes Atlas "intelligent" from the user's perspective rather than just a chat window next to a list.

---

### #8 [MEDIUM] Add Habit Frequency Selector to QuickAddForm
**File:** `src/modules/atlas/components/QuickAddForm.tsx`

**Change:** When `itemType === 'habit'`, add a frequency selector between title and energy cost:

```tsx
{itemType === 'habit' && (
  <fieldset>
    <legend className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">
      Frequency
    </legend>
    <div className="grid grid-cols-3 gap-1">
      {['daily', 'weekdays', 'weekends', 'weekly', 'custom'].map(freq => (
        <button
          key={freq}
          type="button"
          onClick={() => setFrequency(freq as HabitFrequency)}
          aria-pressed={frequency === freq}
          className={cn('py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider', ...)}
        >
          {freq}
        </button>
      ))}
    </div>
  </fieldset>
)}
```

Without this, every chat-created habit gets the correct frequency, but every form-created habit defaults to undefined, breaking streak logic.

**Impact:** Fixes a silent data integrity bug for all form-created habits.

---

### #9 [MEDIUM] Mount WeeklyReviewModal with a UI Trigger in the Review Tab
**File:** `src/modules/atlas/components/EnhancedAtlasDashboard.tsx`

**Change:** The Review tab should have a primary CTA at the top:

```tsx
{activeTab === 'review' && (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold font-display text-white/90">Temporal Reviews</h3>
      <NeuralButton 
        onClick={() => setIsReviewModalOpen(true)}
        variant="primary"
        size="sm"
      >
        <CalendarDays className="w-4 h-4 mr-2" />
        Run Weekly Review
      </NeuralButton>
    </div>
    
    <WeeklyReviewModal
      isOpen={isReviewModalOpen}
      onClose={() => setIsReviewModalOpen(false)}
      soul={soul}
      energyWave={energyWave}
      scheduledTasks={profile?.scheduledTasks ?? []}
      predictiveDisplay={predictiveDisplay}
    />
    
    {/* existing review list... */}
  </div>
)}
```

**Impact:** Activates a fully-built feature that currently dead-ends. Users should not need to know the correct chat incantation to trigger a core module flow.

---

### #10 [MEDIUM] Implement a Contextual First-Day Experience
**File:** `src/modules/atlas/components/EnhancedAtlasDashboard.tsx`, new `FirstDayGuide.tsx`

**Design:** Detect first-day state: `profile.tasks.length === 0 && profile.goals.length === 0 && profile.habits.length === 0`. When true, render a guided action sequence above the dashboard content:

```
┌──────────────────────────────────────────────────────────┐
│  ⚡ Atlas is ready. Here's how to start:                  │
│                                                           │
│  [1] Set today's intention → (pre-filled from onboarding) │
│  [2] Add your first goal → (opens GoalTracker form)       │
│  [3] Add 3 tasks for this week → (opens QuickAddForm)     │
│  [4] Schedule your deep work window → (opens chat)        │
│                                                           │
│  Or just talk to me: "Plan my week"                       │
└──────────────────────────────────────────────────────────┘
```

Each item is individually dismissible. The whole card dismisses after all 4 are done or after 7 days, whichever comes first.

**Impact:** Eliminates the cold-start problem. Connects onboarding momentum into first-week engagement.

---

## Summary Matrix

| # | Issue | Severity | Effort | Impact |
|---|-------|----------|--------|--------|
| 1 | TodaysPlanCard wired to wrong property | CRITICAL | XS | 🔴 Highest |
| 2 | FocusView chat button = noop | CRITICAL | S | 🔴 High |
| 3 | handleAddField = console.log | CRITICAL | S | 🔴 High |
| 4 | Week view shows same content as Today | HIGH | S | 🟠 High |
| 5 | Morning check-in missing | HIGH | M | 🟠 High |
| 6 | EnergyWaveChart needs rebuild | HIGH | M | 🟠 Medium |
| 7 | No contextual AI selection on entity cards | HIGH | M | 🟠 High |
| 8 | QuickAddForm habit missing frequency | MEDIUM | XS | 🟡 Medium |
| 9 | WeeklyReviewModal never triggered | MEDIUM | XS | 🟡 Medium |
| 10 | No first-day experience | MEDIUM | M | 🟡 Medium |

**Secondary issues (not in top 10 but must be tracked):**
- RoutineEditor input fields need `<label>` elements (WCAG AA failure)
- `TrendArrow` is imported but unused in TodaysPlanCard
- GoalTracker incorrectly placed in Backlog tab
- No projects management UI despite first-class data model entity
- TaskTimeline is empty for deadline-based tasks (no scheduled time)
- HabitTracker has no 7-day historical completion dots
- FocusView has no configurable session length (only 25 min hardcoded)
- FocusView session completion should auto-increment Pomodoro Count extension field
- Static AI greeting with no daily context injection
- Review tab insights rendered as unstyled `<ul>` — high-value AI output deserves callout cards

---

## Closing Argument

Atlas has the most sophisticated data model in the Nexus suite. The Spine integration is real. The onboarding chat is genuinely useful. The AI action tag system works. But the visualization layer — the part the user actually looks at and touches every day — fails to deliver on the promise.

The worst failures are not complex engineering problems. Wiring `profile.tasks` instead of `profile.taskGraph` is a one-line fix. Replacing `noop` with a chat-open call is a ten-line fix. Mounting `WeeklyReviewModal` with a button is a twenty-line fix. These are not architecture decisions that need debate — they are bugs that must be closed before any user interaction study is run.

The strategic design gap is the AI-first interaction pattern. The module is structured as "chat panel | visual dashboard" but these two surfaces do not talk to each other. The chat does not highlight things in the dashboard. The dashboard does not respond to entity selection with chat context. The daily greeting is static. Fix the wiring first, then build the interaction layer. Atlas has all the ingredients for a genuinely transformative cognitive planner — the recipe just needs to be assembled correctly.

---

*Design Agent Report | Nexus Orchestrator Nexus | Atlas Module UX Audit*
