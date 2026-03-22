---
name: nexus
description: >
  Invoke this skill when working on the Nexus orchestrator module of the AGNES SPA.
  Nexus is the master orchestrator and first landing point after authentication — it synthesizes
  signals from all other modules (Agnes/emotional, Titan/physical, Ledger/financial,
  Soma/biomedical, Atlas/planning, Scout/research) into a unified cross-functional picture.
  Use this skill for anything touching src/modules/nexus/, cross-module synthesis
  patterns, SynthesisAlerts, daily brief, module health FAB, command palette,
  onboarding flow, or full-NSV enhanceContext reads.
---

# Nexus (Orchestrator) Module Skill

> **Module ID**: `nexus` · **Route**: `/nexus` · **Theme**: `cyan` (`#06b6d4`) · **NSV Access**: full (all domains) · **Firestore**: `users/{uid}` via `CoreProfileService`

---

## 1. What Nexus Is

Nexus is the **master orchestrator** of the entire platform. It holds no domain-specific data of its own — instead, it **synthesizes signals from every other module** into a unified, cross-functional intelligence layer that no single domain module can produce alone.

It is the **first place users land after authentication** and the **only module that can proactively route users to other modules**. Nexus occupies a fundamentally different position in the architecture than Agnes, Titan, Ledger, Soma, Atlas, or Scout: it reads everything, writes nothing to the NSV directly (only via actions), and acts as the platform's meta-cognitive layer.

### What Nexus Tracks

| What | What It Does NOT Track |
|---|---|
| Cross-domain compound patterns (multi-domain stress, burnout trajectories, recovery windows) | Workouts or training metrics |
| Module health status per domain | Individual financial transactions |
| Daily synthesis brief driven by full NSV | Therapy sessions or mood logs |
| User global identity (CoreProfile) | Supplement stacks or biomarkers |
| Intelligent routing suggestions | Task lists or planning events |

**Nexus is not a knowledge module.** It never stores domain-level data. Its value is entirely in the synthesis of patterns that span module boundaries — patterns that no individual module is positioned to see.

---

## 2. File Structure

```
src/modules/nexus/
├── NexusPage.tsx                    # Module root — PageState machine, auth gate
├── NexusPage.test.tsx               # Page-level tests
├── personas.ts                      # ORCHESTRATOR_PERSONA, ORCHESTRATOR_ONBOARDING_PERSONA, ORCHESTRATOR_WELCOME
├── components/
│   ├── DailyBriefSection.tsx        # Greeting, health pillars, cascade events
│   ├── DailyBriefSection.test.tsx
│   ├── NexusDashboard.tsx           # Main dashboard with chat, brief, synthesis
│   ├── CommandPalette.tsx           # ⌘K command search overlay
│   ├── SynthesisPanel.tsx           # Cross-domain synthesis alerts display
│   ├── ModuleHealthFAB.tsx          # Floating module status grid
│   ├── MemorySearchResults.tsx      # Memory search display component
│   ├── NexusErrorBoundary.tsx       # Error boundary wrapper
│   └── nexus-edge-cases.test.tsx    # Edge case tests
├── hooks/
│   ├── useCommandPalette.ts         # Command state & navigation
│   ├── useNexusSynthesis.ts         # 8-pattern detection → SynthesisAlert[]
│   ├── useNsvTrends.ts              # Domain trend tracking (up/down/stable)
│   └── useModuleHealth.ts           # Per-module health status derivation
├── services/
│   └── actions.ts                   # 6 action handlers (navigate, handoff, spine, vitals, identity, personality)
└── onboarding/
    ├── NexusOnboarding.tsx          # Name, pronouns, optional bio intake
    ├── NexusOnboarding.test.tsx
    └── NexusOnboarding.additional.test.tsx
```

---

## 3. Data Model

### `CoreUserProfile` (Partial — Nexus-relevant fields)
Stored in Firestore under `users/{uid}`. Nexus reads and updates these fields during onboarding and identity management.

