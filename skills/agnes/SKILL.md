---
name: agnes
description: >
  Invoke this skill when working on the Agnes mental-health and emotional-intelligence
  module of the Nexus AGNES SPA. Agnes is the emotional core of the platform: it runs
  AI-assisted therapy sessions, owns all emotional NSV signals, and cascades stress/
  resilience data to every other module. Use this skill for anything touching
  src/modules/agnes/, NSV emotional domain writes, cross-module burnout/resilience
  cascade rules, or therapy-session data handling.
---

# Agnes Module Skill

> **Module ID**: `agnes` · **Route**: `/agnes` · **Theme**: `indigo/purple` · **NSV Domain**: `emotional` · **Firestore Collection**: `agnes_profiles`

---

## 1. What Agnes Is

Agnes is the **mental health and emotional intelligence module** of Nexus. It acts as an AI psychotherapist/companion, conducting structured therapy sessions using evidence-based modalities. The AI agent is named *Agnes* by default but can be given a user-customizable alias.

Agnes is the **emotional core of the entire Nexus platform**. Every stress and resilience signal it writes cascades outward — Titan adjusts training loads, Atlas reduces cognitive pressure, Ledger flags stress-spending — making Agnes the highest-priority module for data integrity and session safety.

### Therapy Modalities Supported
| Modality | Focus |
|---|---|
| Cognitive Behavioural Therapy (CBT) | Thought-pattern identification and restructuring |
| Relational Attachment Theory | Early relational patterns, trust, and connection |
| Modernized Psychodynamics | Unconscious drivers, defenses, insight work |
| Existential Therapy | Meaning, purpose, mortality, philosophical grounding |

**Clinical Boundary**: Agnes does **not** issue medical diagnoses. It routes any clinical concern to professional resources and escalates crises to the Nexus Orchestrator.

---

## 2. File Structure

```
src/modules/agnes/
├── AgnesPage.tsx                        — Module root (756 lines), auth gate, onboarding gate
├── types.ts                             — Type definitions (re-exports + local types)
├── personas.ts                          — AGNES_PERSONA master prompt + THERAPIST_ARCHETYPES + legacy personas (439 lines)
├── components/
│   ├── Agnes3DEnvironment.tsx           — 3D environment with belief nebula visualization
│   ├── AgnesDashboard.tsx               — Session data & belief graphs
│   ├── AgnesPersonalitySidebar.tsx      — Therapist personality traits display
│   ├── AgnesTherapistCard.tsx           — Therapist selection card
│   ├── AgnesSettingsPanel.tsx           — User settings panel
│   ├── AgnesTelemetryHeader.tsx         — Resilience, stress, mood metrics display
│   ├── AgnesNotificationSettingsPanel.tsx — Notification preferences
│   ├── BeliefGraph.tsx                  — Interactive belief visualization
│   ├── SanctuaryBackground.tsx          — Ambient background visuals
│   ├── AgnesSanctuarySidebar.tsx        — Sanctuary mode sidebar
│   ├── AgnesSanctuaryContent.tsx        — Sanctuary mode content
│   └── somatic/
│       ├── BreathworkExercise.tsx       — 4-7-8, box breathing exercises
│       ├── GroundingExercise.tsx        — 5-4-3-2-1 grounding technique
│       └── SomaticSessionPicker.tsx     — Somatic session type selector
├── onboarding/
│   ├── AgnesOnboarding.tsx              — Guided chat intake flow
│   ├── TherapyIntake.tsx                — Therapy intake questionnaire
│   └── AgnesOnboarding.test.tsx         — Onboarding unit tests
├── services/
│   ├── actions.ts                       — ActionHub registrations (8 action handlers, 142 lines)
│   ├── agnes-profile-service.ts         — Profile CRUD + encryption
│   └── belief-graph-service.ts          — Belief graph CRUD
└── prompts/
    ├── agnes-session-prompt.ts          — Session-specific prompt builders
    └── somatic-response-templates.ts    — Somatic response templates
```

---

## 3. Data Model

