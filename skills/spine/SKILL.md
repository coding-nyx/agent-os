---
name: spine
description: >
  Invoke this skill when working on the Spine event bus — Nexus's decoupled pub/sub
  nervous system that enables reactive cross-module communication. Use this skill for
  anything touching src/lib/spine/, SpineEventType unions, cascade rule authoring,
  Spine.publish()/subscribe() call sites, persistence of alert/critical events to
  Firestore, the useSpineEvent() React hook, debounce behaviour, or any cross-module
  event-driven automation triggered through Spine.
---

# Spine Event Bus Skill

> **Singleton export**: `Spine` from `@/lib/spine/spine-event-bus` · **Source dir**: `src/lib/spine/` · **Persistence**: `spine_events/{uid}/events` · **Max cascade depth**: 3 · **Debounce window**: 500 ms

---

## 1. What Spine Is

Spine is the **nervous system of Nexus** — a singleton, framework-agnostic pub/sub event bus that enables every module to communicate reactively without direct module-to-module imports. It is **not a React context** and has no opinion about the rendering tree. Any TypeScript file, service, hook, or component can publish to or subscribe from Spine.

### Core Design Principles

| Principle | Detail |
|---|---|
| **Singleton** | One global `Spine` instance — never instantiate `SpineEventBus` directly |
| **Decoupled** | Publishers and subscribers never import each other; they share only `SpineEventType` strings |
| **Domain-scoped** | Every event carries a `domain` code that determines cascade routing |
| **Priority-tiered** | Three priority levels control UI surfacing and Firestore persistence |
| **Debounce-guarded** | Duplicate events on the same `type:source:target` tuple within 500 ms are silently dropped |
| **Cascade-bounded** | Cascade chains are hard-capped at 3 levels deep — no infinite loops |

### What Spine Is Used For

```
VITAL_UPDATED          ──cascade──▶  BURNOUT_WARNING  ──cascade──▶  FLATTEN_ENERGY_WAVE → Atlas
SESSION_STARTED / SESSION_ENDED      (session lifecycle)
DRAFT_PROPOSED         ──user──▶    DRAFT_APPROVED / DRAFT_DISMISSED
SCHEMA_EXTENDED / SCHEMA_MIGRATED    (schema evolution)
TRANSACTION_CREATED    ──cascade──▶  BUDGET_UPDATED
BURNOUT_WARNING        ──cascade──▶  FLATTEN_ENERGY_WAVE → Atlas
```

---

## 2. File Structure

```
src/lib/spine/
├── spine-event-bus.ts      — SpineEventBus class + singleton export (Spine) + useSpineEvent hook
├── cascade-rules.ts        — CORE_CASCADE_RULES + module-specific rule sets + registration functions
└── scheduler-service.ts    — SchedulerService singleton for time-based Spine event triggers

src/lib/types.ts            — SpineEventType union, SpineEvent interface, SpineEventPayload,
                              SpineDomain, SpineEventPriority — all canonical type definitions

src/App.tsx                 — Bootstrap: Spine.setDataLayer(), Spine.setUser(), cascade rule registration
```

---

## 3. Singleton — Always Import, Never Instantiate

```typescript
// ✅ CORRECT — always import the singleton
import { Spine } from '@/lib/spine/spine-event-bus';

// ❌ WRONG — never construct directly
import { SpineEventBus } from '@/lib/spine/spine-event-bus';
const mySpine = new SpineEventBus(); // breaks debounce, persistence, cascade shared state
```

The singleton is exported as a module-level constant:

```typescript
// src/lib/spine/spine-event-bus.ts (internals — reference only)
export const Spine = new SpineEventBus();
```

---

## 4. Core Data Shapes

### `SpineEvent` — the canonical event object

```typescript
// src/lib/types.ts
interface SpineEvent {
  id: string;                   // auto-generated UUID (crypto.randomUUID())
  type: SpineEventType;         // must be a member of the SpineEventType union
  source: string;               // module ID (e.g. 'agnes') or 'cascade:<source>'
  target?: string;              // optional hint for the intended consuming module
  domain: SpineDomain;          // 'B' | 'E' | 'C' | 'R' | 'system'
  data: Record<string, unknown>;
  timestamp: number;            // Date.now() — set automatically by the bus
  cascadeDepth: number;         // 0-based; always present (defaulted to 0)
  priority: SpineEventPriority; // 'info' | 'alert' | 'critical'
}
```

### `SpineEventPayload` — what callers pass to `Spine.publish()`

`SpineEventPayload` is `SpineEvent` **minus** `{ id, timestamp }`. The bus fills those in automatically.

```typescript
// src/lib/types.ts
interface SpineEventPayload {
  type: SpineEventType;
  source: string;
  target?: string;
  domain: SpineDomain;
  data: Record<string, unknown>;
  cascadeDepth?: number;         // optional — defaults to 0 if omitted
  priority: SpineEventPriority;
}
```

### Domain Codes

| Code | Full Name | Owned By |
|---|---|---|
| `B` | Biological | Titan, Soma |
| `E` | Emotional | Agnes |
| `C` | Cognitive / Planning | Atlas, Scout |
| `R` | Resource / Financial | Ledger |
| `system` | System-wide | Nexus, Orchestrator |

> **Rule**: always publish with the domain that matches your module. Cascade rules use the source event's domain to route correctly. Using the wrong domain silently breaks cascade filtering.

### Priority Levels

| Level | Usage | Persisted to Firestore? | In-memory buffer? |
|---|---|---|---|
| `info` | Routine heartbeats, soft updates | ❌ No | ✅ Yes (`getRecentEvents()`) |
| `alert` | Notable state change, needs attention | ✅ Yes | ✅ Yes |
| `critical` | Immediate action required (burnout, crisis) | ✅ Yes | ✅ Yes |

---

## 5. Full API Reference

### `Spine.publish(payload)`

```typescript
Spine.publish(payload: SpineEventPayload): SpineEvent
```

Publishes an event into the bus. The bus will:
1. Validate and normalize the payload (throws on invalid domain/priority/missing fields)
2. Assign a UUID `id` and `Date.now()` `timestamp`
3. Apply the 500 ms debounce check on `${type}:${source}:${target ?? ''}`
4. Fan out to all matching subscribers (synchronously in call order)
5. Log the event via NexusLogger
6. Push to the in-memory ring buffer (last 50 events)
7. Run cascade rules against the event (if `cascadeDepth < 3`)
8. Emit any cascade-produced child events (up to depth 3)
9. Persist to Firestore if priority is `alert` or `critical` (fire-and-forget, no await)

Returns the full `SpineEvent` object (useful for testing/debugging).

### `Spine.subscribe(type, handler, options?)`

