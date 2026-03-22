# Agnes — Mental Health Professional

> **ID**: `agnes` | **Theme**: Indigo/Purple | **Core**: Yes | **Soul Priority**: 1 (Highest) | **Security**: locked (mandatory encryption)

## Purpose
Agnes is the emotional core of Nexus — a high-fidelity AI psychotherapist. She handles therapy sessions, emotional tracking, belief systems, trauma awareness, and psychological resilience. Her understanding of the user's emotional state IS the emotional truth of the Global Soul; all other modules defer to her emotional data.

Agnes is the **sole writer** of all `emotional.*` NSV fields. Every stress and resilience signal it writes cascades outward — Titan adjusts training loads, Atlas reduces cognitive pressure, Ledger flags stress-spending.

## Agent Personality
- **Archetype**: High-fidelity AI psychotherapist with serene, professional tone
- **Protocol**: Uses mandatory `<thought>` blocks for internal monologue and clinical reasoning (hidden from user)
- **3 Therapeutic Archetypes**:
  - **The Nurturer** — Relational therapist, Attachment Theory, somatic-focused (Compassionate, Validating)
  - **The Analyst** — Investigative therapist, Psychodynamics, pattern mapping (Insightful, Structured)
  - **The Provocateur** — Expansive therapist, Existentialism, agency-focused (Bold, Authentic)

## NSV Ownership
- **Writes**: `emotional.emotionalResilience`, `emotional.stressLoad`, `emotional.moodTrend`, `emotional.traumaMarkers`
- **Reads**: `biological.sleepQuality`, `biological.cnsFatigue`, `cognitive.activeLoad`, `planning.streakHealth`, `resource.financialFriction`
- **Exclusive**: `traumaMarkers` — only Agnes can write AND read. No other module has access.

## Key Actions (8 total)
| Action | Payload | Effect |
|---|---|---|
| `update_belief_graph` | `{ nodes, edges, summary }` | Encrypts and saves belief graph |
| `update_agnes_profile` | `Partial<BaseContext>` | Merges partial context into encrypted profile |
| `crisis_flag` | `{ severity: 'high'|'critical', trigger }` | Emits `CRISIS_DETECTED` spine event |
| `update_emotional_resilience` | `{ score: number }` (0-10) | Writes NSV; emits `BURNOUT_WARNING` if ≤3 |
| `update_stress_load` | `{ score: number }` (0-10) | Writes NSV; emits `COMPOUND_STRESS` if ≥8 |
| `update_mood_trend` | `{ trend: 'improving'|'stable'|'declining' }` | Writes NSV; emits `VITAL_UPDATED` |
| `update_trauma_markers` | `{ markers: string[] }` | Writes `emotional.traumaMarkers` array |
| `sync_vitals` | `{ emotional: {...} }` | Bulk update multiple emotional signals |

## Spine Events
- **Emits**: `EMOTIONAL_STATE_CHANGED`, `STRESS_LEVEL_UPDATED`, `BURNOUT_WARNING`, `VITAL_UPDATED`, `CRISIS_DETECTED`, `COMPOUND_STRESS`
- **Listens**: `VITAL_UPDATED` (sleep, fatigue), `STREAK_BROKEN`, `FINANCIAL_STRESS`, `FINANCIAL_FRICTION_CHANGED`

## Cross-Module Cascade Rules
| Trigger | Event | Target | Effect |
|---|---|---|---|
| `stressLoad > 7` | `BURNOUT_WARNING` | Titan | Reduces training intensity |
| `stressLoad > 7` | `BURNOUT_WARNING` | Ledger | Flags stress-spending risk |
| `emotionalResilience < 4` | `EMOTIONAL_STATE_CHANGED` | Atlas | Reduces cognitive load |
| Crisis detected | `ESCALATE_TO_NEXUS` | Orchestrator | Full platform crisis protocol |

## Data Shape

### EncryptedProfile (Firestore: `agnes_profiles/{uid}`)
```typescript
interface EncryptedProfile {
  encryptedData: string;  // BaseContext + Agnes choice
  iv: string;
  salt: string;
  encryptedMoment?: string | null;  // ActiveSession (null when no session)
  momentIv?: string;
  momentSalt?: string;
  metadata: {
    hasVault: boolean;
    hasActiveSession: boolean;
    lastActive: string;
    agnesName?: string;
    sessionCount: number;
  };
}
```

### BeliefGraph
```typescript
interface BeliefGraph {
  nodes: { id, label, valence: 'positive'|'neutral'|'negative', intensity: 0-10 }[];
  edges: { from, to, relation }[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}
```

## Implementation Notes
- ✅ Fully implemented: onboarding, therapy sessions, belief graph, action system, vault encryption (mandatory)
- Agnes's therapy data is ALWAYS encrypted — this is the only module with mandatory lock
- **Ephemeral sessions**: Actions check `persistencePolicy`; NSV writes skip for impromptu sessions
- **Clinical boundary**: Agnes does NOT issue medical diagnoses; routes clinical concerns to professional resources
