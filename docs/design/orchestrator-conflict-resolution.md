# NexusSynthesisService — Conflict Resolution Design

**Status:** Design Complete — Ready for Implementation  
**Spike ID:** S1-011  
**Owner:** Orchestrator / Nexus Module  
**Source File:** `src/modules/orchestrator/hooks/useNexusSynthesis.ts`  
**Related:** `src/lib/spine/cascade-rules.ts`, `src/lib/services/nsv-ownership.ts`, `src/lib/actions/action-hub.ts`

---

## 1. Purpose & Scope

`useNexusSynthesis` currently detects 8 cross-domain patterns and returns up to 3 `SynthesisAlert` objects. This spike deepens it into a full `NexusSynthesisService` with:

1. **Conflict zone detection** across all NSV dimension pairs
2. **Priority resolution** — explicit rules for which module wins when they conflict
3. **Pre-dispatch surfacing** — UI flow that shows conflicts BEFORE a user message is sent
4. **Scoped conversation UX** — keeping context across multi-domain queries
5. **Cross-module scheduling API** — Nexus scheduling actions that span module boundaries

**Out of scope:** New detection ML; changes to module LLM prompts; changes to existing cascade rules.

---

## 2. Conflict Zone Matrix

All NSV dimension pairs that carry meaningful conflict potential. `HIGH` = user-facing intercept required; `MEDIUM` = synthesis alert only; `LOW` = logged, no UI action.

| Conflict ID | Domain A (Owner) | Domain B (Owner) | Conflict Condition | Impact Level |
|---|---|---|---|---|
| `TITAN_AGNES_INTENSITY` | `biological.cnsFatigue` (Titan) | `emotional.emotionalResilience` (Agnes) | cnsFatigue >= 7 AND resilience <= 4 | HIGH |
| `TITAN_ATLAS_LOAD` | `biological.cnsFatigue` (Titan) | `cognitive.planningLoad` (Atlas) | cnsFatigue >= 7 AND planningLoad >= 7 | HIGH |
| `AGNES_ATLAS_CAPACITY` | `emotional.stressLoad` (Agnes) | `cognitive.activeLoad` (Atlas) | stress >= 7 AND activeLoad >= 8 | HIGH |
| `LEDGER_AGNES_LOOP` | `resource.financialFriction` (Ledger) | `emotional.stressLoad` (Agnes) | friction >= 7 AND stress >= 6 | HIGH |
| `TITAN_LEDGER_RECOVERY` | `biological.recoveryScore` (Titan) | `resource.financialFriction` (Ledger) | recovery <= 3 AND friction >= 8 | MEDIUM |
| `ATLAS_SCOUT_HYPERFOCUS` | `cognitive.planningLoad` (Atlas) | `cognitive.interestDiversity` (Scout) | planningLoad >= 8 AND interestDiversity <= 2 | MEDIUM |
| `TITAN_ATLAS_DEADLINE` | `biological.cnsFatigue` (Titan) | `planning.deadlinePressure` (Atlas) | cnsFatigue >= 8 AND deadlinePressure >= 8 | HIGH |
| `AGNES_TITAN_SLEEP` | `biological.sleepQuality` (Titan) | `emotional.emotionalResilience` (Agnes) | sleepQuality <= 3 AND resilience <= 4 | HIGH |
| `ATLAS_LEDGER_COGNITIVE` | `cognitive.activeLoad` (Atlas) | `resource.financialFriction` (Ledger) | activeLoad >= 8 AND friction >= 6 | MEDIUM |
| `COMPOUND_3WAY` | biological + emotional + resource | All three domains | cnsFatigue >= 7 AND stress >= 7 AND friction >= 6 | HIGH (CRISIS) |
| `RECOVERY_WINDOW_POSITIVE` | `biological.recoveryScore` (Titan) | `emotional.stressLoad` (Agnes) | recovery >= 7 AND stress <= 3 | LOW (positive) |

---

## 3. Priority Resolution Rules

When two modules conflict, Nexus applies these rules in order. The "winning" module's recommendation is surfaced first; the other is presented as a constraint.

### Rule Table (Precedence: higher row wins)