```typescript
Spine.subscribe(
  type: SpineEventType | '*',
  handler: (event: SpineEvent) => void,
  options?: { minPriority?: SpineEventPriority }
): () => void   // ← returns unsubscribe function — MUST be called to prevent memory leaks
```

`'*'` is a wildcard that subscribes to all event types.

`minPriority` filters: `'info'` passes all; `'alert'` passes `alert` + `critical`; `'critical'` passes only `critical`.

### `Spine.getRecentEvents(filter?)`

```typescript
Spine.getRecentEvents(filter?: { type?: SpineEventType; source?: string }): SpineEvent[]
// Returns the last ~50 events from the in-memory ring buffer (all priorities)
// Optional filter narrows results by type and/or source
```

### `Spine.setDataLayer(layer)`

```typescript
Spine.setDataLayer(layer: NexusDataLayer): void
// MUST be called at application bootstrap — before any alert/critical events are published
// Without this, persistence logs an error and no events are persisted
```

### `Spine.setUser(uid)`

```typescript
Spine.setUser(uid: string | null): void
// Sets the user ID for Firestore persistence path: spine_events/{uid}/events
// Called from SpineRuntimeBootstrap on auth state change
```

### `Spine.registerCascadeRules(rules)`

```typescript
Spine.registerCascadeRules(rules: CascadeRule[]): void
// Registers cascade rules with deduplication by rule.id
// Safe to call multiple times — later registrations replace earlier ones with same id
```

### `Spine.clear()`

```typescript
Spine.clear(): void
// Clears all listeners, recent events, cascade rules, and debounce timers
// Intended for tests and hot-reload cleanup
```

### `useSpineEvent(type, handler, options?)` — React hook

```typescript
import { useSpineEvent } from '@/lib/spine/spine-event-bus';

useSpineEvent(
  type: SpineEventType | '*',
  handler: (event: SpineEvent) => void,
  options?: { minPriority?: SpineEventPriority }
): void
// Subscribes on mount, unsubscribes automatically on unmount — no manual cleanup needed
// Handler reference is stable (useRef pattern) — no re-subscribe on handler change
```

---

## 6. Publishing Events

### Basic Publish

```typescript
import { Spine } from '@/lib/spine/spine-event-bus';

Spine.publish({
  type: 'VITAL_UPDATED',
  source: 'agnes',
  domain: 'E',
  priority: 'alert',
  data: { cnsFatigue: 0.8, emotionalResilience: 3 },
});
```

### Publishing with a Target Module Hint

```typescript
Spine.publish({
  type: 'FLATTEN_ENERGY_WAVE',
  source: 'cascade:burnout-flatten-wave',
  domain: 'E',
  priority: 'critical',
  data: { reason: 'burnout_warning_triggered' },
  target: 'atlas',   // hint — Atlas listens for this and adjusts its energy planning
});
```

### Session Lifecycle Events

```typescript
// Session start — all modules listening for context refresh will react
Spine.publish({
  type: 'SESSION_STARTED',
  source: 'nexus',
  domain: 'system',
  priority: 'info',
  data: { sessionId: 'sess_abc123', userId: uid },
});

// Session end — triggers NSV refresh cycles
Spine.publish({
  type: 'SESSION_ENDED',
  source: 'nexus',
  domain: 'system',
  priority: 'alert',
  data: { sessionId: 'sess_abc123', durationMs: 3600000 },
});
```

### AI Draft Approval Flow

```typescript
// AI proposes a plan draft
Spine.publish({
  type: 'DRAFT_PROPOSED',
  source: 'atlas',
  domain: 'C',
  priority: 'alert',
  data: { draftId: 'draft_xyz', content: { ... } },
});

// User approves
Spine.publish({
  type: 'DRAFT_APPROVED',
  source: 'atlas',
  domain: 'C',
  priority: 'alert',
  data: { draftId: 'draft_xyz' },
});
```

---

## 7. Subscribing to Events

### Outside React — Service / Utility File

```typescript
import { Spine } from '@/lib/spine/spine-event-bus';

// Subscribe — returns unsubscribe fn — MUST store and call it
const unsub = Spine.subscribe('BURNOUT_WARNING', (event) => {
  if (event.data.severity === 'critical') {
    notifyUser();
  }
});

// When the service is torn down or the subscription is no longer needed:
unsub();
```

### Inside a React Component — `useSpineEvent`

```typescript
import { useSpineEvent } from '@/lib/spine/spine-event-bus';

function MyComponent() {
  useSpineEvent('VITAL_UPDATED', (event) => {
    setLastVital(event.data);
  });

  // With priority filter — only handle alert and critical events
  useSpineEvent('VITAL_UPDATED', handleHighPriorityVital, { minPriority: 'alert' });

  // Trigger a full NSV refresh when health data goes stale
  useSpineEvent('HEALTH_CONTEXT_STALE', () => {
    refreshGlobalSoul();
  });

  // React to session end for counter-based re-fetch
  useSpineEvent('SESSION_ENDED', () => {
    setRefreshCounter(c => c + 1);
  });
}
```

### Priority Filter Semantics

| `minPriority` value | Events that pass through |
|---|---|
| `'info'` (or omitted) | `info`, `alert`, `critical` |
| `'alert'` | `alert`, `critical` only |
| `'critical'` | `critical` only |

---

## 8. Debounce Behaviour

```
Key:    "${event.type}:${event.source}:${event.target ?? ''}"
Window: 500 ms

If an identical type+source+target tuple is published within 500 ms of the previous one,
the second (and any further) event is silently dropped — returns the event but no fan-out occurs.
```

### When Debounce Matters

```typescript
// These two calls are 200 ms apart — the second is DROPPED
Spine.publish({ type: 'VITAL_UPDATED', source: 'soma', ... });
// 200ms later...
Spine.publish({ type: 'VITAL_UPDATED', source: 'soma', ... }); // ← DROPPED

// Different source — both fire (different debounce key)
Spine.publish({ type: 'VITAL_UPDATED', source: 'soma', ... });
Spine.publish({ type: 'VITAL_UPDATED', source: 'titan', ... }); // ← fires (different key)

// Same type+source but different target — both fire
Spine.publish({ type: 'VITAL_UPDATED', source: 'soma', target: 'atlas', ... });
Spine.publish({ type: 'VITAL_UPDATED', source: 'soma', target: 'agnes', ... }); // ← fires (different key)
```

### Intentional Design

The 500 ms window prevents event storms during rapid sequential state updates (e.g., slider drag, real-time biomarker streaming). It is **not a bug** — it is Spine's primary back-pressure mechanism. If you need guaranteed delivery, increase the interval between publishes or use a different communication pattern.

---

## 9. Cascade Engine

### How Cascades Work

