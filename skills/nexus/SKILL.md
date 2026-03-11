---
name: nexus
description: >
  Invoke this skill when working on the Nexus orchestrator module of the Nexus AGNES SPA.
  Nexus is the master orchestrator and first landing point after onboarding — it synthesizes
  signals from all other modules (Agnes/emotional, Titan/physical, Ledger/financial,
  Soma/biomedical, Atlas/planning, Scout/research) into a unified cross-functional picture.
  Use this skill for anything touching src/modules/orchestrator/, cross-module synthesis
  patterns, NexusSynthesis alerts, routing service logic, daily brief, module health FAB,
  CoreProfile onboarding, or full-NSV enhanceContext reads.
---

# Nexus (Orchestrator) Module Skill

> **Module ID**: `orchestrator` · **Route**: `/orchestrator` · **Theme**: `cyan` (`#06b6d4`) · **NSV Access**: full (all domains) · **Firestore**: `users/{uid}` via `CoreProfileService`

---

## 1. What Nexus Is

Nexus is the **master orchestrator** of the entire platform. It holds no domain-specific data of its own — instead, it **synthesizes signals from every other module** into a unified, cross-functional intelligence layer that no single domain module can produce alone.

It is the **first place users land after onboarding** and the **only module that can proactively route users to other modules**. Nexus occupies a fundamentally different position in the architecture than Agnes, Titan, Ledger, Soma, Atlas, or Scout: it reads everything, writes nothing to the NSV, and acts as the platform's meta-cognitive layer.

### What Nexus Tracks

| What | What It Does NOT Track |
|---|---|
| Cross-domain compound patterns (multi-domain stress, burnout trajectories, recovery windows) | Workouts or training metrics |
| Module health status per domain | Individual financial transactions |
| Daily synthesis brief driven by full NSV | Therapy sessions or mood logs |
| User global identity (CoreProfile) | Supplement stacks or biomarkers |
| Intelligent routing suggestions | Task lists or planning events |

**Nexus is not a knowledge module.** It never stores domain-level data. Its value is entirely in the synthesis of patterns that span module boundaries — patterns that no individual module is positioned to see.

### Module Registry Entry

```typescript
// MODULE_MANIFEST entry for orchestrator
{
  id: 'orchestrator',
  route: '/orchestrator',
  themeColor: '#06b6d4',   // cyan
  hasPage: true,
  hasAI: true,
  requiresAuth: true,
  requiresVault: false,    // accessible in any auth state (no vault encryption)
}
```

---

## 2. File Structure

```
src/modules/orchestrator/
├── OrchestratorPage.tsx              # Module root — PageState machine, auth gate
├── components/
│   ├── NexusDashboard.tsx            # Primary chat + synthesis UI container
│   ├── DailyBriefSection.tsx         # NSV-driven morning brief, collapsible
│   ├── SynthesisPanel.tsx            # Cross-module SynthesisAlert[] display
│   ├── ModuleHealthFAB.tsx           # Floating status bubble for each module
│   ├── CommandPalette.tsx            # Keyboard-accessible module launcher overlay
│   ├── RoutingSuggestion.tsx         # Non-intrusive routing suggestion chips
│   ├── GuestModePanel.tsx            # Blocks profile creation in guest state
│   └── OrchestratorOnboarding.tsx   # Global identity intake chat component
├── hooks/
│   ├── useNexusSynthesis.ts          # Pattern detection on NSV → SynthesisAlert[]
│   └── useModuleHealth.ts            # Per-module health status from NSV + memory envelopes
├── personas.ts                       # ORCHESTRATOR_PERSONA + ORCHESTRATOR_ONBOARDING_PERSONA
└── services/
    ├── nexus-routing-service.ts      # NexusRoutingService.classifyIntent()
    └── actions.ts                    # ActionHub registrations for all Nexus action tags
```

---

## 3. Data Model

### `CoreProfile`
Stored in Firestore under `users/{uid}`. This is the **global user identity record** — shared across all modules. Nexus is the only module that creates and owns this record.

```typescript
interface CoreProfile {
  uid: string;
  preferredName: string;
  pronouns: string;                  // e.g. 'he/him', 'she/her', 'they/them'
  lifeGoals: string[];               // high-level life priorities set at onboarding
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

> **Key distinction**: `CoreProfile` lives in `users/{uid}`, not in a module-specific collection. `CoreProfileService` is the only permitted write path. No other module creates or mutates this document.

### `SynthesisAlert`

```typescript
interface SynthesisAlert {
  id: SynthesisAlertId;              // e.g. 'COMPOUND_STRESS', 'BURNOUT_TRAJECTORY'
  severity: SynthesisSeverity;       // 'critical' | 'warning' | 'positive'
  title: string;
  description: string;
  involvedDomains: NSVDomain[];      // e.g. ['emotional', 'biological', 'resource']
  suggestedActions: SuggestedAction[];
  detectedAt: Timestamp;
}

type SynthesisSeverity = 'critical' | 'warning' | 'positive';

type SynthesisAlertId =
  | 'COMPOUND_STRESS'
  | 'BURNOUT_TRAJECTORY'
  | 'RECOVERY_WINDOW'
  | 'SLEEP_PERFORMANCE_GAP'
  | 'FINANCIAL_EMOTIONAL_LOOP'
  | 'TRAINING_RECOVERY_CONFLICT'
  | 'PLANNING_COLLAPSE'
  | 'INTEREST_HYPERFOCUS';
