# AGNES — State Flow Architecture v1.0

> **Status:** SPECIFICATION — Implements State Ownership Charter v1.0  
> **Author:** System Architecture (Milestone 2)  
> **Scope:** NSV type system, ownership enforcement runtime, Spine events, cascade rules, concurrency, Forge bridge  
> **Depends On:** `STATE_OWNERSHIP_CHARTER.md` (ratified)  
> **Implements:** Charter §§2–8 at the code level  

---

## Table of Contents

1. [Updated NSV Type System](#1-updated-nsv-type-system)
2. [Ownership Enforcement Runtime](#2-ownership-enforcement-runtime)
3. [New SpineEventTypes for Atlas Planner](#3-new-spineeventtypes-for-atlas-planner)
4. [Cascade Rules — Planner Events](#4-cascade-rules--planner-events)
5. [Complete Cascade Chain Diagram](#5-complete-cascade-chain-diagram)
6. [Concurrency Model](#6-concurrency-model)
7. [Forge Soul Bridge](#7-forge-soul-bridge)

---

## 1. Updated NSV Type System

### 1.1 Design Decision: Separate `planning` Domain

**Decision:** Create a distinct `planning.*` domain rather than overloading `cognitive.*`.

**Rationale:**
- `cognitive.*` represents instantaneous mental-state metrics (focus, energy, load) — these are *snapshots* of current capacity.
- `planning.*` represents temporal commitment metrics (streaks, deadlines) — these are *trajectories* over time.
- Separating them allows cascade rules to differentiate between "mind is overloaded right now" (cognitive) and "schedule is unsustainable over time" (planning).
- The domain code changes from `'B' | 'E' | 'C' | 'R'` to `'B' | 'E' | 'C' | 'P' | 'R'`. Single-character codes keep Spine event routing terse.
- `planningLoad` and `taskCompletionRate` remain in `cognitive.*` because they describe current cognitive occupation, not schedule trajectory. This avoids a breaking migration.

### 1.2 Complete TypeScript Interfaces

```typescript
// ──────────────────────────────────────────────────────────────
// src/lib/types/nsv.ts — Neural State Vector Type System
// ──────────────────────────────────────────────────────────────

/**
 * Biological domain — physical substrate metrics.
 * Writers: Titan (cnsFatigue, sleepQuality), Soma (recoveryScore, hormonalContext)
 */
export interface NSVBiological {
  /** CNS fatigue from training load. 0 = fresh, 10 = destroyed. Owner: Titan */
  cnsFatigue: number | null;
  /** Subjective sleep quality. 0 = insomnia, 10 = perfect. Owner: Titan */
  sleepQuality: number | null;
  /** Overall recovery readiness. 0 = wrecked, 10 = fully recovered. Owner: Soma */
  recoveryScore?: number | null;
  /** Free-text hormonal context (e.g., "luteal phase", "low-T"). Owner: Soma */
  hormonalContext?: string | null;
}

/**
 * Emotional domain — psychological state metrics.
 * Writer: Agnes (exclusive)
 */
export interface NSVEmotional {
  /** Capacity to absorb emotional stressors. 0 = brittle, 10 = resilient. Owner: Agnes */
  emotionalResilience: number | null;
  /** Aggregate stress level. 0 = calm, 10 = crisis. Owner: Agnes */
  stressLoad?: number | null;
  /** Directional mood descriptor. Owner: Agnes */
  moodTrend?: string | null;
  /** Active trauma markers for therapeutic context. Owner: Agnes */
  traumaMarkers?: string[] | null;
}

/**
 * Cognitive domain — instantaneous mental-state capacity metrics.
 * Writers: Atlas (energyBudget, focusScore, activeLoad, planningLoad, taskCompletionRate),
 *          Scout (researchLoad, interestDiversity)
 */
export interface NSVCognitive {
  /** Available mental energy. 0 = depleted, 10 = overflowing. Owner: Atlas */
  energyBudget?: number | null;
  /** Current focus capacity. 0 = scattered, 10 = laser. Owner: Atlas */
  focusScore?: number | null;
  /** Current task-related cognitive load. 0 = idle, 10 = crushed. Owner: Atlas */
  activeLoad?: number | null;
  /** Open-loop + planning complexity. >8 triggers compression. Owner: Atlas */
  planningLoad?: number | null;
  /** Rolling 7-day completed/scheduled ratio. 0–1. Owner: Atlas */
  taskCompletionRate?: number | null;
  /** Research intensity. 0 = idle, 10 = deep-dive. Owner: Scout */
  researchLoad?: number | null;
  /** Breadth of active interests across knowledge domains. 0–10. Owner: Scout */
  interestDiversity?: number | null;
}

/**
 * Planning domain — temporal commitment trajectory metrics.
 * Writer: Atlas (exclusive)
 *
 * DESIGN NOTE: These are distinct from cognitive metrics because they represent
 * state-over-time (streaks, upcoming deadlines) rather than instantaneous capacity.
 */
export interface NSVPlanning {
  /** Composite habit-streak health. 0 = all broken, 10 = perfect streaks. Owner: Atlas */
  streakHealth: number | null;
  /** Urgency of nearest deadlines. 0 = clear horizon, 10 = overdue. Owner: Atlas */
  deadlinePressure: number | null;
}

/**
 * Resource domain — financial and ROI metrics.
 * Writer: Ledger (exclusive)
 */
export interface NSVResource {
  /** Financial stress level. 0 = comfortable, 10 = crisis. Owner: Ledger */
  financialFriction?: number | null;
  /** Spending-to-wellness ratio. 0 = wasteful, 1 = perfect alignment. Owner: Ledger */
  resonanceROI?: number | null;
}

/**
 * Per-field timestamps recording when each metric was last updated.
 * Keys are dot-path strings (e.g., "biological.cnsFatigue").
 */
export type NSVTimestampMap = Record<string, string>;

/**
 * The complete Neural State Vector — AGNES's nervous system.
 * 5 domains, 19 metrics, 6 writer modules.
 */
export interface NeuralStateVector {
  biological: NSVBiological;
  emotional: NSVEmotional;
  cognitive: NSVCognitive;
  planning: NSVPlanning;
  resource: NSVResource;
  lastUpdated: NSVTimestampMap;
}

/**
 * Domain code for Spine event routing.
 * B = Biological, E = Emotional, C = Cognitive, P = Planning, R = Resource
 */
export type NSVDomainCode = 'B' | 'E' | 'C' | 'P' | 'R' | 'system';

/**
 * Patch type for partial NSV updates. All domains optional.
 * Used by updateGlobalSoul() and ActionHub dispatch.
 */
export interface NeuralStateVectorPatch {
  biological?: Partial<NSVBiological>;
  emotional?: Partial<NSVEmotional>;
  cognitive?: Partial<NSVCognitive>;
  planning?: Partial<NSVPlanning>;
  resource?: Partial<NSVResource>;
  lastUpdated?: NSVTimestampMap;
}

/**
 * Fully-qualified dot-path to any NSV metric.
 * Used by ownership registry, validation, and cascade rules.
 */
export type NSVMetricPath =
  // Biological
  | 'biological.cnsFatigue'
  | 'biological.sleepQuality'
  | 'biological.recoveryScore'
  | 'biological.hormonalContext'
  // Emotional
  | 'emotional.emotionalResilience'
  | 'emotional.stressLoad'
  | 'emotional.moodTrend'
  | 'emotional.traumaMarkers'
  // Cognitive
  | 'cognitive.energyBudget'
  | 'cognitive.focusScore'
  | 'cognitive.activeLoad'
  | 'cognitive.planningLoad'
  | 'cognitive.taskCompletionRate'
  | 'cognitive.researchLoad'
  | 'cognitive.interestDiversity'
  // Planning
  | 'planning.streakHealth'
  | 'planning.deadlinePressure'
  // Resource
  | 'resource.financialFriction'
  | 'resource.resonanceROI';
```

### 1.3 Default Factory

```typescript
/**
 * Creates a zero-initialized NSV for new users or system recovery.
 * All metrics start null — the system has no assumptions about user state.
 */
export function createDefaultNSV(): NeuralStateVector {
  return {
    biological: { cnsFatigue: null, sleepQuality: null, recoveryScore: null, hormonalContext: null },
    emotional:  { emotionalResilience: null, stressLoad: null, moodTrend: null, traumaMarkers: null },
    cognitive:  { energyBudget: null, focusScore: null, activeLoad: null, planningLoad: null,
                  taskCompletionRate: null, researchLoad: null, interestDiversity: null },
    planning:   { streakHealth: null, deadlinePressure: null },
    resource:   { financialFriction: null, resonanceROI: null },
    lastUpdated: {},
  };
}
```

---

## 2. Ownership Enforcement Runtime

### 2.1 Architecture Overview

The ownership enforcement layer sits between ActionHub dispatch and the `updateGlobalSoul()` call. It is a **synchronous validation gate** — not middleware, not a hook, but a hard gate that throws on violation.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        WRITE PATH (per request)                         │
│                                                                         │
│  LLM Response                                                           │
│    │                                                                    │
│    ▼                                                                    │
│  Orchestrator.parseActions()                                            │
│    │  extracts: moduleId, actionName, payload                           │
│    ▼                                                                    │
│  ActionHub.dispatch(moduleId, actionName, payload)                      │
│    │                                                                    │
│    ▼                                                                    │
│  ┌─────────────────────────────────────────────┐                        │
│  │  OWNERSHIP VALIDATION GATE                  │  ◄── NEW: This layer  │
│  │                                             │                        │
│  │  1. Extract all NSV field paths from patch   │                        │
│  │  2. Look up owning module for each path     │                        │
│  │  3. Compare against calling moduleId        │                        │
│  │  4. REJECT if any field not owned by caller │                        │
│  │  5. ALLOW sync_vitals ONLY with staleness   │                        │
│  │     check + reason audit                    │                        │
│  └─────────────────────────────────────────────┘                        │
│    │                                                                    │
│    ▼ (only if validation passes)                                        │
│  Handler calls updateGlobalSoul(patch)                                  │
│    │                                                                    │
│    ▼                                                                    │
│  GlobalSoulContext → GlobalProjectionService → Firestore updateDoc()    │
│    │                                                                    │
│    ▼                                                                    │
│  Spine.emit(VITAL_UPDATED)                                              │
│    │                                                                    │
│    ▼                                                                    │
│  Cascade rules evaluate                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Ownership Registry

```typescript
// ──────────────────────────────────────────────────────────────
// src/lib/services/nsv-ownership.ts — Ownership Registry
// ──────────────────────────────────────────────────────────────

import type { NSVMetricPath } from '../types/nsv';

/** Module identifiers that participate in NSV writes. */
export type NSVWriterModule = 'titan' | 'soma' | 'agnes' | 'atlas' | 'scout' | 'ledger';

/**
 * The Single Writer Map.
 * Each NSV field is owned by exactly one module.
 * This is the source of truth — derived from STATE_OWNERSHIP_CHARTER §2.
 *
 * INVARIANT: Every value in NSVMetricPath appears exactly once across all arrays.
 * INVARIANT: No field appears in more than one module's array.
 */
export const NSV_OWNERSHIP: Record<NSVWriterModule, readonly NSVMetricPath[]> = {
  titan: [
    'biological.cnsFatigue',
    'biological.sleepQuality',
  ],
  soma: [
    'biological.recoveryScore',
    'biological.hormonalContext',
  ],
  agnes: [
    'emotional.emotionalResilience',
    'emotional.stressLoad',
    'emotional.moodTrend',
    'emotional.traumaMarkers',
  ],
  atlas: [
    'cognitive.energyBudget',
    'cognitive.focusScore',
    'cognitive.activeLoad',
    'cognitive.planningLoad',
    'cognitive.taskCompletionRate',
    'planning.streakHealth',
    'planning.deadlinePressure',
  ],
  scout: [
    'cognitive.researchLoad',
    'cognitive.interestDiversity',
  ],
  ledger: [
    'resource.financialFriction',
    'resource.resonanceROI',
  ],
} as const;

/**
 * Reverse index: field path → owning module.
 * Built once at module load time. O(1) lookup per field during validation.
 */
export const FIELD_TO_OWNER: ReadonlyMap<NSVMetricPath, NSVWriterModule> = (() => {
  const map = new Map<NSVMetricPath, NSVWriterModule>();
  for (const [module, fields] of Object.entries(NSV_OWNERSHIP)) {
    for (const field of fields) {
      if (map.has(field)) {
        throw new Error(
          `OWNERSHIP INVARIANT VIOLATION: Field "${field}" claimed by both ` +
          `"${map.get(field)}" and "${module}". Fix NSV_OWNERSHIP.`
        );
      }
      map.set(field, module as NSVWriterModule);
    }
  }
  return map;
})();
```

### 2.3 Validation Gate Implementation

```typescript
// ──────────────────────────────────────────────────────────────
// src/lib/services/nsv-validation.ts — Ownership Validation Gate
// ──────────────────────────────────────────────────────────────

import type { NeuralStateVectorPatch, NSVMetricPath } from '../types/nsv';
import { FIELD_TO_OWNER, type NSVWriterModule } from './nsv-ownership';

/** Structured violation for audit logging. */
export interface OwnershipViolation {
  field: NSVMetricPath;
  attemptedBy: string;
  ownedBy: NSVWriterModule;
  timestamp: string;
}

/** Result of ownership validation. */
export type ValidationResult =
  | { valid: true; fieldPaths: NSVMetricPath[] }
  | { valid: false; violations: OwnershipViolation[] };

/**
 * Extracts all dot-path field references from a NeuralStateVectorPatch.
 *
 * Given: { biological: { cnsFatigue: 8 }, planning: { streakHealth: 6 } }
 * Returns: ['biological.cnsFatigue', 'planning.streakHealth']
 */
export function extractFieldPaths(patch: NeuralStateVectorPatch): NSVMetricPath[] {
  const paths: NSVMetricPath[] = [];
  const domains = ['biological', 'emotional', 'cognitive', 'planning', 'resource'] as const;

  for (const domain of domains) {
    const domainPatch = patch[domain];
    if (domainPatch && typeof domainPatch === 'object') {
      for (const field of Object.keys(domainPatch)) {
        paths.push(`${domain}.${field}` as NSVMetricPath);
      }
    }
  }
  return paths;
}

/**
 * Validates that a module only writes to fields it owns.
 *
 * @param callerModule - The module ID attempting the write
 * @param patch - The NSV patch being applied
 * @returns ValidationResult with either success + parsed paths, or violations
 *
 * @example
 * // PASSES — Titan writing its own field
 * validateOwnership('titan', { biological: { cnsFatigue: 8 } })
 * // → { valid: true, fieldPaths: ['biological.cnsFatigue'] }
 *
 * @example
 * // FAILS — Titan trying to write Agnes's field
 * validateOwnership('titan', { emotional: { stressLoad: 5 } })
 * // → { valid: false, violations: [{ field: 'emotional.stressLoad', attemptedBy: 'titan', ownedBy: 'agnes', ... }] }
 */
export function validateOwnership(
  callerModule: string,
  patch: NeuralStateVectorPatch
): ValidationResult {
  const fieldPaths = extractFieldPaths(patch);
  const violations: OwnershipViolation[] = [];

  for (const path of fieldPaths) {
    const owner = FIELD_TO_OWNER.get(path);

    if (!owner) {
      // Unknown field — this is a schema violation, not an ownership violation.
      // Fail closed: reject writes to unknown fields.
      violations.push({
        field: path,
        attemptedBy: callerModule,
        ownedBy: 'unknown' as NSVWriterModule, // will be caught by TypeScript
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    if (owner !== callerModule) {
      violations.push({
        field: path,
        attemptedBy: callerModule,
        ownedBy: owner,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (violations.length > 0) {
    return { valid: false, violations };
  }
  return { valid: true, fieldPaths };
}
```

### 2.4 ActionHub Integration

```typescript
// ──────────────────────────────────────────────────────────────
// Integration point in ActionHub.dispatch()
// ──────────────────────────────────────────────────────────────

import { validateOwnership } from './nsv-validation';
import { logger } from '../logging';

// Inside ActionHub.dispatch():
async function dispatch(
  moduleId: string,
  actionName: string,
  payload: unknown
): Promise<ActionResult> {

  const handler = this.getHandler(moduleId, actionName);
  if (!handler) {
    return { success: false, error: `No handler: ${moduleId}.${actionName}` };
  }

  // ── OWNERSHIP GATE ──────────────────────────────────────────
  // If the action results in an NSV patch, validate BEFORE execution.
  // Handlers declare their NSV intent via metadata, or we validate
  // at the updateGlobalSoul() call site.
  // ─────────────────────────────────────────────────────────────

  const result = await handler(payload);

  // Post-execution validation: if the handler produced an NSV patch,
  // validate it before committing.
  if (result.nsvPatch) {
    const validation = validateOwnership(moduleId, result.nsvPatch);

    if (!validation.valid) {
      // LOG EVERY VIOLATION — these are bugs, not expected conditions
      logger.error('[NSV_OWNERSHIP_VIOLATION]', {
        module: moduleId,
        action: actionName,
        violations: validation.violations,
      });

      // Reject the entire write. Do NOT partially apply.
      return {
        success: false,
        error: `Ownership violation: ${moduleId} cannot write to ` +
               `[${validation.violations.map(v => v.field).join(', ')}]`,
      };
    }

    // Validation passed — commit the patch
    await updateGlobalSoul(result.nsvPatch);
  }

  return result;
}
```

### 2.5 sync_vitals Override Protocol

```typescript
// ──────────────────────────────────────────────────────────────
// Special handling for orchestrator's sync_vitals action
// ──────────────────────────────────────────────────────────────

/**
 * Valid reasons for sync_vitals override. Exhaustive list.
 * Any reason not in this list is rejected.
 */
export type SyncVitalsReason =
  | 'calibration'           // Initial user onboarding
  | 'system_recovery'       // System restart with stale state
  | 'manual_override';      // Explicit user request via UI

export interface SyncVitalsPayload {
  patch: NeuralStateVectorPatch;
  reason: SyncVitalsReason;
  /** Override only applies to fields not updated within this window. */
  stalenessThresholdMs?: number; // Default: 5 minutes (300_000)
}

/**
 * Validates sync_vitals writes. Bypasses single-writer for stale fields only.
 *
 * Rules:
 * 1. MUST provide a reason from SyncVitalsReason union
 * 2. Fields updated within stalenessThreshold are SKIPPED (module's write wins)
 * 3. All overridden fields are audit-logged with reason
 */
export function validateSyncVitals(
  payload: SyncVitalsPayload,
  currentNSV: NeuralStateVector
): { allowedPatch: NeuralStateVectorPatch; skippedFields: NSVMetricPath[] } {
  const threshold = payload.stalenessThresholdMs ?? 300_000; // 5 minutes
  const now = Date.now();
  const fieldPaths = extractFieldPaths(payload.patch);

  const allowedPatch: NeuralStateVectorPatch = {};
  const skippedFields: NSVMetricPath[] = [];

  for (const path of fieldPaths) {
    const lastUpdate = currentNSV.lastUpdated[path];
    const lastUpdateMs = lastUpdate ? new Date(lastUpdate).getTime() : 0;
    const isStale = (now - lastUpdateMs) > threshold;

    if (isStale || payload.reason === 'calibration') {
      // Allow override — field is stale or this is initial calibration
      const [domain, field] = path.split('.') as [keyof NeuralStateVectorPatch, string];
      if (!allowedPatch[domain]) {
        (allowedPatch as any)[domain] = {};
      }
      (allowedPatch as any)[domain][field] = getNestedValue(payload.patch, path);
    } else {
      // Skip — module's recent write takes precedence
      skippedFields.push(path);
    }
  }

  return { allowedPatch, skippedFields };
}
```

---

## 3. New SpineEventTypes for Atlas Planner

### 3.1 Event Type Additions

```typescript
// ──────────────────────────────────────────────────────────────
// Addition to SpineEventType union in src/lib/types.ts
// ──────────────────────────────────────────────────────────────

export type SpineEventType =
  // ── Existing Events ──────────────────────────────────────
  | 'VITAL_UPDATED'           // Any NSV field changed
  | 'BLOCK_HIGH_INTENSITY'    // CNS too high for intense work
  | 'FLATTEN_ENERGY_WAVE'     // Energy needs redistribution
  | 'COGNITIVE_OVERLOAD'      // Cognitive load exceeds capacity
  | 'EMOTIONAL_CRISIS'        // Emotional metrics critical
  | 'RESEARCH_DEEP_DIVE'      // Scout entering deep research mode
  | 'FINANCIAL_STRESS'        // Ledger detects financial pressure
  | 'RECOVERY_CRITICAL'       // Soma flags low recovery
  // ... (other existing types)

  // ── NEW: Planning Domain Events ──────────────────────────
  | 'PLANNING_OVERLOAD'       // planning.deadlinePressure ≥ 8 AND cognitive.planningLoad ≥ 8
  | 'DEADLINE_APPROACHING'    // planning.deadlinePressure ≥ 7 (warning threshold)
  | 'HABIT_STREAK_BROKEN'     // planning.streakHealth drops ≥ 3 points in single update
  | 'PLANNING_CLARITY'        // planning.deadlinePressure ≤ 3 AND cognitive.planningLoad ≤ 3
  ;                           // (positive signal — schedule is healthy)
```

### 3.2 Event Contracts

```typescript
// ──────────────────────────────────────────────────────────────
// Spine event payload contracts for new planning events
// ──────────────────────────────────────────────────────────────

/** Base interface for all Spine events. */
export interface SpineEvent<T extends SpineEventType = SpineEventType> {
  type: T;
  domain: NSVDomainCode;
  source: string;           // Module that triggered the event
  timestamp: string;        // ISO 8601
  data: SpineEventPayloads[T];
}

/** Payload types per event. */
export interface SpineEventPayloads {
  // Existing payloads (preserve backward compatibility)...
  VITAL_UPDATED: { field: NSVMetricPath; oldValue: unknown; newValue: unknown; module: string };
  BLOCK_HIGH_INTENSITY: { cnsFatigue: number; threshold: number };
  FLATTEN_ENERGY_WAVE: { energyBudget: number; cnsFatigue: number };
  COGNITIVE_OVERLOAD: { activeLoad: number; planningLoad: number; combined: number };

  // NEW: Planning domain payloads
  PLANNING_OVERLOAD: {
    deadlinePressure: number;  // Current value (≥8)
    planningLoad: number;      // Current value (≥8)
    recommendation: 'compress' | 'delegate' | 'reschedule';
  };
  DEADLINE_APPROACHING: {
    deadlinePressure: number;  // Current value (≥7)
    daysUntilNearest: number;  // Computed from task data, not NSV
    affectedTaskCount: number;
  };
  HABIT_STREAK_BROKEN: {
    previousStreakHealth: number;
    currentStreakHealth: number;
    drop: number;               // Absolute drop magnitude
    brokenHabits: string[];     // Which habits broke (from Atlas task data)
  };
  PLANNING_CLARITY: {
    deadlinePressure: number;  // Current value (≤3)
    planningLoad: number;      // Current value (≤3)
    freeCapacity: number;      // Estimated open slots
  };
}
```

### 3.3 Domain Assignment for New Events

| Event | Domain Code | Justification |
|-------|------------|---------------|
| `PLANNING_OVERLOAD` | `P` | Compound planning-domain signal |
| `DEADLINE_APPROACHING` | `P` | Schedule trajectory, not current cognition |
| `HABIT_STREAK_BROKEN` | `P` | Streak is a temporal-planning metric |
| `PLANNING_CLARITY` | `P` | Positive planning signal for opportunity routing |

---

## 4. Cascade Rules — Planner Events

### 4.1 What Are Cascade Rules?

Cascade rules are reactive event transformations: when a `VITAL_UPDATED` event fires and certain conditions are met on the current NSV, the cascade engine emits a **secondary event**. Secondary events can trigger further cascades, up to `MAX_CASCADE_DEPTH = 3`.

### 4.2 New Cascade Rule Definitions

```typescript
// ──────────────────────────────────────────────────────────────
// Addition to src/lib/spine/cascade-rules.ts
// ──────────────────────────────────────────────────────────────

import type { CascadeRule } from './types';

export const PLANNING_CASCADE_RULES: CascadeRule[] = [

  // ── Rule P1: PLANNING_OVERLOAD ───────────────────────────
  // Trigger: deadlinePressure OR planningLoad updated to high value
  // Condition: BOTH deadlinePressure ≥ 8 AND planningLoad ≥ 8
  // Effect: Emits PLANNING_OVERLOAD — signals Atlas to compress/reschedule
  {
    id: 'P1_PLANNING_OVERLOAD',
    trigger: 'VITAL_UPDATED',
    condition: (event, nsv) => {
      const isRelevantField =
        event.data.field === 'planning.deadlinePressure' ||
        event.data.field === 'cognitive.planningLoad';
      return (
        isRelevantField &&
        (nsv.planning.deadlinePressure ?? 0) >= 8 &&
        (nsv.cognitive.planningLoad ?? 0) >= 8
      );
    },
    emit: (event, nsv) => ({
      type: 'PLANNING_OVERLOAD' as const,
      domain: 'P' as const,
      source: 'cascade:P1',
      timestamp: new Date().toISOString(),
      data: {
        deadlinePressure: nsv.planning.deadlinePressure!,
        planningLoad: nsv.cognitive.planningLoad!,
        recommendation: nsv.planning.deadlinePressure! >= 9 ? 'reschedule' : 'compress',
      },
    }),
  },

  // ── Rule P2: DEADLINE_APPROACHING ────────────────────────
  // Trigger: deadlinePressure updated
  // Condition: deadlinePressure ≥ 7 (but < the OVERLOAD threshold compound)
  // Effect: Warning-level event — surfaces in Bridge alerts
  {
    id: 'P2_DEADLINE_APPROACHING',
    trigger: 'VITAL_UPDATED',
    condition: (event, nsv) => {
      return (
        event.data.field === 'planning.deadlinePressure' &&
        (nsv.planning.deadlinePressure ?? 0) >= 7
      );
    },
    emit: (event, nsv) => ({
      type: 'DEADLINE_APPROACHING' as const,
      domain: 'P' as const,
      source: 'cascade:P2',
      timestamp: new Date().toISOString(),
      data: {
        deadlinePressure: nsv.planning.deadlinePressure!,
        daysUntilNearest: -1, // Populated by Atlas handler, not cascade
        affectedTaskCount: -1, // Populated by Atlas handler, not cascade
      },
    }),
  },

  // ── Rule P3: HABIT_STREAK_BROKEN ─────────────────────────
  // Trigger: streakHealth updated
  // Condition: Drop of ≥ 3 points from previous value
  // Effect: Signals Agnes for emotional support, Atlas for plan adjustment
  {
    id: 'P3_HABIT_STREAK_BROKEN',
    trigger: 'VITAL_UPDATED',
    condition: (event, nsv) => {
      if (event.data.field !== 'planning.streakHealth') return false;
      const oldVal = (event.data.oldValue as number) ?? 10;
      const newVal = (event.data.newValue as number) ?? 0;
      return (oldVal - newVal) >= 3;
    },
    emit: (event, nsv) => ({
      type: 'HABIT_STREAK_BROKEN' as const,
      domain: 'P' as const,
      source: 'cascade:P3',
      timestamp: new Date().toISOString(),
      data: {
        previousStreakHealth: (event.data.oldValue as number) ?? 10,
        currentStreakHealth: (event.data.newValue as number) ?? 0,
        drop: ((event.data.oldValue as number) ?? 10) - ((event.data.newValue as number) ?? 0),
        brokenHabits: [], // Populated downstream by Atlas, not in cascade
      },
    }),
  },

  // ── Rule P4: PLANNING_CLARITY ────────────────────────────
  // Trigger: deadlinePressure OR planningLoad drops to low value
  // Condition: BOTH ≤ 3 — schedule is healthy, opportunity to take on new work
  // Effect: Positive signal — Scout can propose research, Atlas can suggest stretch goals
  {
    id: 'P4_PLANNING_CLARITY',
    trigger: 'VITAL_UPDATED',
    condition: (event, nsv) => {
      const isRelevantField =
        event.data.field === 'planning.deadlinePressure' ||
        event.data.field === 'cognitive.planningLoad';
      return (
        isRelevantField &&
        (nsv.planning.deadlinePressure ?? 10) <= 3 &&
        (nsv.cognitive.planningLoad ?? 10) <= 3
      );
    },
    emit: (event, nsv) => ({
      type: 'PLANNING_CLARITY' as const,
      domain: 'P' as const,
      source: 'cascade:P4',
      timestamp: new Date().toISOString(),
      data: {
        deadlinePressure: nsv.planning.deadlinePressure ?? 0,
        planningLoad: nsv.cognitive.planningLoad ?? 0,
        freeCapacity: 10 - (nsv.cognitive.activeLoad ?? 0),
      },
    }),
  },

  // ── Rule P5: PLANNING_OVERLOAD → FLATTEN_ENERGY_WAVE ─────
  // Trigger: PLANNING_OVERLOAD (secondary cascade)
  // Condition: energyBudget > 5 (energy available to redistribute)
  // Effect: Forces energy conservation when schedule is dangerously full
  // CASCADE DEPTH: 2 (VITAL_UPDATED → PLANNING_OVERLOAD → FLATTEN_ENERGY_WAVE)
  {
    id: 'P5_OVERLOAD_FLATTENS_ENERGY',
    trigger: 'PLANNING_OVERLOAD',
    condition: (event, nsv) => {
      return (nsv.cognitive.energyBudget ?? 0) > 5;
    },
    emit: (event, nsv) => ({
      type: 'FLATTEN_ENERGY_WAVE' as const,
      domain: 'C' as const,
      source: 'cascade:P5',
      timestamp: new Date().toISOString(),
      data: {
        energyBudget: nsv.cognitive.energyBudget!,
        cnsFatigue: nsv.biological.cnsFatigue ?? 0,
      },
    }),
  },
];
```

### 4.3 Cascade Rule Summary Table

| Rule ID | Trigger Event | Condition | Emits | Cascade Depth | Consumers |
|---------|--------------|-----------|-------|---------------|-----------|
| P1 | `VITAL_UPDATED` | `deadlinePressure ≥ 8 ∧ planningLoad ≥ 8` | `PLANNING_OVERLOAD` | 1 | Atlas, Bridge |
| P2 | `VITAL_UPDATED` | `deadlinePressure ≥ 7` | `DEADLINE_APPROACHING` | 1 | Atlas, Bridge |
| P3 | `VITAL_UPDATED` | `streakHealth drop ≥ 3` | `HABIT_STREAK_BROKEN` | 1 | Agnes, Atlas |
| P4 | `VITAL_UPDATED` | `deadlinePressure ≤ 3 ∧ planningLoad ≤ 3` | `PLANNING_CLARITY` | 1 | Scout, Atlas |
| P5 | `PLANNING_OVERLOAD` | `energyBudget > 5` | `FLATTEN_ENERGY_WAVE` | 2 | Atlas |

---

## 5. Complete Cascade Chain Diagram

```
═══════════════════════════════════════════════════════════════════════════════════
                    AGNES — COMPLETE CASCADE CHAIN DIAGRAM
                    (All domains, including new Planning events)
═══════════════════════════════════════════════════════════════════════════════════

                              ┌─────────────────┐
                              │  LLM RESPONSE    │
                              │  (action tags)   │
                              └───────┬─────────┘
                                      │
                                      ▼
                              ┌─────────────────┐
                              │  ORCHESTRATOR    │
                              │  parseActions()  │
                              └───────┬─────────┘
                                      │
                                      ▼
                         ┌────────────────────────┐
                         │    ACTIONHUB.dispatch() │
                         │  ┌──────────────────┐   │
                         │  │ OWNERSHIP GATE   │   │ ◄── Rejects unauthorized writes
                         │  └──────────────────┘   │
                         └────────────┬────────────┘
                                      │ (validated patch)
                                      ▼
                         ┌────────────────────────┐
                         │   updateGlobalSoul()    │
                         │   Firestore updateDoc() │
                         └────────────┬────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────────┐
                    │  Spine.emit(VITAL_UPDATED, {field}) │
                    └──────────────────┬──────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │            CASCADE ENGINE (depth limit = 3)           │
           │              500ms debounce per type+source           │
           └───────────────────────────┼───────────────────────────┘
                                       │
      ┌────────────────────────────────┼────────────────────────────────┐
      │                               │                                │
      ▼                               ▼                                ▼
 ┌─────────┐                    ┌──────────┐                     ┌──────────┐
 │BIOLOGICAL│                   │ COGNITIVE │                     │ PLANNING │
 │ DOMAIN   │                   │  DOMAIN   │                     │  DOMAIN  │
 └────┬────┘                    └─────┬────┘                     └────┬─────┘
      │                               │                                │
      │  cnsFatigue ≥ 8               │  activeLoad ≥ 7                │  deadlinePressure ≥ 7
      │  ┌──────────────────┐         │  ∧ planningLoad ≥ 7            │  ┌─────────────────────┐
      ├─▶│BLOCK_HIGH_INTENS.│         │  ┌──────────────────┐          ├─▶│DEADLINE_APPROACHING │ ──▶ Bridge
      │  └──────────────────┘         ├─▶│COGNITIVE_OVERLOAD│          │  └─────────────────────┘     (alert)
      │                               │  └──────────────────┘          │
      │  sleepQuality ≤ 3            │                                │  deadlinePressure ≥ 8
      │  ∧ cnsFatigue ≥ 6            │                                │  ∧ planningLoad ≥ 8
      │  ┌──────────────────┐         │                                │  ┌──────────────────┐
      ├─▶│RECOVERY_CRITICAL │         │                                ├─▶│PLANNING_OVERLOAD │
      │  └──────────────────┘         │                                │  └────────┬─────────┘
      │                               │                                │           │
      │  cnsFatigue ≥ 6              │                                │           │ (depth 2)
      │  ∧ energyBudget > 5          │                                │           │ energyBudget > 5
      │  ┌──────────────────┐         │                                │           ▼
      └─▶│FLATTEN_ENERGY_W. │◄────────┼────────────────────────────────┼── ┌──────────────────┐
         └──────────────────┘         │                                │   │FLATTEN_ENERGY_W. │
                                      │                                │   └──────────────────┘
                                      │                                │         (from P5)
      ┌─────────┐                     │                                │
      │EMOTIONAL│                     │                                │  streakHealth drops ≥ 3
      │ DOMAIN  │                     │                                │  ┌──────────────────┐
      └────┬────┘                     │                                ├─▶│HABIT_STREAK_BROKE│
           │                          │                                │  └────────┬─────────┘
           │  stressLoad ≥ 8          │                                │           │
           │  ∧ resilience ≤ 3        │                                │           ▼
           │  ┌──────────────────┐    │                                │  Agnes receives:
           ├─▶│EMOTIONAL_CRISIS  │    │                                │  emotional support
           │  └──────────────────┘    │                                │  context for therapy
           │                          │                                │
      ┌─────────┐                     │                                │  deadlinePressure ≤ 3
      │RESOURCE │                     │                                │  ∧ planningLoad ≤ 3
      │ DOMAIN  │                     │                                │  ┌──────────────────┐
      └────┬────┘                     │                                └─▶│PLANNING_CLARITY  │
           │                          │                                   └────────┬─────────┘
           │  financialFriction ≥ 7   │                                            │
           │  ┌──────────────────┐    │                                            ▼
           └─▶│FINANCIAL_STRESS  │    │                                   Scout: propose research
              └──────────────────┘    │                                   Atlas: suggest stretch
                                      │
                                      │  researchLoad ≥ 8
                                      │  ┌──────────────────┐
                                      └─▶│RESEARCH_DEEP_DIVE│
                                         └──────────────────┘


═══════════════════════════════════════════════════════════════════════════════════
                          CIRCULAR DEPENDENCY CHECK
═══════════════════════════════════════════════════════════════════════════════════

  VERIFIED: No circular paths exist.

  Longest cascade chain (depth 2):
    VITAL_UPDATED(deadlinePressure=9)
      → P1: PLANNING_OVERLOAD
        → P5: FLATTEN_ENERGY_WAVE
          → (no further cascades — FLATTEN_ENERGY_WAVE has no cascade triggers)

  All other chains terminate at depth 1.
  MAX_CASCADE_DEPTH = 3 provides headroom for future rules.

═══════════════════════════════════════════════════════════════════════════════════
                          EVENT CONSUMER MATRIX
═══════════════════════════════════════════════════════════════════════════════════

  Event                  │ Consumers (read-only reaction)
  ───────────────────────┼───────────────────────────────────────────
  BLOCK_HIGH_INTENSITY   │ Titan (adjusts prescription), Atlas (blocks intense tasks)
  FLATTEN_ENERGY_WAVE    │ Atlas (lowers energyBudget in next cycle)
  RECOVERY_CRITICAL      │ Soma (elevates recovery protocol), Bridge (alert)
  COGNITIVE_OVERLOAD     │ Atlas (triggers task compression), Bridge (alert)
  EMOTIONAL_CRISIS       │ Agnes (activates crisis protocol), Bridge (alert)
  RESEARCH_DEEP_DIVE     │ Scout (enters deep mode), Atlas (reserves cognitive slots)
  FINANCIAL_STRESS       │ Ledger (activates budget mode), Bridge (alert)
  PLANNING_OVERLOAD      │ Atlas (compress/reschedule), Bridge (alert)
  DEADLINE_APPROACHING   │ Atlas (prioritize), Bridge (notification)
  HABIT_STREAK_BROKEN    │ Agnes (emotional support), Atlas (rebuild plan)
  PLANNING_CLARITY       │ Scout (propose exploration), Atlas (stretch goals)
  ───────────────────────┴───────────────────────────────────────────

  NOTE: Consumers react by modifying their OWN behavior or their OWN NSV fields.
  No consumer ever writes to another module's fields in response to an event.

═══════════════════════════════════════════════════════════════════════════════════
```

---

## 6. Concurrency Model

### 6.1 The Problem

AGNES is a single-user application served via Firestore. Concurrency concerns arise from:

1. **Multiple module writes within a single LLM response** — one response can contain 2–3 action tags targeting different modules.
2. **sync_vitals vs. module writes** — orchestrator calibration racing with a module update.
3. **Client-side re-renders** — React context reading NSV while a write is in flight.
4. **Cascade side effects** — a cascade rule reading NSV state while another module's write hasn't landed yet.

### 6.2 Chosen Strategy: Field-Level Last-Write-Wins + Single-Writer Enforcement

```
┌──────────────────────────────────────────────────────────────────┐
│                    CONCURRENCY STRATEGY                          │
│                                                                  │
│   Model: Field-level Last-Write-Wins                             │
│   Guard: Single-Writer Principle (structural prevention)         │
│   Firestore: updateDoc() with merge — atomic at document level   │
│                                                                  │
│   WHY NOT Firestore transactions?                                │
│   ─────────────────────────────────────────────────              │
│   • Transactions add ~100-200ms latency per write                │
│   • Single-Writer Principle already prevents field conflicts     │
│   • Transactions solve read-modify-write races, but AGNES        │
│     writes are set-to-value, not increment-by-delta              │
│   • Transaction retries can cause UX jank in real-time UI        │
│                                                                  │
│   WHY NOT optimistic locking (version counters)?                 │
│   ─────────────────────────────────────────────                  │
│   • Requires read-before-write on every update                   │
│   • Adds complexity without benefit — field ownership already    │
│     guarantees no two modules write the same field               │
│   • Version conflicts would be false positives (two modules     │
│     updating different fields in the same document)              │
│                                                                  │
│   WHEN TO USE Firestore transactions (future):                   │
│   ─────────────────────────────────────────────                  │
│   • If AGNES ever supports multi-user (e.g., coach+client)      │
│   • If a metric becomes computed (read-modify-write pattern)     │
│   • If cross-document consistency is needed (e.g., NSV + tasks)  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Write Ordering Guarantees

```typescript
// ──────────────────────────────────────────────────────────────
// Write orchestration within a single LLM response
// ──────────────────────────────────────────────────────────────

/**
 * When the LLM response contains multiple action tags:
 *
 *   <action type="update_cns_fatigue">{"value": 8}</action>
 *   <action type="update_streak_health">{"value": 4}</action>
 *   <action type="update_stress_load">{"value": 7}</action>
 *
 * ActionHub processes them SEQUENTIALLY (not in parallel):
 *
 *   for (const action of parsedActions) {
 *     await ActionHub.dispatch(action.moduleId, action.name, action.payload);
 *   }
 *
 * This guarantees:
 * 1. Each write sees the result of the previous write in Firestore
 * 2. Cascade rules from write N complete before write N+1 begins
 * 3. The NSV state is consistent at each step
 *
 * IMPORTANT: We do NOT batch-merge multiple patches into one Firestore write.
 * Each action produces its own updateDoc() call. This is intentional:
 * - Each write triggers its own VITAL_UPDATED event
 * - Each VITAL_UPDATED can trigger different cascade rules
 * - Batching would skip intermediate cascade evaluations
 */
```

### 6.4 Race Condition Prevention Matrix

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  RACE CONDITION ANALYSIS                                │
├──────────────────────────┬──────────────────────────────────────────────┤
│ Scenario                 │ Prevention                                  │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Two modules write same   │ IMPOSSIBLE — Single Writer Principle.       │
│ field simultaneously     │ Ownership gate rejects at runtime.          │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Two modules write diff   │ SAFE — Firestore updateDoc() with nested   │
│ fields simultaneously    │ field paths. Both writes succeed. No data   │
│                          │ loss. (Firestore guarantees atomicity at    │
│                          │ the document level for individual ops.)     │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Cascade reads NSV while  │ SAFE — Cascades run synchronously in the   │
│ another write is pending │ same event loop tick as the triggering      │
│                          │ write. The NSV snapshot is consistent.      │
├──────────────────────────┼──────────────────────────────────────────────┤
│ React re-render during   │ ACCEPTABLE — React reads from              │
│ Firestore write          │ GlobalSoulContext (local state). The local  │
│                          │ state is updated optimistically before the  │
│                          │ Firestore write completes. Firestore        │
│                          │ onSnapshot listener reconciles if needed.   │
├──────────────────────────┼──────────────────────────────────────────────┤
│ sync_vitals races with   │ HANDLED — Staleness check (§2.5). Module's │
│ module write             │ recent write wins if within 5-min window.   │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Two browser tabs open    │ SAFE — Firestore onSnapshot provides       │
│ simultaneously           │ real-time sync across tabs. Both tabs see   │
│                          │ the same state within ~1-2 seconds.         │
├──────────────────────────┼──────────────────────────────────────────────┤
│ Cascade storm (infinite  │ PREVENTED — 500ms debounce per             │
│ event loop)              │ type+source + MAX_CASCADE_DEPTH = 3.       │
│                          │ Verified: no circular paths exist (§5).    │
└──────────────────────────┴──────────────────────────────────────────────┘
```

### 6.5 Optimistic Local Update Pattern

```typescript
// ──────────────────────────────────────────────────────────────
// Optimistic update flow in GlobalSoulContext
// ──────────────────────────────────────────────────────────────

/**
 * Write path uses optimistic local update + Firestore write:
 *
 * 1. Update local React state immediately (optimistic)
 * 2. Fire Spine event from local state (cascade rules evaluate immediately)
 * 3. Write to Firestore (async, may take 50-200ms)
 * 4. Firestore onSnapshot confirms write (usually a no-op since local matches)
 *
 * This means UI reflects changes instantly. If Firestore write fails:
 * - onSnapshot will NOT fire with the new value
 * - Local state remains optimistically updated (acceptable for single-user)
 * - Next successful write will overwrite with fresh data
 * - For critical failures: retry with exponential backoff (max 3 retries)
 */

async function updateGlobalSoul(patch: NeuralStateVectorPatch): Promise<void> {
  // 1. Compute idempotent lastUpdated timestamps
  const fieldPaths = extractFieldPaths(patch);
  const timestampPatch: NSVTimestampMap = {};
  const now = new Date().toISOString();

  for (const path of fieldPaths) {
    const currentValue = getNestedValue(currentNSV, path);
    const newValue = getNestedValue(patch, path);
    if (currentValue !== newValue) {
      timestampPatch[path] = now;
    }
  }

  const fullPatch = { ...patch, lastUpdated: { ...timestampPatch } };

  // 2. Optimistic local update
  const previousNSV = { ...currentNSV };
  setLocalNSV(applyPatch(currentNSV, fullPatch));

  // 3. Emit Spine events (cascade rules evaluate synchronously)
  for (const path of fieldPaths) {
    const oldValue = getNestedValue(previousNSV, path);
    const newValue = getNestedValue(fullPatch, path);
    if (oldValue !== newValue) {
      Spine.emit({
        type: 'VITAL_UPDATED',
        domain: domainCodeFromPath(path),
        source: 'updateGlobalSoul',
        timestamp: now,
        data: { field: path, oldValue, newValue, module: currentModule },
      });
    }
  }

  // 4. Firestore write (non-blocking from UI perspective)
  try {
    await updateDoc(globalSoulRef, flattenToFirestorePaths(fullPatch));
  } catch (error) {
    logger.error('[NSV_WRITE_FAILED]', { patch: fullPatch, error });
    // Retry logic here — but do NOT roll back local state
    // (next successful write will reconcile)
  }
}
```

---

## 7. Forge Soul Bridge

### 7.1 Architecture Context

Forge is separating from AGNES into its own product (a developer tools SPA). However, Forge needs **read-only access** to certain NSV metrics to provide context-aware developer experiences (e.g., "don't suggest complex refactoring when cnsFatigue is high").

### 7.2 Design Principles

1. **Read-only** — Forge MUST NOT write to AGNES's NSV. Ever.
2. **Subset exposure** — Forge receives a curated projection, not the full NSV.
3. **Eventually consistent** — Forge can tolerate 1–5 second staleness.
4. **Authentication boundary** — Same Firebase user, different SPA. Shared auth token.
5. **No direct Firestore access** — Forge reads via an API gateway, not raw Firestore.

### 7.3 Interface Architecture

```
═══════════════════════════════════════════════════════════════════════════════════
                        FORGE SOUL BRIDGE — DATA FLOW
═══════════════════════════════════════════════════════════════════════════════════

  ┌───────────────────┐          ┌─────────────────────────┐
  │   AGNES SPA       │          │   FORGE SPA             │
  │                   │          │   (separate product)    │
  │  ┌─────────────┐  │          │                         │
  │  │ Full NSV    │  │          │  ┌───────────────────┐  │
  │  │ (19 fields) │  │          │  │ ForgeSoulView     │  │
  │  └──────┬──────┘  │          │  │ (read-only, 6     │  │
  │         │         │          │  │  curated fields)  │  │
  │         │ write   │          │  └─────────┬─────────┘  │
  │         ▼         │          │            ▲             │
  │  ┌─────────────┐  │          │            │ read       │
  │  │ Firestore   │  │          │            │            │
  │  │ global_souls│──┼──────────┼────────────┘            │
  │  └─────────────┘  │          │   via Soul Bridge API   │
  │                   │          │   (Cloud Function)      │
  └───────────────────┘          └─────────────────────────┘
                │                          ▲
                │                          │
                ▼                          │
        ┌───────────────────────────────────┐
        │     SOUL BRIDGE CLOUD FUNCTION    │
        │                                   │
        │  • Reads global_souls document    │
        │  • Projects to ForgeSoulView      │
        │  • Returns curated subset         │
        │  • Validates Firebase auth token  │
        │  • Rate-limited: 1 req/5 sec      │
        │  • Caches projection for 5 sec    │
        └───────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════
```

### 7.4 TypeScript Contracts

```typescript
// ──────────────────────────────────────────────────────────────
// src/lib/forge-bridge/types.ts — Forge Soul Bridge contracts
// ──────────────────────────────────────────────────────────────

/**
 * The curated NSV subset exposed to Forge.
 * ONLY metrics that affect developer tool behavior.
 *
 * SECURITY: No emotional or financial data crosses the bridge.
 * PRIVACY: traumaMarkers, moodTrend, financialFriction are NEVER exposed.
 */
export interface ForgeSoulView {
  /** Physical readiness signal. Forge uses this to gate complex suggestions. */
  cnsFatigue: number | null;
  /** Mental energy available. Forge sizes task suggestions accordingly. */
  energyBudget: number | null;
  /** Current focus capacity. Forge adjusts interruption frequency. */
  focusScore: number | null;
  /** Current task load. Forge avoids adding work when load is high. */
  activeLoad: number | null;
  /** Schedule pressure. Forge prioritizes deadline-relevant suggestions. */
  deadlinePressure: number | null;
  /** How recently this data was refreshed. */
  lastSyncedAt: string;  // ISO 8601
}

/**
 * Fields from full NSV that map to ForgeSoulView.
 * This is the projection whitelist — nothing else crosses the bridge.
 */
export const FORGE_BRIDGE_WHITELIST: readonly NSVMetricPath[] = [
  'biological.cnsFatigue',
  'cognitive.energyBudget',
  'cognitive.focusScore',
  'cognitive.activeLoad',
  'planning.deadlinePressure',
] as const;

/**
 * Fields EXPLICITLY DENIED from crossing the bridge.
 * Documented for security audit purposes.
 */
export const FORGE_BRIDGE_DENYLIST: readonly NSVMetricPath[] = [
  'emotional.emotionalResilience',
  'emotional.stressLoad',
  'emotional.moodTrend',
  'emotional.traumaMarkers',
  'resource.financialFriction',
  'resource.resonanceROI',
  'biological.hormonalContext',
] as const;
```

### 7.5 Cloud Function Implementation Sketch

```typescript
// ──────────────────────────────────────────────────────────────
// functions/src/forge-bridge.ts — Cloud Function endpoint
// ──────────────────────────────────────────────────────────────

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { ForgeSoulView } from '../../src/lib/forge-bridge/types';
import { FORGE_BRIDGE_WHITELIST } from '../../src/lib/forge-bridge/types';

// In-memory cache per user (Cloud Function instance lifetime)
const projectionCache = new Map<string, { view: ForgeSoulView; cachedAt: number }>();
const CACHE_TTL_MS = 5_000; // 5 seconds

export const forgeSoulBridge = onRequest(
  { cors: true, region: 'us-central1' },
  async (req, res) => {
    // 1. Authenticate — same Firebase user, different SPA
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing auth token' });
      return;
    }

    let uid: string;
    try {
      const token = authHeader.split('Bearer ')[1];
      const decoded = await getAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      res.status(403).json({ error: 'Invalid auth token' });
      return;
    }

    // 2. Check cache
    const cached = projectionCache.get(uid);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      res.json(cached.view);
      return;
    }

    // 3. Read full NSV from Firestore
    const db = getFirestore();
    const doc = await db.collection('global_souls').doc(uid).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'No soul data found' });
      return;
    }

    const nsv = doc.data() as NeuralStateVector;

    // 4. Project to ForgeSoulView (whitelist-only)
    const view: ForgeSoulView = {
      cnsFatigue: nsv.biological?.cnsFatigue ?? null,
      energyBudget: nsv.cognitive?.energyBudget ?? null,
      focusScore: nsv.cognitive?.focusScore ?? null,
      activeLoad: nsv.cognitive?.activeLoad ?? null,
      deadlinePressure: nsv.planning?.deadlinePressure ?? null,
      lastSyncedAt: new Date().toISOString(),
    };

    // 5. Cache and return
    projectionCache.set(uid, { view, cachedAt: Date.now() });
    res.json(view);
  }
);
```

### 7.6 Forge Client SDK

```typescript
// ──────────────────────────────────────────────────────────────
// forge-app/src/lib/soul-bridge-client.ts — Forge-side client
// ──────────────────────────────────────────────────────────────

import type { ForgeSoulView } from '@agnes/forge-bridge-types';

const BRIDGE_URL = import.meta.env.VITE_SOUL_BRIDGE_URL;
const POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Forge Soul Bridge client.
 *
 * Polls the Soul Bridge Cloud Function for curated NSV data.
 * Exposes a reactive store (Svelte store, React context, or similar).
 *
 * SECURITY PROPERTIES:
 * - Read-only — no methods to write back to AGNES NSV
 * - Authenticated — requires valid Firebase ID token
 * - Rate-limited — server enforces 1 req/5 sec per user
 * - Subset only — server projects; client cannot request additional fields
 */
export class SoulBridgeClient {
  private _view: ForgeSoulView | null = null;
  private _listeners: Set<(view: ForgeSoulView) => void> = new Set();
  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private getIdToken: () => Promise<string>) {}

  async fetchOnce(): Promise<ForgeSoulView> {
    const token = await this.getIdToken();
    const response = await fetch(BRIDGE_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Soul Bridge error: ${response.status}`);
    }

    this._view = await response.json();
    this._listeners.forEach(fn => fn(this._view!));
    return this._view;
  }

  /** Start polling for NSV updates. Call stopPolling() to clean up. */
  startPolling(): void {
    this.fetchOnce(); // Initial fetch
    this._pollTimer = setInterval(() => this.fetchOnce(), POLL_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  /** Subscribe to NSV view updates. Returns unsubscribe function. */
  subscribe(listener: (view: ForgeSoulView) => void): () => void {
    this._listeners.add(listener);
    if (this._view) listener(this._view); // Emit current value
    return () => this._listeners.delete(listener);
  }

  /** Current view snapshot. May be null if not yet fetched. */
  get current(): ForgeSoulView | null {
    return this._view;
  }
}
```

### 7.7 Future Evolution: Real-Time Bridge

The polling approach (§7.6) is sufficient for MVP. When Forge needs lower latency:

```
Phase 1 (Current):  Polling — 30-second intervals, 5-second server cache
Phase 2 (Future):   Firestore onSnapshot via shared subcollection
                    ─ Create `forge_projections/{uid}` collection
                    ─ AGNES writes projected ForgeSoulView on NSV change
                    ─ Forge subscribes via onSnapshot (real-time, ~1s latency)
                    ─ Security rule: Forge can only READ, never WRITE

Phase 3 (Scale):    Firebase Extensions or Cloud Functions trigger
                    ─ Firestore onWrite trigger on global_souls
                    ─ Cloud Function projects + writes to forge_projections
                    ─ Fully decoupled — AGNES doesn't know about Forge
```

---

## Appendix A: Migration Checklist Cross-Reference

This architecture implements the following Charter §8 items:

| Charter Item | Architecture Section | Status |
|-------------|---------------------|--------|
| §8 Phase 1: NSV Schema Update | §1 — Updated NSV Type System | ✅ Specified |
| §8 Phase 2: Ownership Registry | §2 — Ownership Enforcement Runtime | ✅ Specified |
| §8 Phase 3: Cascade Rules | §4 — Cascade Rules, §5 — Diagram | ✅ Specified |
| §8 Phase 4: Action Handlers | §2.4 — ActionHub Integration | ✅ Specified |
| §8 Phase 6: Forge Separation | §7 — Forge Soul Bridge | ✅ Specified |
| §8 Phase 7: Firestore Schema | §6 — Concurrency Model | ✅ Specified |

---

## Appendix B: Invariant Verification Checklist

Before implementation, verify:

- [ ] **No circular dependencies** in cascade rules (verified in §5 diagram)
- [ ] **Every NSVMetricPath** appears exactly once in NSV_OWNERSHIP (enforced by FIELD_TO_OWNER builder)
- [ ] **No cascade chain exceeds depth 3** (longest is 2: VITAL_UPDATED → PLANNING_OVERLOAD → FLATTEN_ENERGY_WAVE)
- [ ] **Forge bridge exposes no emotional/financial data** (enforced by FORGE_BRIDGE_WHITELIST + DENYLIST)
- [ ] **sync_vitals cannot override fresh writes** (enforced by staleness check in §2.5)
- [ ] **All NSV writes go through ownership gate** (enforced at ActionHub.dispatch level in §2.4)
- [ ] **Cascade events are fire-and-forget** (no await, no response expected)
- [ ] **lastUpdated only advances on value change** (idempotency check in §6.5)

---

> **This document is the technical implementation contract for AGNES's state flow.**  
> All code implementing NSV writes, cascade rules, or cross-product bridges MUST conform to these interfaces.  
> Deviations require architecture review.

---

*Document version: 1.0*  
*Companion to: STATE_OWNERSHIP_CHARTER v1.0*  
*Word count: ~5,200*  
*Last updated: 2025-01-20*
