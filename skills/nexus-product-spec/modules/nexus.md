# Nexus — Sovereign Unified Mind

> **ID**: `nexus` | **Route**: `/nexus` | **Theme**: Cyan (`#06b6d4`) | **Core**: Yes | **Soul Priority**: — | **Security**: open

## Purpose
Nexus is the platform's **master orchestrator** — the sovereign intelligence at the heart of the system. It holds no domain-specific data of its own; instead, it **synthesizes signals from every other module** into a unified, cross-functional intelligence layer that no single domain module can produce alone. Nexus is the first place users land after authentication and the only module that can proactively route users to other modules.

## Agent Personality
- **Archetype**: Ghost in the Machine — calm authority with depth
- **Tone**: Incisive, composed, proactive, sovereign
- **Special**: Not a simple router — has its own analytical perspective that synthesizes insights no single module can produce alone. When modules conflict, Nexus arbitrates with its own judgment.

## NSV Ownership
- **Writes**: None directly — Nexus only writes via `sync_vitals` action (NSV writes go through the action system)
- **Reads**: ALL fields across all domains:
  - `biological.*` — cnsFatigue, recoveryScore, sleepQuality
  - `cognitive.*` — activeLoad, focusScore, planningLoad, energyBudget, interestDiversity, researchLoad, taskCompletionRate
  - `emotional.*` — stressLoad, emotionalResilience
  - `resource.*` — financialFriction, resonanceROI
  - `planning.*` — deadlinePressure

## Key Actions (6)
- `navigate_to_module` — Navigate to module's route (no handoff context)
- `create_module_handoff` — Create handoff entry + emit `MODULE_DELEGATED` event
- `broadcast_spine_event` — Emit restricted Spine events (7 allowed types)
- `sync_vitals` — Apply NSV patch + emit `VITAL_UPDATED` event
- `update_global_identity` — Update CoreProfile fields (preferredName, pronouns, etc.)
- `sync_personality_provision` — Update agent aliases/genders/overlays

## Synthesis Patterns (8)
Cross-module pattern detection via `useNexusSynthesis` hook (max 3 alerts shown):

| Pattern | Trigger | Severity | Domains |
|---------|---------|----------|---------|
| `COMPOUND_STRESS` | stress ≥ 7 AND cnsFatigue ≥ 6 AND friction ≥ 6 | critical | emotional, biological, resource |
| `BURNOUT_TRAJECTORY` | activeLoad ≥ 8 AND sleep ≤ 4 AND resilience ≤ 4 | critical | cognitive, biological, emotional |
| `RECOVERY_WINDOW` | recovery ≥ 7 AND stress ≤ 3 AND activeLoad ≤ 4 | positive | biological, emotional, cognitive |
| `SLEEP_PERFORMANCE_GAP` | sleep ≤ 4 AND focus ≤ 4 | warning | biological, cognitive |
| `FINANCIAL_EMOTIONAL_LOOP` | friction ≥ 7 AND stress ≥ 6 | warning | resource, emotional |
| `TRAINING_RECOVERY_CONFLICT` | cnsFatigue ≥ 7 AND recovery ≤ 3 | warning | biological |
| `PLANNING_COLLAPSE` | deadline ≥ 8 AND planningLoad ≥ 8 AND completion ≤ 0.3 | critical | planning, cognitive |
| `INTEREST_HYPERFOCUS` | diversity ≤ 2 AND researchLoad ≥ 7 | warning | cognitive |

## Core Hooks
- `useCommandPalette` — ⌘K / Ctrl+K command search overlay with module navigation
- `useNexusSynthesis` — 8-pattern detection → `SynthesisAlert[]` (max 3)
- `useNsvTrends` — Per-domain trend tracking (up/down/stable) via LocalStorage snapshots
- `useModuleHealth` — Per-module health status derivation from NSV + memory envelopes

## Spine Events
- **Emits (Restricted)**: `VITAL_UPDATED`, `HEALTH_CONTEXT_STALE`, `MODULE_DELEGATED`, `COMPOUND_STRESS`, `CRISIS_DETECTED`, `COGNITIVE_OVERLOAD`, `BURNOUT_WARNING`
- **Listens**: ALL (system-level monitoring via wildcard)

## Cross-Module Links
- Can initiate sessions in any module via handoff or navigation
- Reads from: Agnes (emotional), Titan (biological), Soma (biological), Ledger (resource), Atlas (planning), Scout (cognitive)
- Resolves conflicts when modules have opposing recommendations

## Data Shape
`CoreUserProfile` collected during platform onboarding:
- **Required**: `preferredName`, `pronouns`
- **Optional**: `age`, `assignedSexAtBirth`, `genderIdentity`, `occupation`, `typicalSleepHours`
- **System**: `agentPersonalityProvision` (agent aliases/genders/overlays)

Onboarding uses focus stages: `focus_identity` → `focus_bio` → `focus_review` → `complete_orchestrator_onboarding`.

## Implementation Notes
- ⚠️ Nexus uses a **bespoke page pattern** (not `UnifiedModulePage`) due to its global-identity onboarding flow
- ⚠️ 3-alert synthesis cap is enforced at both hook and display layer — cognitive overload protection
- ⚠️ Cross-module action scheduling is architecturally possible but not fully wired
- ⚠️ Full conflict resolution logic between opposing module recommendations needs deepening