### Re-exported Types (from `@/lib/types`)
```typescript
// Re-exported in types.ts for module-local access
Message, SessionSummary, AgnesMode, Gender, AgnesArchetype, GeneratedAgnes, BaseContext
```

### `ActiveSession`
Represents the in-memory session state during active therapy conversations.

```typescript
interface ActiveSession {
  id: string;
  messages: Message[];           // The actual chat log
  emotionalTrend: string[];      // e.g. ["anxious", "calm", "reflective"]
  startedAt: number;
  lastUpdatedAt: number;
}
```

### `EncryptedProfile` / `AgnesProfile`
Stored encrypted in Firestore under `agnes_profiles/{uid}`. **Never stored in plaintext.**

```typescript
interface EncryptedProfile {
  uid?: string;
  
  // The "Soul" (BaseContext + Agnes Choice)
  encryptedData: string; 
  iv: string;
  salt: string;

  // The "Moment" (ActiveSession) - Null when no session is active
  encryptedMoment?: string | null;
  momentIv?: string;
  momentSalt?: string;
  
  // Metadata (Unencrypted for UI/Querying)
  metadata: {
    hasVault: boolean;
    hasActiveSession: boolean;
    lastActive: string;
    agnesName?: string;
    sessionCount: number;
    email?: string;
  };
}

type AgnesProfile = EncryptedProfile;
```

