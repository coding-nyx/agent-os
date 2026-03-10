# SPRINT 2 — Memory Consolidation & LLM Context Retrieval
**Duration:** 1–2 weeks  
**Objective:** Complete the existing consolidation and retrieval path so module chat can inject stable long-term context without breaking the `llm-engine` boundary.
**Status:** Completed — Closed in Sprint 6 on March 10, 2026

## Sprint Start
- Sprint 2 started as the active sprint and was paused when Sprint 4 started.
- Execution order is S2-001 -> S2-002 -> S2-003 -> S2-004 -> S2-005 -> S2-006.
- Completed: S2-001 through S2-006.

## Goals
- Operationalize memory consolidation on top of `useConsolidation`, `MemoryManager`, and `MemoryOrchestrator`.
- Harden encrypted retrieval and prompt injection for module-scoped memory.
- Validate interruption, recovery, and consolidation interactions in the app-layer runtime.

## In Scope
- Consolidation trigger rules and summary/fact extraction flow.
- Retrieval injection for module chat and first-message prewarm paths.
- Unit/integration coverage around encrypted module memory reads and recovery behavior.

## Out of Scope
- New engine internals or provider changes inside `src/llm-engine/*`.
- Spine Cascade Rules v2.
- New UI polish beyond what is needed to surface recovery/consolidation behavior.

## Sprint Items
1. **S2-001: Consolidation threshold audit**
   - [x] Acceptance: trigger rules are documented and tested against current `MemoryManager` token/window assumptions.
   - Immediate start: audit threshold constants and trigger points in `MemoryManager` + `useConsolidation`.

2. **S2-002: Summary + fact persistence path**
   - [x] Acceptance: older messages consolidate into durable summary/fact outputs without plaintext leaks for vault-protected modules.

3. **S2-003: Retrieval injection standardization**
   - [x] Acceptance: retrieved memory is injected consistently through `useModuleAI` for supported modules and skipped cleanly when locked or unavailable.

4. **S2-004: Pending recovery compatibility**
   - [x] Acceptance: interrupted or recovered sessions do not corrupt summary, active-session, or retrieval state.

5. **S2-005: Verification**
   - [x] Acceptance: targeted tests cover consolidation, retrieval, interruption, and encrypted persistence; `npm run build` passes.

6. **S2-006: RAG Adapter Implementation (Vault-Safe Retrieval)**
   - [x] Acceptance:
     - Web adapter integrates with `useModuleAI` retrieval path, accepts `encryptionKey`, and refuses plaintext paths for vault-scoped modules.
     - Non-web/KMP/native adapter stubs defined with secure keyring usage and offline Spine event queueing; proxy support documented for provider keys.
     - Pending completion recovery replays retrievals deterministically via context hashes; vault-locked sessions skip injection and mark status without crashes.
     - Tests or contracts cover encrypted fact/summary storage and absence of plaintext writes for protected modules.
   - Progress:
     - Added runtime-selectable RAG adapter registry.
     - Implemented `web` vault-safe adapter and `native` stub adapter contracts.
     - Added tests for vault blocking, runtime selection, and adapter overrides.
     - Pending recovery context-hash replay guard remains active in `use-module-ai`.

## Sprint Handoff
- Sprint scope is complete. Remaining portability follow-ups continue in [SPRINT_3](SPRINT_3.md) and the architecture backlog.