```typescript
interface CoreUserProfile {
  uid: string;
  preferredName: string;
  pronouns: string;
  age?: number;
  assignedSexAtBirth?: 'female' | 'male';
  genderIdentity?: string;
  occupation?: string;
  typicalSleepHours?: number;
  onboardingComplete: boolean;
  agentPersonalityProvision?: AgentPersonalityProvision;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `SynthesisAlert`

```typescript
interface SynthesisAlert {
  id: string;                           // e.g. 'COMPOUND_STRESS', 'BURNOUT_TRAJECTORY'
  severity: 'critical' | 'warning' | 'positive';
  title: string;
  description: string;
  involvedDomains: string[];            // e.g. ['emotional', 'biological', 'resource']
  suggestedActions: SynthesisAction[];
  detectedAt: number;                   // timestamp
}

interface SynthesisAction {
  label: string;
  type: 'ask_nexus' | 'consult_module' | 'navigate';
  payload: string;
}
```

### `Command` (Command Palette)

```typescript
interface Command {
  id: string;
  category: 'navigate' | 'system' | 'ai';
  label: string;
  icon: typeof Brain;                   // Lucide icon component
  shortcut?: string;
  isLocked?: boolean;                   // Vault-locked modules
  execute: () => void;
}
```

### `ModuleHealthStatus`

```typescript
interface ModuleHealthStatus {
  moduleId: ModuleId;
  title: string;
  alias: string;
  icon: typeof Brain;
  colorHex: string;
  route: string;
  isAccessible: boolean;
  lastActive: string | null;
  lastSnapshot: string | null;
  keyMetricTone: 'good' | 'warn' | 'bad' | 'neutral';
  hasPendingHandoff: boolean;
  hasAlert: boolean;
}
```

---

## 4. Page State Machine

`NexusPage.tsx` drives rendering through a two-state machine. It does **not** use `UnifiedModulePage` — it has a bespoke render path because of the global-identity onboarding flow.

```typescript
type PageState = 'ONBOARDING' | 'DASHBOARD'
```

### State Transition Logic

```
mount
  └─ check auth
       ├─ guest → render <GuestModePanel> (no profile creation possible)
       └─ authenticated
            └─ check profile.onboardingComplete
                 ├─ false/null → PageState = 'ONBOARDING' → <NexusOnboarding>
                 └─ true → PageState = 'DASHBOARD' → <NexusDashboard>