### Belief Graph Types (from `belief-graph-service.ts`)
```typescript
interface BeliefNode {
  id: string;
  label: string;
  valence: 'positive' | 'neutral' | 'negative';
  intensity: number;  // 0-10
}

interface BeliefEdge {
  from: string;
  to: string;
  relation: string;
}

interface BeliefGraph {
  nodes: BeliefNode[];
  edges: BeliefEdge[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Persona Architecture

### Master Prompt — `AGNES_PERSONA`
The core system prompt (~200 lines) injected into every Agnes session. Defines:
- **Operating Mandate**: Private encrypted therapy system with full engagement authority
- **Identity**: High-fidelity AI psychotherapist with serene, professional tone
- **Clinical Methodology**: Emotional safety, therapeutic relationships, layered self-view
- **Interaction Protocols**:
  - Mandatory `<thought>` block for internal monologue and move-category tracking
  - E2EE awareness and client confidentiality
  - Adaptation to Global Soul state (resilience, sleep, fatigue)
  - Anti-repetition constraints (move-category tracking, max limits per session)
  - Somatic-exploration protocol with regulate-before-explore flow
  - Distress protocol with crisis keywords and post-crisis mode
- **Session Telemetry**: Action tag emission guidelines
- **Cultural Attunement**: Context-sensitive, anti-pathologizing stance

### Dynamic Archetypes — `THERAPIST_ARCHETYPES[]`
Three clinically-grounded postures with distinct methodologies:

| ID | Name | Methodology | Traits |
|---|---|---|---|
| `nurturer` | The Nurturer | Relational therapist, Attachment Theory, somatic-focused | Compassionate, Somatic-Focused, Validating |
| `analyst` | The Analyst | Investigative therapist, Psychodynamics, pattern mapping | Insightful, Structured, Investigative |
| `provocateur` | The Provocateur | Expansive therapist, Existentialism, agency-focused | Expansive, Authentic, Bold |

Each archetype includes:
- Base clinical prompt with verbal fingerprints
- Somatic awareness guidelines (Nurturer does full somatic-exploration; others observe/slow down only)
- Safety constraints and earned-challenge principles

### Legacy Static Personas — `THERAPIST_PERSONAS[]`
Four pre-built personas maintained for fallback/reference:

| Index | Name | Style | Speciality |
|---|---|---|---|
| 0 | Dr. Elena | Empathetic | Warm validation, relational safety |
| 1 | Dr. Arthur | Analytical | Structured insight, pattern mapping |
| 2 | Coach Sarah | CBT | Action plans, thought records, behavioral activation |
| 3 | Dr. Silas | Existential | Meaning exploration, philosophical grounding |

### Dynamic Persona Factory — `generateAgnesOptions()`
```typescript
// Builds customized therapist options based on user context and gender preference
function generateAgnesOptions(context: BaseContext, gender: Gender = 'female'): GeneratedAgnes[]
```

Returns an array of `GeneratedAgnes` objects combining archetype base prompts with personalized names, pronouns, and the full interaction protocol.

---

## 5. NSV Signals — Emotional Domain

Agnes is the **sole writer** of all `emotional.*` NSV fields. No other module may write to this domain.

### Writes (Agnes → GlobalSoul)
| Signal | Range | Meaning |
|---|---|---|
| `emotional.emotionalResilience` | 0–10 | Capacity to absorb / recover from stress |
| `emotional.stressLoad` | 0–10 | Current psychological stress level |
| `emotional.moodTrend` | `'improving'` \| `'stable'` \| `'declining'` | Emotional momentum |
| `emotional.traumaMarkers` | `string[]` | Identified trauma patterns (e.g., abandonment, rejection) |

### Reads (Other Modules → Agnes Context)
| Signal | Source Module | Usage |
|---|---|---|
| `biological.sleepQuality` | Soma | Adapt pacing if sleep-deprived |
| `biological.cnsFatigue` | Soma | Reduce cognitive load in prompts |
| `cognitive.activeLoad` | Atlas | Consider mental bandwidth |
| `planning.streakHealth` | Titan | Context for motivation patterns |
| `resource.financialFriction` | Ledger | Context for stress discussion |

### Writing NSV Signals

All NSV writes go through the `updateGlobalSoul` callback passed to action handlers, which internally uses `GlobalProjectionService`:

```typescript
// Inside an action handler in services/actions.ts
ActionHub.register('agnes', 'update_stress_load', async ({ payload, persistencePolicy, updateGlobalSoul, emitSpineEvent }) => {
  const score = typeof (payload as any)?.score === 'number' ? (payload as any).score : null;
  if (score === null) return;
  
  // Skip NSV writes for ephemeral (impromptu) sessions
  if (persistencePolicy !== 'ephemeral') {
    await updateGlobalSoul({ emotional: { stressLoad: score } });
  }
  
  // Emit spine events based on thresholds
  if (score >= 8) {
    emitSpineEvent('COMPOUND_STRESS', { stressLoad: score, source: 'agnes' });
  }
});
```

---

## 6. Cross-Module Cascade Rules

Agnes triggers Spine events that propagate to other modules. These rules live in `src/lib/spine/cascade-rules.ts` and are registered via `registerAgnesCascadeRules()`.

### Cascade Table

| Trigger Condition | Event Published | Target Module | Downstream Effect |
|---|---|---|---|
| `stressLoad > 7` | `BURNOUT_WARNING` | **Titan** | Reduces training intensity and volume |
| `stressLoad > 7` | `BURNOUT_WARNING` | **Ledger** | Flags stress-spending risk; elevates variable spend forecast |
| `emotionalResilience < 4` | `EMOTIONAL_STATE_CHANGED` | **Atlas** | Reduces cognitive load in schedule planning |
| Emotional emergency detected | `ESCALATE_TO_NEXUS` | **Nexus Orchestrator** | Full platform crisis protocol |

### Publishing a Cascade Event

```typescript
import { Spine } from '@/lib/spine';

// Burnout warning — reaches Titan + Ledger
Spine.publish({
  type: 'BURNOUT_WARNING',
  source: 'agnes',
  domain: 'E',          // E = Emotional domain
  priority: 'alert',
  data: { stressLoad: 8.5 },
});