```

### `ModuleHealthStatus`

```typescript
interface ModuleHealthStatus {
  moduleId: ModuleId;               // 'agnes' | 'titan' | 'soma' | 'ledger' | 'atlas'
  tone: 'good' | 'warn' | 'bad';
  label: string;                    // short human-readable status phrase
  nsv: Record<string, number>;      // relevant NSV fields powering this status
}
```

### `RoutingResult`

```typescript
interface RoutingResult {
  target: ModuleId;                 // destination module ID
  confidence: number;               // 0.0–1.0
  reason: string;                   // human-readable rationale for the suggestion
}
```

---

## 4. Page State Machine

`OrchestratorPage.tsx` drives rendering through a three-state machine. It does **not** use `UnifiedModulePage` — it has a bespoke render path because of the global-identity onboarding flow.

```typescript
type PageState = 'LOADING' | 'ONBOARDING' | 'DASHBOARD'
```

### State Transition Logic

```
mount
  └─ check auth
       ├─ guest → render <GuestModePanel> (no profile creation possible)
       └─ authenticated
            └─ CoreProfileService.getProfile(uid)
                 ├─ null → PageState = 'ONBOARDING'  → <OrchestratorOnboarding>
                 └─ exists → PageState = 'DASHBOARD'  → <NexusDashboard>
```

```typescript
// OrchestratorPage.tsx — skeleton
const OrchestratorPage = () => {
  const { user, isGuest } = useAuth();
  const [pageState, setPageState] = useState<PageState>('LOADING');

  useEffect(() => {
    if (isGuest) return;            // GuestModePanel rendered below
    CoreProfileService.getProfile(user.uid).then(profile => {
      setPageState(profile ? 'DASHBOARD' : 'ONBOARDING');
    });
  }, [user, isGuest]);

  if (isGuest)                  return <GuestModePanel />;
  if (pageState === 'LOADING')  return <LoadingSpinner />;
  if (pageState === 'ONBOARDING') return <OrchestratorOnboarding onComplete={() => setPageState('DASHBOARD')} />;
  return <NexusDashboard />;
};
```

---

## 5. Persona Architecture

### `ORCHESTRATOR_PERSONA` — `personas.ts`

The primary post-onboarding persona. This is injected as the LLM system prompt for all authenticated dashboard sessions.

| Attribute | Value |
|---|---|
| Default agent name | `"Nexus"` (user-customizable) |
| Archetype | Systems Architect + Meta-Intelligence |
| Tone | Analytical, integrative, non-prescriptive |
| Core behaviour | Surfaces cross-domain patterns; never prescribes; always asks |
| Hard delegation rules | Training → Titan · Emotions → Agnes · Finances → Ledger · Planning → Atlas |
| NSV access | Full — reads every domain without filter |
| Diagnosis | Never issues domain-level diagnoses or prescriptions |

```typescript
// personas.ts (abbreviated structure)
export const ORCHESTRATOR_PERSONA = {
  name: 'Nexus',
  archetype: 'Systems Architect + Meta-Intelligence',
  system_prompt: `
    You are Nexus, the orchestrating intelligence of this platform.
    Your role is synthesis, not prescription. You see all signals from all domains.
    When you detect a cross-domain pattern, surface it as an observation and ask the user
    how they want to engage with it. Never tell a user what to do — only what you see.

    Delegate domain specifics:
    - Training, recovery, physical load → Titan
    - Emotional processing, therapy → Agnes
    - Budgeting, spending, financial goals → Ledger
    - Medical concerns, biomarkers → Soma
    - Planning, scheduling, projects → Atlas
    - Research, exploration, external data → Scout

    Action tags available: [query_module, delegate_to_module, search_memory,
    broadcast_spine_event, sync_vitals, update_global_identity,
    sync_personality_provision]
  `,
};
```

### `ORCHESTRATOR_ONBOARDING_PERSONA` — `personas.ts`

Used during the initial global-identity onboarding flow, before a `CoreProfile` exists.

| Attribute | Value |
|---|---|
| Tone | Warmer, exploratory, curiosity-led |
| Purpose | Collect preferred name, pronouns, life goals; optionally seed NSV baseline |
| Transition | Ends with `update_global_identity` action tag; then persona switches to `ORCHESTRATOR_PERSONA` |

### `ORCHESTRATOR_WELCOME(name)` Function

```typescript
// Personalized greeting injected as the first AI message after onboarding completes
export const ORCHESTRATOR_WELCOME = (name: string): string =>
  `Welcome, ${name}. I'm Nexus — your cross-functional intelligence layer. ` +
  `I don't track workouts or finances myself, but I see how everything connects. ` +
  `Tell me what's on your mind, or ask me for a synthesis of where things stand.`;