```
Spine.publish(event)
  │
  ├── fan-out to direct subscribers
  │
  └── for each CascadeRule where rule.trigger === event.type:
        if event.cascadeDepth < 3:
          if rule.condition(event) === true:
            childEvent = { ...rule.transform(event), cascadeDepth: event.cascadeDepth + 1 }
            childEvent.source = 'cascade:<rule.id>'
            Spine.publish(childEvent)   ← recursive — same debounce + persistence logic applies
        else:
          ⛔ silently truncated — no further cascade
```

### `CascadeRule` Interface

```typescript
// src/lib/spine/spine-event-bus.ts
export interface CascadeRule {
  id: string;                                              // unique rule identifier
  trigger: SpineEventType;                                 // listens for this event type
  condition: (event: SpineEvent) => boolean;              // guard — return false to skip
  transform: (event: SpineEvent) => SpineEventPayload;    // produces the child event payload
}
```

### Cascade Depth Limit

- Max depth: **3 levels** (0-indexed, so depth 0 → 1 → 2 → ⛔ at 3)
- `cascadeDepth` is set to `0` for all events published via `Spine.publish()` directly (if not specified)
- Child cascades have `cascadeDepth` auto-incremented by 1
- At `cascadeDepth >= 3`, the cascade engine silently stops — no error thrown

### Cascade-Emitted Event `source` Convention

```
source: 'cascade:<originalSource>'

Examples:
  'cascade:agnes'           // cascaded from agnes module
  'cascade:soma'            // cascaded from soma module
  'cascade:spine-cascade'   // cascaded from another cascade rule
  'spine-cascade:core'      // core cascade rules use this pattern
  'spine-cascade:ledger'    // module-specific cascade sources
```

This allows subscribers to distinguish cascade-emitted events from direct module publishes.

---

## 10. Registered Cascade Rules

All cascade rules are defined in `src/lib/spine/cascade-rules.ts` and registered in `SpineRuntimeBootstrap` (App.tsx).

### CORE_CASCADE_RULES (Energy Wave Logic)

| Rule ID | Trigger | Condition | Emits | Target |
|---|---|---|---|---|
| `burnout-warning` | `VITAL_UPDATED` | `cnsFatigue >= 8` AND `emotionalResilience <= 3` | `BURNOUT_WARNING` | `nexus` |
| `burnout-flatten-wave` | `BURNOUT_WARNING` | always | `FLATTEN_ENERGY_WAVE` | `atlas` |
| `intensity-flatten-wave` | `BLOCK_HIGH_INTENSITY` | always | `FLATTEN_ENERGY_WAVE` | `atlas` |

### LEDGER_CASCADE_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `ledger-transaction-to-budget` | `TRANSACTION_CREATED` | `domain === 'R'` | `BUDGET_UPDATED` |
| `ledger-goal-progress-to-health` | `GOAL_PROGRESS` | `domain === 'R'` | `FINANCIAL_HEALTH_CHECK` |
| `ledger-risk-to-alert` | `RISK_DETECTED` | `domain === 'R'` | `FINANCIAL_FRICTION_CHANGED` |
| `ledger-high-friction-to-somatic-support` | `FINANCIAL_FRICTION_CHANGED` | `newScore >= 7` | `SOMATIC_SUPPORT_REQUESTED` |
| `ledger-soma-stress-to-financial-review` | `STRESS_SPIKE` | `stressLoad >= 8` | `FINANCIAL_HEALTH_CHECK` |
| `ledger-goal-completed-to-vital-update` | `GOAL_COMPLETED` | `domain === 'R'` | `VITAL_UPDATED` |
| `ledger-burnout-to-financial-friction-check` | `BURNOUT_WARNING` | always | `RISK_DETECTED` |

### AGNES_CASCADE_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `agnes-burnout-to-somatic-support` | `BURNOUT_WARNING` | `domain === 'system'` | `SOMATIC_SUPPORT_REQUESTED` |
| `agnes-crisis-detected-to-crisis-mode` | `CRISIS_DETECTED` | always | `CRISIS_MODE` |

### ATLAS_CASCADE_RULES (Weekly Review)

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `atlas-weekly-review-due-session` | `SESSION_STARTED` | `isWeeklyReviewDue()` | `WEEKLY_REVIEW_DUE` |
| `atlas-weekly-review-due-state` | `ATLAS_STATE_CHANGED` | `isWeeklyReviewDue()` | `WEEKLY_REVIEW_DUE` |

### ATLAS_MORNING_RULES (Intelligence Cadence)

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `atlas-morning-brief-session` | `SESSION_STARTED` | `isMorningBriefDue()` (05:00–11:00) | `MORNING_BRIEF_DUE` |
| `atlas-evening-checkin-session` | `SESSION_STARTED` | `isEveningCheckinDue()` (19:00–22:00) | `EVENING_CHECKIN_DUE` |

### ATLAS_JOURNAL_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `atlas-journal-reflection-streak-milestone` | `JOURNAL_ENTRY_CREATED` | `reflectionStreak >= 7` | `HABIT_STREAK_MILESTONE` |

### ATLAS_FAILURE_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `atlas-commitment-missed-to-routine-disrupted` | `COMMITMENT_MISSED` | always | `ROUTINE_UPDATED` |
| `atlas-habit-streak-broken-to-somatic-support` | `HABIT_STREAK_BROKEN` | `streakDays >= 3` | `SOMATIC_SUPPORT_REQUESTED` |

### ATLAS_PLANNING_CASCADE_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `atlas-goal-updated-to-state-changed` | `ATLAS_GOAL_UPDATED` | always | `ATLAS_STATE_CHANGED` |
| `atlas-goal-completed-to-milestone` | `ATLAS_GOAL_UPDATED` | `action === 'completed'` | `ATLAS_GOAL_MILESTONE` |
| `atlas-deadline-pressure-high-to-crunch` | `DEADLINE_PRESSURE_CHANGED` | `deadlinePressure >= 8` | `DEADLINE_CRUNCH` |
| `atlas-planning-state-updated-to-vital` | `PLANNING_STATE_UPDATED` | always | `VITAL_UPDATED` |
| `atlas-task-completed-to-vital` | `ATLAS_TASK_COMPLETED` | always | `VITAL_UPDATED` |
| `atlas-predictive-alert-to-flatten` | `ATLAS_PREDICTIVE_ALERT` | `riskScore >= 0.6` | `FLATTEN_ENERGY_WAVE` |
| `atlas-goal-milestone-to-agnes` | `ATLAS_GOAL_MILESTONE` | always | `SOMATIC_SUPPORT_REQUESTED` |
| `atlas-recovery-scheduled-to-reduce-load` | `ATLAS_RECOVERY_SCHEDULED` | always | `REDUCE_TRAINING_LOAD` |