// Emotional state change — reaches Atlas
Spine.publish({
  type: 'EMOTIONAL_STATE_CHANGED',
  source: 'agnes',
  domain: 'E',
  priority: 'normal',
  data: { emotionalResilience: 3.2, moodTrend: -0.6 },
});
```

### Spine Events Agnes Publishes
- `STRESS_LEVEL_UPDATED` — on any `stressLoad` write
- `EMOTIONAL_STATE_CHANGED` — on resilience or mood change
- `BURNOUT_WARNING` — when `stressLoad > 7` threshold crossed

---

## 7. Action Tags

All action tags are registered in `services/actions.ts` via the ActionHub. When adding a new tag, it must also be documented in the `AGNES_PERSONA` SESSION TELEMETRY section so the LLM knows to emit it.

### Full Action Tag Reference (8 Actions)

| Tag | Payload Shape | Effect |
|---|---|---|
| `update_belief_graph` | `{ nodes: BeliefNode[], edges: BeliefEdge[], summary: string }` | Encrypts and saves belief graph to `belief_graphs/{uid}` |
| `update_agnes_profile` | `Partial<BaseContext>` | Merges partial context into encrypted profile |
| `crisis_flag` | `{ severity: 'high' \| 'critical', trigger: string }` | Emits `CRISIS_DETECTED` spine event with critical priority |
| `update_emotional_resilience` | `{ score: number }` (0-10) | Writes `emotional.emotionalResilience`; emits `BURNOUT_WARNING` if ≤3 |
| `update_stress_load` | `{ score: number }` (0-10) | Writes `emotional.stressLoad`; emits `COMPOUND_STRESS` if ≥8 |
| `update_mood_trend` | `{ trend: 'improving' \| 'stable' \| 'declining' }` | Writes `emotional.moodTrend`; emits `VITAL_UPDATED` |
| `update_trauma_markers` | `{ markers: string[] }` | Writes `emotional.traumaMarkers` array |
| `sync_vitals` | `{ emotional: { stressLoad?, emotionalResilience?, moodTrend? } }` | Bulk update multiple emotional signals; emits appropriate spine events |

### Ephemeral Session Handling
All emotional NSV actions check `persistencePolicy`. If set to `'ephemeral'` (impromptu sessions), NSV writes are skipped but spine events may still fire for critical conditions.

---

## 8. Onboarding Flow

### Entry Condition
Agnes checks `profile.onboardingComplete` on mount. If `false`, `AgnesOnboarding.tsx` is rendered instead of the main workspace.

### Intake Sequence
The onboarding is a guided chat that collects:
1. **Stress Sources** — what is causing distress right now
2. **Coping Mechanisms** — what has worked before
3. **Therapy Goals** — what the user hopes to achieve
4. **Archetype Preference** — which of the 4 persona styles resonates

A **fast-track option** is available via `useFastTrackValidation('agnes')` — skips deep intake and uses defaults with a brief summary prompt.

### Completion
```typescript
// Fired by complete_agnes_onboarding action tag handler
await AgnesProfileService.completeOnboarding(uid, {
  archetype,
  therapeuticGoals,
  currentStressors,
  copingStrategies,
});

// Seeds initial NSV vitals immediately after onboarding
await GlobalProjectionService.updateCrossFunctionalState(uid, {
  emotional: { stressLoad: initialStress, emotionalResilience: initialResilience },
});
```

---

## 9. Clinical Protocols

### 9.1 Crisis Protocol
If the LLM detects suicidal ideation or self-harm language:
1. Immediately switch to de-escalation response tone
2. Surface crisis resources (hotline numbers, emergency contacts) in the UI
3. Fire `escalate_to_nexus` action tag with `severity: 'emergency'`
4. Log the session with `sessionDepth` and a crisis flag — **do not summarize into a normal session object**

### 9.2 Session Depth Tracking
Track **engagement quality**, not just session frequency. `sessionDepth` is scored 0–10 based on:
- Emotional disclosure level
- Insight acknowledgement signals
- Therapeutic goal connection

### 9.3 Therapeutic Alliance
Agnes must maintain consistent persona tone **across sessions**. The archetype-derived system prompt is always re-injected at session start from the stored `AgnesProfile.archetype` — never inferred from context window.

### 9.4 Insight Compression
At session end, the LLM compresses the session into a `summary` string and up to 5 `insights`. These are synced to **GlobalSoul** so other agents have emotional context without storing raw therapy transcript.

### 9.5 Vault Locking
All therapy session data is **vault-locked**. Access requires `isModuleAccessible('agnes')` to return `true`. If it returns `false`, render the module access gate — never a partial view.

```typescript
import { isModuleAccessible } from '@/lib/vault';

