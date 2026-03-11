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
| **Debounce-guarded** | Duplicate events on the same `type:source` pair within 500 ms are silently dropped |
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
├── spine-event-bus.ts      — SpineEventBus class + singleton export (Spine)
├── cascade-rules.ts        — CORE_CASCADE_RULES array + registerLedgerCascadeRules()
└── (no sub-dirs)

src/lib/types.ts            — SpineEventType union, SpineEvent interface, SpineDomain,
                              SpineEventPriority — all canonical type definitions live here

src/hooks/
└── use-spine-event.ts      — useSpineEvent() React hook (auto-cleanup on unmount)

src/main.tsx  (or App.tsx)  — Bootstrap: Spine.setDataLayer(layer) MUST be called here
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
interface SpineEvent {
  id: string;                   // auto-generated UUID — do not set manually
  type: SpineEventType;         // must be a member of the SpineEventType union
  source: string;               // module ID (e.g. 'agnes') or 'cascade:<ruleId>'
  domain: SpineDomain;          // 'B' | 'E' | 'C' | 'R' | 'system'
  priority: SpineEventPriority; // 'info' | 'alert' | 'critical'
  data: Record<string, unknown>;
  timestamp: number;            // Date.now() — set automatically by the bus
  target?: string;              // optional hint for the intended consuming module
  cascadeDepth?: number;        // 0-based; auto-incremented by cascade engine
}
```

### `SpineEventPayload` — what callers pass to `Spine.publish()`

`SpineEventPayload` is `SpineEvent` **minus** `{ id, timestamp, cascadeDepth }`. The bus fills those in automatically.

```typescript
// SpineEventPayload (inferred — callers need not import it explicitly)
type SpineEventPayload = Omit<SpineEvent, 'id' | 'timestamp' | 'cascadeDepth'>;
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
Spine.publish(payload: SpineEventPayload): void
```

Publishes an event into the bus. The bus will:
1. Assign a UUID `id` and `Date.now()` `timestamp`
2. Apply the 500 ms debounce check on `${type}:${source}`
3. Fan out to all matching subscribers (synchronously in call order)
4. Persist to Firestore if priority is `alert` or `critical` (fire-and-forget, no await)
5. Run cascade rules against the event
6. Emit any cascade-produced child events (up to depth 3)

### `Spine.subscribe(type, handler, options?)`

```typescript
Spine.subscribe(
  type: SpineEventType,
  handler: (event: SpineEvent) => void,
  options?: { minPriority?: SpineEventPriority }
): () => void   // ← returns unsubscribe function — MUST be called to prevent memory leaks
```

`minPriority` filters: `'info'` passes all; `'alert'` passes `alert` + `critical`; `'critical'` passes only `critical`.

### `Spine.getRecentEvents()`

```typescript
Spine.getRecentEvents(): SpineEvent[]
// Returns the last ~50 events from the in-memory ring buffer (all priorities)
```

### `Spine.setDataLayer(layer)`

```typescript
Spine.setDataLayer(layer: NexusDataLayer): void
// MUST be called at application bootstrap — before any alert/critical events are published
// Without this, persistence silently no-ops
```

### `useSpineEvent(type, handler, options?)` — React hook

```typescript
import { useSpineEvent } from '@/lib/spine/spine-event-bus'; // or from @/hooks

useSpineEvent(
  type: SpineEventType,
  handler: (event: SpineEvent) => void,
  options?: { minPriority?: SpineEventPriority }
): void
// Subscribes on mount, unsubscribes automatically on unmount — no manual cleanup needed
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
Key:    "${event.type}:${event.source}"
Window: 500 ms

If an identical type+source pair is published within 500 ms of the previous one,
the second (and any further) event is silently dropped — no error, no log.
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
interface CascadeRule {
  id: string;                                              // unique rule identifier
  trigger: SpineEventType;                                 // listens for this event type
  condition: (event: SpineEvent) => boolean;              // guard — return false to skip
  transform: (event: SpineEvent) => Partial<SpineEvent>;  // produces the child event shape
}
```

### Cascade Depth Limit

- Max depth: **3 levels** (0-indexed, so depth 0 → 1 → 2 → ⛔ at 3)
- `cascadeDepth` is set to `0` for all events published via `Spine.publish()` directly
- Child cascades have `cascadeDepth` auto-incremented by 1
- At `cascadeDepth >= 3`, the cascade engine silently stops — no error thrown

### Cascade-Emitted Event `source` Convention

```
source: 'cascade:<ruleId>'

Examples:
  'cascade:burnout-warning'
  'cascade:burnout-flatten-wave'
  'cascade:ledger-transaction-to-budget'