```

---

## 6. `useModuleAI` Configuration

Nexus is the **only module** that passes a `navigateTo` function into `useModuleAI`. This is what enables it to physically navigate the user to another module — not just suggest.

```typescript
// In NexusDashboard.tsx
const {
  messages,
  sendUserMessage,
  isProcessing,
  streamingText,
  routingSuggestion,
  quota,
} = useModuleAI({
  moduleId: 'orchestrator',
  systemPrompt: ORCHESTRATOR_PERSONA.system_prompt,
  contextPolicy: 'prompted',           // Uses full NSV context via enhanceContext()
  navigateTo: navigate,                // Unique to Nexus — enables actual navigation
});
```

### `contextPolicy: 'prompted'` vs. `'enhanceContextForModule'`

| Policy | Used By | NSV Access |
|---|---|---|
| `'prompted'` via `enhanceContext()` | **Nexus only** | Full NSV — all domains, no filter |
| `'module'` via `enhanceContextForModule()` | All other modules | Filtered to their own domain |

> **Critical**: Nexus must always use `enhanceContext()`, never `enhanceContextForModule()`. Using the module-scoped version would blind Nexus to the cross-domain signals that are its entire purpose.

### What `enhanceContext(ctx)` Injects for Nexus

```typescript
// The prompt context injected before every Nexus AI message
{
  preferredName: profile.preferredName,
  pronouns: profile.pronouns,
  nsv: formatNSVForPrompt(nsv),        // Full serialized NSV — all domains
  compactedInsights: insights           // Up to 200 chars each from GlobalSoul
    .slice(0, 10)
    .map(i => i.slice(0, 200)),
}
```

---

## 7. Synthesis Pattern Detection — `useNexusSynthesis`

`useNexusSynthesis` is the intelligence core of Nexus. It reads the full NSV via `useGlobalSoul()` and runs `detectPatterns(nsv)` to produce `SynthesisAlert[]`. Only the first 3 alerts are ever shown at once — this cap is intentional and must never be removed.

### Full Pattern Table

| Alert ID | Trigger Condition | Severity | Involved Domains |
|---|---|---|---|
| `COMPOUND_STRESS` | `stress ≥ 7` AND `cnsFatigue ≥ 6` AND `friction ≥ 6` | `critical` | emotional, biological, resource |
| `BURNOUT_TRAJECTORY` | `activeLoad ≥ 8` AND `sleep ≤ 4` AND `resilience ≤ 4` | `critical` | cognitive, biological, emotional |
| `RECOVERY_WINDOW` | `recovery ≥ 7` AND `stress ≤ 3` AND `activeLoad ≤ 4` | `positive` | biological, emotional, cognitive |
| `SLEEP_PERFORMANCE_GAP` | `sleep ≤ 4` AND `focus ≤ 4` | `warning` | biological, cognitive |
| `FINANCIAL_EMOTIONAL_LOOP` | `friction ≥ 7` AND `stress ≥ 6` | `warning` | resource, emotional |
| `TRAINING_RECOVERY_CONFLICT` | `cnsFatigue ≥ 7` AND `recovery ≤ 3` | `warning` | biological |
| `PLANNING_COLLAPSE` | `deadline ≥ 8` AND `planningLoad ≥ 8` AND `completion ≤ 0.3` | `critical` | planning, cognitive |
| `INTEREST_HYPERFOCUS` | `diversity ≤ 2` AND `researchLoad ≥ 7` | `warning` | cognitive |

### NSV Field → Alert Mapping

| NSV Field | Relevant Alerts |
|---|---|
| `emotional.stressLoad` | COMPOUND_STRESS, BURNOUT_TRAJECTORY, RECOVERY_WINDOW, FINANCIAL_EMOTIONAL_LOOP |
| `biological.cnsFatigue` | COMPOUND_STRESS, BURNOUT_TRAJECTORY, TRAINING_RECOVERY_CONFLICT |
| `biological.recoveryScore` | BURNOUT_TRAJECTORY, RECOVERY_WINDOW, TRAINING_RECOVERY_CONFLICT |
| `biological.sleepQuality` | BURNOUT_TRAJECTORY, SLEEP_PERFORMANCE_GAP |
| `resource.financialFriction` | COMPOUND_STRESS, FINANCIAL_EMOTIONAL_LOOP |
| `cognitive.activeLoad` | BURNOUT_TRAJECTORY, RECOVERY_WINDOW |
| `cognitive.focusScore` | SLEEP_PERFORMANCE_GAP |
| `planning.deadlinePressure` | PLANNING_COLLAPSE |
| `planning.planningLoad` | PLANNING_COLLAPSE |
| `planning.completionRate` | PLANNING_COLLAPSE |
| `cognitive.interestDiversity` | INTEREST_HYPERFOCUS |
| `cognitive.researchLoad` | INTEREST_HYPERFOCUS |

### Implementation Skeleton

```typescript
// hooks/useNexusSynthesis.ts

export function useNexusSynthesis(): { alerts: SynthesisAlert[]; isLoading: boolean } {
  const { nsv, isLoading } = useGlobalSoul();          // full NSV — no domain filter

  const alerts = useMemo<SynthesisAlert[]>(() => {
    if (!nsv) return [];
    return detectPatterns(nsv).slice(0, 3);             // NEVER show more than 3
  }, [nsv]);

  return { alerts, isLoading };
}