if (!isModuleAccessible('agnes')) {
  return <ModuleAccessGate moduleId="agnes" />;
}
```

---

## 10. Security & Data Handling

| Rule | Detail |
|---|---|
| **No plaintext session content** | Always encrypt before writing to Firestore `agnes_profiles` |
| **Vault-locked** | `isModuleAccessible('agnes')` must be checked on every route render |
| **NSV writes only via projection service** | Never write `emotional.*` directly to Firestore |
| **No raw transcripts in GlobalSoul** | Only compressed summaries + insight arrays propagate cross-module |
| **No diagnoses** | Agnes must never output clinical diagnostic language (DSM codes, disorder labels as personal assertions) |

---

## 11. UI Components Reference

### Telemetry Header — `AgnesTelemetryHeader.tsx`
Displays real-time emotional metrics:
- Emotional resilience gauge (0-10)
- Stress load indicator (0-10)
- Mood trend arrow (improving/stable/declining)

### Dashboard — `AgnesDashboard.tsx`
Displays:
- Session history with summaries
- Belief graph integration
- Aggregate emotional patterns

### 3D Environment — `Agnes3DEnvironment.tsx`
Interactive belief nebula visualization:
- Nodes colored by valence (positive/neutral/negative)
- Node size by intensity (0-10)
- Edge connections showing belief relationships

### Belief Graph — `BeliefGraph.tsx`
2D interactive belief visualization component with:
- Node selection and highlighting
- Edge relationship display
- Summary panel

### Therapist Selection — `AgnesTherapistCard.tsx`
Card component for displaying and selecting therapist archetypes:
- Name and archetype badge
- Trait pills (e.g., "Compassionate", "Investigative")
- Selection state indicator

### Personality Sidebar — `AgnesPersonalitySidebar.tsx`
Displays the selected therapist's personality traits and clinical approach.

### Settings Panels
- `AgnesSettingsPanel.tsx` — General Agnes settings
- `AgnesNotificationSettingsPanel.tsx` — Notification preferences

### Sanctuary Mode
- `SanctuaryBackground.tsx` — Ambient visual background
- `AgnesSanctuarySidebar.tsx` — Sanctuary navigation
- `AgnesSanctuaryContent.tsx` — Sanctuary main content area

### Somatic Components — `components/somatic/`
| Component | Function |
|---|---|
| `BreathworkExercise.tsx` | Guided breathing (4-7-8, box breathing) with animated visuals |
| `GroundingExercise.tsx` | 5-4-3-2-1 grounding technique walkthrough |
| `SomaticSessionPicker.tsx` | Session type selector for somatic exercises |

---

## 12. Common Development Tasks

### Add a New Action Tag
1. Define the handler in `services/actions.ts` and register with `ActionHub.register('agnes', 'tag_name', handler)`
2. Add the tag + payload shape to the `AGNES_PERSONA` SESSION TELEMETRY section in `personas.ts`
3. If it writes NSV signals, use the `updateGlobalSoul` callback from the handler context
4. If it crosses module boundaries, use the `emitSpineEvent` callback or publish directly via `Spine.publish()`
5. Handle `persistencePolicy === 'ephemeral'` to skip writes for impromptu sessions

### Update NSV Emotional Fields
```typescript
// Inside an action handler
ActionHub.register('agnes', 'my_action', async ({ payload, persistencePolicy, updateGlobalSoul }) => {
  if (persistencePolicy !== 'ephemeral') {
    await updateGlobalSoul({
      emotional: {
        stressLoad: newValue,
        // Only include fields being updated — partial updates are safe
      },
    });
  }
});
```

### Add a Belief Graph Update
```typescript
import { saveBeliefGraph, BeliefGraph } from './belief-graph-service';