### SOMA_CASCADE_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `soma-poor-readiness-to-compound-stress` | `SOMA_READINESS_UPDATED` | `score <= 30` | `COMPOUND_STRESS` |
| `soma-clearance-revoked-to-vital-alert` | `SOMA_CLEARANCE_CHANGED` | `action === 'revoked'` | `VITAL_UPDATED` |
| `soma-optimal-readiness-to-vital-update` | `SOMA_READINESS_UPDATED` | `score >= 80` | `VITAL_UPDATED` |

### TITAN_CASCADE_RULES

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `titan-high-rpe-to-reduce-load` | `WORKOUT_COMPLETED` | `rpe >= 9` | `REDUCE_TRAINING_LOAD` |
| `titan-recovery-needed-to-somatic-support` | `TITAN_RECOVERY_NEEDED` | always | `SOMATIC_SUPPORT_REQUESTED` |
| `titan-aggressive-cut-to-compound-stress` | `TITAN_BODY_WEIGHT_LOGGED` | `aggressiveCut === true` | `COMPOUND_STRESS` |
| `titan-training-streak-to-agnes` | `TITAN_TRAINING_STREAK` | always | `SOMATIC_SUPPORT_REQUESTED` |

### Registration Functions

```typescript
// src/lib/spine/cascade-rules.ts
export function registerLedgerCascadeRules(): void
export function registerAgnesCascadeRules(): void
export function registerAtlasCascadeRules(): void      // includes ATLAS_CASCADE_RULES + ATLAS_MORNING_RULES + ATLAS_JOURNAL_RULES
export function registerAtlasFailureRules(): void
export function registerAtlasPlanningCascadeRules(): void
export function registerSomaCascadeRules(): void
export function registerTitanCascadeRules(): void
```

### Example Cascade Rule Implementation

```typescript
// cascade-rules.ts
{
  id: 'burnout-warning',
  trigger: 'VITAL_UPDATED',
  condition: (event) => {
    const data = event.data as Record<string, unknown>;
    const cnsFatigue = data?.cnsFatigue;
    const emotionalResilience = data?.emotionalResilience;
    return (
      typeof cnsFatigue === 'number' &&
      typeof emotionalResilience === 'number' &&
      cnsFatigue >= 8 &&
      emotionalResilience <= 3
    );
  },
  transform: (event) => ({
    type: 'BURNOUT_WARNING',
    domain: 'system',
    source: 'spine-cascade:core',
    priority: 'critical',
    target: 'nexus',
    data: {
      reason: 'high_fatigue_low_resilience',
      cnsFatigue: event.data.cnsFatigue,
      emotionalResilience: event.data.emotionalResilience
    },
  }),
}
```

---

## 11. Complete `SpineEventType` Union

All valid event type strings. Defined in `src/lib/types.ts`. **Do not use raw string literals** at call sites — always import and reference from `SpineEventType`.