| Priority | Rule Name | Condition | Winner | Loser Constraint |
|---|---|---|---|---|
| 1 | **Safety Override** | Any CRISIS_MODE or MEDICAL_ALERT cascade active | Titan (biological safety) | All other modules yield |
| 2 | **Burnout Block** | BURNOUT_WARNING emitted in last 30min | Agnes (emotional safety) | Titan yields on intensity; Atlas yields on planning |
| 3 | **Clearance Gate** | BLOCK_HIGH_INTENSITY active | Titan | Atlas cannot schedule high-energy tasks |
| 4 | **Emotional Resilience Floor** | emotionalResilience <= 3 | Agnes | Ledger defers complex financial decisions; Atlas reduces to ≤3 tasks |
| 5 | **Cognitive Overload** | planningLoad >= 8 AND activeLoad >= 8 | Atlas | Scout defers new research threads |
| 6 | **Financial Crisis** | financialFriction >= 9 | Ledger | Atlas reduces discretionary tasks; Agnes prioritizes financial stress therapy |
| 7 | **Recovery Window** | recovery >= 7 AND stress <= 3 | Titan (positive: suggest intensity) | Agnes endorses; Atlas creates high-energy task window |

### Mediation Output Format

When Nexus mediates a conflict, it produces a `ConflictResolution` object:

```typescript
interface ConflictResolution {
  conflictId: string;             // from Conflict Zone Matrix
  winner: ModuleId;               // module whose recommendation takes priority
  loser: ModuleId;                // module whose recommendation is constrained
  winnerRecommendation: string;   // plain-language recommendation from winner
  loserConstraint: string;        // what the loser module must yield on
  mediatorSummary: string;        // Nexus explanation for the user
  suggestedActions: SynthesisAction[];
  priority: 'critical' | 'warning' | 'info';
  resolvedAt: number;             // timestamp
}
```

---

## 4. Pre-Dispatch Surfacing — UI Flow

This is the mechanism by which conflicts are shown **before** the user sends a message (passive surfacing) or **before** an action executes (active intercept).

### 4.1 Passive Surfacing (Dashboard Panel)

Rendered in the existing Nexus "⚡ Nexus Synthesis" panel. No changes to component location needed.

**Current:** `alerts: SynthesisAlert[]` from `useNexusSynthesis()` (max 3)  
**Enhanced:** `conflicts: ConflictResolution[]` from `useNexusSynthesisService()` (max 3, sorted by priority)

**Panel layout (enhanced):**

```
┌─────────────────────────────────────────────────────────┐
│ ⚡ NEXUS SYNTHESIS          [collapse]  [2 conflicts]    │
├─────────────────────────────────────────────────────────┤
│ 🔴 TITAN ↔ AGNES — Intensity Conflict                   │
│ High CNS fatigue + low emotional resilience.            │
│ Titan recommends deload. Agnes needs grounding first.   │
│ [Ask Nexus] [Consult Titan] [Consult Agnes]             │
├─────────────────────────────────────────────────────────┤
│ 🟡 ATLAS ↔ LEDGER — Cognitive-Financial Loop            │
│ Planning overload is amplifying financial friction.     │
│ [Ask Nexus] [Open Atlas] [Open Ledger]                  │
└─────────────────────────────────────────────────────────┘
```

**Render rule:** If `conflicts.length === 0` AND `alerts.length === 0`, hide the panel entirely (no empty state shown).

### 4.2 Pre-Dispatch Chat Intercept

**Trigger:** User types in the Nexus chat input area (before sending). The `NexusInputBar` component watches the input value and checks against active conflicts.

**Mechanism:**

```typescript
// In NexusInputBar or parent chat component:
const { conflicts } = useNexusSynthesisService();

function getRelevantConflict(inputText: string, conflicts: ConflictResolution[]): ConflictResolution | null {
  // Keyword → domain mapping
  const domainKeywords: Record<string, string[]> = {
    biological: ['workout', 'train', 'lift', 'run', 'exercise', 'intensity'],
    emotional: ['feel', 'anxious', 'stressed', 'overwhelmed', 'sad', 'therapy'],
    cognitive: ['plan', 'task', 'schedule', 'deadline', 'focus', 'work'],
    resource: ['spend', 'budget', 'money', 'bill', 'debt', 'save'],
  };
  // If input text matches keywords for domains involved in an active HIGH conflict → return that conflict
  // Return the highest-priority matching conflict
}
```

**UI Behaviour:**

When a relevant conflict is detected while the user is typing (debounced 800ms):