const graph: BeliefGraph = {
  nodes: [{ id: 'belief_1', label: 'Core belief', valence: 'negative', intensity: 7 }],
  edges: [],
  summary: 'Initial belief identified',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

await saveBeliefGraph(graph, { userId, encryptionKey });
```

### Register a New Cross-Module Cascade Rule
```typescript
// In src/lib/spine/cascade-rules.ts, inside registerAgnesCascadeRules()
Spine.onCondition({
  field: 'emotional.newSignal',
  operator: '<',
  threshold: 3,
  publish: {
    type: 'NEW_AGNES_EVENT',
    source: 'agnes',
    domain: 'E',
    priority: 'normal',
  },
});
```

### Add a Therapist Archetype
```typescript
// In personas.ts — append to THERAPIST_ARCHETYPES[]
{
  id: 'somatic',
  name: 'The Somatic Healer',
  basePrompt: `You are a body-centered therapist rooted in Somatic Experiencing...
    
    CLINICAL VERBAL FINGERPRINT:
    - Use phrases like: "What does your body want to do right now?"...
    
    SOMATIC AWARENESS:
    ...`,
  traits: ['Body-Centered', 'Trauma-Informed', 'Grounding']
}
```

---

## 13. Cross-Module Relationships Summary

| Module | Relationship | Direction |
|---|---|---|
| **Titan** | Receives `BURNOUT_WARNING` → reduces training intensity | Agnes → Titan |
| **Ledger** | Receives `BURNOUT_WARNING` → elevates stress-spend forecast | Agnes → Ledger |
| **Atlas** | Receives `EMOTIONAL_STATE_CHANGED` → reduces schedule cognitive load | Agnes → Atlas |
| **Nexus Orchestrator** | Receives `escalate_to_nexus` → crisis protocol | Agnes → Nexus |
| **GlobalSoul** | Receives compressed session insights at session end | Agnes → GlobalSoul |
| **Vault** | Provides `isModuleAccessible('agnes')` access gate | Vault → Agnes |
| **GlobalProjectionService** | Agnes uses this as the exclusive NSV write path | Agnes → Projection |

---

## 14. Common Pitfalls

| Pitfall | Correct Approach |
|---|---|
| Writing NSV directly to Firestore | Always use `updateGlobalSoul` callback in action handlers |
| Storing raw session transcript | Compress to `summary` + belief graph before any persistence |
| Skipping the vault gate | Always check `isModuleAccessible('agnes')` at the module root — never skip for "loading" states |
| Publishing Spine events with wrong domain | Agnes events must use `domain: 'E'` — wrong domain breaks cascade routing |
| Ignoring `persistencePolicy` | Check for `'ephemeral'` and skip NSV writes for impromptu sessions |
| Adding action tags only in `actions.ts` | New tags must also appear in `AGNES_PERSONA` SESSION TELEMETRY section or the LLM won't emit them |
| Allowing the LLM to output diagnostic labels | Prompt must explicitly forbid DSM-coded language as personal assertions |
| Skipping move-category tracking | Every `<thought>` block must include `Move_Log` and `Next_Move` per persona protocol |
| Doing somatic exploration during crisis | Post-crisis mode requires validation-only — no somatic inquiry until next session |
| Challenging before trust established | Provocateur archetype must wait 2-3 sessions before existential challenges |

---

## 15. Environment & Dependencies

- **Auth**: All Agnes routes require an authenticated Nexus user (`useAuth()`)
- **Firestore Collections**:
  - `agnes_profiles` — encrypted user profiles
  - `belief_graphs` — encrypted belief graph documents
- **Encryption**: `@/lib/encryption` — `encryptWithKey()`, `decryptWithKey()`
- **LLM**: Session chat uses the Nexus LLM gateway — not a direct OpenAI/Anthropic call
- **Spine**: `@/lib/spine/spine-event-bus` — event bus for cross-module cascade
- **ActionHub**: `@/lib/actions/action-hub` — centralized action tag registration
- **Data Layer**: `@/lib/data-layer/provider` — `getNexusDataLayer()` for Firestore abstraction
- **Vault**: `@/lib/vault` — `isModuleAccessible(moduleId)` access control
