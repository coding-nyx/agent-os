# LLM Entrypoint Runtime

This document describes the app-facing LLM entry path for AGNES. It is the reference for where module code may integrate with the runtime and where it must stop.

## 1. Boot Chain
- `src/main.tsx` boots the SPA and registers core action handlers.
- `src/App.tsx` mounts providers in this order: `ThemeProvider` -> `DataLayerProvider` -> `AuthProvider` -> `VaultProvider` -> `GlobalSoulProvider` -> `AIProvider`.
- `AIProvider` in `src/llm-engine/ai-context.tsx` is the runtime entrypoint exposed to the app.
- `AIProvider` creates a `CognitiveAgent`, initializes model metadata, and exposes `sendMessage`, `streamMessage`, and `isInitialized`.
- `AIRuntimeGate` blocks route rendering until auth and AI runtime initialization complete.

## 2. Public Integration Surface
App code should integrate through these boundaries only:

### `useAI`
- Source: `src/llm-engine/ai-context.tsx`
- Responsibility: thin runtime transport wrapper around `CognitiveAgent.chat()`
- Returns:
  - `sendMessage(content, context, signal)`
  - `streamMessage(content, context, onChunk, signal)`
  - `isInitialized`

### `useModuleAI`
- Source: `src/lib/hooks/use-module-ai.ts`
- Responsibility: main module conversation adapter
- Adds:
  - filtered or full NSV prompt enhancement
  - memory retrieval and prewarming
  - active-session persistence
  - ActionHub execution
  - handoff processing
  - pending completion recovery
  - consolidation triggers
  - global projection / Spine side effects

### `useScopedConversation`
- Source: `src/lib/hooks/use-scoped-conversation.ts`
- Responsibility: ephemeral side-channel chat for scoped workflows
- Rules:
  - no Firestore persistence
  - no memory integration
  - action filtering by allowed action set
  - intended for field CRUD or entity-specific work, not full module chat

## 3. Internal Runtime Flow
The `llm-engine` remains a runtime boundary:

1. Module UI calls `useModuleAI` or `useScopedConversation`.
2. Hook builds a `ConversationContext` with:
   - `systemPrompt`
   - `memoryContext`
   - `summary`
   - `history`
3. `useAI` forwards the request into `CognitiveAgent.chat()`.
4. `CognitiveAgent` uses `MemoryManager.buildContext()` to compose:
   - active message window
   - memory facts
   - long-term summary
5. `CognitiveAgent` formats the final system prompt and calls `Orchestrator.sendMessage()`.
6. `Orchestrator` selects the active model, streams text, parses tool calls and `<action>` tags, and returns a `StructuredResponse`.
7. App-layer hooks execute effects:
   - `ActionHub`
   - `ModuleMemoryService`
   - `GlobalProjectionService`
   - `NexusHandoffService`
   - `Spine`

The engine parses actions. The app layer owns side effects.

## 4. Runtime Modes

### Guest Mode
- Set by `AIProvider guestMode`
- Forces `freeModelsOnly`
- Used for guest-safe model selection and quota-limited flows

### Mock Mode
- Enabled when no provider API key is available
- `Orchestrator` returns a synthetic response instead of hitting a provider

### Initialization Timeout
- `AIProvider` allows the app to proceed after 8 seconds with limited functionality
- This prevents the full UI from hanging on model/bootstrap delays

### Streaming / Cancellation
- `streamMessage` forwards chunks through a guarded callback
- Hooks use `AbortController` on unmount or manual interruption
- `Orchestrator` marks interrupted streams with `isInterrupted`

## 5. Message Assembly Rules

### System Prompt Ownership
- Module personas and module prompts live in module folders
- NSV/context injection happens in app-layer hooks, not inside the engine
- Document injection and memory retrieval are app-layer concerns

### Memory
- `useMemoryIntegration` retrieves module-scoped context
- `MemoryManager` manages the active window and token estimates
- `useConsolidation` decides when old messages should be summarized into long-term context

### Persistence
- Full module chat uses `ModuleMemoryService` and active-session persistence
- Scoped conversation is intentionally local-only
- Pending completion recovery is handled in `use-pending-recovery`

## 6. Extension Rules
Allowed extension points:
- add or revise module prompts in `src/modules/*`
- add app-layer prompt context in `useModuleAI` or related services
- add app-layer action handlers through `ActionHub`
- add module-local memory or onboarding services

Do not:
- wire UI directly to `Orchestrator` or `CognitiveAgent`
- move Firestore, auth, vault, or ActionHub side effects into `src/llm-engine/*`
- make module pages depend on engine internals beyond exported types/hooks

## 7. Failure Modes and Troubleshooting
- `Agent not initialized`: route rendered before `AIProvider` finished or hook used outside provider
- empty or interrupted stream: inspect `isInterrupted`, pending recovery state, and provider/network errors
- missing actions: `Orchestrator` may attempt correction re-prompts for action-like text that omitted tags
- vault-locked memory: module prompt may proceed with reduced memory context if encrypted data cannot be decrypted
- stale module UI after action execution: expect `MODULE_PROFILE_UPDATED` Spine events and module-profile reload/subscription paths to refresh state

