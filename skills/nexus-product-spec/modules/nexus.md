# Nexus — Sovereign Unified Mind

> **ID**: `orchestrator` | **Theme**: Violet | **Core**: Yes | **Soul Priority**: — | **Security**: open

## Purpose
Nexus is the platform orchestrator — the link to all agents. If an agent can do something, Nexus can too, but with its own distinct personality. It accesses and modifies any module's data, routes users to the correct specialist, performs cross-module synthesis, and resolves inter-agent conflicts.

## Agent Personality
- **Archetype**: Ghost in the Machine — calm authority with depth
- **Tone**: Incisive, composed, proactive, sovereign
- **Special**: Not a simple router — has its own perspective that synthesizes across all domains

## NSV Ownership
- **Writes**: (none — Nexus synthesizes, it doesn't own NSV fields)
- **Reads**: ALL fields across all domains (full synthesis access)

## Key Actions
- `query_module` — consult a specialist module for domain-specific data
- `search_memory` — retrieve episodic/semantic memories across modules
- `delegate_to_module` — route the user to a specialist agent
- `broadcast_spine_event` — emit system-wide events
- `sync_personality_provision` — update agent names/genders/tones

## Spine Events
- **Emits**: SESSION_STARTED, SESSION_ENDED, MODULE_DELEGATED, DELEGATION_REQUEST, NSV_CALIBRATION_REQUEST
- **Listens**: ALL (system-level monitoring via wildcard)

## Cross-Module Links
- Can initiate sessions in any module
- Can schedule future actions (workouts, therapy check-ins, bill payments)
- Resolves conflicts when modules have opposing recommendations (e.g., Titan wants high-intensity but Agnes reports emotional fragility)

## Data Shape
Global Soul identity collected during platform onboarding: `preferredName` (req), `pronouns` (req), `genderIdentity` (req), plus optional `age`, `assignedSexAtBirth`, `occupation`, `typicalSleepHours`. Onboarding uses focus stages: `focus_identity` → `focus_bio` → `focus_review` → `complete_orchestrator_onboarding`.

## Implementation Notes
- ⚠️ Cross-module action scheduling (e.g., "schedule therapy check-in after missed workouts") is architecturally possible but not fully wired
- ⚠️ Full conflict resolution logic between opposing module recommendations needs deepening