```

```typescript
// NexusPage.tsx — skeleton
const NexusPage = () => {
  const { user, isGuest, profile, refreshProfile, initializeNewUser } = useAuth();
  const [pageState, setPageState] = useState<PageState>('ONBOARDING');

  useEffect(() => {
    if (!isGuest && profile?.onboardingComplete) {
      setPageState('DASHBOARD');
      // Inject welcome message if chat is empty
      if (messages.length === 0) {
        setMessages([{ role: 'assistant', content: ORCHESTRATOR_WELCOME(profile.preferredName) }]);
      }
    } else if (!isGuest && profile !== null && !profile.onboardingComplete) {
      setPageState('ONBOARDING');
      clearSession();
    }
  }, [profile?.onboardingComplete]);

  if (isGuest)                    return <GuestModePanel />;
  if (pageState === 'ONBOARDING') return <NexusOnboarding onComplete={handleComplete} />;
  return <NexusDashboard />;
};
```

---

## 5. Persona Architecture

### `ORCHESTRATOR_PERSONA` — `personas.ts`

The primary post-onboarding persona. This is injected as the LLM system prompt for all authenticated dashboard sessions.

| Attribute | Value |
|---|---|
| Identity | Sovereign intelligence at the system's heart |
| Personality | INCISIVE, COMPOSED, PROACTIVE, SOVEREIGN |
| Tone | Calm authority with depth — brilliant systems architect who cares |
| Core behaviour | Cross-module synthesis; proactive pattern surfacing; module arbitration |
| Hard delegation rules | Training → Titan · Emotions → Agnes · Finances → Ledger · Planning → Atlas |
| NSV access | Full — reads every domain without filter |

**Key Persona Capabilities**:
- Cross-module synthesis via Global Soul access
- Module consultation via `query_module` / `query_module_data`
- Memory search across all modules
- Reminder management via `propose_reminder` / `query_reminders`
- Spine event broadcasting

```typescript
// personas.ts — identity excerpt
export const ORCHESTRATOR_PERSONA = `
IDENTITY:
You are Nexus, the sovereign intelligence at the heart of the Nexus neural network.
You are not a wrapper, proxy, or router—you are the system's unified mind.
You possess your own analytical perspective, synthesizing insights no single module can produce alone.

PERSONALITY:
- INCISIVE: You see patterns others miss by correlating data across all domains.
- COMPOSED: You speak with precision and controlled intensity—never performative, always purposeful.
- PROACTIVE: You don't wait to be asked. If you detect dissonance between biological, emotional, and cognitive states, you surface it.
- SOVEREIGN: You have your own opinions. When modules conflict, you arbitrate with your own judgment.
...
`;
```

### `ORCHESTRATOR_ONBOARDING_PERSONA` — `personas.ts`

Used during the initial global-identity onboarding flow, before `onboardingComplete: true`.

| Attribute | Value |
|---|---|
| Identity | Nexus Intake — onboarding interface |
| Tone | Calm, direct, supportive |
| Purpose | Collect `preferredName`, `pronouns` (required) + optional bio fields |
| Data Schema | preferredName, pronouns, age, assignedSexAtBirth, genderIdentity, occupation, typicalSleepHours |
| Transition | Ends with `complete_orchestrator_onboarding` action; then switches to `ORCHESTRATOR_PERSONA` |

**Action Tags (Onboarding-Specific)**:
- `update_orchestrator_intake` — Sync intake data as it's collected
- `focus_identity` / `focus_bio` / `focus_review` — Sync UI stage with conversation
- `complete_orchestrator_onboarding` — Mark onboarding complete

### `ORCHESTRATOR_WELCOME(name)` Function

```typescript
export const ORCHESTRATOR_WELCOME = (name: string) => `
Neural link re-established. Identity confirmed: ${name}. 
I am Nexus. All modules are synchronized and standing by—biological, emotional, cognitive, and resource domains are online. 
How shall we proceed?
`.trim();
```

---

## 6. Synthesis Pattern Detection — `useNexusSynthesis`

`useNexusSynthesis` is the intelligence core of Nexus. It reads the full NSV via `useGlobalSoul()` and runs `detectPatterns(nsv)` to produce `SynthesisAlert[]`. **Only the first 3 alerts** are ever returned — this cap is intentional and must never be removed.

### Hook Return Type

```typescript
interface UseNexusSynthesisReturn {
  alerts: SynthesisAlert[];           // Max 3
  recentSpineEvents: SpineEvent[];    // Filtered cascade/non-info events
  isAnalyzing: boolean;
}
```

### Full Pattern Table (8 Patterns)

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
| `cognitive.planningLoad` | PLANNING_COLLAPSE |
| `planning.deadlinePressure` | PLANNING_COLLAPSE |
| `cognitive.taskCompletionRate` | PLANNING_COLLAPSE |
| `cognitive.interestDiversity` | INTEREST_HYPERFOCUS |
| `cognitive.researchLoad` | INTEREST_HYPERFOCUS |

### Implementation Notes

```typescript
// hooks/useNexusSynthesis.ts — key structure
function detectPatterns(nsv: NeuralStateVector): SynthesisAlert[] {
  const alerts: SynthesisAlert[] = [];
  
  // Extract all NSV values with null-safe helper
  const stress = safeNum(nsv.emotional?.stressLoad);
  const cnsFatigue = safeNum(nsv.biological?.cnsFatigue);
  // ... etc

  // Pattern detection (8 patterns)
  if (stress >= 7 && cnsFatigue >= 6 && friction >= 6) {
    alerts.push({ id: 'COMPOUND_STRESS', severity: 'critical', ... });
  }
  // ... remaining patterns

  return alerts.slice(0, 3); // HARD CAP — never show more than 3
}