```
[Nexus Input Bar]
┌─────────────────────────────────────────────────────────┐
│ ⚠ Conflict detected: Titan ↔ Agnes (Intensity/Resilience)│
│ Your question may touch a live conflict. Nexus will      │
│ mediate. [Learn more ↓]  [Dismiss]                       │
└─────────────────────────────────────────────────────────┘
│ Type your message...                               [Send] │
```

- The banner appears **above** the text input, not blocking it
- "Learn more" expands an inline card with the full `ConflictResolution` details
- "Dismiss" snoozes the banner for 10 minutes (not the underlying conflict)
- Banner does NOT block send — it is informational, not gating

### 4.3 Post-Send Conflict Framing

After the user sends a message that touches a conflict domain, Nexus prepends conflict context to its own LLM system prompt (not visible to user):

```
[CONFLICT CONTEXT - DO NOT SURFACE VERBATIM]
Active conflict: TITAN_AGNES_INTENSITY
Titan recommendation: Deload. cnsFatigue=8.
Agnes constraint: Emotional resilience too low for high-intensity stress.
Nexus mediation: Suggest light movement (walk, stretch) that serves both biological recovery and emotional regulation.
Resolve in favor of: Agnes (safety rule 2 — emotional resilience floor).
```

This shapes the response without Nexus explicitly saying "I detected a conflict" — the mediated recommendation just naturally appears.

---

## 5. Scoped Conversation UX

Multi-domain queries (e.g., "I want to plan my week, manage my stress, and sort out my budget") must not lose context as the user bounces between topics within a single Nexus session.

### 5.1 Conversation Scope Object

```typescript
interface NexusConversationScope {
  sessionId: string;
  activeModules: ModuleId[];         // domains currently "open" in this conversation
  domainContext: Record<ModuleId, {
    lastReferencedAt: number;
    keyFacts: string[];              // extracted from conversation for this domain
    pendingActions: string[];        // actions proposed but not yet executed
  }>;
  activeConflicts: ConflictResolution[];
  scopeCreatedAt: number;
  lastActivityAt: number;
}
```

**Scope is ephemeral** (session-scoped only, not persisted to Firestore). It lives in React state (`useNexusSynthesisService` hook).

### 5.2 Scope Lifecycle

```
User sends first message
  → Nexus infers relevant domains from intent
  → scope.activeModules = [inferred domains]

User references a second domain mid-conversation
  → domain added to scope.activeModules
  → domain context populated with key facts from conversation

User asks about a module directly ("What does Atlas think?")
  → Nexus queries Atlas context via existing `delegateToModule` / module handoff
  → Response from Atlas injected into conversation as module-tagged message
  → Atlas domain context updated in scope

Conversation ends (user navigates away or 30min inactivity)
  → Scope cleared
  → Session summary written to module_memory via existing SessionEventSummary pattern
```

### 5.3 Context Injection (LLM System Prompt Addition)

For each active domain in scope, Nexus appends a section to its system prompt:

```
[SCOPED CONTEXT: ATLAS]
Key facts from this session:
- User mentioned 3 overdue tasks
- User confirmed planningLoad is high
Pending actions: atlas_flatten_wave (proposed, not confirmed)

[SCOPED CONTEXT: AGNES]  
Key facts from this session:
- User described feeling overwhelmed
- Emotional resilience last reported: 4/10
```

**Max context budget:** 500 tokens across all scoped domains (trim `keyFacts` to most recent 3 per domain if over budget).

---

## 6. Cross-Module Scheduling API

Nexus needs to schedule actions that span module boundaries. This is handled by a new `NexusCrossModuleScheduler` (thin utility, not a full service).

### Use Case: Schedule Therapy Check-in After Missed Workouts

**Trigger scenario:** Titan detects 3+ missed workouts in 7 days (`WORKOUT_COMPLETED` events absent). Agnes needs to do a check-in.

```typescript
interface CrossModuleScheduledAction {
  id: string;
  triggerEvent: SpineEventType;     // the event that fires this action
  triggerCondition: (event: SpineEvent, nsv: NeuralStateVector) => boolean;
  targetModule: ModuleId;
  actionType: string;               // ActionHub action type to execute
  actionPayload: Record<string, unknown>;
  scheduledAt: number;
  executedAt?: number;
  status: 'pending' | 'executed' | 'cancelled';
  rationale: string;                // why Nexus scheduled this
}
```

