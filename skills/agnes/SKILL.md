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
├── AgnesPage.tsx                   — Module root, auth gate, onboarding gate
├── components/
│   ├── AgnesDashboard.tsx          — Mood trends, resilience metrics, session history
│   ├── AgnesWorkspace.tsx          — Tabbed therapy workspace
│   ├── MoodTracker.tsx             — Mood logging with trigger tagging
│   ├── CopingToolbox.tsx           — Library of coping strategies
│   ├── TherapeuticGoals.tsx        — Goal setting and progress tracking
│   └── FieldsTab.tsx               — Extension/custom field surface
├── onboarding/
│   └── AgnesOnboarding.tsx         — Guided chat intake flow
├── services/
│   ├── agnes-profile-service.ts    — CRUD for AgnesProfile in Firestore
│   └── actions.ts                  — ActionHub registrations for all Agnes action tags
├── personas.ts                     — AGNES_PERSONA system prompt + THERAPIST_PERSONAS[]
└── types.ts                        — AgnesProfile, Session, MoodEntry, AgnesArchetype types
                                      + generateAgnesPersona(archetype, user) factory
```

---

## 3. Data Model

### `AgnesProfile`
Stored encrypted in Firestore under `agnes_profiles/{uid}`. **Never stored in plaintext.**

```typescript
interface AgnesProfile {
  uid: string;
  onboardingComplete: boolean;
  archetype: AgnesArchetype;              // therapy style preference
  sessionHistory: Session[];             // past sessions with compressed summaries
  therapeuticGoals: string[];            // user-set therapy goals
  currentStressors: string[];            // active stressor list
  copingStrategies: string[];            // known effective coping methods
  moodLog: MoodEntry[];                  // time-series mood data
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `AgnesArchetype`
```typescript
type AgnesArchetype =
  | 'analytical'    // cognitive pattern focus, structured insight delivery
  | 'empathetic'    // emotional safety first, validation-led responses
  | 'cbt'           // action-oriented, thought-pattern restructuring
  | 'existential';  // meaning, purpose, philosophical grounding
```

### `Session`
```typescript
interface Session {
  id: string;
  startedAt: Timestamp;
  endedAt: Timestamp;
  summary: string;                // LLM-compressed session narrative
  insights: string[];             // key insights extracted
  therapeuticProgress: number;    // 0-10 snapshot at session end
  sessionDepth: number;           // 0-10 engagement quality rating
  moodAtStart: number;
  moodAtEnd: number;
}
```

### `MoodEntry`
```typescript
interface MoodEntry {
  id: string;
  timestamp: Timestamp;
  mood: number;                   // -1.0 to +1.0 continuous scale
  notes?: string;
  triggers?: string[];            // tagged trigger categories
}
```

---

## 4. Persona Architecture

### Static Personas — `personas.ts`

`THERAPIST_PERSONAS[]` is an array of 4 pre-built personas available for user selection:

| Index | Name | Style | Speciality |
|---|---|---|---|
| 0 | Dr. Elena | Empathetic | Warm validation, relational safety |
| 1 | Dr. Arthur | Analytical | Structured insight, pattern mapping |
| 2 | Coach Sarah | CBT | Action plans, thought records, behavioral activation |
| 3 | Dr. Silas | Existential | Meaning exploration, philosophical grounding |

`AGNES_PERSONA` is the **main dynamic persona string** — the default system prompt injected when no archetype override is active. It is rooted in **Relational Attachment Theory + modernized Psychodynamics**.

### Dynamic Persona Factory — `types.ts`

```typescript
// Builds a custom system prompt tailored to the user's chosen archetype and profile
function generateAgnesPersona(archetype: AgnesArchetype, user: AgnesProfile): string
```

The returned string is injected as the LLM system prompt at session start. It adapts tone, therapeutic framing, response structure, and action-tag usage to the archetype.

---

## 5. NSV Signals — Emotional Domain

Agnes is the **sole writer** of all `emotional.*` NSV fields. No other module may write to this domain.

| Signal | Range | Meaning |
|---|---|---|
| `emotional.stressLoad` | 0–10 | Current psychological stress level |
| `emotional.emotionalResilience` | 0–10 | Capacity to absorb / recover from stress |
| `emotional.moodTrend` | −1 to +1 | Emotional momentum (negative = declining, positive = improving) |
| `emotional.therapeuticProgress` | 0–10 | Trajectory of therapeutic engagement over time |
| `emotional.sessionDepth` | 0–10 | Quality and depth of the most recent session |

### Writing NSV Signals

```typescript
import { GlobalProjectionService } from '@/lib/projection/global-projection-service';

// Always go through GlobalProjectionService — never write Firestore directly
await GlobalProjectionService.updateCrossFunctionalState(uid, {
  emotional: {
    stressLoad: 7.2,
    emotionalResilience: 5.5,
    moodTrend: -0.3,
    therapeuticProgress: 6.1,
    sessionDepth: 7.8,
  },
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

All action tags are registered in `services/actions.ts` via the ActionHub. When adding a new tag, it must also be listed in the `AGNES_PERSONA` action tags section so the LLM knows to emit it.

### Full Action Tag Reference

| Tag | Payload Shape | Effect |
|---|---|---|
| `update_agnes_profile` | `Partial<AgnesProfile>` | Merges partial profile update |
| `update_emotional_state` | `{ stressLoad, emotionalResilience, moodTrend }` | Writes NSV emotional signals |
| `sync_vitals` | `{ emotional: { stressLoad, emotionalResilience } }` | Syncs key vitals to GlobalSoul |
| `focus_stress_sources` | `{ stressors: string[] }` | Updates `currentStressors` array |
| `focus_coping_strategies` | `{ strategies: string[] }` | Updates `copingStrategies` array |
| `focus_therapeutic_goals` | `{ goals: string[] }` | Updates `therapeuticGoals` array |
| `complete_agnes_onboarding` | `{ archetype: AgnesArchetype }` | Sets `onboardingComplete: true`, seeds initial NSV |
| `log_mood_entry` | `{ mood: number, notes?: string, triggers?: string[] }` | Appends a `MoodEntry` to `moodLog` |
| `update_session_summary` | `{ summary: string, insights: string[], therapeuticProgress: number }` | Appends compressed session to `sessionHistory` |
| `suggest_coping_strategy` | `{ strategy: string, context?: string }` | Surfaced to UI as a recommendation card |
| `escalate_to_nexus` | `{ reason: string, severity: 'urgent' \| 'emergency' }` | Triggers Nexus Orchestrator crisis protocol |

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

### Dashboard — `AgnesDashboard.tsx`
Displays:
- Mood trend chart (time-series from `moodLog`)
- `emotionalResilience` and `stressLoad` stat cards
- Session history list with compressed summaries
- Quick mood log button

Use `SurfaceCard` for panel containers and `StatCard` for metric displays. Do not use raw `<div>` wrappers for dashboard sections.

### Therapy Workspace — `AgnesWorkspace.tsx`
Tab-based layout:
- **Session** — live AI chat with the active persona
- **Goals** — `TherapeuticGoals.tsx`
- **Coping Toolbox** — `CopingToolbox.tsx`
- **Mood Log** — `MoodTracker.tsx`
- **Fields** — `FieldsTab.tsx` (extension fields)

### Extension Fields — `FieldsTab.tsx`
Agnes supports user-defined extension fields within the `emotional` domain. Allowed field types: moods, stressors, affirmations, journal prompts. All custom field values are **domain-validated by the LLM** before persistence to prevent scope bleed.

---

## 12. Common Development Tasks

### Add a New Action Tag
1. Define the handler in `services/actions.ts` and register with ActionHub
2. Add the tag + payload shape to the `AGNES_PERSONA` action tags section in `personas.ts`
3. Add the type to the action tag union in `types.ts`
4. If it writes NSV signals, call `GlobalProjectionService.updateCrossFunctionalState()`
5. If it crosses module boundaries, publish the appropriate Spine event

### Update NSV Emotional Fields
```typescript
await GlobalProjectionService.updateCrossFunctionalState(uid, {
  emotional: {
    stressLoad: newValue,
    // Only include fields being updated — partial updates are safe
  },
});
```

### Add a Dashboard Widget
```tsx
// In AgnesDashboard.tsx
import { SurfaceCard, StatCard } from '@/components/ui';

<SurfaceCard title="New Metric">
  <StatCard
    label="My Metric"
    value={value}
    trend={trend}
    domain="emotional"
  />
</SurfaceCard>
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

### Add a Therapy Modality (New Static Persona)
```typescript
// In personas.ts — append to THERAPIST_PERSONAS[]
{
  id: 'somatic',
  name: 'Dr. Maya',
  style: 'Somatic',
  description: 'Body-centered trauma processing, nervous system regulation',
  systemPrompt: `You are Dr. Maya, a somatic therapist...`,
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
| Writing NSV directly to Firestore | Always use `GlobalProjectionService.updateCrossFunctionalState()` |
| Storing raw session transcript | Compress to `summary` + `insights[]` before any persistence |
| Skipping the vault gate | Always check `isModuleAccessible('agnes')` at the module root — never skip for "loading" states |
| Publishing Spine events with wrong domain | Agnes events must use `domain: 'E'` — wrong domain breaks cascade routing |
| Calling `generateAgnesPersona` without a profile | Guard against null archetype — default to `'empathetic'` if unset |
| Adding action tags only in `actions.ts` | New tags must also appear in `AGNES_PERSONA` string or the LLM won't emit them |
| Using `StatCard` outside a `SurfaceCard` | Agnes dashboard convention requires `SurfaceCard` as the outer container |
| Allowing the LLM to output diagnostic labels | Prompt must explicitly forbid DSM-coded language as personal assertions |

---

## 15. Environment & Dependencies

- **Auth**: All Agnes routes require an authenticated Nexus user (`useAuth()`)
- **Firestore**: `agnes_profiles` collection — encrypted documents, compound index on `uid + updatedAt`
- **LLM**: Session chat uses the Nexus LLM gateway — not a direct OpenAI/Anthropic call
- **Spine**: `src/lib/spine` — event bus for cross-module cascade
- **GlobalProjectionService**: `src/lib/projection/global-projection-service.ts`
- **Vault**: `src/lib/vault` — `isModuleAccessible(moduleId)` access control
- **Fast-track hook**: `useFastTrackValidation('agnes')` — from `src/hooks/use-fast-track-validation`