```typescript
type SpineEventType =
  // ── Core vitals / health ──────────────────────────────────────────────────
  | 'VITAL_UPDATED'           // any vital signal changed
  | 'REDUCE_TRAINING_LOAD'    // command: lower Titan training intensity
  | 'BLOCK_HIGH_INTENSITY'    // command: block high-intensity blocks in Titan
  | 'FLATTEN_ENERGY_WAVE'     // command: flatten energy curve in Atlas schedule
  | 'RECOVERY_AVAILABLE'      // signal: recovery window opened
  | 'BURNOUT_WARNING'         // signal: burnout threshold crossed
  | 'CLEARANCE_DENIED'        // ⚠️ deprecated — use BLOCK_HIGH_INTENSITY
  | 'CLEARANCE_GRANTED'       // ⚠️ deprecated — use BLOCK_HIGH_INTENSITY

  // ── Session lifecycle ────────────────────────────────────────────────────
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'

  // ── Cognitive / Planning ─────────────────────────────────────────────────
  | 'COGNITIVE_OVERLOAD'
  | 'PLANNING_OVERLOAD'
  | 'DEADLINE_CRUNCH'
  | 'EXECUTION_COLLAPSE'
  | 'STREAK_BROKEN'
  | 'TASK_COMPLETED'
  | 'DEADLINE_APPROACHING'
  | 'HABIT_STREAK_BROKEN'

  // ── System-wide ──────────────────────────────────────────────────────────
  | 'SECURITY_POLICY_UPDATED'
  | 'FINANCIAL_STRESS'
  | 'MEDICAL_ALERT'
  | 'CRISIS_DETECTED'
  | 'COMPOUND_STRESS'
  | 'CRISIS_MODE'

  // ── AI draft approval flow ────────────────────────────────────────────────
  | 'DRAFT_PROPOSED'
  | 'DRAFT_APPROVED'
  | 'DRAFT_DISMISSED'

  // ── Module coordination ───────────────────────────────────────────────────
  | 'MODULE_DELEGATED'
  | 'TEMPORAL_REVIEW_COMPLETE'
  | 'DELEGATION_REQUEST'
  | 'NSV_CALIBRATION_REQUEST'
  | 'MODULE_PROFILE_UPDATED'
  | 'MODULE_REMINDER_DUE'
  | 'MODULE_REMINDER_COMPLETED'

  // ── Schema evolution ──────────────────────────────────────────────────────
  | 'SCHEMA_EXTENDED'
  | 'SCHEMA_MODIFIED'
  | 'SCHEMA_MIGRATED'
  | 'FIELD_CREATED'
  | 'FIELD_DELETED'
  | 'FIELD_VALUE_UPDATED'

  // ── Spending / Conflict ───────────────────────────────────────────────────
  | 'SPENDING_DETECTED'
  | 'CONFLICT_DETECTED'
  | 'CONFLICT_RESOLVED'

  // ── Atlas events ──────────────────────────────────────────────────────────
  | 'ATLAS_RECOVERY_SCHEDULED'
  | 'ATLAS_PREDICTIVE_ALERT'
  | 'ATLAS_STATE_CHANGED'
  | 'GOAL_MISSING_PROGRESS'
  | 'ATLAS_TASK_COMPLETED'
  | 'ATLAS_TASK_CREATED'
  | 'ATLAS_TASK_BLOCKED'
  | 'ATLAS_TASK_UNBLOCKED'
  | 'ATLAS_HABIT_LOGGED'
  | 'ATLAS_HABIT_MILESTONE'
  | 'ATLAS_GOAL_MILESTONE'
  | 'ATLAS_GOAL_COMPLETED'
  | 'ATLAS_GOAL_UPDATED'
  | 'ATLAS_ENERGY_UPDATED'
  | 'ATLAS_ENERGY_OVERLOAD'
  | 'ATLAS_RECOVERY_WINDOW_CREATED'
  | 'ATLAS_OVERLOAD_DETECTED'
  | 'ATLAS_FIELD_CREATED'
  | 'ATLAS_FIELD_DELETED'
  | 'ATLAS_FIELD_VALUE_UPDATED'
  | 'DEADLINE_PRESSURE_CHANGED'
  | 'PLANNING_STATE_UPDATED'
  | 'WEEKLY_REVIEW_DUE'
  | 'ROUTINE_UPDATED'
  | 'MORNING_BRIEF_DUE'
  | 'MORNING_BRIEF'
  | 'EVENING_CHECKIN_DUE'
  | 'COMMITMENT_MISSED'
  | 'JOURNAL_ENTRY_CREATED'
  | 'JOURNAL_ENTRY_UPDATED'
  | 'HABIT_STREAK_MILESTONE'

  // ── Ledger events ─────────────────────────────────────────────────────────
  | 'BUDGET_UPDATED'
  | 'BUDGET_CREATED'
  | 'BUDGET_MODIFIED'
  | 'BUDGET_ALERT'
  | 'GOAL_PROGRESS'
  | 'GOAL_CREATED'
  | 'GOAL_COMPLETED'
  | 'FINANCIAL_FRICTION_CHANGED'
  | 'FINANCIAL_FRICTION_UPDATED'
  | 'FINANCIAL_HEALTH_CHECK'
  | 'FINANCIAL_STREAK_MILESTONE'
  | 'RESONANCE_ROI_UPDATED'
  | 'FINANCIAL_PLAN_CREATED'
  | 'DOCUMENT_ANALYZED'
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_UPDATED'
  | 'TRANSACTION_DELETED'
  | 'RISK_DETECTED'
  | 'OVERSPEND_DETECTED'
  | 'DEBT_MILESTONE'
  | 'SAVINGS_MILESTONE'
  | 'INCOME_CHANGE'
  | 'EXPENSE_SPIKE'
  | 'CASHFLOW_POSITIVE'
  | 'CASHFLOW_NEGATIVE'
  | 'LEDGER_FIELD_SUGGESTION'

  // ── Soma events ───────────────────────────────────────────────────────────
  | 'SOMA_BIOMARKER_COMMITTED'
  | 'SOMA_READINESS_UPDATED'
  | 'SOMA_CLEARANCE_CHANGED'
  | 'SOMA_FIELD_CREATED'
  | 'SOMA_FIELD_UPDATED'
  | 'SOMA_FIELD_DELETED'
  | 'SOMA_VITAL_LOGGED'
  | 'SOMA_LAB_REPORT_PARSED'
  | 'SOMA_PROFILE_UPDATED'
  | 'SOMA_DIAGNOSIS_MERGED'
  | 'SOMA_DIAGNOSIS_DISCARDED'
  | 'HEALTH_CONTEXT_STALE'      // triggers GlobalSoul refresh via NSV re-read

  // ── Titan events ──────────────────────────────────────────────────────────
  | 'CYCLE_STARTED'
  | 'CYCLE_COMPLETED'
  | 'WORKOUT_COMPLETED'
  | 'TITAN_BODY_WEIGHT_LOGGED'
  | 'TITAN_RECOVERY_NEEDED'
  | 'TITAN_TRAINING_STREAK'

  // ── Agnes events ──────────────────────────────────────────────────────────
  | 'SOMATIC_SUPPORT_REQUESTED'
  | 'SOMATIC_SESSION_COMPLETE'

  // ── Soul Write Protocol ───────────────────────────────────────────────────
  | 'SOUL_WRITE_REQUESTED'
  | 'SOUL_WRITE_APPROVED'
  | 'SOUL_WRITE_REJECTED'

  // ── Contextual Inference Engine ───────────────────────────────────────────
  | 'CONTEXT_HINT_DETECTED'
  | 'CONTEXT_HINT_CONFIRMED'
  | 'CONTEXT_HINT_DISMISSED'

  // ── Reminder proposal lifecycle ───────────────────────────────────────────
  | 'REMINDER_PROPOSED'
  | 'REMINDER_CONFIRMED'
  | 'REMINDER_DISMISSED'

  // ── Scout Research events ─────────────────────────────────────────────────
  | 'DEEP_RESEARCH_REQUESTED'
  | 'DEEP_RESEARCH_BACKUP_FOUND'
  | 'DEEP_RESEARCH_STARTED'
  | 'DEEP_RESEARCH_COMPLETED'
  | 'DIGEST_GENERATION_STARTED'
  | 'DIGEST_GENERATED'
  | 'DIGEST_GENERATION_FAILED'
  | 'EXPORT_REQUESTED'
  | 'SOURCE_ADDED'
  | 'KNOWLEDGE_SYNTHESIZED'
  | 'SCOUT_PROFILE_UPDATED'
  | 'HABIT_SUGGESTED'
  | 'RESEARCH_SEARCHING'
  | 'RESEARCH_RESULTS'

  // ── AI validation ─────────────────────────────────────────────────────────
  | 'ai_validation_suggestion'
  | 'ai_contextual_validation'
  | 'ai_error_explanation'
```

---

## 12. Scheduler Service

The `SchedulerService` is a singleton that enables time-based Spine event triggers. Defined in `src/lib/spine/scheduler-service.ts`.

### ScheduleDefinition Interface

```typescript
interface ScheduleDefinition {
  id: string;               // Unique identifier, e.g. 'atlas.evening_checkin'
  moduleId: string;         // Owning module, used as Spine event source
  type: string;             // Semantic type, e.g. 'evening_checkin'
  time: string;             // Wall-clock time: 'HH:MM' (daily) or 'DDD HH:MM' (weekly)
  spineEventType: SpineEventType;  // Event type to emit when fired
  defaultEnabled: boolean;  // Whether this schedule is enabled by default
}
```

### Registered Schedules (from SchedulerRuntimeBootstrap)

| Schedule ID | Type | Time | Event Type |
|---|---|---|---|
| `atlas.morning_brief` | Morning Brief | `09:00` daily | `MORNING_BRIEF` |
| `atlas.evening_checkin` | Evening Check-in | `20:30` daily | `EVENING_CHECKIN_DUE` |
| `atlas.weekly_review` | Weekly Review | `Sun 18:00` weekly | `WEEKLY_REVIEW_DUE` |

### Time Formats

- **Daily**: `'HH:MM'` (24-hour format) — fires daily at the specified time
- **Weekly**: `'DDD HH:MM'` — fires on the specified weekday at the specified time
  - Day abbreviations: `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`

### SchedulerService API

