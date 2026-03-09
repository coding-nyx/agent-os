# Forge — Execution Engine

> **ID**: `forge` | **Theme**: Rose | **Core**: No (Extended) | **Soul Priority**: 5 (Isolated) | **Security**: open

## Purpose
Forge is a multi-purpose execution tool for getting things done. Like Scout, it is isolated from the Global Soul — it reads wellness context to understand user capacity but never writes NSV or contributes to the soul.

## Agent Personality
- **Archetype**: Execution engine — precise, deliberate, safety-first
- **Tone**: Technical, efficient, protective
- **Special**: Four operational overlays — CODE (generation, debugging, refactoring), COMMS (email drafting, message handling), DOCS (document creation, editing), LIFE (checklists, trip planning, budgets)

## NSV Ownership
- **Writes**: (none)
- **Reads**: `biological.(cnsFatigue, sleepQuality)`, `cognitive.(energyBudget, focusScore, activeLoad)`
- **Soul Impact**: None — Forge is a tool

## Key Actions
- `execute_code` — run code (status: queued → pending_approval → executed)
- `read_file` / `write_file` — file operations
- `run_tests` — execute test suite
- `propose_refactor` — suggest code improvements
- `draft_email` / `send_communication` — communication tools

## Spine Events
- **Emits**: (minimal)
- **Listens**: (minimal — reads NSV for cognitive performance context)

## Cross-Module Links
- Reads cognitive/physical NSV to understand user's current capacity
- Can be delegated to by Nexus for execution tasks

## Data Shape
Operations classified by risk level: **safe** (pure computation — execute immediately), **low** (read-only — execute with notification), **medium** (file writes, API calls — user confirmation), **high** (deletions, DB ops — explicit approval), **blocked** (shell escapes, privilege escalation — refuse).

## Implementation Notes
- ✅ Onboarding, four operational modes, safety protocol implemented