## 8. Files to Read Together
- `src/App.tsx`
- `src/llm-engine/ai-context.tsx`
- `src/llm-engine/engine/CognitiveAgent.ts`
- `src/llm-engine/engine/Orchestrator.ts`
- `src/lib/hooks/use-module-ai.ts`
- `src/lib/hooks/use-scoped-conversation.ts`
- `src/lib/hooks/useConsolidation.ts`
- `src/lib/hooks/useHandoffProcessor.ts`

## 9. Entrypoint Story & Summary
- **Story:** As a platform integrator, I need a single-story overview of the LLM runtime so I understand how modules, agents, and Nexus services maintain alignment when we port AGNES to another stack (KMP/native/hybrid), keeping memory, actions, and UI continuity intact.
- **Summary of new tasks:** The portability story centers on preserving the locus of responsibility between `useModuleAI`, the Spine bus, and the LLM engine, while documenting how RAG retrieval, context compaction, and action tags stay synchronized with the live data model and UI. The documentation work in Sprint 3 connects back to the backlog entry under *Architecture & Portability* and informs next steps for migration and testing.

## 10. Portability Checklist & Next Steps
1. **Interface contracts** — Verify that modules and agents only call `useModuleAI`/`useAI`, and ensure any new adapters continue to honor CognitiveAgent’s `sendMessage`/`streamMessage` boundary.
2. **Context maintenance** — Identify where context compaction (summaries/facts) lives in `MemoryManager`/`useConsolidation`, then specify how those flows should persist (or rehydrate) when porting to another runtime so encrypted histories never leak. See Section 12.
3. **RAG & Nexus linking** — Document how module-scoped retrievals (including `scopedConversation` and pending completion recovery) should connect to RAG providers while respecting vault/E2EE protections. Include instructions for linking Spine/Nexus events after retrieval completes. See Section 11.
4. **Action tags** — Trace how `<action>` tags are generated, parsed, and executed by `Orchestrator` and the app-layer `ActionHub`, emphasizing that action tags must survive porting and maintain Side Effect gating.
5. **Alive data model & UI** — Define the UI contracts (profiles, NSV, global projection) that must stay live when contexts change, ensuring Spine events refresh module views and `ActionHub` updates propagate through `GlobalSoulProvider` and `VaultProvider`.
6. **Migration checklist** — Create a runnable checklist covering runtime boot order, provider bindings, Spine/Nexus handoff contracts, persistence adapters, and UI hooks. Validate each step with the Sprint 3 documentation work and the backlog's portability task list.

## 11. RAG Linking & Vault Boundaries (Ported Runtimes)
- **Adapter responsibilities:** RAG adapters must live at the app layer; they receive retrieval requests from `useModuleAI`/module services and return decrypted facts/summaries. Engine stays unaware of provider specifics.
- **Vault/E2EE constraints:** All stored embeddings and retrieved documents for vault-scoped modules must be encrypted at rest using the module/vault key. Decrypt in-memory only for assembly, then zero sensitive buffers when done. No plaintext disk writes for protected modules.
- **Key handling:** Ported stacks (KMP/native) must expose a secure keyring for vault keys. Retrieval adapters should take an `encryptionKey` param and refuse to run if absent.
- **Pending completion recovery:** When recovery resumes a stream, re-run retrieval with the same context hash to avoid drift; cache retrieval results in-memory only for the session. If vault locked mid-recovery, skip injection and mark the attempt as vault-blocked.
- **Non-web runtime guidance:** Use platform-secure storage (Keychain/Keystore/Secure Enclave) for keys; queue Spine events offline with encrypted payloads; perform RAG calls over a secure proxy when direct provider keys cannot be embedded.
- **Actionable outputs:** RAG results must flow back through `useModuleAI` into `memoryContext` or `memoryFacts`, never directly into UI; action tags generated after retrieval still route through `ActionHub`.

## 12. Consolidation & Recovery Safety in Ported Stacks
- **Ownership:** Consolidation thresholds and token/window math live in `MemoryManager` and `useConsolidation`; do not fork logic in UI shells. Ported runtimes should invoke the same parameters and keep defaults aligned.
- **Invariants:** Summaries/facts must be encrypted with the module/vault key; trimming of active history should never drop unsummarized protected messages; consolidation checkpoints must be replay-safe after interruptions or device restarts.
- **Failure modes to test:**
  - Interrupted streams during consolidation: ensure no partial summaries are committed; next run should retry with idempotent markers.
  - Vault lock mid-consolidation: abort write and mark pending; resume only once the key is present.
  - Offline/airplane: queue consolidation tasks locally; do not emit plaintext to disk; reconcile once online.
  - Context hash drift: ensure recovered sessions recompute summary/fact injection deterministically before sending.
- **Recovery touchpoints:** Pending completion recovery must not bypass consolidation queues. When resuming, revalidate token estimates to avoid over-window injection; if limits exceeded, trigger an immediate consolidation pass before sending.
- **Adapters:** Any non-web persistence adapter must provide atomic write + encrypt guarantees and expose a hook to clear stale checkpoints when schema versions change.