```typescript
import { SchedulerService } from '@/lib/spine/scheduler-service';

// Register a schedule
SchedulerService.register({
  id: 'atlas.morning_brief',
  moduleId: 'atlas',
  type: 'morning_brief',
  time: '09:00',
  spineEventType: 'MORNING_BRIEF',
  defaultEnabled: true,
});

// Unregister a schedule
SchedulerService.unregister('atlas.morning_brief');

// Start the scheduler (called once at app init)
SchedulerService.start();

// Stop the scheduler (for cleanup)
SchedulerService.stop();
```

### Re-scheduling Strategy

- Uses `setTimeout` (never `setInterval`) and re-schedules after each fire to prevent drift
- If the scheduled time has already passed today, defers to tomorrow (daily) or next week (weekly)

---

## 13. Persistence

### What Gets Persisted

```
priority: 'info'     → in-memory only (getRecentEvents() ring buffer, ~50 events)
priority: 'alert'    → Firestore: spine_events/{uid}/events/{autoId}
priority: 'critical' → Firestore: spine_events/{uid}/events/{autoId}
```

### Firestore Write Behaviour

- Writes are **fire-and-forget** — `Spine.publish()` does **not** `await` the Firestore write
- If `Spine.setDataLayer()` was never called, an error is logged and event is not persisted
- Each persisted document is the full `SpineEvent` object serialized as JSON
- Requires `Spine.setUser(uid)` to be called — without a uid, events are not persisted

### Bootstrap Requirement

```typescript
// src/App.tsx — SpineRuntimeBootstrap component
import { Spine } from '@/lib/spine/spine-event-bus';

// DataLayer is injected via DataLayerProvider context
Spine.setDataLayer(dataLayer);
Spine.setUser(user?.uid ?? null);
```

> **Gotcha**: if you set the data layer late (after the first `alert` event fires), those early events are lost permanently — they are not buffered and retried.

---

## 14. Architecture Diagrams

### Event Flow (publish → fan-out → cascade → persist)

```
Module / Hook / AI ActionHub
         │
         │  Spine.publish(payload)
         ▼
┌─────────────────────────────────────┐
│           SpineEventBus             │
│                                     │
│  1. Validate & normalize payload    │──── throws on invalid domain/priority
│  2. Assign id + timestamp           │
│  3. Debounce check (500ms window)   │──── DROPPED if duplicate type:source:target
│  4. Fan-out to subscribers          │
│  5. Log via NexusLogger             │
│  6. Push to ring buffer (~50)       │
│  7. Cascade engine                  │
│     └─ depth < 3?                   │
│        ├─ yes → evaluate rules      │
│        │        └─ match? → child   │──── recursive Spine.publish()
│        └─ no  → stop               │
│  8. Priority gate → Firestore write │──── fire-and-forget (alert/critical only)
└─────────────────────────────────────┘
```

### Cascade Chain Example — Burnout Warning

```
[Agnes writes NSV: cnsFatigue=8.5, emotionalResilience=2]
         │
         ▼
Spine.publish({ type: 'VITAL_UPDATED', source: 'agnes', domain: 'E', priority: 'alert',
                data: { cnsFatigue: 8.5, emotionalResilience: 2 } })
         │
         │  cascade rule: burnout-warning (depth 0→1)
         │  condition: cnsFatigue >= 8 && emotionalResilience <= 3 ✓
         ▼
Spine.publish({ type: 'BURNOUT_WARNING', source: 'cascade:burnout-warning',
                domain: 'E', priority: 'critical', cascadeDepth: 1 })
         │
         │  cascade rule: burnout-flatten-wave (depth 1→2)
         │  condition: always ✓
         ▼
Spine.publish({ type: 'FLATTEN_ENERGY_WAVE', source: 'cascade:burnout-flatten-wave',
                target: 'atlas', domain: 'E', priority: 'critical', cascadeDepth: 2 })
         │
         │  depth 2 → 3: TRUNCATED — no further cascades
         ▼
        ⛔ (cascade engine stops)
```

### Module-to-Module Communication Map

```
Agnes ──VITAL_UPDATED──────────────────────────────────────────────┐
                                                                    │ cascade
                                                          BURNOUT_WARNING
                                                                    │
                                ┌────────────────────────────────────┘
                                │ cascade
                        FLATTEN_ENERGY_WAVE
                                │
                                ▼
                             Atlas  (flattens energy planning)
                             Titan  (reduces training load)

Soma ──SOMA_BIOMARKER_COMMITTED──────────────────────────────────▶ Spine
                                                                    │
                                                        HEALTH_CONTEXT_STALE
                                                                    │
                                                                    ▼
                                                           GlobalSoulProvider
                                                           (refreshGlobalSoul())

Ledger ──TRANSACTION_CREATED──────────────────────────────────────┐
                                                                   │ cascade
                                                          BUDGET_UPDATED

AI ActionHub ──broadcast_spine_event──────────────────────────▶ Spine.publish()
(only entry point for AI-driven events)
```

### Subscription Lifecycle Diagram

```
React mount                        React unmount
    │                                    │
    ▼                                    ▼
useSpineEvent()              ───────▶  unsub()   ← auto-called
    │                                  (no memory leak)
    ▼
Spine.subscribe()
    │
    ├─ handler registered in internal Map<SpineEventType, Set<Handler>>
    │
    └─ returns unsub fn ───────────────── stored by useSpineEvent hook
```

---

## 15. Integration Points

### Integration with GlobalSoul

`GlobalSoulProvider` holds a platform-wide snapshot of NSV (Nexus State Vector) signals. Soma triggers a Spine event after committing biomarkers; GlobalSoul listens and refreshes from Firestore.

```typescript
// In GlobalSoulProvider (reference pattern):
useSpineEvent('HEALTH_CONTEXT_STALE', () => {
  refreshGlobalSoul(); // re-reads NSV from Firestore
});
```

**Implication**: any module that mutates health data in Firestore **must** publish `HEALTH_CONTEXT_STALE` afterward to keep the rest of the platform in sync.

```typescript
// After committing biomarkers:
await somaProfileService.commitBiomarkers(uid, biomarkers);

Spine.publish({
  type: 'HEALTH_CONTEXT_STALE',
  source: 'soma',
  domain: 'B',
  priority: 'alert',
  data: { reason: 'biomarker_committed' },
});
```

### Integration with ActionHub (AI → Spine)

The Nexus Orchestrator action tag `broadcast_spine_event` is the **only sanctioned entry point** for AI-driven events into the Spine bus. No module AI can call `Spine.publish()` directly — it must go through an ActionHub handler.

```typescript
// In ActionHub handler registration (reference pattern):
ActionHub.register('broadcast_spine_event', (payload) => {
  Spine.publish({
    type: payload.type as SpineEventType,
    source: payload.source ?? 'nexus-ai',
    domain: payload.domain ?? 'system',
    priority: payload.priority ?? 'info',
    data: payload.data ?? {},
  });
});
```