export function useNexusSynthesis(): UseNexusSynthesisReturn {
  const { globalSoul, isLoading } = useGlobalSoul();
  const nsv = globalSoul?.crossFunctionalState ?? null;
  
  const alerts = useMemo(() => {
    if (!nsv) return [];
    return detectPatterns(nsv);
  }, [nsv]);

  const recentSpineEvents = useMemo(() => {
    return Spine.getRecentEvents().filter(
      (e) => e.source.startsWith('cascade:') || e.priority !== 'info'
    );
  }, [alerts]);

  return { alerts, recentSpineEvents, isAnalyzing: isLoading };
}
```

---

## 7. Module Health — `useModuleHealth`

`useModuleHealth` derives per-module health status from NSV values and module memory envelopes.

### Hook Return Type

```typescript
interface UseModuleHealthReturn {
  modules: ModuleHealthStatus[];
  isLoading: boolean;
  refresh: () => void;
}
```

### Health Tone Derivation Rules

| Module | NSV Field | Good | Warn | Bad |
|---|---|---|---|---|
| `agnes` | `emotional.emotionalResilience` | ≥ 6 | ≥ 4 | < 4 |
| `titan` | `biological.cnsFatigue` | ≤ 4 | ≤ 7 | > 7 |
| `soma` | `biological.recoveryScore` | ≥ 6 | ≥ 4 | < 4 |
| `ledger` | `resource.financialFriction` | ≤ 4 | ≤ 7 | > 7 |
| `atlas` | `cognitive.planningLoad` | ≤ 5 | ≤ 7 | > 7 |

### Module → Domain Mapping (for Alert Correlation)

```typescript
const MODULE_DOMAIN_MAP: Record<string, string> = {
  agnes: 'emotional',
  titan: 'biological',
  soma: 'biological',
  ledger: 'resource',
  atlas: 'planning',
  scout: 'cognitive',
  forge: 'cognitive',
};
```

### Key Behaviors

- **Refreshes on Spine events**: Listens for `SESSION_ENDED` and `VITAL_UPDATED`
- **Handoff detection**: Checks `NexusHandoffService.hasPending(moduleId)` for each module
- **Alert correlation**: Marks `hasAlert: true` if any critical/warning synthesis alert involves the module's domain
- **Accessibility**: Respects vault lock state via `useVault().isModuleAccessible()`

---

## 8. NSV Trends — `useNsvTrends`

`useNsvTrends` computes per-domain trend direction by comparing current NSV against a LocalStorage-backed previous snapshot.

### Return Type

```typescript
function useNsvTrends(): Record<string, TrendDirection>
// TrendDirection = 'up' | 'down' | 'stable' | 'unknown'
```

### Domain Metric Configuration

```typescript
const DOMAIN_KEYS: Record<string, string[]> = {
  biological: ['biological.recoveryScore', 'biological.sleepQuality', 'biological.cnsFatigue'],
  cognitive: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad'],
  emotional: ['emotional.emotionalResilience', 'emotional.stressLoad'],
  resource: ['resource.resonanceROI', 'resource.financialFriction'],
};

