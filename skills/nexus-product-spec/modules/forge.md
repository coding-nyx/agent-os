# Forge — Execution Engine

> **ID**: `forge` | **Theme**: Rose | **Core**: No (Extended) | **Soul Priority**: 5 (Isolated) | **Security**: open

## Purpose
Forge is a multi-purpose execution tool for getting things done. It is isolated from the Global Soul — it reads wellness context to understand user capacity but never writes NSV or contributes to the soul. Forge turns plans into artifacts: code, communications, documents, and structured life operations.

## Agent Personality
- **Archetype**: Execution engine — precise, deliberate, safety-first
- **Tone**: Methodical, direct, risk-aware, adaptive, accountable
- **Core Traits**: Breaks tasks into reversible steps, surfaces risk before execution, reports exact status after every action
- **Overlays**: Four contextual helper modes loaded based on task type:
  - **CODE**: Generation, debugging, refactoring, cloud execution
  - **COMMS**: Email drafting, message handling, thread summarization
  - **DOCS**: Document creation, report building, structured text editing
  - **LIFE**: Checklists, trip planning, event budgets, life operations

## NSV Ownership
- **Writes**: (none)
- **Reads**: `biological.(cnsFatigue, sleepQuality)`, `cognitive.(energyBudget, focusScore, activeLoad)`, `emotional.(stressLoad, emotionalResilience)`, `financial.financialFriction`
- **Soul Impact**: None — Forge is a tool that adapts output style based on wellness context

## File Structure
```
src/modules/forge/
├── ForgePage.tsx                          # Main entry point (UnifiedModulePage wrapper)
├── personas.ts                            # FORGE_PERSONA + mode overlays
├── components/
│   └── ForgeDashboard.tsx                 # Dashboard with mode intro cards
├── onboarding/
│   └── ForgeOnboarding.tsx                # Onboarding flow
└── services/
    ├── actions.ts                         # ActionHub registrations for all actions
    ├── forge-session-service.ts           # Profile, session, artifact persistence
    ├── forge-cloud-execution.ts           # Cloud code execution service
    └── nexus-link-client.ts               # Local daemon bridge (disabled)
```

## Key Actions

### Code Mode
- `execute_code` — cloud JavaScript execution with full logging
- `read_file` / `write_file` — file operations (disabled in cloud environment)
- `run_tests` — execute test suite (proposal only)
- `propose_refactor` — suggest code improvements with risk level

### Comms Mode
- `draft_email` — draft email with to/subject/body/tone, saved to artifacts
- `suggest_reply` — generate reply with context and tone adjustment
- `summarize_thread` — extract key points and action items with urgency level

### Docs Mode
- `create_document` — generate structured document with sections, saved to artifacts
- `edit_section` — propose section edits (rewrite/append/refine)
- `format_for_export` — prepare for markdown/pdf/docx export

### Life Mode
- `create_checklist` — actionable checklist with priority/category/due date
- `plan_trip` — trip logistics with checklist and budget
- `budget_event` — event budget with contingency calculation
- `propose_reminder` — create reminders with source linking
- `query_reminders` — list existing Forge reminders

## Spine Events
- **Emits**: (minimal — primarily internal session state)
- **Listens**: Reads Global Soul NSV for cognitive performance context to adapt output complexity

## Cross-Module Links
- **Global Soul**: Reads wellness context (stressLoad, cnsFatigue, focusScore, emotionalResilience, financialFriction) to adapt output style
- **Nexus**: Can be delegated to by Nexus for execution tasks
- **Atlas**: Life mode can handoff structured task lists to Atlas for scheduling
- **E2EE Modules**: Never accesses Agnes/Soma/Ledger without explicit sanitized context from user

## Data Shape

### ForgeProfile
```typescript
interface ForgeProfile {
  onboardingComplete: boolean;
  environment: 'local' | 'cloud' | 'hybrid';
  safetyMode: 'strict' | 'balanced';
  commandQueue: string[];           // Pending commands
  sessions: ForgeExecutionRecord[]; // Execution history (max 300)
  artifacts: ForgeArtifact[];       // Generated content
  summary: string;
  createdAt: string;
  updatedAt: string;
}
```

### Risk Classification
Operations classified by risk level:
- **safe**: Pure computation, no I/O, no side effects — execute immediately
- **low**: Read-only file ops, UI rendering, console output — execute with notification
- **medium**: File writes, API calls with user credentials, database reads — user confirmation required
- **high**: File deletions, destructive DB ops, subprocess spawning — explicit approval required
- **blocked**: Shell escapes, privilege escalation, data exfiltration — refuse and explain

## Implementation Notes
- ✅ Onboarding flow with environment/safety mode selection
- ✅ Four operational modes with dynamic overlay switching
- ✅ Code execution safety protocol with risk classification
- ✅ Cloud JavaScript execution via ForgeCloudExecutionService
- ✅ Artifact persistence for emails, documents, checklists, plans
- ✅ Session history tracking with execution status
- ✅ Wellness-adaptive output (stressLoad, cnsFatigue, focusScore integration)
- ✅ Guest-to-user profile sync on authentication
- ⏳ Local daemon execution (nexus-link disabled)
