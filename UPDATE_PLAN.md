# AGNES Update Plan (Post-Initialization)

## Scope Summary
This plan covers the remaining expansion scope after `INITIALIZATION_PLAN.md`:

1. `Atlas` — Daily Planner / Routine Handler
2. `Forge` — Coding Helper
3. `Pulse` — News Agent
4. `Scout` — Web Search Agent
5. `Vaultkeeper` — Backup and Recovery Agent

These agents will be integrated on top of the existing orchestrator + therapy + trainer + ledger foundation.

## Goals
1. Add new specialized agents without breaking module boundaries.
2. Reuse shared profile/context/memory contracts.
3. Keep safety, hallucination safeguards, and encrypted persistence consistent.
4. Enable extensible “agent plug-in” growth for future modules.

## Agent Naming Defaults
1. `Atlas` (planner)
2. `Forge` (coding)
3. `Pulse` (news)
4. `Scout` (web search)
5. `Vaultkeeper` (backup/recovery)

All default to `female` personality profile, with per-agent user override:
- `female`
- `male`
- `non-binary`
- `gender-fluid`

## Architecture Additions
1. Extend module registry with new `agentType` values:
- `planner`
- `coding`
- `news`
- `search`
- `backup`
2. Add `agentCapabilities` metadata per agent:
- required tools
- allowed data domains
- mutation rights
3. Add dedicated service layer per new agent under `src/modules/<agent>/services`.
4. Keep `llm-engine` as black-box and use app-layer wrappers only.

## Shared Interface Contract (All New Agents)

### Request Envelope
```ts
export type AgentRequest<TInput> = {
  requestId: string;
  userId: string;
  sessionId: string;
  agentId: string;
  timestampIso: string;
  input: TInput;
  contextRefs: {
    coreProfileRef: string;
    globalProjectionRef: string;
    moduleRefs?: string[];
  };
  policy: {
    mode: 'guest' | 'authenticated';
    tokenBudget: number;
    privacyLevel: 'standard' | 'sensitive';
  };
};
```

### Response Envelope
```ts
export type AgentResponse<TOutput> = {
  requestId: string;
  status: 'ok' | 'needs_input' | 'blocked' | 'error';
  output?: TOutput;
  citations?: Array<{ title: string; url: string; publishedAt?: string }>;
  confidence?: number;
  warnings?: string[];
  fallbackUsed?: string;
  nextActions?: string[];
};
```

### Mandatory Rules
1. No fabricated user facts.
2. No cross-module direct writes.
3. Persist only via each module service.
4. Return `needs_input` on missing critical fields.

## Agent-Specific Plan

## 1) Atlas — Daily Planner / Routine Handler
### Responsibilities
1. Build daily/weekly routines from goals and constraints.
2. Track adherence and update plans dynamically.
3. Coordinate with Trainer routines and Therapy load signals.

### Data
1. New collection: `planner_profiles/{uid}`.
2. Store:
- planning preferences
- recurring blocks
- daily plans
- completion logs
- adaptation history

### UI
1. Planner dashboard with day/week timeline.
2. Quick actions: complete, skip, reschedule.
3. Chat + structured plan editor.

## 2) Forge — Coding Helper
### Responsibilities
1. Debug and architecture guidance.
2. Task decomposition and code-review style suggestions.
3. Session-level coding memory only (no health profile writes).

### Data
1. New collection: `forge_sessions/{uid}` (optional retention policy).
2. Store:
- project context pointers
- task history
- suggested patch plans

### UI
1. Chat + “Task Board” panel.
2. Structured output cards: plan, risks, tests.

## 3) Pulse — News Agent
### Responsibilities
1. Personalized news briefing.
2. Topic/region/time-window filtering.
3. Summaries with “why this matters”.

### Data
1. New collection: `news_profiles/{uid}`.
2. Store:
- topic preferences
- source preferences
- digest schedule

### Safeguards
1. Always include source links.
2. Mark stale or unverified items explicitly.

## 4) Scout — Web Search Agent
### Responsibilities
1. Real-time research and fact retrieval.
2. Structured compare/summarize/fact-check workflows.
3. Citation-first responses.

### Data
1. New collection: `search_sessions/{uid}` (optional history).
2. Store:
- query logs
- result summaries
- citation records

### Safeguards
1. Confidence tagging.
2. Missing-data transparency (“not found / uncertain”).

## 5) Vaultkeeper — Backup and Recovery Agent
### Responsibilities
1. Manage encrypted backups across user core and module memory.
2. Create pre-compaction restore points.
3. Run integrity checks and guided restore.

### Data
1. New collection: `backup_manifests/{uid}`.
2. Store:
- backup id
- schema version
- timestamps
- checksum
- encrypted pointers
- restore status

### Recovery Rules
1. Restore never blindly overwrites active data.
2. Conflict report before final merge.
3. Rollback path retained until restore verification passes.

## Implementation Phases
0. Phase U0: **[DEFERRED] Cloud Functions Baseline.** (Moved to deferred scope) Set up the Firebase Functions environment, `onScheduleBackup` skeleton, and `onGlobalSoulSync` (Neural Synthesis) logic to support advanced health dashboards and automated backups.
1. Phase U1: registry + types + firestore schema/rules for new agents.
2. Phase U2: Atlas full vertical (onboarding, planner dashboard, memory).
3. Phase U3: Forge full vertical (chat + task board + session persistence).
4. Phase U4: Pulse + Scout verticals with citation and confidence safeguards.
5. Phase U5: Vaultkeeper backup orchestration + restore tooling.
6. Phase U6: cross-agent integration, QA, performance and security hardening.

## Acceptance Criteria
1. All five new agents are routable and registry-driven.
2. Each agent respects shared identity and personality settings.
3. Each agent has clear boundaries and correct data permissions.
4. External-information agents (`Pulse`, `Scout`) always return citations.
5. Backup and restore pass corruption and partial-write simulations.
6. Build passes with TypeScript strict mode.

## Deferred/Out of Scope
1. Auto-trading or financial execution features.
2. Autonomous write access from news/search agents into health modules.
3. Non-consensual cross-agent data sharing policy changes.
4. **Cloud Functions & Server-Side Orchestration (The "Neural Spine"):**
    - Automated Backup & Recovery (Vaultkeeper Core)
    - Context Compaction Engine (Token Optimization)
    - Neural Nexus Synthesis (Advanced Health Logic)
    - Nexus Hygiene (Guest Cleanup)
