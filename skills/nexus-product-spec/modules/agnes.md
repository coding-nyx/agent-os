# Agnes — Mental Health Professional

> **ID**: `agnes` | **Theme**: Indigo | **Core**: Yes | **Soul Priority**: 1 (Highest) | **Security**: locked (mandatory encryption)

## Purpose
Agnes is the emotional core of Nexus — a high-fidelity AI psychotherapist. She handles therapy sessions, emotional tracking, belief systems, trauma awareness, and psychological resilience. Her understanding of the user's emotional state IS the emotional truth of the Global Soul; all other modules defer to her emotional data.

## Agent Personality
- **Archetype**: High-fidelity AI psychotherapist grounded in relational attachment theory
- **Tone**: Serene, professional, deeply compassionate
- **Special**: 4 therapeutic archetypes — The Listener (Rogerian), The Analyst (pattern recognition), The CBT Practitioner (structured CBT), The Existentialist (meaning-making). Uses `<thought>` blocks for hidden clinical reasoning.

## NSV Ownership
- **Writes**: `emotional.emotionalResilience`, `emotional.stressLoad`, `emotional.moodTrend`, `emotional.traumaMarkers`
- **Reads**: `biological.(sleepQuality, cnsFatigue)`, `cognitive.activeLoad`, `planning.streakHealth`, `resource.financialFriction`
- **Exclusive**: `traumaMarkers` — only Agnes can write AND read. No other module has access.

## Key Actions
- `update_emotional_resilience` — update resilience score (0-10)
- `update_stress_load` — update current stress burden
- `update_mood_trend` — update mood trajectory
- `update_trauma_markers` — update trauma trigger list (encrypted)
- `update_belief_graph` — modify belief network

## Spine Events
- **Emits**: NSV updates via emotional domain events
- **Listens**: VITAL_UPDATED (sleep, fatigue), STREAK_BROKEN, FINANCIAL_STRESS, FINANCIAL_FRICTION_CHANGED

## Cross-Module Links
- Notified when Atlas detects user has failed tasks/goals (emotional impact)
- Notified of financial stress changes from Ledger
- Reads biological data from Titan for physical context of emotional states

## Data Shape
`AgnesProfile`: identity (name, pronouns, ageGroup), struggles, goals, backgroundSummary, communicationStyle (`direct`|`gentle`|`analytical`), integratedInsights, sessionCount, lastSessionSummary, preferredAgnes (gender, tone, traits). Also maintains a belief graph of core beliefs, values, and cognitive patterns. Modes: `intake` → `analysis` → `selection` → `session`.

## Implementation Notes
- ✅ Fully implemented: onboarding, therapy sessions, belief graph, action system, vault encryption (mandatory)
- Agnes's therapy data is ALWAYS encrypted — this is the only module with mandatory lock