### Integration with ModuleHealth

`ModuleHealth` components subscribe to `VITAL_UPDATED` and `SESSION_ENDED` to drive re-fetch counters:

```typescript
useSpineEvent('SESSION_ENDED', () => setRefreshCounter(c => c + 1));
useSpineEvent('VITAL_UPDATED', () => setRefreshCounter(c => c + 1));
```

### Spine vs. NexusHandoffService

| Use Case | Tool |
|---|---|
| Broadcast a state change to any interested subscriber | `Spine.publish()` |
| Synchronous request-response between two modules | `NexusHandoffService` |
| Guaranteed exactly-once delivery | `NexusHandoffService` |
| Fire-and-forget notification to many listeners | `Spine.publish()` |

> ❌ Do **not** use `Spine.publish()` to implement request-response. Spine is broadcast-only — it provides no reply mechanism, no acknowledgement, and no ordering guarantee for multiple subscribers.

---

## 16. Common Development Tasks

### 1. Add a New Event Type

1. Open `src/lib/types.ts`
2. Append the string literal to the `SpineEventType` union
3. Add it under the appropriate comment group (vitals, session, atlas, ledger, etc.)
4. Do **not** add it as a string literal at call sites — always reference the type

```typescript
// src/lib/types.ts
type SpineEventType =
  // ... existing ...
  | 'MY_NEW_EVENT';   // ← add here, with a comment explaining the semantics
```

### 2. Add a New Core Cascade Rule

```typescript
// src/lib/spine/cascade-rules.ts
export const CORE_CASCADE_RULES: CascadeRule[] = [
  // ... existing rules ...
  {
    id: 'my-new-rule',
    trigger: 'SOMA_READINESS_UPDATED',
    condition: (event) => Number(event.data.readiness) < 40,
    transform: (event) => ({
      type: 'REDUCE_TRAINING_LOAD',
      domain: 'B',
      priority: 'alert',
      data: {
        readiness: event.data.readiness,
        reason: 'low_readiness',
      },
    }),
  },
];
```

### 3. Register Module-Specific Cascade Rules

```typescript
// src/lib/spine/cascade-rules.ts
export function registerMyModuleCascadeRules(): void {
  // ✅ Direct import — not (window as any).Spine
  import { Spine } from '@/lib/spine/spine-event-bus';
  Spine.registerCascadeRules(MY_MODULE_CASCADE_RULES);
}

// src/App.tsx (or wherever module cascade rules are bootstrapped)
registerMyModuleCascadeRules();
```

### 4. Subscribe in a Service (Non-React)

```typescript
// src/services/my-service.ts
import { Spine } from '@/lib/spine/spine-event-bus';

let _unsubBurnout: (() => void) | null = null;

export function startListening(): void {
  _unsubBurnout = Spine.subscribe('BURNOUT_WARNING', (event) => {
    handleBurnout(event.data);
  });
}

export function stopListening(): void {
  _unsubBurnout?.();
  _unsubBurnout = null;
}
```

### 5. Publish a Schema Evolution Event

```typescript
Spine.publish({
  type: 'SCHEMA_EXTENDED',
  source: 'atlas',
  domain: 'C',
  priority: 'alert',
  data: {
    entityType: 'task',
    fieldName: 'energyCost',
    fieldType: 'number',
  },
});
```

### 6. Publish a Financial Cascade

```typescript
// Ledger publishes a transaction
Spine.publish({
  type: 'TRANSACTION_CREATED',
  source: 'ledger',
  domain: 'R',
  priority: 'alert',
  data: { amount: 450, category: 'dining', merchantId: 'rest_123' },
});

// cascade: ledger-transaction-to-budget fires automatically → BUDGET_UPDATED emitted
```

### 7. Debug the In-Memory Event Buffer

```typescript
// From the browser console or a devtools component:
import { Spine } from '@/lib/spine/spine-event-bus';

const recent = Spine.getRecentEvents();
console.table(recent.map(e => ({
  type: e.type,
  source: e.source,
  priority: e.priority,
  cascadeDepth: e.cascadeDepth ?? 0,
  ts: new Date(e.timestamp).toISOString(),
})));
```

---

## 17. Debugging Guide

### Event Not Firing — Checklist

| Symptom | Likely Cause | Fix |
|---|---|---|
| Subscriber never called | Debounce: same `type:source` within 500 ms | Wait >500 ms between publishes or change `source` |
| Subscriber never called | `minPriority` filter too high | Lower `minPriority` or raise event priority |
| `alert` events not in Firestore | `Spine.setDataLayer()` not called at bootstrap | Call `setDataLayer` before any alert event |
| `info` events missing from Firestore | Expected — `info` is never persisted | Raise to `alert` if persistence is needed |
| Memory leak in service file | Unsubscribe fn not called | Store and call the returned unsubscribe fn |
| Cascade not firing | `cascadeDepth >= 3` | Refactor cascade chain to ≤ 3 levels |
| Cascade not firing | Condition fn returns `false` | Add `console.log` inside condition fn to verify |
| Cascade not firing | Trigger type string doesn't match exactly | Compare against `SpineEventType` union — no typos |
| Event published but wrong domain | Wrong `domain` code on publish | Use the domain that matches your module (see §4) |

### Cascade Depth Debug Pattern

```typescript
// Temporarily log cascade depth in a subscriber to trace chain depth
Spine.subscribe('FLATTEN_ENERGY_WAVE', (event) => {
  console.debug('[Spine] FLATTEN_ENERGY_WAVE received', {
    source: event.source,
    cascadeDepth: event.cascadeDepth,
    data: event.data,
  });
});
```

### Verify setDataLayer Was Called

```typescript
// In App.tsx or main.tsx — add this guard during development
if (!Spine.hasDataLayer?.()) {
  console.error('[Spine] setDataLayer not called — alert/critical events will not persist');
}
```

### Trace All Events (Dev Only)

```typescript
// Subscribe to every event type for tracing — remove before committing
const ALL_TYPES: SpineEventType[] = [
  'VITAL_UPDATED', 'BURNOUT_WARNING', 'FLATTEN_ENERGY_WAVE', /* ... */
];

ALL_TYPES.forEach(type => {
  Spine.subscribe(type, (event) => {
    console.debug(`[Spine:trace] ${event.type} from ${event.source} (depth=${event.cascadeDepth ?? 0})`);
  });
});
```

---

## 18. Known Issues & Anti-Patterns