```

This allows subscribers to distinguish cascade-emitted events from direct module publishes.

---

## 10. Registered Cascade Rules

### CORE_CASCADE_RULES

Defined in `src/lib/spine/cascade-rules.ts`. Registered automatically at app init (referenced from `App.tsx`).

| Rule ID | Trigger | Condition | Emits | Target |
|---|---|---|---|---|
| `burnout-warning` | `VITAL_UPDATED` | `cnsFatigue >= 8` AND `emotionalResilience <= 3` | `BURNOUT_WARNING` | — |
| `burnout-flatten-wave` | `BURNOUT_WARNING` | always | `FLATTEN_ENERGY_WAVE` | `atlas` |
| `intensity-flatten-wave` | `BLOCK_HIGH_INTENSITY` | always | `FLATTEN_ENERGY_WAVE` | `atlas` |

### Full `burnout-warning` Rule (example implementation)

```typescript
// cascade-rules.ts
{
  id: 'burnout-warning',
  trigger: 'VITAL_UPDATED',
  condition: (event) =>
    Number(event.data.cnsFatigue) >= 8 &&
    Number(event.data.emotionalResilience) <= 3,
  transform: (event) => ({
    type: 'BURNOUT_WARNING',
    domain: event.domain,
    priority: 'critical',
    data: {
      cnsFatigue: event.data.cnsFatigue,
      emotionalResilience: event.data.emotionalResilience,
      triggeredBy: event.source,
    },
  }),
}
```

### LEDGER_CASCADE_RULES

Registered via `registerLedgerCascadeRules()` — must be called explicitly in `App.tsx`.

| Rule ID | Trigger | Condition | Emits |
|---|---|---|---|
| `ledger-transaction-to-budget` | `TRANSACTION_CREATED` | `event.domain === 'ledger'` | `BUDGET_UPDATED` |
| `ledger-goal-progress-to-health` | `GOAL_PROGRESS` | `event.domain === 'ledger'` | `FINANCIAL_HEALTH_CHECK` |
| `ledger-risk-to-alert` | `RISK_DETECTED` | `event.domain === 'ledger'` | `FINANCIAL_FRICTION_CHANGED` |

> ⚠️ `registerLedgerCascadeRules()` currently uses `(window as any).Spine` — a fragile global. See §16 Known Issues for the fix.

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
  | 'ATLAS_HABIT_LOGGED'
  | 'ATLAS_GOAL_MILESTONE'
  | 'ATLAS_ENERGY_UPDATED'
  | 'ATLAS_FIELD_CREATED'
  | 'ATLAS_FIELD_DELETED'
  | 'ATLAS_FIELD_VALUE_UPDATED'

  // ── Ledger events ─────────────────────────────────────────────────────────
  | 'BUDGET_UPDATED'
  | 'GOAL_PROGRESS'
  | 'FINANCIAL_FRICTION_CHANGED'
  | 'RESONANCE_ROI_UPDATED'
  | 'FINANCIAL_PLAN_CREATED'
  | 'DOCUMENT_ANALYZED'
  | 'TRANSACTION_CREATED'
  | 'RISK_DETECTED'
  | 'FINANCIAL_HEALTH_CHECK'

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
  | 'HEALTH_CONTEXT_STALE'      // triggers GlobalSoul refresh via NSV re-read

  // ── Titan events ──────────────────────────────────────────────────────────
  | 'CYCLE_STARTED'
  | 'CYCLE_COMPLETED'
  | 'WORKOUT_COMPLETED'

  // ── AI validation ─────────────────────────────────────────────────────────
  | 'ai_validation_suggestion'
  | 'ai_contextual_validation'
  | 'ai_error_explanation'

  // ── Deprecated — sunset after 90 days ────────────────────────────────────
  | 'CLEARANCE_DENIED'          // ⚠️ deprecated — use SOMA_CLEARANCE_CHANGED
  | 'CLEARANCE_GRANTED';        // ⚠️ deprecated — use SOMA_CLEARANCE_CHANGED
```

---

## 12. Persistence

### What Gets Persisted

```
priority: 'info'     → in-memory only (getRecentEvents() ring buffer, ~50 events)
priority: 'alert'    → Firestore: spine_events/{uid}/events/{autoId}
priority: 'critical' → Firestore: spine_events/{uid}/events/{autoId}
```

### Firestore Write Behaviour

- Writes are **fire-and-forget** — `Spine.publish()` does **not** `await` the Firestore write
- If `Spine.setDataLayer()` was never called, persistence silently no-ops — no error thrown
- Each persisted document is the full `SpineEvent` object serialized as JSON

### Bootstrap Requirement

```typescript
// src/main.tsx or App.tsx — must run before any alert/critical event is published
import { Spine } from '@/lib/spine/spine-event-bus';
import { nexusDataLayer } from '@/lib/data-layer';

Spine.setDataLayer(nexusDataLayer);
```

> **Gotcha**: if you set the data layer late (after the first `alert` event fires), those early events are lost permanently — they are not buffered and retried.

---

## 13. Architecture Diagrams

### Event Flow (publish → fan-out → cascade → persist)

