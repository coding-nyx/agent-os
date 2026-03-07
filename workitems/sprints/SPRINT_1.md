# Sprint 1: Reliability & Integrity (Current)

**Goal:** Secure the AGNES core engine and implement the "indestructible" Action Gateway.

## Active Items

### [S1-ITEM-1] Secure Tag Parsing & Robust Orchestration
- **Owner:** Developer + Architect Agent
- **Priority:** Critical
- **Task:** Refactor `Orchestrator.ts` to use a tag-balanced parsing algorithm (not just regex) to capture `<thought>` and `<action>` content reliably.
- **Success Criteria:** 
  - LLM "thinking out loud" (thought tags) is correctly hidden from the public UI even if it's multi-line.
  - Actions are captured even if formatting is slightly irregular.

### [S1-ITEM-2] Zod Validation Gateway
- **Owner:** Architect Agent
- **Priority:** Critical
- **Task:** Implement `src/core/actions/schema.ts` and integrate it into the `Orchestrator`'s action processing loop.
- **Success Criteria:**
  - All global actions (`request_biometric`, `update_soul_resilience`, `delegate_module`) must pass Zod validation before execution.
  - Malformed payloads are logged and the action is blocked.

### [S1-ITEM-3] Decentralized Action Registry
- **Owner:** Developer Agent
- **Priority:** High
- **Task:** Refactor the `ActionHub` to allow modules to register their own action handlers dynamically.
- **Success Criteria:**
  - `ActionHub.execute` is replaced with a registry-based lookup.
  - No need to modify the global `ActionHub` when adding new module-specific actions.

### [S1-ITEM-4] Automatic Memory Consolidation
- **Owner:** Developer Agent
- **Priority:** Medium
- **Task:** Connect `MemoryManager` to the `CognitiveAgent.chat` flow to trigger auto-summarization.
- **Success Criteria:**
  - Chat history remains manageable without manual user intervention.
  - Token counts are monitored in real-time.

## Sprint Log
- [ ] Research: Map all current action types.
- [ ] Strategy: Define the Zod schemas for core actions.
- [ ] Execution: Implement the robust tag parser in `Orchestrator.ts`.
- [ ] Execution: Refactor `ActionHub.ts` for modularity.