| Anti-Pattern | Risk | Correct Approach |
|---|---|---|
| Anti-Pattern | Risk | Correct Approach |
|---|---|---|
| Subscribing without storing the unsubscribe fn | Memory leak — handler accumulates indefinitely | Always `const unsub = Spine.subscribe(...)` and call `unsub()` on teardown |
| Publishing `info` events that need to survive page refresh | `info` events are not persisted — lost on page reload | Raise to `alert` or `critical` if persistence is required |
| Cascade chains deeper than 3 levels | Silently truncated — downstream events never fire | Flatten the cascade design to ≤ 3 hops |
| Using `Spine.publish()` for request-response | No reply mechanism, no ordering guarantee | Use `NexusHandoffService` for synchronous module-to-module handoffs |
| Publishing without calling `setDataLayer` first | Alert/critical events not persisted (error logged) | Ensure `Spine.setDataLayer(layer)` is called at application bootstrap |
| Using raw string literals instead of `SpineEventType` | TypeScript won't catch typos; breaks refactoring | Import `SpineEventType` from `@/lib/types` and use the union |
| Publishing under the wrong `domain` | Cascade rules that filter by domain will fail silently | Match `domain` to the owning module (see §4 Domain Codes table) |
| Expecting Firestore write to be synchronous | Persistence is fire-and-forget; `Spine.publish()` returns the event | Do not `await` Spine.publish — persistence is async internally |
| Subscribing to `info` events with `minPriority: 'alert'` | Events will be silently filtered out | Lower `minPriority` or raise event priority |
| Forgetting to call `Spine.setUser(uid)` | Events won't be persisted (no uid for path) | Call `setUser` when auth state changes |

---

## 19. Cross-Module Relationships

| Module | Relationship with Spine | Direction |
|---|---|---|
| **Agnes** | Publishes `CRISIS_DETECTED`, `SOMATIC_SESSION_COMPLETE`; receives `SOMATIC_SUPPORT_REQUESTED` | Agnes ↔ Spine |
| **Titan** | Publishes `WORKOUT_COMPLETED`, `TITAN_RECOVERY_NEEDED`, `TITAN_TRAINING_STREAK`; receives `REDUCE_TRAINING_LOAD` | Titan ↔ Spine |
| **Atlas** | Publishes `ATLAS_TASK_COMPLETED`, `ATLAS_GOAL_UPDATED`; receives `FLATTEN_ENERGY_WAVE`, `DEADLINE_CRUNCH` | Atlas ↔ Spine |
| **Ledger** | Publishes `TRANSACTION_CREATED`, `GOAL_COMPLETED`; receives `BUDGET_UPDATED` via cascade | Ledger ↔ Spine |
| **Soma** | Publishes `SOMA_BIOMARKER_COMMITTED`, `SOMA_READINESS_UPDATED`, `HEALTH_CONTEXT_STALE` | Soma → Spine |
| **GlobalSoulProvider** | Subscribes to `HEALTH_CONTEXT_STALE` → triggers NSV re-read from Firestore | Spine → GlobalSoul |
| **Nexus Orchestrator** | ActionHub handler for `broadcast_spine_event` → only AI → Spine entry point | AI → ActionHub → Spine |
| **SchedulerService** | Emits `MORNING_BRIEF`, `EVENING_CHECKIN_DUE`, `WEEKLY_REVIEW_DUE` on schedule | SchedulerService → Spine |

---

## 20. Security & Data Handling

| Rule | Detail |
|---|---|
| **No sensitive plaintext in `data`** | `SpineEvent.data` is persisted to Firestore for `alert`/`critical` events — never put raw PII, credentials, or unencrypted health data in it |
| **No direct Firestore writes from cascade handlers** | Cascade handlers should publish further events or call module services — not write Firestore directly |
| **AI events via ActionHub only** | LLM-generated Spine events must be validated and dispatched through the `broadcast_spine_event` ActionHub handler |
| **No request-response over Spine** | Spine provides no acknowledgement or reply primitives — do not use it as an RPC mechanism |
| **Unsubscribe on module teardown** | Any service or non-React subscriber must track and call its unsubscribe function to prevent handler accumulation |

---

## 21. Environment & Dependencies

| Dependency | Role |
|---|---|
| `src/lib/types.ts` | Canonical home of `SpineEventType`, `SpineEvent`, `SpineEventPayload`, `SpineDomain`, `SpineEventPriority` |
| `src/lib/spine/spine-event-bus.ts` | `SpineEventBus` class + `Spine` singleton export + `useSpineEvent` hook + `CascadeRule` interface |
| `src/lib/spine/cascade-rules.ts` | All cascade rule arrays + registration functions (`registerAgnesCascadeRules`, `registerAtlasCascadeRules`, etc.) |
| `src/lib/spine/scheduler-service.ts` | `SchedulerService` singleton for time-based Spine event triggers |
| `NexusDataLayer` | Interface required by `Spine.setDataLayer()` — provides Firestore write access |
| `ActionHub` | Bridge between Nexus Orchestrator AI output and `Spine.publish()` |
| `GlobalProjectionService` | NSV write path — modules that update NSV signals should also publish the appropriate Spine events |
| `NexusHandoffService` | Alternative for synchronous module-to-module communication where Spine is insufficient |

### Provider Stack (App.tsx Bootstrap Order)

```
1. ThemeProvider
2. DataLayerProvider
3. Router
4. AuthProvider
5. AIWrapper → AIProvider
6. NotificationProvider
7. VaultProvider
8. GlobalSoulProvider
9. AppErrorBoundary
10. AIRuntimeGate
```

### Bootstrap Services (mounted inside Router)

```typescript
// src/App.tsx — AuthenticatedApp component
<SpineRuntimeBootstrap />    // Registers cascade rules, sets dataLayer + user
<SchedulerRuntimeBootstrap /> // Starts SchedulerService, registers morning/evening/weekly schedules
<IntelligencePipelineMount /> // Intelligence pipeline initialization
<BridgeMount />               // Bridge + ReminderScheduler initialization
```

### SpineRuntimeBootstrap Initialization Order

```typescript
// 1. Register all cascade rules (order matters for deduplication)
Spine.registerCascadeRules(CORE_CASCADE_RULES);
Spine.registerCascadeRules(ATLAS_CASCADE_RULES);
Spine.registerCascadeRules(ATLAS_PLANNING_CASCADE_RULES);
Spine.registerCascadeRules(AGNES_CASCADE_RULES);
Spine.registerCascadeRules(ATLAS_FAILURE_RULES);
Spine.registerCascadeRules(SOMA_CASCADE_RULES);
Spine.registerCascadeRules(TITAN_CASCADE_RULES);
Spine.registerCascadeRules(ATLAS_MORNING_RULES);
Spine.registerCascadeRules(ATLAS_JOURNAL_RULES);

// 2. Inject data layer for persistence
Spine.setDataLayer(dataLayer);

// 3. Set user ID for persistence path
Spine.setUser(user?.uid ?? null);
```