```
Module / Hook / AI ActionHub
         │
         │  Spine.publish(payload)
         ▼
┌─────────────────────────────────────┐
│           SpineEventBus             │
│                                     │
│  1. Assign id + timestamp           │
│  2. Debounce check (500ms window)   │──── DROPPED if duplicate type:source
│  3. Fan-out to subscribers          │
│  4. Priority gate → Firestore write │──── fire-and-forget (alert/critical only)
│  5. Cascade engine                  │
│     └─ depth < 3?                   │
│        ├─ yes → evaluate rules      │
│        │        └─ match? → child   │──── recursive Spine.publish()
│        └─ no  → stop               │
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

## 14. Integration Points

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

## 15. Common Development Tasks

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

## 16. Debugging Guide

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

## 17. Known Issues & Anti-Patterns

| Anti-Pattern | Risk | Correct Approach |
|---|---|---|
| `(window as any).Spine` in `cascade-rules.ts` | Fragile global; breaks in SSR, test isolation, and module bundling | Replace with `import { Spine } from '@/lib/spine/spine-event-bus'` |
| Subscribing without storing the unsubscribe fn | Memory leak — handler accumulates indefinitely | Always `const unsub = Spine.subscribe(...)` and call `unsub()` on teardown |
| Publishing `info` events that need to survive page refresh | `info` events are not persisted — lost on page reload | Raise to `alert` or `critical` if persistence is required |
| Cascade chains deeper than 3 levels | Silently truncated — downstream events never fire | Flatten the cascade design to ≤ 3 hops |
| Using `Spine.publish()` for request-response | No reply mechanism, no ordering guarantee | Use `NexusHandoffService` for synchronous module-to-module handoffs |
| Publishing without calling `setDataLayer` first | Alert/critical events silently not persisted | Always call `Spine.setDataLayer(layer)` at application bootstrap |
| Using raw string literals instead of `SpineEventType` | TypeScript won't catch typos; breaks refactoring | Import `SpineEventType` from `@/lib/types` and use the union |
| Publishing under the wrong `domain` | Cascade rules that filter by domain will fail silently | Match `domain` to the owning module (see §4 Domain Codes table) |
| Expecting Firestore write to be synchronous | Persistence is fire-and-forget; `Spine.publish()` returns `void` | Do not `await` Spine.publish — it has no async return |
| Subscribing to `info` events with `minPriority: 'alert'` | Events will be silently filtered out | Lower `minPriority` or raise event priority |

---

## 18. Cross-Module Relationships

| Module | Relationship with Spine | Direction |
|---|---|---|
| **Agnes** | Publishes `VITAL_UPDATED`, `BURNOUT_WARNING`, `EMOTIONAL_STATE_CHANGED` with domain `E` | Agnes → Spine |
| **Titan** | Subscribes to `BURNOUT_WARNING`, `FLATTEN_ENERGY_WAVE` to reduce training load | Spine → Titan |
| **Atlas** | Subscribes to `FLATTEN_ENERGY_WAVE`, `DEADLINE_CRUNCH`, `COGNITIVE_OVERLOAD` to adjust schedule | Spine → Atlas |
| **Ledger** | Publishes `TRANSACTION_CREATED`, subscribes to receive cascade `BUDGET_UPDATED` | Ledger ↔ Spine |
| **Soma** | Publishes `SOMA_BIOMARKER_COMMITTED`, `HEALTH_CONTEXT_STALE`, `SOMA_READINESS_UPDATED` | Soma → Spine |
| **GlobalSoulProvider** | Subscribes to `HEALTH_CONTEXT_STALE` → triggers NSV re-read from Firestore | Spine → GlobalSoul |
| **Nexus Orchestrator** | ActionHub handler for `broadcast_spine_event` → only AI → Spine entry point | AI → ActionHub → Spine |
| **ModuleHealth** | Subscribes to `VITAL_UPDATED` and `SESSION_ENDED` → counter-based re-fetch | Spine → ModuleHealth |

---

## 19. Security & Data Handling

| Rule | Detail |
|---|---|
| **No sensitive plaintext in `data`** | `SpineEvent.data` is persisted to Firestore for `alert`/`critical` events — never put raw PII, credentials, or unencrypted health data in it |
| **No direct Firestore writes from cascade handlers** | Cascade handlers should publish further events or call module services — not write Firestore directly |
| **AI events via ActionHub only** | LLM-generated Spine events must be validated and dispatched through the `broadcast_spine_event` ActionHub handler |
| **No request-response over Spine** | Spine provides no acknowledgement or reply primitives — do not use it as an RPC mechanism |
| **Unsubscribe on module teardown** | Any service or non-React subscriber must track and call its unsubscribe function to prevent handler accumulation |

---

## 20. Environment & Dependencies

| Dependency | Role |
|---|---|
| `src/lib/types.ts` | Canonical home of `SpineEventType`, `SpineEvent`, `SpineDomain`, `SpineEventPriority` |
| `src/lib/spine/spine-event-bus.ts` | `SpineEventBus` class + `Spine` singleton export + `useSpineEvent` hook |
| `src/lib/spine/cascade-rules.ts` | `CORE_CASCADE_RULES`, `registerLedgerCascadeRules()` |
| `NexusDataLayer` | Interface required by `Spine.setDataLayer()` — provides Firestore write access |
| `ActionHub` | Bridge between Nexus Orchestrator AI output and `Spine.publish()` |
| `GlobalProjectionService` | NSV write path — modules that update NSV signals should also publish the appropriate Spine events |
| `NexusHandoffService` | Alternative for synchronous module-to-module communication where Spine is insufficient |