function detectPatterns(nsv: NeuralStateVector): SynthesisAlert[] {
  const results: SynthesisAlert[] = [];

  const stress     = nsv.emotional?.stressLoad       ?? 0;
  const resilience = nsv.emotional?.emotionalResilience ?? 10;
  const cns        = nsv.biological?.cnsFatigue      ?? 0;
  const recovery   = nsv.biological?.recoveryScore   ?? 10;
  const sleep      = nsv.biological?.sleepQuality    ?? 10;
  const friction   = nsv.resource?.financialFriction ?? 0;
  const activeLoad = nsv.cognitive?.activeLoad       ?? 0;
  const focus      = nsv.cognitive?.focusScore       ?? 10;
  const deadline   = nsv.planning?.deadlinePressure  ?? 0;
  const planLoad   = nsv.planning?.planningLoad      ?? 0;
  const completion = nsv.planning?.completionRate    ?? 1;
  const diversity  = nsv.cognitive?.interestDiversity ?? 10;
  const researchLd = nsv.cognitive?.researchLoad     ?? 0;

  if (stress >= 7 && cns >= 6 && friction >= 6) {
    results.push(buildAlert('COMPOUND_STRESS', 'critical',
      ['emotional', 'biological', 'resource']));
  }
  if (activeLoad >= 8 && sleep <= 4 && resilience <= 4) {
    results.push(buildAlert('BURNOUT_TRAJECTORY', 'critical',
      ['cognitive', 'biological', 'emotional']));
  }
  if (recovery >= 7 && stress <= 3 && activeLoad <= 4) {
    results.push(buildAlert('RECOVERY_WINDOW', 'positive',
      ['biological', 'emotional', 'cognitive']));
  }
  if (sleep <= 4 && focus <= 4) {
    results.push(buildAlert('SLEEP_PERFORMANCE_GAP', 'warning',
      ['biological', 'cognitive']));
  }
  if (friction >= 7 && stress >= 6) {
    results.push(buildAlert('FINANCIAL_EMOTIONAL_LOOP', 'warning',
      ['resource', 'emotional']));
  }
  if (cns >= 7 && recovery <= 3) {
    results.push(buildAlert('TRAINING_RECOVERY_CONFLICT', 'warning',
      ['biological']));
  }
  if (deadline >= 8 && planLoad >= 8 && completion <= 0.3) {
    results.push(buildAlert('PLANNING_COLLAPSE', 'critical',
      ['planning', 'cognitive']));
  }
  if (diversity <= 2 && researchLd >= 7) {
    results.push(buildAlert('INTEREST_HYPERFOCUS', 'warning',
      ['cognitive']));
  }

  // Sort: critical first, then warning, then positive
  return results.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
}
```

---

## 8. Module Health — `useModuleHealth`

`useModuleHealth` reads per-module `ModuleMemoryEnvelope` entries and the NSV to produce a `ModuleHealthStatus[]` array, one entry per tracked module. It refreshes automatically on `SESSION_ENDED` and `VITAL_UPDATED` Spine events.

### Health Tone Derivation Rules

| Module | NSV Field | Good | Warn | Bad |
|---|---|---|---|---|
| `agnes` | `emotional.emotionalResilience` | ≥ 6 | ≥ 4 | < 4 |
| `titan` | `biological.cnsFatigue` | ≤ 4 | ≤ 7 | > 7 |
| `soma` | `biological.recoveryScore` | ≥ 6 | ≥ 4 | < 4 |
| `ledger` | `resource.financialFriction` | ≤ 4 | ≤ 7 | > 7 |
| `atlas` | `planning.planningLoad` | ≤ 5 | ≤ 7 | > 7 |

### Implementation Skeleton

```typescript
// hooks/useModuleHealth.ts

export function useModuleHealth(): ModuleHealthStatus[] {
  const { nsv } = useGlobalSoul();
  const [statuses, setStatuses] = useState<ModuleHealthStatus[]>([]);

  const compute = useCallback(() => {
    if (!nsv) return;
    setStatuses([
      deriveHealth('agnes',  nsv.emotional?.emotionalResilience ?? 5, 'asc'),
      deriveHealth('titan',  nsv.biological?.cnsFatigue         ?? 5, 'desc'),
      deriveHealth('soma',   nsv.biological?.recoveryScore      ?? 5, 'asc'),
      deriveHealth('ledger', nsv.resource?.financialFriction    ?? 5, 'desc'),
      deriveHealth('atlas',  nsv.planning?.planningLoad         ?? 5, 'desc'),
    ]);
  }, [nsv]);

  // Recompute on Spine events
  useEffect(() => {
    const unsub1 = Spine.on('SESSION_ENDED', compute);
    const unsub2 = Spine.on('VITAL_UPDATED',  compute);
    compute();
    return () => { unsub1(); unsub2(); };
  }, [compute]);

  return statuses;
}

function deriveHealth(
  moduleId: ModuleId,
  value: number,
  direction: 'asc' | 'desc'   // 'asc' = higher is better; 'desc' = lower is better
): ModuleHealthStatus {
  let tone: 'good' | 'warn' | 'bad';
  const thresholds = HEALTH_THRESHOLDS[moduleId];

  if (direction === 'asc') {
    tone = value >= thresholds.good ? 'good' : value >= thresholds.warn ? 'warn' : 'bad';
  } else {
    tone = value <= thresholds.good ? 'good' : value <= thresholds.warn ? 'warn' : 'bad';
  }

  return { moduleId, tone, label: HEALTH_LABELS[moduleId][tone], nsv: { value } };
}
```

---

## 9. Routing Service — `NexusRoutingService`

The routing service classifies the intent of user messages to suggest which module they should visit. It is intentionally conservative — it only makes suggestions when confidence is high and the conversation is at the right depth.

### `classifyIntent` Contract

```typescript
// services/nexus-routing-service.ts

