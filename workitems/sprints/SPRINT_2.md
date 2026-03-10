# SPRINT 2 — Memory Consolidation & LLM Context Retrieval
**Duration:** 1–2 weeks  
**Objective:** Complete the existing consolidation and retrieval path so module chat can inject stable long-term context without breaking the `llm-engine` boundary.
**Status:** Active — Started March 10, 2026

## Sprint Start
- Sprint 2 is now the active sprint.
- Execution order is S2-001 -> S2-002 -> S2-003 -> S2-004 -> S2-005 -> S2-006.
- Completed so far: S2-001 through S2-005.

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
   - [ ] Acceptance:
     - Web adapter integrates with `useModuleAI` retrieval path, accepts `encryptionKey`, and refuses plaintext paths for vault-scoped modules.
     - Non-web/KMP/native adapter stubs defined with secure keyring usage and offline Spine event queueing; proxy support documented for provider keys.
     - Pending completion recovery replays retrievals deterministically via context hashes; vault-locked sessions skip injection and mark status without crashes.
     - Tests or contracts cover encrypted fact/summary storage and absence of plaintext writes for protected modules.
   - Progress: web-side vault-safe adapter contract and retrieval integration are in place; remaining work is non-web/KMP stub coverage and explicit adapter selection strategy.

## Sprint Handoff
- This sprint is still responsible for the memory consolidation and retrieval work described above, but parallel documentation and portability planning has launched in [SPRINT_3](SPRINT_3.md), which is tracking the LLM entrypoint story and migration guidance requested by the platform team.