**Example registration (Nexus module init):**

```typescript
NexusCrossModuleScheduler.register({
  id: 'missed-workouts-agnes-checkin',
  triggerEvent: 'VITAL_UPDATED',
  triggerCondition: (event, nsv) => {
    // Check: streak health dropped (proxy for missed workouts) + resilience low
    const streakHealth = nsv.planning?.streakHealth ?? 10;
    const resilience = nsv.emotional?.emotionalResilience ?? 10;
    return streakHealth <= 3 && resilience <= 5;
  },
  targetModule: 'agnes',
  actionType: 'request_emotional_checkin',   // Agnes ActionHub action (new)
  actionPayload: {
    reason: 'habit_streak_broken',
    context: 'Missed workouts detected. Agnes to initiate gentle check-in.'
  },
  rationale: 'Streak breaks often precede emotional distress. Agnes check-in is prophylactic.'
});
```

**Scheduler execution:**
- Spine wildcard listener (on all events)
- For each pending scheduled action: evaluate `triggerCondition`
- If true: call `ActionHub.execute(targetModule, actionType, context)`
- Max 1 cross-module action per event (prevents action storms)
- Cooldown: 4 hours between re-triggers of same scheduled action ID

### Pre-Built Cross-Module Schedules (Sprint 1)

| ID | Trigger | Condition | Target | Action |
|---|---|---|---|---|
| `missed-workouts-agnes-checkin` | `VITAL_UPDATED` | streakHealth <= 3 AND resilience <= 5 | Agnes | `request_emotional_checkin` |
| `financial-crisis-atlas-reduce` | `FINANCIAL_STRESS` | friction >= 8 | Atlas | `reduce_planning_load` (remove 2 lowest-priority tasks) |
| `burnout-agnes-escalate` | `BURNOUT_WARNING` | always | Agnes | `request_emotional_checkin` with urgency=high |
| `recovery-titan-promote` | `VITAL_UPDATED` | recovery >= 8 AND stress <= 2 | Titan | `suggest_training_window` |
| `crisis-atlas-lockdown` | `CRISIS_MODE` | always | Atlas | `transition_to_recovery_state` |

---

## 7. NexusSynthesisService — Proposed API

This deepens `useNexusSynthesis.ts` into a proper service with a clean hook interface.

```typescript
// Proposed: src/modules/orchestrator/services/nexus-synthesis-service.ts

class NexusSynthesisService {
  /** Detect all active conflict zones from NSV snapshot */
  detectConflicts(nsv: NeuralStateVector): ConflictResolution[];

  /** Mediate a specific conflict and return resolution */
  mediateConflict(conflictId: string, nsv: NeuralStateVector): ConflictResolution;

  /** Get relevant conflicts for a text input (pre-dispatch) */
  getConflictsForInput(inputText: string, conflicts: ConflictResolution[]): ConflictResolution | null;

  /** Register a cross-module scheduled action */
  scheduleAction(action: CrossModuleScheduledAction): void;

  /** Cancel a scheduled action by ID */
  cancelScheduledAction(id: string): void;

  /** Get current scope for this session */
  getScope(): NexusConversationScope;

  /** Update scope with new domain context */
  updateScope(moduleId: ModuleId, facts: string[], pendingActions: string[]): void;
}

// Hook wrapping the service
export function useNexusSynthesisService(): {
  conflicts: ConflictResolution[];        // enhanced (was: alerts: SynthesisAlert[])
  alerts: SynthesisAlert[];              // kept for backward compat
  recentSpineEvents: SpineEvent[];
  scope: NexusConversationScope;
  isAnalyzing: boolean;
  getConflictsForInput: (text: string) => ConflictResolution | null;
}
```

**Backward compatibility:** The existing `useNexusSynthesis()` hook is NOT removed. It remains a thin wrapper around `useNexusSynthesisService()` returning the `alerts` field — zero breaking changes.

---

## 8. Open Questions

- Should `ConflictResolution` objects be persisted to `spine_events` Firestore collection for audit? (Proposal: only `priority: 'critical'` ones, same policy as existing events.)
- What is the maximum number of active scheduled cross-module actions? (Proposal: cap at 5 pending, drop oldest on overflow.)
- Should pre-dispatch conflict banner be opt-out via user settings? (Recommendation: yes — add to `CoreUserProfile.securityPreferences`.)