class NexusRoutingService {
  /**
   * Classifies the intent of a user message and returns a routing suggestion.
   * Returns null if conditions for suggestion are not met.
   *
   * Skip conditions (return null):
   *  - conversationDepth === 0 (first message — orient before routing)
   *  - conversationDepth > 3 (user is engaged here — don't interrupt)
   *  - suggestionCount >= 2 (cap reached — no more suggestions this session)
   *  - target === 'orchestrator' (no self-routing)
   *  - confidence < 0.62
   */
  classifyIntent(
    text: string,
    conversationDepth: number,
    suggestionCount: number,
  ): RoutingResult | null
}
```

### Routing Logic Decision Tree

```
classifyIntent(text, depth, count)
  ├─ depth === 0 → null (first message, orient first)
  ├─ depth > 3  → null (user is engaged, don't interrupt)
  ├─ count >= 2 → null (session cap reached)
  └─ classify text intent
       └─ target === 'orchestrator' → null
       └─ confidence < 0.62 → null
       └─ return { target, confidence, reason }
```

### Intent → Module Routing Examples

| User Intent Signal | Likely Target | Rationale |
|---|---|---|
| "I need to adjust my workout split" | `titan` | Physical training domain |
| "I've been feeling really anxious lately" | `agnes` | Emotional processing domain |
| "How do I budget for my rent increase?" | `ledger` | Financial domain |
| "I've been sleeping terribly, my HRV is low" | `soma` | Biomedical domain |
| "I have three deadlines next week" | `atlas` | Planning domain |
| "Can you find research on cold exposure?" | `scout` | Research domain |
| "What does my whole picture look like?" | `orchestrator` | Stays in Nexus — synthesis request |

### Routing Suggestion UI — `RoutingSuggestion.tsx`

- Appears after messages **2–4** if `classifyIntent()` returns a result with `confidence ≥ 0.62`
- Auto-dismisses after **8 seconds** if the user takes no action
- Maximum **2 suggestions per session** (enforced in both service and component)
- User can always **dismiss** or **accept** — dismissal is never penalised

```tsx
// RoutingSuggestion.tsx — appearance conditions
{
  routingSuggestion &&
  conversationDepth >= 2 &&
  conversationDepth <= 4 &&
  suggestionCount < 2 &&
  (
    <RoutingSuggestion
      suggestion={routingSuggestion}
      onAccept={() => navigate(`/${routingSuggestion.target}`)}
      onDismiss={() => dismissSuggestion()}
      autoDismissMs={8000}
    />
  )
}
```

---

## 10. Action Tags

All action tags are registered in `services/actions.ts` via the ActionHub. Every tag listed here must also appear in `ORCHESTRATOR_PERSONA.system_prompt` under its action tags section, or the LLM will not emit it.

### Full Action Tag Reference

| Tag | Payload Shape | Effect |
|---|---|---|
| `query_module` | `{ moduleId: ModuleId, query: string }` | Queries another module's current state/data |
| `delegate_to_module` | `{ moduleId: ModuleId, task: string, context?: string }` | Delegates a task via `NexusHandoffService` |
| `search_memory` | `{ query: string, domains?: NSVDomain[] }` | Cross-module semantic memory search via GlobalSoul |
| `broadcast_spine_event` | `{ type: SpineEventType, data?: Record<string, unknown> }` | Emits a Spine event to all subscribers |
| `sync_vitals` | `{ modules?: ModuleId[] }` | Triggers NSV sync/refresh across specified (or all) modules |
| `update_global_identity` | `{ preferredName?: string, pronouns?: string, lifeGoals?: string[] }` | Updates `CoreProfile` via `CoreProfileService` |
| `sync_personality_provision` | `{ moduleId: ModuleId, personaOverride: Partial<PersonaConfig> }` | Updates per-module agent persona overrides |

### Action Tag Registration Pattern

```typescript
// services/actions.ts

ActionHub.register('query_module', async (payload: QueryModulePayload, ctx: ActionContext) => {
  const { moduleId, query } = payload;
  // Fetch relevant data from the target module's service
  const result = await ModuleQueryService.query(moduleId, query, ctx.uid);
  // Return result to the LLM response stream
  return { result };
});

ActionHub.register('delegate_to_module', async (payload: DelegatePayload, ctx: ActionContext) => {
  const { moduleId, task, context } = payload;
  // Store in session storage with TTL
  await NexusHandoffService.createHandoff({
    from: 'orchestrator',
    to: moduleId,
    task,
    context: context?.slice(0, 4000),   // 4000 char limit — hard cap
    ttlMs: 10 * 60 * 1000,              // 10 minute TTL
    uid: ctx.uid,
  });
});

ActionHub.register('update_global_identity', async (payload, ctx) => {
  await CoreProfileService.updateProfile(ctx.uid, payload);
});
```

---

## 11. Cross-Module Coordination Channels

Nexus uses all three coordination channels available in the platform. No other module uses all three simultaneously.

### Channel 1: Spine (Event Bus)

Nexus **subscribes** to relevant Spine events and can **broadcast** via the `broadcast_spine_event` action tag.

```typescript
// Events Nexus subscribes to
Spine.on('BURNOUT_WARNING',        handler);    // from Agnes
Spine.on('EMOTIONAL_STATE_CHANGED', handler);  // from Agnes
Spine.on('VITAL_UPDATED',          handler);   // from any module
Spine.on('SESSION_ENDED',          handler);   // from any module
Spine.on('ESCALATE_TO_NEXUS',      handler);   // from Agnes (crisis protocol)

// Broadcasting via action tag
// LLM emits: { tag: 'broadcast_spine_event', type: 'RECOVERY_WINDOW_ALERT', data: { ... } }
```

### Channel 2: NexusHandoffService (Session Delegation)

Used when Nexus decides to **actively delegate** a task to another module. The target module reads the handoff on mount and can surface it to the user.

```typescript
// Handoff constraints
const HANDOFF_LIMITS = {
  maxContextChars: 4000,       // Truncated if exceeded — never throw
  ttlMs: 10 * 60 * 1000,       // 10 minutes — auto-expires
  storageKey: (uid: string, target: ModuleId) => `nexus_handoff_${uid}_${target}`,
};
```

### Channel 3: GlobalProjectionService (NSV Read)

Nexus **reads** the full NSV via `GlobalProjectionService` through `useGlobalSoul()`. It **never writes** to the NSV. Writing is exclusively the domain modules' responsibility.

```typescript
// ✅ Correct — read only
const { nsv, insights, isLoading } = useGlobalSoul();

// ❌ Wrong — Nexus must never call this
await GlobalProjectionService.updateCrossFunctionalState(uid, { ... });
```

### Coordination Channel Comparison

| Channel | Direction | Use Case | TTL |
|---|---|---|---|
| **Spine** | Broadcast (any→any) | Real-time event reactions; system-wide signals | Immediate |
| **NexusHandoffService** | Nexus → Module | Pre-loading a module with a specific task context | 10 min |
| **GlobalProjectionService** | Module → Nexus (read) | Synthesis computation; daily brief; alert detection | None (live) |

---

## 12. NexusDashboard Component Architecture

`NexusDashboard.tsx` is the top-level authenticated view. It composes all the sub-components in a specific layout order.

```tsx
// NexusDashboard.tsx — component composition
<NexusDashboardLayout>
  <DailyBriefSection                          // Collapses when conversationDepth >= 1
    nsv={nsv}
    isCollapsed={conversationDepth >= 1}
  />
  <SynthesisPanel                             // Shows at most 3 alerts
    alerts={alerts.slice(0, 3)}
    isLoading={synthesisLoading}
  />
  <NexusChat                                  // Primary chat interface
    messages={messages}
    onSend={sendUserMessage}
    isProcessing={isProcessing}
    streamingText={streamingText}
  />
  {routingSuggestion && conversationDepth >= 2 && suggestionCount < 2 && (
    <RoutingSuggestion
      suggestion={routingSuggestion}
      onAccept={handleRoutingAccept}
      onDismiss={handleRoutingDismiss}
      autoDismissMs={8000}
    />
  )}
  <ModuleHealthFAB                            // Floating, always visible
    statuses={moduleHealthStatuses}
  />
  <CommandPalette                             // Keyboard-triggered overlay
    isOpen={commandPaletteOpen}
    onClose={() => setCommandPaletteOpen(false)}
  />
</NexusDashboardLayout>
```

### `DailyBriefSection`

- Displayed above the chat on initial load
- Pulls data from the NSV to produce a human-readable morning synthesis
- Automatically **collapses** when `conversationDepth >= 1` (after the user's first message)
- Always remains accessible via a re-expand toggle — never permanently hidden

```tsx
// Collapse behaviour
<DailyBriefSection
  nsv={nsv}
  isCollapsed={conversationDepth >= 1}
  onToggle={() => setDailyBriefExpanded(prev => !prev)}
/>
```

### `SynthesisPanel`

Renders `SynthesisAlert[]` as visual alert cards. Enforces the 3-alert cap at the display layer (belt-and-suspenders, since `useNexusSynthesis` also slices at 3).

```tsx
// Alert severity → visual treatment
const alertStyles: Record<SynthesisSeverity, string> = {
  critical: 'border-red-500 bg-red-950/30',
  warning:  'border-amber-400 bg-amber-950/20',
  positive: 'border-emerald-400 bg-emerald-950/20',
};
```

### `ModuleHealthFAB`

Floating action button that renders a compact status dot per module. Tapping expands to show `ModuleHealthStatus[]` details.

```
ModuleHealthFAB tone → color mapping
  'good' → cyan (#06b6d4)
  'warn' → amber (#f59e0b)
  'bad'  → red (#ef4444)
```

### `CommandPalette`

Keyboard-accessible overlay for module navigation. Trigger via standard platform shortcut (Cmd+K / Ctrl+K).

- Lists all modules with their current health tone indicator
- Supports fuzzy search by module name or keyword
- On selection: calls `navigate(module.route)` via the `navigateTo` ref from `useModuleAI`

---

## 13. Onboarding Flow

### Entry Conditions

| State | Render |
|---|---|
| Guest user | `<GuestModePanel>` — explains that account creation is required for a CoreProfile |
| Authenticated, no CoreProfile | `<OrchestratorOnboarding>` — guided global identity intake |
| Authenticated, has CoreProfile | `<NexusDashboard>` — full orchestrator experience |

### Intake Sequence — `OrchestratorOnboarding.tsx`

The onboarding is a guided AI chat using `ORCHESTRATOR_ONBOARDING_PERSONA`. It collects the following, in order:

1. **Preferred Name** — how the user wants to be addressed across all modules
2. **Pronouns** — stored in CoreProfile, injected into all AI context
3. **Life Goals** — 1–5 high-level priorities (e.g. "build muscle", "get out of debt", "reduce anxiety")
4. **Optional NSV Baseline** — user can describe their current state; Nexus seeds a rough NSV baseline (optional fast-path)

### Completion Sequence

```typescript
// Fired when OrchestratorOnboarding completes
async function handleOnboardingComplete(data: OnboardingData) {
  // 1. Create the CoreProfile document
  await CoreProfileService.initializeProfile(uid, {
    preferredName: data.preferredName,
    pronouns: data.pronouns,
    lifeGoals: data.lifeGoals,
  });

  // 2. Transition page state
  setPageState('DASHBOARD');

  // 3. Inject the personalized welcome message as the first AI message
  injectSystemMessage(ORCHESTRATOR_WELCOME(data.preferredName));
}
```

### Why Nexus Does Not Use `UnifiedModulePage`

`UnifiedModulePage` assumes a module-specific Firestore collection and a module profile document. Nexus manages `CoreProfile` in `users/{uid}` via `CoreProfileService`, which has a different lifecycle — it persists across the entire platform, not just the orchestrator module. Using `UnifiedModulePage` would introduce incorrect collection assumptions and break the global identity model.

---

## 14. GlobalSoul / NSV Integration

### Full NSV Read (Nexus-Exclusive)

Nexus is the **only module** that reads the entire NSV without domain filtering. Every other module is scoped to its own domain via `enhanceContextForModule`.

```typescript
// enhanceContext — Nexus exclusive path
async function enhanceContext(ctx: AIContext): Promise<EnhancedContext> {
  const nsv = await GlobalProjectionService.getNSV(ctx.uid);
  const insights = await GlobalSoul.getCompactedInsights(ctx.uid);
  const profile = await CoreProfileService.getProfile(ctx.uid);

  return {
    ...ctx,
    preferredName: profile.preferredName,
    pronouns: profile.pronouns,
    nsv: formatNSVForPrompt(nsv),             // Full — no domain filter
    compactedInsights: insights
      .slice(0, 10)
      .map(i => i.content.slice(0, 200)),
  };
}
```

### `formatNSVForPrompt` Output Shape

The serialized NSV string injected into every Nexus AI prompt provides a compact snapshot of all platform signals:

```
[NSV SNAPSHOT]
Emotional:    stress=7.2  resilience=4.1  mood=-0.3  therapeuticProgress=5.0
Biological:   cnsFatigue=6.8  recovery=3.1  sleep=4.5  hrv=52
Cognitive:    activeLoad=8.3  focus=3.9  researchLoad=4.0  diversity=5.0
Resource:     financialFriction=7.4  savingsVelocity=-0.3
Planning:     deadlinePressure=7.1  planningLoad=7.8  completionRate=0.38
```

---

## 15. Security & Data Handling

| Rule | Detail |
|---|---|
| **No vault encryption required** | `CoreProfile` is not sensitive in the same way as Agnes therapy data — no vault lock |
| **No NSV writes from Nexus** | Nexus reads NSV via `useGlobalSoul()` — write calls go to domain modules only |
| **No domain tracking** | Nexus must never store workouts, transactions, sessions, or any domain-level data |
| **4000-char handoff cap** | NexusHandoffService truncates at 4000 chars — never reject, always truncate |
| **10-min handoff TTL** | All delegations auto-expire — target modules must handle missing handoff gracefully |
| **3-alert synthesis cap** | Enforced in both `useNexusSynthesis` and `SynthesisPanel` — cognitive overload protection |
| **2-suggestion session cap** | `NexusRoutingService` and `RoutingSuggestion` both enforce this — avoids pushy UX |
| **No `enhanceContextForModule` for Nexus** | Must always use `enhanceContext` — module-scoped version breaks cross-domain synthesis |

---

## 16. Common Development Tasks

### Add a New Synthesis Pattern

1. Define the NSV condition logic in `detectPatterns()` inside `hooks/useNexusSynthesis.ts`
2. Add the new `SynthesisAlertId` literal to the `SynthesisAlertId` union type in the module's `types.ts`
3. Add a corresponding `buildAlert()` call with correct `severity` and `involvedDomains`
4. Verify the **3-alert `slice(0, 3)` cap** is preserved — your new alert competes with existing ones
5. Verify that NSV fields are populated (not null) before using them in the condition

```typescript
// Example: Add ANXIETY_PERFORMANCE_BIND pattern
// Condition: high stress + high active load + low focus
if (stress >= 6 && activeLoad >= 7 && focus <= 3) {
  results.push(buildAlert('ANXIETY_PERFORMANCE_BIND', 'warning',
    ['emotional', 'cognitive']));
}
```

### Add a New Action Tag

1. Define the handler and register it in `services/actions.ts` via `ActionHub.register()`
2. Add the tag name and payload shape to `ORCHESTRATOR_PERSONA.system_prompt` action tags list in `personas.ts`
3. Add the payload interface to module types
4. If it crosses module boundaries, confirm the target module has a handler or service for the operation

```typescript
// services/actions.ts — new tag example
ActionHub.register('refresh_daily_brief', async (payload, ctx) => {
  await GlobalProjectionService.refreshNSV(ctx.uid);
  Spine.publish({ type: 'VITAL_UPDATED', source: 'orchestrator', data: {} });
});
```

### Change Routing Thresholds

Edit `NexusRoutingService.classifyIntent()` in `services/nexus-routing-service.ts`:

```typescript
// Current thresholds — adjust here
const ROUTING_CONFIG = {
  confidenceThreshold: 0.62,    // Minimum confidence to show a suggestion
  minDepth: 2,                  // Show suggestions starting at message 2
  maxDepth: 3,                  // Stop suggesting after message 3
  maxSuggestionsPerSession: 2,  // Session cap
};
```

### Add a DailyBrief Section

1. Open `components/DailyBriefSection.tsx`
2. Source data from NSV fields via the `nsv` prop — do not fetch independently
3. Keep the section **collapsible** — the `isCollapsed` prop must be respected
4. Do not add static content — all brief content should be NSV-driven or AI-generated

```tsx
// DailyBriefSection.tsx — adding a new metric row
<BriefRow
  label="Financial Pressure"
  value={nsv.resource?.financialFriction}
  unit="/ 10"
  threshold={{ warn: 6, bad: 8 }}
/>
```

### Debug a Synthesis Alert Not Showing

Work through this checklist in order:

1. **Check NSV values are populated**: `console.log(nsv)` in `useNexusSynthesis` — null fields default to 0 or 10 and may not trigger the condition
2. **Check the 3-alert slot**: Is `alerts.slice(0, 3)` already full with higher-priority alerts? Add `console.log('all detected:', detectPatterns(nsv))` before the slice
3. **Check `isLoading`**: If `useGlobalSoul()` returns `isLoading: true`, `nsv` is null and `detectPatterns` returns `[]`
4. **Check `SynthesisPanel` render condition**: Is the component even mounted? Verify `alerts.length > 0` condition in the parent

```typescript
// Debug snippet for useNexusSynthesis
const allAlerts = detectPatterns(nsv);
console.debug('[Nexus Synthesis] All detected:', allAlerts.map(a => a.id));
console.debug('[Nexus Synthesis] Showing (capped to 3):', allAlerts.slice(0, 3).map(a => a.id));
```

### Debug a Routing Suggestion Not Appearing

1. Check `conversationDepth` — must be between 2 and 4 (inclusive)
2. Check `suggestionCount` — must be < 2
3. Check `classifyIntent()` return — log the full `RoutingResult` to verify confidence ≥ 0.62
4. Check that `target !== 'orchestrator'` — self-routing is suppressed

```typescript
// Debug snippet in NexusDashboard
const result = NexusRoutingService.classifyIntent(lastMessage, conversationDepth, suggestionCount);
console.debug('[Nexus Routing] Result:', result);
console.debug('[Nexus Routing] depth:', conversationDepth, 'count:', suggestionCount);
```

### Update Global Identity (CoreProfile)

```typescript
// Via action tag (LLM-initiated)
// LLM emits: { tag: 'update_global_identity', preferredName: 'Sam', pronouns: 'they/them' }

// Via direct call (e.g., from a settings panel)
await CoreProfileService.updateProfile(uid, {
  preferredName: 'Sam',
  pronouns: 'they/them',
  lifeGoals: ['reduce anxiety', 'build consistent habits'],
});
```

---

## 17. Anti-Patterns

| ❌ Anti-Pattern | ✅ Correct Approach |
|---|---|
| Importing from `src/llm-engine/*` directly | Always use `useModuleAI` hook |
| Writing NSV from Nexus | Read-only — NSV writes are the domain modules' responsibility |
| Using `enhanceContextForModule` in Nexus | Use `enhanceContext` — Nexus requires full NSV access |
| Adding domain tracking (workouts, transactions, etc.) to OrchestratorPage | Domain data lives in its module — Nexus reads NSV synthesis only |
| Showing more than 3 simultaneous `SynthesisAlert`s | Enforce `alerts.slice(0, 3)` — cognitive overload is a UX bug |
| Bypassing the routing suggestion session cap (max 2) | The cap prevents the assistant feeling pushy — it is a product requirement |
| Calling `CoreProfileService.initializeProfile()` from any module other than Nexus | Global identity initialization is Nexus-only |
| Referencing `UnifiedModulePage` in OrchestratorPage | Nexus has a bespoke page pattern — `UnifiedModulePage` doesn't model `users/{uid}` correctly |
| Using NexusHandoffService with > 4000 chars without truncation | Always truncate context to 4000 chars before calling `createHandoff` |
| Hardcoding routing confidence below 0.62 | The threshold is product-tuned — only change via `ROUTING_CONFIG`, not inline |
| Triggering `NexusHandoffService` without a TTL | Always set the 10-minute TTL — orphaned handoffs cause stale context bugs |

---

## 18. Cross-Module Relationships Summary

Nexus is the hub of the cross-module graph. It receives signals from all modules and routes context back out — but never stores domain-level state.

| Module | What Nexus Reads | What Nexus Can Trigger | Direction |
|---|---|---|---|
| **Agnes** | `emotional.stressLoad`, `emotional.emotionalResilience`, `emotional.moodTrend` | Crisis routing (`delegate_to_module`) | NSV read + handoff |
| **Titan** | `biological.cnsFatigue`, `biological.recoveryScore` | Training delegation | NSV read + handoff |
| **Soma** | `biological.sleepQuality`, `biological.hrv` | Medical delegation | NSV read + handoff |
| **Ledger** | `resource.financialFriction`, `resource.savingsVelocity` | Financial delegation | NSV read + handoff |
| **Atlas** | `planning.deadlinePressure`, `planning.planningLoad`, `planning.completionRate` | Planning delegation | NSV read + handoff |
| **Scout** | `cognitive.researchLoad`, `cognitive.interestDiversity` | Research delegation | NSV read + handoff |
| **GlobalSoul** | Full NSV + compacted cross-module insights | — | Read only |
| **Spine** | All published events | `broadcast_spine_event` action tag | Subscribe + publish |
| **CoreProfileService** | CoreProfile (name, pronouns, goals) | Profile init + updates | Read + write |

---

## 19. Environment & Dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| `useAuth()` | Auth state; `isGuest` check | Guest → `GuestModePanel` |
| `CoreProfileService` | CoreProfile CRUD in `users/{uid}` | Nexus-exclusive; no other module may call `initializeProfile` |
| `useModuleAI` | LLM session management | Must pass `navigateTo` — only Nexus does this |
| `useGlobalSoul()` | Full NSV + compacted insights | Returns `{ nsv, insights, isLoading }` |
| `GlobalProjectionService` | NSV read path | Nexus reads only — never calls `updateCrossFunctionalState` |
| `NexusHandoffService` | Session-storage task delegation | 4000-char cap, 10-min TTL |
| `NexusRoutingService` | Intent classification + routing | Confidence threshold 0.62 |
| `Spine` | Cross-module event bus | Subscribes to and can broadcast Spine events |
| `ActionHub` | Action tag registration | All tags must also appear in `ORCHESTRATOR_PERSONA` prompt |
| `ORCHESTRATOR_PERSONA` | LLM system prompt (post-onboarding) | From `personas.ts` |
| `ORCHESTRATOR_ONBOARDING_PERSONA` | LLM system prompt (onboarding) | From `personas.ts` |
| `ORCHESTRATOR_WELCOME(name)` | First post-onboarding message | Injected via `injectSystemMessage()` |

---

## 20. Quota & Rate Considerations

Nexus is the most AI-intensive module — it processes every cross-module signal and is the first module users interact with daily. Keep the following in mind:

- **Daily Brief generation** runs once per session open — do not re-trigger on every re-render
- **Synthesis detection** (`detectPatterns`) is pure computation on the cached NSV — no LLM calls, no cost
- **Routing classification** (`classifyIntent`) uses lightweight intent matching — evaluate whether it needs LLM invocation or can be rule-based for common patterns
- **`quota`** returned from `useModuleAI` should gate the send button in `NexusChat` to prevent over-consumption

```tsx
// Gate chat input on quota
<SendButton
  disabled={isProcessing || quota.remaining === 0}
  title={quota.remaining === 0 ? 'Daily message limit reached' : undefined}
/>
```