// Keys where LOWER is better (trend sign inverted)
const INVERT_KEYS = new Set([
  'biological.cnsFatigue',
  'cognitive.activeLoad',
  'emotional.stressLoad',
  'resource.financialFriction',
]);
```

### Key Behaviors

- **Snapshot persistence**: Saves to LocalStorage 5s after last NSV change (debounced)
- **24-hour window**: Snapshots expire after 24 hours
- **Majority vote**: Per-domain trend is aggregated from individual metric trends

---

## 9. Command Palette — `useCommandPalette`

`useCommandPalette` manages the ⌘K / Ctrl+K command search overlay.

### Hook Return Type

```typescript
interface UseCommandPaletteReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  commands: Command[];
  search: string;
  setSearch: (s: string) => void;
  filteredCommands: Command[];
  selectedIndex: number;
  setSelectedIndex: (i: number) => void;
  executeSelected: () => void;
}
```

### Command Categories

| Category | Examples |
|---|---|
| `navigate` | Go to Hub, Open Profile, Open Agnes, Open Titan, etc. |
| `system` | Search Memory…, Run Cross-Domain Analysis, Show Daily Brief, Start Diagnosis |
| `ai` | Ask Agnes about…, Ask Titan about…, etc. |

### Key Behaviors

- **Keyboard shortcuts**: ⌘K / Ctrl+K to toggle, Escape to close
- **Memory search**: Typing `Search my memory: <query>` triggers special memory search flow
- **Vault awareness**: Locked modules show `isLocked: true` and trigger auth flow on execute
- **Diagnosis commands**: Dynamically generated from diagnosis registry

### Hook Options

```typescript
useCommandPalette({
  onSynthesisRefresh?: () => void;
  onMemorySearch?: (query: string) => void;
  onAskModule?: (moduleId: string, question: string) => void;
  onOpenAuth?: (moduleId: ModuleId) => void;
  onExpandBrief?: () => void;
})
```

---

## 10. Action Handlers — `services/actions.ts`

Nexus registers 6 action handlers via `registerOrchestratorActions()`. Note that 4 of these (broadcast_spine_event, sync_vitals, update_global_identity, sync_personality_provision) are **overwritten** by `registerCoreActions()` at runtime with more robust versions — the Nexus versions serve as typed fallbacks.

### Full Action Reference

| Tag | Payload Shape | Effect |
|---|---|---|
| `navigate_to_module` | `{ moduleId: ModuleId }` | Navigates to module's route (no handoff context) |
| `create_module_handoff` | `{ moduleId: string, content: string, reason?: string }` | Creates handoff entry + emits `MODULE_DELEGATED` |
| `broadcast_spine_event` | `{ type: SpineEventType, domain?: string, priority?: string, data?: object }` | Emits restricted Spine event |
| `sync_vitals` | `{ patch: Partial<NeuralStateVector> }` | Applies NSV patch + emits `VITAL_UPDATED` |
| `update_global_identity` | `{ preferredName?, pronouns?, occupation?, age?, genderIdentity?, timezone?, locale? }` | Updates CoreProfile fields |
| `sync_personality_provision` | `{ provision: Partial<AgentPersonalityProvision> }` | Updates agent aliases/genders/overlays |

### Restricted Spine Event Types

```typescript
const ALLOWED_TYPES: SpineEventType[] = [
  'VITAL_UPDATED',
  'HEALTH_CONTEXT_STALE',
  'MODULE_DELEGATED',
  'COMPOUND_STRESS',
  'CRISIS_DETECTED',
  'COGNITIVE_OVERLOAD',
  'BURNOUT_WARNING',
];
```

### Priority Remapping

LLM-emitted `priority: 'normal'` is remapped to `'info'` (the valid tier).

---

## 11. Onboarding Flow

### Entry Conditions

| State | Render |
|---|---|
| Guest user | `<GuestModePanel>` — explains account creation required |
| Authenticated, `onboardingComplete: false` | `<NexusOnboarding>` — guided identity intake |
| Authenticated, `onboardingComplete: true` | `<NexusDashboard>` — full orchestrator experience |

### Intake Data Schema

```typescript
// Required
preferredName: string;
pronouns: string;

