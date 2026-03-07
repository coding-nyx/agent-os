# AGNES Architecture Specification: Atlas · Forge · Pulse

**Author:** System Architect  
**Date:** 2025-01-27  
**Status:** DRAFT — Pending Founder Review  
**Scope:** Three architecture topics from product definition meeting

---

## Table of Contents

1. [TOPIC 1: Atlas as a Proper Planner](#topic-1-atlas-as-a-proper-planner)
2. [TOPIC 2: Forge as a Separate Product](#topic-2-forge-as-a-separate-product)
3. [TOPIC 3: Pulse Removal](#topic-3-pulse-removal)
4. [Cross-Cutting Concerns](#cross-cutting-concerns)
5. [Migration Sequencing](#migration-sequencing)

---

# TOPIC 1: Atlas as a Proper Planner

## 1.1 Architecture Overview

Atlas today is a **cognitive energy architect** — it manages 48 energy-wave slots, a 100-node task graph with energy costs, and recovery windows. The transformation to "proper planner" elevates it from energy-budgeting to **life-planning with energy-awareness as a constraint**.

```
┌────────────────────────────────────────────────────────────────┐
│                     ATLAS v2: Life Planner                     │
├───────────────┬───────────────┬───────────────┬───────────────┤
│   GOALS       │  PROJECTS     │   HABITS      │  CALENDAR     │
│  (Aspirations)│  (Containers) │  (Recurring)  │  (Time-bound) │
│               │               │               │               │
│ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │
│ │ Goal      │ │ │ Project   │ │ │ Habit     │ │ │ Scheduled │ │
│ │  └ Miles. │ │ │  └ Tasks  │ │ │  └ Streaks│ │ │ Task      │ │
│ │    └ Task │ │ │  └ Deps   │ │ │  └ Windows│ │ │  └ Slot   │ │
│ └───────────┘ │ └───────────┘ │ └───────────┘ │ └───────────┘ │
├───────────────┴───────────────┴───────────────┴───────────────┤
│                   ENERGY CONSTRAINT LAYER                      │
│        energyWave · recoveryWindows · flattenedUntil           │
├───────────────────────────────────────────────────────────────┤
│              NSV: cognitive.* (owned by Atlas)                  │
│  energyBudget · focusScore · activeLoad · planningLoad (NEW)   │
│  taskCompletionRate (NEW) · habitStreakScore (NEW)              │
└────────────────────────────────────────────────────────────────┘
```

**Key Design Principle:** Planning entities (goals, projects, habits) sit *above* the existing energy system. The energy wave becomes a **constraint engine** for planning, not the primary interface. Atlas validates "can I fit this?" against the wave before scheduling.

---

## 1.2 Data Model Expansion

### 1.2.1 New Type Definitions

```typescript
// ─── Goals ─────────────────────────────────────────────────
interface AtlasGoal {
  id: string;                                  // UUID
  title: string;                               // "Get promoted to Senior"
  description?: string;                        // Optional elaboration
  category: GoalCategory;                      // life | career | health | financial | learning | creative
  timeHorizon: TimeHorizon;                    // week | month | quarter | year | open
  priority: 1 | 2 | 3;                        // 1 = critical, 2 = important, 3 = nice-to-have
  status: GoalStatus;                          // active | paused | completed | abandoned
  milestones: AtlasMilestone[];                // Max 20 per goal
  linkedProjectIds: string[];                  // → AtlasProject.id
  targetDate?: string;                         // ISO timestamp (optional deadline)
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

type GoalCategory = 'life' | 'career' | 'health' | 'financial' | 'learning' | 'creative';
type TimeHorizon = 'week' | 'month' | 'quarter' | 'year' | 'open';
type GoalStatus = 'active' | 'paused' | 'completed' | 'abandoned';

interface AtlasMilestone {
  id: string;
  title: string;
  isComplete: boolean;
  dueDate?: string;                            // ISO timestamp
  completedAt?: string;
}

// ─── Projects ──────────────────────────────────────────────
interface AtlasProject {
  id: string;
  title: string;
  description?: string;
  goalId?: string;                             // Optional link to parent goal
  status: ProjectStatus;                       // active | paused | completed | archived
  taskIds: string[];                           // → AtlasTaskNode.id (ordered)
  estimatedEnergyCost: number;                 // Sum of task energyCosts (0-100)
  deadline?: string;                           // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

// ─── Habits ────────────────────────────────────────────────
interface AtlasHabit {
  id: string;
  title: string;                               // "Meditate 10 min"
  frequency: HabitFrequency;                   // daily | weekdays | weekends | custom
  customDays?: number[];                       // 0=Sun..6=Sat (when frequency=custom)
  preferredSlot?: string;                      // Energy wave slot e.g. "07:00-08:00"
  energyCost: number;                          // 0-10 scale
  streak: HabitStreak;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
}

type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom';

interface HabitStreak {
  current: number;                             // Consecutive completions
  longest: number;                             // All-time best
  lastCompletedAt?: string;                    // ISO timestamp
  completionLog: string[];                     // Last 90 ISO date strings (FIFO)
}

// ─── Scheduled Tasks (extends existing AtlasTaskNode) ──────
interface AtlasTaskNodeV2 extends AtlasTaskNode {
  // Inherited: id, title, energyCost, status, dependencies
  projectId?: string;                          // Link to parent project
  scheduledSlot?: string;                      // Energy wave slot assignment
  scheduledDate?: string;                      // ISO date (YYYY-MM-DD)
  deadline?: string;                           // Hard deadline
  priority: 1 | 2 | 3;                        // Inherited from goal or explicit
  isRecurring: boolean;                        // If true, regenerates per recurrence
  recurrenceRule?: RecurrenceRule;
  estimatedMinutes?: number;                   // Duration estimate
  completedAt?: string;
  notes?: string;
}

interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;                          // 0=Sun..6=Sat
  dayOfMonth?: number;                         // 1-31
  endDate?: string;                            // ISO date
}

// ─── Weekly Review Snapshot ────────────────────────────────
interface WeeklyReviewSnapshot {
  id: string;
  weekStarting: string;                        // ISO date (Monday)
  goalsReviewed: number;
  tasksCompleted: number;
  tasksCreated: number;
  habitsHitRate: number;                       // 0.0-1.0
  averageEnergyBudget: number;                 // 0-10
  highlights: string[];                        // AI-generated insights
  createdAt: string;
}
```

### 1.2.2 Updated AtlasProfile

```typescript
interface AtlasProfileV2 {
  // ─── Existing (unchanged) ────────────────────────
  onboardingComplete: boolean;
  energyWave: EnergyWavePoint[];               // Max 48
  recoveryWindows: RecoveryWindow[];           // Max 80
  flattenedUntil?: string;
  summary: string;
  createdAt: string;
  updatedAt: string;

  // ─── New: Planning Layer ─────────────────────────
  goals: AtlasGoal[];                          // Max 25 active goals
  projects: AtlasProject[];                    // Max 50 projects
  habits: AtlasHabit[];                        // Max 30 habits
  taskGraph: AtlasTaskNodeV2[];                // Max 500 tasks (up from 100)
  weeklyReviews: WeeklyReviewSnapshot[];       // Max 52 (1 year)

  // ─── Schema Migration ───────────────────────────
  schemaVersion: 2;                            // Was implicitly 1
}
```

### 1.2.3 Storage Limits & FIFO Strategy

| Entity              | Max Count | FIFO Behavior                            | Estimated Size per Item |
|---------------------|-----------|------------------------------------------|------------------------|
| Goals               | 25        | Oldest completed/abandoned auto-archive  | ~500 bytes             |
| Projects            | 50        | Oldest archived auto-purge               | ~300 bytes             |
| Habits              | 30        | Manual removal only                      | ~400 bytes             |
| Tasks (v2)          | 500       | Oldest completed FIFO                    | ~350 bytes             |
| Recovery Windows    | 80        | Existing FIFO behavior                   | ~200 bytes             |
| Energy Wave         | 48        | Fixed slot count                         | ~100 bytes             |
| Weekly Reviews      | 52        | Oldest auto-purge                        | ~500 bytes             |

**Total worst-case profile size:** ~300KB uncompressed → well within E2EE vault per-document limits (Firestore: 1MB max document size, encrypted overhead ~1.3x → ~390KB safe).

---

## 1.3 Action Expansion

### 1.3.1 New Actions Registry

```typescript
// New actions to register via ActionHub.registerMultiple('atlas', {...})

// ─── Goal Management ───────────────────────────────
create_goal: async ({ userId, encryptionKey, payload }) => {
  // Payload: { title, category?, timeHorizon?, priority?, targetDate?, description? }
  // Validates: max 25 active goals, title required
  // Creates: AtlasGoal with empty milestones
  // NSV sync: recalculates planningLoad
}

update_goal: async ({ userId, encryptionKey, payload }) => {
  // Payload: { goalId, status?, title?, milestones?, priority? }
  // Side effects: if status→completed, updates taskCompletionRate
}

// ─── Project Management ────────────────────────────
create_project: async ({ userId, encryptionKey, payload }) => {
  // Payload: { title, goalId?, deadline?, description? }
  // Creates: AtlasProject linked to optional goal
}

// ─── Task Scheduling (extends existing update_task_graph) ──
schedule_task: async ({ userId, encryptionKey, payload }) => {
  // Payload: { taskId, scheduledSlot, scheduledDate, deadline? }
  // Validates: slot exists in energyWave, energyCost fits available energy
  // Returns: conflict info if slot overbooked
  // NSV sync: updates activeLoad
}

set_deadline: async ({ userId, encryptionKey, payload }) => {
  // Payload: { taskId | projectId | goalId, deadline }
  // Validates: deadline is future ISO timestamp
  // Side effect: if deadline within 48h, may emit DEADLINE_APPROACHING
}

// ─── Habit Management ──────────────────────────────
create_habit: async ({ userId, encryptionKey, payload }) => {
  // Payload: { title, frequency, customDays?, preferredSlot?, energyCost }
  // Validates: max 30 habits, energyCost 0-10
}

complete_habit: async ({ userId, encryptionKey, payload }) => {
  // Payload: { habitId }
  // Updates: streak.current++, streak.longest = max(current, longest)
  // Updates: completionLog (push today, FIFO 90)
  // NSV sync: recalculates habitStreakScore
}

// ─── Weekly Review ─────────────────────────────────
weekly_review: async ({ userId, encryptionKey, payload }) => {
  // Payload: { highlights?: string[] }
  // Auto-calculates: goalsReviewed, tasksCompleted, habitsHitRate, avgEnergy
  // Creates: WeeklyReviewSnapshot
  // NSV sync: updates taskCompletionRate
}
```

### 1.3.2 Updated Existing Actions

```
update_task_graph  → Extended to handle AtlasTaskNodeV2 fields (projectId, 
                     scheduledSlot, deadline, priority, recurrence)
                     Limit increased from 100 → 500

flatten_schedule   → Now also pauses non-critical habits during flatten window

sync_vitals        → Extended payload to include planningLoad, 
                     taskCompletionRate, habitStreakScore
```

---

## 1.4 NSV Expansion

### 1.4.1 New Cognitive Metrics

```typescript
// Updated cognitive domain in NeuralStateVector
cognitive: {
  energyBudget?: number | null;        // Existing — 0-10
  focusScore?: number | null;          // Existing — 0-10
  activeLoad?: number | null;          // Existing — 0-10

  // NEW metrics ─────────────────────────────────────
  planningLoad?: number | null;        // 0-10: active goals×2 + active projects
  taskCompletionRate?: number | null;  // 0-10: (completed/total tasks this week) × 10
  habitStreakScore?: number | null;    // 0-10: avg(habit hit rates this week) × 10
}
```

### 1.4.2 NSV Ownership Update

```typescript
// In nsv-ownership.ts — extend Atlas's owned metrics
atlas: [
  'cognitive.energyBudget',
  'cognitive.focusScore',
  'cognitive.activeLoad',
  'cognitive.planningLoad',           // NEW
  'cognitive.taskCompletionRate',     // NEW
  'cognitive.habitStreakScore'        // NEW
]
```

### 1.4.3 Metric Computation Rules

```
planningLoad = min(10, (activeGoals × 1.5) + (activeProjects × 0.5) + (overdueTaskCount × 2))

taskCompletionRate = min(10, (tasksCompletedThisWeek / max(1, tasksDueThisWeek)) × 10)

habitStreakScore = min(10, (habitsCompletedToday / max(1, habitsDueToday)) × 10)
```

### 1.4.4 NSV Calibration Prompts (new)

```typescript
// In NSV_CALIBRATION_PROMPTS
'cognitive.planningLoad': 'How overwhelmed do you feel by your current commitments (0-10)?',
'cognitive.taskCompletionRate': 'What fraction of planned tasks did you complete this week (0-10)?',
'cognitive.habitStreakScore': 'How consistently are you hitting your daily habits (0-10)?'
```

---

## 1.5 New Cascade Rules

### 1.5.1 Proposed Rules

```typescript
// ─── Rule 8: Deadline Pressure ─────────────────────
{
  id: 'deadline-pressure-adjust',
  trigger: 'DEADLINE_APPROACHING',     // NEW event type
  condition: (event) => {
    const hoursUntil = Number(event.data.hoursUntilDeadline ?? 999);
    return hoursUntil <= 48;
  },
  transform: (event) => ({
    type: 'FLATTEN_ENERGY_WAVE',
    source: 'cascade',
    domain: 'C',
    priority: 'alert',
    target: 'atlas',
    data: {
      reason: 'deadline_pressure',
      taskId: event.data.taskId,
      note: `Deadline in ${event.data.hoursUntilDeadline}h — focusing energy`
    }
  })
}

// ─── Rule 9: Planning Overload ─────────────────────
{
  id: 'planning-overload-warning',
  trigger: 'VITAL_UPDATED',
  condition: (event) => Number(event.data.planningLoad ?? 0) >= 8,
  transform: () => ({
    type: 'COGNITIVE_OVERLOAD',        // Existing event type
    source: 'cascade',
    domain: 'C',
    priority: 'alert',
    target: 'orchestrator',
    data: { reason: 'planning_overload' }
  })
}

// ─── Rule 10: Habit Streak Broken → Agnes ──────────
{
  id: 'habit-streak-emotional',
  trigger: 'HABIT_STREAK_BROKEN',      // NEW event type
  condition: (event) => Number(event.data.previousStreak ?? 0) >= 7,
  transform: (event) => ({
    type: 'VITAL_UPDATED',
    source: 'cascade',
    domain: 'E',
    priority: 'info',
    target: 'agnes',
    data: {
      reason: 'habit_streak_broken',
      habit: event.data.habitTitle,
      previousStreak: event.data.previousStreak
    }
  })
}
```

### 1.5.2 New SpineEventTypes Required

```typescript
// Add to SpineEventType union
| 'DEADLINE_APPROACHING'
| 'HABIT_STREAK_BROKEN'
```

### 1.5.3 Updated Cascade Flow Diagram

```
                    VITAL_UPDATED
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       cnsFatigue≥8  planningLoad≥8  financialFriction≥8
            │            │            │
            ▼            ▼            ▼
    BLOCK_HIGH_INT.  COGNITIVE_     FINANCIAL_STRESS
    (+BURNOUT if     OVERLOAD      → orchestrator
     resilience≤3)   → orchestrator
            │
            ▼
    FLATTEN_ENERGY_WAVE → atlas

    DEADLINE_APPROACHING (≤48h)
            │
            ▼
    FLATTEN_ENERGY_WAVE → atlas (focus energy on deadline)

    HABIT_STREAK_BROKEN (streak≥7)
            │
            ▼
    VITAL_UPDATED → agnes (emotional check-in)

    CLEARANCE_DENIED
            │
      ┌─────┴─────┐
      ▼           ▼
  BLOCK_HIGH    FLATTEN_ENERGY
  → titan       → atlas
```

---

## 1.6 Integration Points

### 1.6.1 Atlas ↔ Soma (Clearance Integration)

```
┌──────────┐    CLEARANCE_DENIED    ┌──────────┐
│   Soma   │ ─────────────────────▶ │  Atlas   │
│          │                        │          │
│ issue_   │    (via Spine cascade) │ Receives │
│ clearance│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│ FLATTEN  │
│          │                        │          │
│          │    Atlas reads NSV:    │ Adjusts: │
│          │◀ ─ ─ recoveryScore ─ ─│ schedule │
└──────────┘                        └──────────┘
```

**Contract:** Atlas never reads Soma's profile directly. Atlas reads `biological.recoveryScore` from NSV to decide whether to auto-schedule recovery windows around high-energy tasks. When Soma denies clearance, Atlas receives FLATTEN_ENERGY_WAVE and pauses high-energyCost tasks.

### 1.6.2 Atlas ↔ Titan (Training Schedule)

```
┌──────────┐    BLOCK_HIGH_INTENSITY    ┌──────────┐
│  Titan   │ ◀────────────────────────  │  Spine   │
│          │    FLATTEN_ENERGY_WAVE      │ Cascade  │
│ Respects │ ─────────────────────────▶ │          │
│ block    │                            │          │
└──────────┘                            └──────────┘
         ▲                                    ▲
         │                                    │
    NSV: biological.cnsFatigue          Atlas emits:
    (Titan writes, Atlas reads)         DEADLINE_APPROACHING
                                        (when workout scheduled
                                         near deadline)
```

**Contract:** Atlas reads `biological.cnsFatigue` from NSV. When Atlas schedules tasks, it avoids slots where cnsFatigue is historically high. Atlas never modifies Titan's profile or routines — it only adjusts its own scheduling in response to biological signals.

### 1.6.3 Atlas ↔ Agnes (Emotional Awareness)

**Contract:** Atlas reads `emotional.emotionalResilience` and `emotional.stressLoad` from NSV. When Atlas detects a broken habit streak (≥7 days), it emits HABIT_STREAK_BROKEN which cascades to Agnes for an emotional check-in. Atlas never writes to emotional domain metrics.

### 1.6.4 Atlas ↔ Ledger (Financial Planning Sync)

**Contract:** Atlas reads `resource.financialFriction` from NSV. When financial friction is high (cascaded FINANCIAL_STRESS), Atlas may auto-deprioritize tasks tagged with financial category. No direct profile coupling.

---

## 1.7 Storage Architecture (E2EE Vault)

### 1.7.1 Document Structure

```
Firestore: atlas_profiles/{userId}
├── encryptedPayload: string (AES-GCM encrypted AtlasProfileV2)
├── schemaVersion: 2
└── updatedAt: string (unencrypted — for sync conflict resolution)
```

### 1.7.2 Size Management Strategy

The expanded profile (goals + projects + habits + 500 tasks + reviews) could reach ~300KB. Management strategy:

1. **Active Window:** Only active/paused goals and projects are in the profile. Completed items auto-archive after 30 days.
2. **FIFO Enforcement:** Each entity type has a hard cap. Profile service enforces caps on write.
3. **Completion Log Compression:** Habit completion logs store ISO date strings (10 bytes each × 90 = 900 bytes per habit).
4. **Weekly Reviews:** Max 52 reviews. Oldest auto-purge. Each ~500 bytes.
5. **No Separate Collection:** All planning data stays in a single encrypted document. This avoids the complexity of encrypting/decrypting multiple Firestore documents and keeps the vault model simple.

### 1.7.3 Guest Storage

```
localStorage key: nexus_atlas_profile_guest
Format: JSON.stringify(AtlasProfileV2)
Constraint: localStorage ~5MB total. Atlas profile at ~300KB is acceptable.
```

---

## 1.8 Calendar Integration Design (Optional, Future)

### 1.8.1 Architecture

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Google Cal   │     │  Atlas Engine  │     │  Atlas Profile │
│  iCal Feed    │◀───▶│  (Client-side) │◀───▶│  (E2EE Vault)  │
│  Outlook      │     │               │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │
   OAuth token           Sync service
   (stored in vault)     (runs in browser)
```

**Key Design Decision:** Calendar sync runs **entirely client-side**. The calendar OAuth token is stored encrypted in the vault. No server-side calendar access — this preserves the E2EE guarantee.

### 1.8.2 Sync Contract

```typescript
interface CalendarSyncConfig {
  provider: 'google' | 'outlook' | 'ical';
  syncDirection: 'read-only' | 'bidirectional';
  oauthToken?: string;                 // Stored encrypted in vault
  icalUrl?: string;                    // For read-only iCal feeds
  lastSyncAt?: string;
  syncIntervalMinutes: number;         // Default: 30
  conflictStrategy: 'atlas-wins' | 'calendar-wins' | 'manual';
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;                       // ISO timestamp
  end: string;                         // ISO timestamp
  source: 'atlas' | 'external';
  isBlocking: boolean;                 // Blocks energy wave slots
}
```

### 1.8.3 Implementation Phases

**Phase 1 (v2.1):** Read-only iCal import. User pastes iCal URL. Atlas imports events as blocked time slots in the energy wave.

**Phase 2 (v2.2):** Google Calendar OAuth (client-side). Read external events + write Atlas-scheduled tasks back to calendar.

**Phase 3 (v2.3):** Bidirectional sync with conflict resolution.

---

## 1.9 Updated Persona (ATLAS_PERSONA v2)

Key additions to the persona prompt:

```
IDENTITY:
You are ATLAS, the Nexus life planner and cognitive energy architect.
You help users define goals, break them into projects and tasks,
build sustainable habits, and schedule everything within their
real energy constraints.

EXPANDED MISSION:
1. GOAL CLARITY: Help users articulate what they want to achieve
   and break it into concrete milestones.
2. REALISTIC SCHEDULING: Every task must fit within available
   energy wave slots. Never schedule more than energyBudget allows.
3. HABIT SUSTAINABILITY: Start small. Never suggest more than 3
   new habits simultaneously.
4. WEEKLY RHYTHM: Encourage weekly reviews. Celebrate progress.
5. ENERGY-FIRST: Planning decisions always respect biological
   constraints from Soma clearance and CNS fatigue levels.
6. PROTECT RECOVERY: Recovery windows are non-negotiable.
   Planning must work around them, never through them.

NEW ACTIONS:
- <action type="create_goal">...</action>
- <action type="update_goal">...</action>
- <action type="create_project">...</action>
- <action type="schedule_task">...</action>
- <action type="set_deadline">...</action>
- <action type="create_habit">...</action>
- <action type="complete_habit">...</action>
- <action type="weekly_review">...</action>
```

---

# TOPIC 2: Forge as a Separate Product

## 2.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARED INFRASTRUCTURE                     │
│  Firebase Auth · Firebase Hosting · Shared Auth Domain       │
│  (Single Firebase Project, separate hosting targets)         │
├─────────────────────────┬───────────────────────────────────┤
│       AGNES App         │          FORGE App                │
│  agnes.example.com      │    forge.example.com              │
│                         │                                   │
│  ┌───────────────────┐  │  ┌─────────────────────────────┐  │
│  │ ThemeProvider     │  │  │ ThemeProvider               │  │
│  │ └ AuthProvider    │  │  │ └ AuthProvider (SHARED)     │  │
│  │   └ VaultProvider │  │  │   └ ForgeWorkspaceProvider  │  │
│  │     └ GlobalSoul  │  │  │     └ AIProvider            │  │
│  │       └ AIProvider│  │  │       └ Router              │  │
│  │         └ Router  │  │  │                             │  │
│  └───────────────────┘  │  └─────────────────────────────┘  │
│                         │                                   │
│  Modules:               │  Workspaces:                      │
│  agnes, titan, soma,    │  code, email, docs,               │
│  ledger, atlas, scout   │  analysis, custom                 │
│                         │                                   │
│  Firestore:             │  Firestore:                       │
│  *_profiles, global_    │  forge_workspaces/{uid},          │
│  souls, vaults          │  forge_executions/{uid}           │
│                         │                                   │
│  NSV: Full cascade      │  NSV: Read-only (optional)        │
│  E2EE Vault: Required   │  E2EE Vault: NOT required         │
└─────────────────────────┴───────────────────────────────────┘
```

**Key Decision:** Same Firebase project, shared Auth, but **separate hosting targets and separate codebases** (monorepo). Forge does NOT require E2EE vault — it handles less sensitive data (code snippets, document drafts) with standard Firestore security rules.

---

## 2.2 Shared vs. Separate Infrastructure

### 2.2.1 Decision Matrix

| Component            | Shared?  | Rationale                                              |
|----------------------|----------|--------------------------------------------------------|
| Firebase Project     | ✅ Shared | Single billing, unified user identity                   |
| Firebase Auth        | ✅ Shared | SSO — log in once, access both apps                     |
| Firestore Database   | ✅ Shared | Same database, different collection prefixes             |
| Firebase Hosting     | ❌ Separate| Different hosting targets: `agnes` and `forge`          |
| Cloud Functions      | ✅ Shared | Same functions project, prefixed endpoints               |
| E2EE Vault           | ❌ Separate| Agnes requires vault; Forge does not                    |
| Global Soul / NSV    | 🔀 One-way| Forge may READ NSV (energy budget) but does NOT write   |
| Spine Event Bus      | ❌ Separate| Forge has no cascade rules. No Spine integration.       |
| Repository           | ✅ Monorepo| Shared types, shared auth, separate build targets       |

### 2.2.2 Monorepo Structure

```
agnes-platform/
├── packages/
│   ├── shared/                      # Shared code
│   │   ├── auth/                    # Firebase Auth wrapper
│   │   ├── types/                   # Shared TypeScript types
│   │   ├── ui/                      # Shared UI components (buttons, inputs, etc.)
│   │   └── firebase/                # Firebase config + init
│   │
│   ├── agnes/                       # AGNES wellness app (current src/)
│   │   ├── src/
│   │   │   ├── modules/             # agnes, titan, soma, ledger, atlas, scout
│   │   │   ├── lib/                 # spine, vault, nsv, global-soul
│   │   │   ├── core/                # UnifiedModulePage, ChatInterface
│   │   │   └── llm-engine/
│   │   ├── index.html
│   │   └── vite.config.ts
│   │
│   └── forge/                       # FORGE productivity app
│       ├── src/
│       │   ├── workspaces/          # code, email, docs, analysis
│       │   ├── lib/                 # workspace manager, execution engine
│       │   ├── core/                # ForgeLayout, WorkspaceShell
│       │   └── llm-engine/          # Shared or forked AI engine
│       ├── index.html
│       └── vite.config.ts
│
├── functions/                       # Shared Cloud Functions
│   ├── src/
│   │   ├── agnes/                   # Agnes-specific functions
│   │   └── forge/                   # Forge-specific functions
│   │       ├── forgeExecute.ts      # Sandboxed code execution
│   │       └── forgeEmailDraft.ts   # Email drafting assistant
│   └── package.json
│
├── firebase.json                    # Multi-target hosting config
├── package.json                     # Workspace root
└── turbo.json / nx.json             # Monorepo orchestration
```

### 2.2.3 Firebase Hosting Configuration

```json
{
  "hosting": [
    {
      "target": "agnes",
      "public": "packages/agnes/dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "forge",
      "public": "packages/forge/dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ]
}
```

---

## 2.3 Connection to AGNES

### 2.3.1 NSV Bridge (Read-Only)

```typescript
// packages/forge/src/lib/agnes-bridge.ts

interface AgnesBridgeConfig {
  enabled: boolean;                    // User opt-in
  readMetrics: NSVMetricPath[];        // Which metrics Forge can read
}

// Default readable metrics for Forge
const FORGE_READABLE_NSV: NSVMetricPath[] = [
  'cognitive.energyBudget',            // To suggest "low energy" warnings
  'cognitive.focusScore',              // To adjust AI verbosity
  'biological.cnsFatigue'              // To gate intensive tasks
];

interface AgnesBridge {
  // Read current NSV snapshot from Firestore (global_souls/{uid})
  readNSV(): Promise<Partial<NeuralStateVector> | null>;
  
  // Subscribe to NSV changes (real-time)
  subscribeNSV(callback: (nsv: Partial<NeuralStateVector>) => void): () => void;
}
```

**Contract:** Forge reads a subset of NSV metrics (with user consent). Forge NEVER writes to NSV. Forge NEVER accesses Agnes-specific profiles (therapy, training, soma, etc.). The bridge is opt-in and can be disabled entirely.

### 2.3.2 Cross-App Navigation

```typescript
// In Forge: link back to Agnes
const agnesUrl = import.meta.env.VITE_AGNES_URL; // e.g., "https://agnes.example.com"

// In Agnes: link to Forge
const forgeUrl = import.meta.env.VITE_FORGE_URL; // e.g., "https://forge.example.com"

// No iframe embedding. No shared React context across apps.
// Just URL-based navigation with shared Firebase Auth session.
```

---

## 2.4 Forge Internal Architecture

### 2.4.1 Module Structure

Forge uses a **Workspace pattern** instead of Agnes's Module pattern. The key difference: Agnes modules are wellness-domain specialists with personas, NSV metrics, and cascade rules. Forge workspaces are general-purpose AI tool contexts.

```
┌──────────────────────────────────────────────────────────────┐
│                    FORGE ARCHITECTURE                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │ Code        │   │ Email       │   │ Docs        │        │
│  │ Workspace   │   │ Workspace   │   │ Workspace   │        │
│  │             │   │             │   │             │        │
│  │ • Editor    │   │ • Compose   │   │ • Markdown  │        │
│  │ • Terminal  │   │ • Templates │   │ • Templates │        │
│  │ • Execute   │   │ • History   │   │ • Export    │        │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
│         │                 │                 │                │
│         ▼                 ▼                 ▼                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              WorkspaceShell<T>                         │  │
│  │  (Equivalent to UnifiedModulePage but for Forge)       │  │
│  │  • AI Chat panel (right)                               │  │
│  │  • Workspace content (left)                            │  │
│  │  • Action dispatch                                     │  │
│  │  • Profile persistence                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              ForgeWorkspaceProvider                    │  │
│  │  • Active workspace state                              │  │
│  │  • Workspace profiles (Firestore)                      │  │
│  │  • Action registry                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.4.2 Workspace Type Definition

```typescript
interface ForgeWorkspace {
  id: string;                          // 'code' | 'email' | 'docs' | 'analysis' | custom UUID
  type: WorkspaceType;
  title: string;
  icon: string;                        // Lucide icon name
  color: string;                       // Hex color
  persona: string;                     // AI system prompt for this workspace
  actions: ForgeAction[];              // Available actions
  profile: ForgeWorkspaceProfile;      // Persisted state
}

type WorkspaceType = 'code' | 'email' | 'docs' | 'analysis' | 'custom';

interface ForgeWorkspaceProfile {
  workspaceId: string;
  artifacts: ForgeArtifact[];          // Max 100 per workspace
  history: ForgeHistoryEntry[];        // Max 200 per workspace
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ForgeArtifact {
  id: string;
  type: 'code' | 'document' | 'email' | 'analysis' | 'file';
  title: string;
  content: string;                     // The actual content
  language?: string;                   // For code artifacts
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ForgeHistoryEntry {
  id: string;
  action: string;
  input: string;
  output: string;
  status: 'success' | 'error' | 'running';
  createdAt: string;
}
```

### 2.4.3 Workspace Registry

```typescript
const FORGE_WORKSPACES: ForgeWorkspace[] = [
  {
    id: 'code',
    type: 'code',
    title: 'Code Lab',
    icon: 'Code',
    color: '#F43F5E',
    persona: FORGE_CODE_PERSONA,
    actions: ['execute_code', 'read_file', 'write_file', 'explain_code', 'refactor_code']
  },
  {
    id: 'email',
    type: 'email',
    title: 'Email Draft',
    icon: 'Mail',
    color: '#3B82F6',
    persona: FORGE_EMAIL_PERSONA,
    actions: ['draft_email', 'rewrite_tone', 'suggest_subject', 'save_template']
  },
  {
    id: 'docs',
    type: 'docs',
    title: 'Document Studio',
    icon: 'FileText',
    color: '#8B5CF6',
    persona: FORGE_DOCS_PERSONA,
    actions: ['create_document', 'edit_section', 'export_format', 'save_template']
  },
  {
    id: 'analysis',
    type: 'analysis',
    title: 'Data Analysis',
    icon: 'BarChart',
    color: '#10B981',
    persona: FORGE_ANALYSIS_PERSONA,
    actions: ['analyze_data', 'create_chart', 'summarize_findings']
  }
];
```

---

## 2.5 "Life Work Helpers" Architecture

### 2.5.1 Helper Pattern

Each "life work helper" is a Forge Workspace with a specialized persona and actions. They follow the same WorkspaceShell pattern:

```typescript
// Example: Email Drafting Helper

// Persona
const FORGE_EMAIL_PERSONA = `
You are a professional email assistant within Forge.
You help users draft, revise, and refine email communications.

CAPABILITIES:
- Draft emails from bullet points or brief descriptions
- Adjust tone (formal, casual, assertive, empathetic)
- Suggest subject lines
- Proofread and improve clarity
- Create reusable templates

RULES:
- Always confirm tone and recipient context before drafting
- Never send emails — only draft them for user review
- Respect user's writing voice — enhance, don't replace
`;

// Actions
interface EmailActions {
  draft_email: {
    payload: {
      context: string;               // Brief description of what to say
      tone: 'formal' | 'casual' | 'assertive' | 'empathetic';
      recipientContext?: string;     // Who is the recipient
    };
    result: ForgeArtifact;           // type: 'email'
  };

  rewrite_tone: {
    payload: {
      artifactId: string;
      newTone: 'formal' | 'casual' | 'assertive' | 'empathetic';
    };
    result: ForgeArtifact;
  };

  suggest_subject: {
    payload: { artifactId: string };
    result: string[];                // Array of subject line suggestions
  };

  save_template: {
    payload: {
      artifactId: string;
      templateName: string;
    };
    result: void;
  };
}
```

### 2.5.2 Custom Workspace Creation

Users can create custom workspaces with a persona and action set:

```typescript
interface CustomWorkspaceConfig {
  title: string;
  description: string;
  persona: string;                     // User-defined system prompt
  baseType: WorkspaceType;             // Inherit actions from base type
  additionalActions?: string[];
}
```

---

## 2.6 Security Boundary (Code Execution)

### 2.6.1 Current Vulnerability

The current `forgeExecute` Cloud Function uses Node.js `vm` module, which is **not a security sandbox**. The `vm` module documentation explicitly states: "The vm module is not a security mechanism. Do not use it to run untrusted code."

### 2.6.2 Proposed Sandboxing Architecture

```
┌──────────────┐     HTTPS      ┌──────────────────────────┐
│ Forge Client │ ──────────────▶│ Cloud Function           │
│ (Browser)    │                │ forgeExecute             │
│              │                │                          │
│              │                │ ┌──────────────────────┐ │
│              │                │ │ Auth + Rate Limit    │ │
│              │                │ │ (Middleware)          │ │
│              │                │ └──────────┬───────────┘ │
│              │                │            ▼             │
│              │                │ ┌──────────────────────┐ │
│              │                │ │ Firecracker microVM  │ │
│              │                │ │ OR                   │ │
│              │                │ │ gVisor container     │ │
│              │                │ │ OR                   │ │
│              │                │ │ Cloud Run Job        │ │
│              │                │ │ (isolated)           │ │
│              │                │ └──────────────────────┘ │
│              │◀───────────────│ Result (stdout/stderr)   │
└──────────────┘                └──────────────────────────┘
```

### 2.6.3 Recommended Approach: Cloud Run Jobs

```typescript
// Cloud Function: forgeExecute (v2)

interface ForgeExecuteRequest {
  code: string;                        // Max 50KB
  language: 'javascript' | 'typescript' | 'python';
  timeoutMs: number;                   // Max 10000
  userId: string;                      // From Firebase Auth token
}

interface ForgeExecuteResponse {
  status: 'success' | 'error' | 'timeout';
  stdout: string[];
  stderr: string[];
  executionTimeMs: number;
}

// Security constraints:
// 1. AUTHENTICATED: Requires valid Firebase Auth token
// 2. RATE LIMITED: 10 executions per minute per user
// 3. RESOURCE LIMITED: 128MB RAM, 10s timeout, no network, no filesystem
// 4. SANDBOXED: Runs in isolated Cloud Run container (ephemeral)
// 5. AUDITED: Every execution logged with userId + timestamp
```

### 2.6.4 Migration from Current vm-based Approach

1. **Phase 1:** Add authentication to the existing `forgeExecute` function (fix unauthenticated vulnerability immediately)
2. **Phase 2:** Migrate execution to Cloud Run Jobs with proper isolation
3. **Phase 3:** Add TypeScript and Python language support

---

## 2.7 Deployment Architecture

### 2.7.1 Firebase Configuration

```
Firebase Project: agnes-platform
├── Hosting Targets:
│   ├── agnes → agnes.example.com
│   └── forge → forge.example.com
├── Auth: Shared (single auth domain)
├── Firestore: Shared database
│   ├── Agnes collections: *_profiles, global_souls, vaults, ...
│   └── Forge collections: forge_workspaces/{uid}, forge_executions/{uid}
├── Cloud Functions:
│   ├── /agnes/* (Agnes-specific)
│   └── /forge/* (Forge-specific, e.g., forgeExecute, forgeEmailDraft)
└── Security Rules: Collection-level access control
```

### 2.7.2 Firestore Security Rules (Forge Collections)

```javascript
// firestore.rules (additions for Forge)
match /forge_workspaces/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

match /forge_executions/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow create: if request.auth != null && request.auth.uid == userId
                && request.resource.data.keys().hasAll(['code', 'language', 'createdAt']);
  // Write-once execution logs — no updates or deletes
  allow update, delete: if false;
}
```

---

## 2.8 Forge Data Contracts

### 2.8.1 Forge Firestore Document

```typescript
// forge_workspaces/{userId}
interface ForgeUserDocument {
  activeWorkspaceId: string;
  workspaces: Record<string, ForgeWorkspaceProfile>;
  preferences: {
    defaultLanguage: string;
    editorTheme: 'dark' | 'light';
    agnesBridgeEnabled: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
```

### 2.8.2 Forge ↔ Agnes Data Flow

```
                  READ ONLY (opt-in)
    ┌──────────┐ ──────────────────▶ ┌──────────────┐
    │  FORGE   │   NSV snapshot:     │  global_souls │
    │  App     │   energyBudget,     │  /{userId}    │
    │          │   focusScore,       │  (Firestore)  │
    │          │   cnsFatigue        │               │
    └──────────┘                     └──────────────┘
         │
         │ NEVER writes to:
         │ ✗ global_souls
         │ ✗ *_profiles (any Agnes profile)
         │ ✗ vaults
         │ ✗ spine_events
         │
         │ WRITES ONLY to:
         │ ✓ forge_workspaces/{userId}
         │ ✓ forge_executions/{userId}
         ▼
```

---

# TOPIC 3: Pulse Removal

## 3.1 Architecture Overview

Pulse is a **non-core extension** module (interest mapping / news trends). It has:
- No NSV metrics ownership (`pulse: []` in NSV_OWNERSHIP)
- No cascade rules that reference it
- No mandatory security policy (`defaultLocked: false, mandatory: false`)
- No other module depends on it
- 3 registered actions: `update_interest_map`, `track_topic`, `synthesize_trends`
- Separate Firestore collection: `pulse_profiles`
- Guest storage: `nexus_pulse_profile_guest`

**Removal is clean.** No module depends on Pulse data. No NSV metrics to reassign. No cascade rules to update.

---

## 3.2 Complete File Inventory for Removal

### 3.2.1 Files to DELETE

```
src/modules/pulse/                           # Entire directory
├── PulsePage.tsx                             # Module page
├── personas.ts                              # PULSE_PERSONA
├── components/
│   ├── PulseDashboard.tsx                   # Dashboard UI
│   └── PulseBubbleCanvas.tsx                # Bubble visualization
├── onboarding/
│   └── PulseOnboarding.tsx                  # Onboarding flow
└── services/
    ├── pulse-profile-service.ts             # Profile persistence
    ├── pulse-news-service.ts                # Web search news
    └── actions.ts                           # Action handlers
```

### 3.2.2 Files to EDIT

| # | File | Change Required |
|---|------|----------------|
| 1 | `src/lib/module-manifest.ts` | Remove `pulse` from `MODULE_IDS`, `MODULE_MANIFEST`, `HUB_MODULE_ORDER`, `ModuleTheme` ('fuchsia') |
| 2 | `src/App.tsx` | Remove `PulsePage` lazy import (line ~30) and `/pulse` route (line ~128) |
| 3 | `src/lib/persona-registry.ts` | Remove `PULSE_PERSONA` import and `pulse` entry from `PERSONA_MAP` |
| 4 | `src/lib/services/nexus-routing-service.ts` | Remove `pulse` entry from `KEYWORD_ROUTES` |
| 5 | `src/lib/services/nsv-ownership.ts` | Remove `pulse: []` from `NSV_OWNERSHIP` |
| 6 | `src/lib/services/guest-sync-service.ts` | Remove `syncGuestPulseProfileToUser` import and call |
| 7 | `src/lib/services/user-data-registry.ts` | Remove `'pulse'` from `MODULE_IDS` and `'pulse_profiles'` from `DIRECT_USER_COLLECTIONS` |
| 8 | `src/lib/services/core-profile-service.ts` | Remove `pulse: 'female'` from agent gender profiles |
| 9 | `src/modules/hub/constants.ts` | Remove `'pulse'` from `FloatingPodProps.modelType` union |
| 10 | `src/modules/hub/hooks/index.ts` | Remove Pulse stat/config from hub hooks |
| 11 | `src/modules/hub/components/three/ThreeDView.tsx` | Remove Pulse pod position/rendering |
| 12 | `src/modules/hub/components/graph/GraphView.tsx` | Remove Pulse node from graph layout |
| 13 | `src/modules/hub/components/cards/CardsView.tsx` | Remove Pulse card (auto if manifest-driven) |
| 14 | `src/modules/hub/components/HubControls.tsx` | Remove Pulse references (if any direct refs) |
| 15 | `src/core/components/SpineOverlay.tsx` | Remove 'pulse' references (note: "pulse" in SpineOverlay refers to animation dots — verify these are visual effects, not module references) |
| 16 | `src/core/components/ChatInterface.tsx` | Remove Pulse-specific references (if any) |
| 17 | `src/core/components/VitalsGrid.tsx` | Remove Pulse stat display (if directly referenced) |
| 18 | `src/core/components/SystemCommandCenter.tsx` | Remove Pulse from command palette |
| 19 | `src/core/components/SyncTransition.tsx` | Remove Pulse references |
| 20 | `src/core/components/NexusOverlay.tsx` | Remove Pulse references |
| 21 | `src/core/components/BootLoader.tsx` | Remove Pulse references |
| 22 | `src/core/components/NeuralLinkAlert.tsx` | Remove Pulse references |
| 23 | `src/core/components/UnifiedAuthModal.tsx` | Remove Pulse references |
| 24 | `src/core/layout/ModuleLayout.tsx` | Remove Pulse references |
| 25 | `src/modules/orchestrator/personas.ts` | Remove Pulse from orchestrator module descriptions |
| 26 | `src/modules/orchestrator/onboarding/OrchestratorOnboarding.tsx` | Remove Pulse from onboarding module list |
| 27 | `src/modules/landing/LandingPage.tsx` | Remove Pulse from landing page feature list |
| 28 | `src/modules/soma/components/SomaDashboard.tsx` | Remove Pulse references (if any) |
| 29 | `src/lib/services/global-projection-service.ts` | Remove Pulse references |
| 30 | `src/lib/services/intake-base-context-service.ts` | Remove Pulse references |
| 31 | `src/lib/constants.test.ts` | Remove Pulse from test expectations |
| 32 | `src/index.css` | Remove fuchsia/pulse theme CSS if Pulse-specific |

---

## 3.3 Detailed Change Specifications

### 3.3.1 Module Manifest (`src/lib/module-manifest.ts`)

```typescript
// REMOVE from MODULE_IDS:
// Before: ['orchestrator', 'agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge', 'pulse', 'bridge']
// After:  ['orchestrator', 'agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge', 'bridge']

// REMOVE from ModuleTheme:
// Remove: | 'fuchsia'
// (Keep fuchsia only if another module uses it — currently none do)

// REMOVE pulse entry from MODULE_MANIFEST object (lines 174-186)

// REMOVE from HUB_MODULE_ORDER:
// Before: ['agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge', 'pulse']
// After:  ['agnes', 'titan', 'soma', 'ledger', 'atlas', 'scout', 'forge']
```

### 3.3.2 Route Removal (`src/App.tsx`)

```typescript
// REMOVE:
// const PulsePage = lazy(() => import('./modules/pulse/PulsePage'));

// REMOVE:
// <Route path="/pulse" element={
//   <ProtectedRoute>
//     <PulsePage />
// ...
```

### 3.3.3 Hub Module Order Impact

```
Before: agnes → titan → soma → ledger → atlas → scout → forge → pulse
After:  agnes → titan → soma → ledger → atlas → scout → forge

Hub positions:
- 3D View: Remove pulse pod at [0, 5.5, -5] (top back center)
- Graph View: Remove pulse node, adjust layout
- Cards View: Auto-adjusts (manifest-driven)

Stats bar update:
- Remove "Signal" stat (Pulse's hub stat showing ACTIVE/IDLE)
```

### 3.3.4 Spine Event References

**No cascade rules reference Pulse.** Verified in `cascade-rules.ts` — all 7 rules target `orchestrator`, `titan`, or `atlas`. No rule triggers from Pulse or targets Pulse.

**No SpineEventType references Pulse.** The `SpineEventType` union has no Pulse-specific events.

### 3.3.5 Action Handler Cleanup

```typescript
// In whatever registers actions on app init:
// REMOVE: registerPulseActions() call
// This unregisters: update_interest_map, track_topic, synthesize_trends
```

### 3.3.6 Guest Sync Cleanup

```typescript
// guest-sync-service.ts
// REMOVE: import { syncGuestPulseProfileToUser } from '@/modules/pulse/services/pulse-profile-service';
// REMOVE: syncGuestPulseProfileToUser({ userId }),  // from syncAllGuestDataToUser
```

---

## 3.4 Concepts to Absorb into Scout

### 3.4.1 What Pulse Does That Might Be Valuable

| Pulse Feature          | Absorb into Scout? | Rationale                                     |
|------------------------|---------------------|-----------------------------------------------|
| Interest tracking      | ✅ Yes              | Scout's `knowledgeNodes` already track topics  |
| Topic scoring (0-100)  | ✅ Yes              | Map to Scout's confidence scale (0.0-1.0)      |
| Trend tracking         | ✅ Yes              | "rising/steady/cooling" → Scout research state |
| News brief generation  | ⚠️ Optional         | Could become a Scout action: `generate_briefs` |
| Bubble visualization   | ❌ No               | UI-specific, not architecturally relevant       |

### 3.4.2 Scout Profile Extension (if absorbing interests)

```typescript
// Extend existing ScoutProfile (if interest tracking is absorbed):
interface ScoutKnowledgeNode {
  // Existing fields...
  id: string;
  topic: string;
  confidence: number;               // 0.0-1.0
  sources: string[];
  
  // NEW: absorbed from Pulse
  interestScore?: number;            // 0-100 (maps from Pulse's score)
  trend?: 'rising' | 'steady' | 'cooling';
  lastSeenAt?: string;
}

// NEW Scout action (optional):
generate_research_briefs: async ({ userId, encryptionKey, payload }) => {
  // Replaces Pulse's synthesize_trends
  // Uses Scout's knowledgeNodes instead of Pulse's interests
  // Generates briefs based on high-confidence research topics
}
```

### 3.4.3 Data Migration (if absorbing)

```typescript
// One-time migration script
async function migratePulseToScout(userId: string, encryptionKey: CryptoKey) {
  const pulseProfile = await loadPulseProfile({ userId });
  if (!pulseProfile || pulseProfile.interests.length === 0) return;

  const scoutProfile = await loadScoutProfile({ userId, encryptionKey });
  
  for (const interest of pulseProfile.interests) {
    const existingNode = scoutProfile.knowledgeNodes.find(
      n => n.topic.toLowerCase() === interest.topic.toLowerCase()
    );
    
    if (existingNode) {
      // Merge: add interest metadata to existing knowledge node
      existingNode.interestScore = interest.score;
      existingNode.trend = interest.trend;
    } else {
      // Create new knowledge node from interest
      scoutProfile.knowledgeNodes.push({
        id: crypto.randomUUID(),
        topic: interest.topic,
        confidence: interest.score / 100,  // Map 0-100 → 0.0-1.0
        sources: [],
        interestScore: interest.score,
        trend: interest.trend,
        lastSeenAt: interest.lastSeenAt
      });
    }
  }
  
  await saveScoutProfile(scoutProfile, { userId, encryptionKey });
  // Optionally delete pulse_profiles/{userId} from Firestore
}
```

---

## 3.5 Firestore Cleanup

```
Collections to clean up (existing users):
- pulse_profiles/{userId}         → Delete after migration (if absorbing into Scout)
                                    or delete immediately (if not absorbing)

localStorage keys to clean up:
- nexus_pulse_profile_guest       → Clear on next app load

Security rules:
- Remove pulse_profiles match rules from firestore.rules
```

---

# Cross-Cutting Concerns

## C.1 Type Safety Across Changes

All three topics modify the `ModuleId` type. Changes must be coordinated:

```typescript
// After all three topics are implemented:
export const MODULE_IDS = [
  'orchestrator',
  'agnes',
  'titan',
  'soma',
  'ledger',
  'atlas',      // Enhanced (Topic 1)
  'scout',      // Optionally enhanced with Pulse concepts (Topic 3)
  // 'forge',   // Removed from AGNES (Topic 2) — exists in separate Forge app
  // 'pulse',   // Removed (Topic 3)
  'bridge'
] as const;
```

**Note:** Forge removal from AGNES MODULE_IDS happens only when the separate Forge app is fully deployed. Until then, Forge remains in AGNES.

## C.2 Test Impact

| Topic | Test Files Affected |
|-------|---------------------|
| Atlas v2 | Atlas action tests, profile service tests, NSV ownership tests |
| Forge separation | Forge-specific tests move to new package |
| Pulse removal | `constants.test.ts`, any integration tests referencing Pulse |

## C.3 Dependency Map (Post-Changes)

```
                    ┌─────────────┐
                    │ Orchestrator│
                    │   (Nexus)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌──────────┐
         │ Agnes  │  │ Titan  │  │  Ledger  │
         │ (E)    │  │ (B)    │  │  (R)     │
         └───┬────┘  └───┬────┘  └──────────┘
             │           │
             │    ┌──────┴──────┐
             │    ▼             ▼
             │  ┌────────┐  ┌────────┐
             │  │  Soma  │  │ Atlas  │ ← Enhanced (Topic 1)
             │  │  (B)   │  │ (C)   │
             │  └────────┘  └───┬────┘
             │                  │
             │           ┌──────┘
             ▼           ▼
         ┌────────┐
         │ Scout  │ ← Absorbs Pulse concepts (Topic 3)
         │ (C)    │
         └────────┘

         ┌────────┐
         │ Bridge │ (Alert Daemon — no page)
         └────────┘

    ═══════════════════════════════════════════
    SEPARATE APP (Topic 2):

         ┌────────────────────┐
         │       FORGE        │
         │  (Separate App)    │
         │                    │
         │  Reads NSV (opt-in)│
         │  No Spine cascade  │
         │  No vault required │
         └────────────────────┘

    Arrow direction = "depends on" / "reads from"
    Letters = NSV domain ownership: (B)iological, (E)motional, (C)ognitive, (R)esource
```

---

# Migration Sequencing

## Recommended Implementation Order

```
Phase 1: Pulse Removal (Topic 3)                    [1-2 days]
├── Delete pulse module files
├── Update all 32 reference files
├── Optional: migrate interests → Scout
├── Update tests
└── Deploy

Phase 2: Atlas v2 — Data Model + Actions (Topic 1)  [3-5 days]
├── Add new types to atlas-profile-service.ts
├── Implement schema migration (v1 → v2)
├── Register new actions
├── Extend NSV ownership + calibration
├── Add cascade rules
├── Update ATLAS_PERSONA
├── Update Atlas dashboard UI
└── Update tests

Phase 3: Forge Security Fix (Topic 2, urgent)       [1 day]
├── Add Firebase Auth to forgeExecute cloud function
├── Add rate limiting
└── Deploy immediately (can be done in parallel with Phase 1)

Phase 4: Forge Separation (Topic 2, full)            [5-8 days]
├── Set up monorepo structure
├── Extract shared packages
├── Create Forge app scaffold
├── Implement workspace architecture
├── Set up separate hosting target
├── Implement Agnes bridge (NSV read-only)
├── Migrate existing Forge code
├── Remove Forge from AGNES
└── Deploy both apps
```

**Critical Path:** Phase 3 (Forge security fix) should happen **immediately** regardless of other phases. The unauthenticated `forgeExecute` endpoint is a security vulnerability.

---

*End of Architecture Specification*
