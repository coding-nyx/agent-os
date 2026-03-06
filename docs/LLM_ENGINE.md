# LLM Engine (Cognitive Engine)

The AGNES Cognitive Engine (`src/llm-engine/`) is a decoupled, data-agnostic LLM orchestration layer designed as an "External Entity" to the application's business logic.

## 1. Core Architecture

The engine is built on a **Modular Strategy Pattern** with three primary layers:

### A. The Orchestrator (`src/llm-engine/engine/Orchestrator.ts`)
The low-level interface to external LLM providers (currently OpenRouter).
- **Multi-Model Support:** Orchestrates calls across different model tiers (Reasoning, Standard, Economy).
- **Tool Handling:** Manages the LLM tool-calling lifecycle (Function calling).
- **Streaming Logic:** Handles SSE (Server-Sent Events) from the provider and performs real-time sanitization of internal thought/action tags.
- **Resilience:** Includes retry logic and automatic model scaling based on failure counts or context limits.

### B. The Memory Manager (`src/llm-engine/engine/MemoryManager.ts`)
Responsible for optimizing the "Cognitive Context" sent to the LLM.
- **Context Construction:** Compiles the system prompt, memory facts, long-term summaries, and active chat history.
- **Token Budgeting:** Uses `gpt-tokenizer` to monitor token counts and identify when consolidation is required.
- **Sliding Window:** Maintains a sliding window of recent messages while allowing for summarization of older conversation blocks.

### C. The Cognitive Agent (`src/llm-engine/engine/CognitiveAgent.ts`)
The high-level controller that ties the Orchestrator and Memory Manager together. It exposes a generic `chat()` interface that modules consume.

---

## 2. The Module Interface (`useModuleAI`)

Modules interact with the engine via the `useModuleAI` hook. This hook acts as a bridge between the generic engine and module-specific state.

- **Data agnostic:** The engine accepts `memoryContext: string[]`. The module is responsible for converting its domain data (e.g., `SessionSummary`, `BeliefGraph`) into formatted strings before passing them to the engine.
- **Action Hub:** The hook captures `<action>` tags from the LLM response and executes them via the `ActionHub`. Actions can update state, trigger navigation, or sync data to Firestore.
- **Sanitization:** All messages are sanitized via `src/llm-engine/sanitize.ts` to ensure that internal reasoning (`<thought>`) and control signals (`<action>`) are stripped from the public UI.

---

## 3. Low-Level Response Schema

The engine expects and enforces a structured XML-like response format from the models:

```xml
<thought>
Internal clinical analysis, pattern matching, and strategic planning.
</thought>

Public response visible to the user.

<action type="update_soul_resilience">{"score": 8, "reason": "Consistent progress"}</action>
```

- **Thought Blocks:** Extracted for internal debug visibility but hidden from the user.
- **Action Tags:** Extracted, parsed as JSON, and executed as side-effects.
- **Public Text:** Cleaned of all tags and rendered in the chat interface.