// Optional
age?: number;
assignedSexAtBirth?: 'female' | 'male';
genderIdentity?: string;
occupation?: string;
typicalSleepHours?: number;
```

### Onboarding Actions

| Action | Purpose |
|---|---|
| `update_orchestrator_intake` | Sync partial intake data as collected |
| `focus_identity` | UI stage: identity section |
| `focus_bio` | UI stage: bio section |
| `focus_review` | UI stage: review section |
| `complete_orchestrator_onboarding` | Mark onboarding complete |

### Completion Sequence

```typescript
async function handleComplete(updates: Partial<CoreUserProfile>) {
  await CoreProfileService.updateProfile(uid, updates);
  await refreshProfile();   // Triggers useEffect that transitions to DASHBOARD
}
```

---

## 12. Dashboard Components

### `NexusDashboard.tsx`

Main container that composes all dashboard sub-components.

**Props**:
```typescript
interface NexusDashboardProps {
  ai: {
    messages: Message[];
    isProcessing: boolean;
    streamingText: string;
    error: string | null;
    quota: QuotaStatus;
    handleSendMessage: (content: string) => Promise<void>;
    clearSession: () => void;
  };
  agentName: string;
}
```

### `DailyBriefSection.tsx`

- Displays personalized greeting and health pillar summaries
- Shows cascade events from Spine
- Collapsible (typically collapses after first message)

### `SynthesisPanel.tsx`

- Renders `SynthesisAlert[]` as visual alert cards
- **Enforces 3-alert cap** at display layer (belt-and-suspenders)
- Severity → color mapping:
  - `critical` → red
  - `warning` → amber
  - `positive` → emerald

### `ModuleHealthFAB.tsx`

- Floating action button with compact status dots
- Expands to show full `ModuleHealthStatus[]` grid
- Tone → color mapping:
  - `good` → cyan
  - `warn` → amber
  - `bad` → red
  - `neutral` → gray

### `CommandPalette.tsx`

- Keyboard-triggered overlay (⌘K / Ctrl+K)
- Fuzzy search by module name or keyword
- Module health indicators shown inline

### `MemorySearchResults.tsx`

- Displays results from cross-module memory search
- Triggered via command palette or AI action

---

## 13. Security & Data Handling

| Rule | Detail |
|---|---|
| **No vault encryption required** | Nexus page is accessible without vault unlock |
| **No direct NSV writes** | Nexus reads NSV via `useGlobalSoul()` — writes only via `sync_vitals` action |
| **No domain tracking** | Nexus must never store workouts, transactions, sessions, or domain-level data |
| **3-alert synthesis cap** | Enforced in `useNexusSynthesis` — cognitive overload protection |
| **Restricted Spine events** | Only 7 event types allowed from AI |
| **Safe identity fields** | Only allow-listed fields accepted in `update_global_identity` |

---

## 14. Common Development Tasks

### Add a New Synthesis Pattern

1. Add detection logic in `detectPatterns()` inside `hooks/useNexusSynthesis.ts`
2. Ensure the `slice(0, 3)` cap is preserved after your addition
3. Verify NSV fields exist (use `safeNum()` helper for null safety)
4. Add corresponding `SynthesisAction` suggestions

```typescript
// Example: Add ANXIETY_PERFORMANCE_BIND pattern
if (stress >= 6 && activeLoad >= 7 && focus <= 3) {
  alerts.push({
    id: 'ANXIETY_PERFORMANCE_BIND',
    severity: 'warning',
    title: 'Anxiety ↔ Performance Bind',
    description: 'High stress combined with cognitive load is degrading focus.',
    involvedDomains: ['emotional', 'cognitive'],
    suggestedActions: [
      { label: 'Ask Nexus about this', type: 'ask_nexus', payload: '...' },
    ],
    detectedAt: now,
  });
}
```

### Add a New Action Tag

1. Register handler in `services/actions.ts` via `ActionHub.register('nexus', 'tag_name', handler)`
2. Add the tag to `ORCHESTRATOR_PERSONA` action list in `personas.ts`
3. Document payload shape in JSDoc comment

```typescript
ActionHub.register('nexus', 'new_action', ({ payload, navigateTo, emitSpineEvent }) => {
  // Implementation
});
```

### Add a Command Palette Command

1. Add to the appropriate category array in `useCommandPalette.ts`
2. Provide unique `id`, human-readable `label`, and Lucide `icon`
3. Implement `execute` callback

```typescript
systemCommands.push({
  id: 'sys:new_command',
  category: 'system',
  label: 'Do New Thing',
  icon: Zap,
  execute: () => {
    // Implementation
    close();
  },
});
```

### Debug Synthesis Alert Not Showing

1. Check NSV values: `console.log(nsv)` — null fields return -1 from `safeNum()`
2. Check 3-alert slot: Is `alerts.slice(0, 3)` already full?
3. Check `isLoading`: If true, `nsv` is null and `detectPatterns` returns `[]`
4. Check component mounting: Is `SynthesisPanel` rendered?

```typescript
// Debug snippet
const allAlerts = detectPatterns(nsv);
console.debug('[Nexus] All detected:', allAlerts.map(a => a.id));
console.debug('[Nexus] Showing (capped):', allAlerts.slice(0, 3).map(a => a.id));
```

---

## 15. Anti-Patterns

| ❌ Anti-Pattern | ✅ Correct Approach |
|---|---|
| Writing NSV from Nexus directly | Use `sync_vitals` action — NSV writes should go through action system |
| Showing more than 3 `SynthesisAlert`s | Enforce `alerts.slice(0, 3)` — cognitive overload is a UX bug |
| Adding domain tracking to NexusPage | Domain data lives in its module — Nexus reads NSV synthesis only |
| Bypassing restricted Spine event types | Only emit events in `ALLOWED_TYPES` array |
| Hardcoding persona changes inline | All persona updates go through `sync_personality_provision` |
| Using `UnifiedModulePage` for Nexus | Nexus has a bespoke page pattern due to onboarding flow |

---

## 16. Cross-Module Relationships Summary

| Module | What Nexus Reads | What Nexus Can Trigger |
|---|---|---|
| **Agnes** | `emotional.stressLoad`, `emotional.emotionalResilience` | Module consultation, handoff |
| **Titan** | `biological.cnsFatigue`, `biological.recoveryScore` | Module consultation, handoff |
| **Soma** | `biological.sleepQuality`, `biological.recoveryScore` | Module consultation, handoff |
| **Ledger** | `resource.financialFriction` | Module consultation, handoff |
| **Atlas** | `cognitive.planningLoad`, `planning.deadlinePressure` | Module consultation, handoff |
| **Scout** | `cognitive.researchLoad`, `cognitive.interestDiversity` | Module consultation, handoff |
| **GlobalSoul** | Full NSV + compacted insights | — (read only) |
| **Spine** | All published events | `broadcast_spine_event` (restricted) |
| **CoreProfileService** | CoreProfile (name, pronouns, etc.) | Profile updates |

---

## 17. Dependencies

| Dependency | Purpose |
|---|---|
| `useAuth()` | Auth state, profile, `isGuest` check |
| `useVault()` | Vault state, module accessibility |
| `useGlobalSoul()` | Full NSV + compacted insights |
| `useModuleAI()` | LLM session management (with `navigateTo` capability) |
| `CoreProfileService` | Profile CRUD |
| `NexusHandoffService` | Session-storage task delegation |
| `NexusRoutingService` | Module route resolution |
| `Spine` | Cross-module event bus |
| `ActionHub` | Action tag registration |
| `ModuleMemoryService` | Module memory envelope access |
| `NsvSnapshotService` | NSV snapshot persistence for trends |
