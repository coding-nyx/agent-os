# LLM/AI System Quick Reference
## AGNES/Nexus AI Architecture Overview

**Overall Conformance: 8.2/10** ✅

---

## CORE STRENGTHS

### ✅ LLM Engine (9.1/10)
- **CognitiveAgent** (84 lines): Clean orchestration of memory → persona → LLM
- **Orchestrator** (332 lines): Production-grade tool-loop, streaming, error recovery
  - Tool-loop: Max 5 iterations, handles interruptions gracefully
  - Streaming: Delta emission, SSE parsing, provider control detection
  - Retry: Exponential backoff (3 attempts)
  - Free model: Grok 3 Mini Beta via OpenRouter
- **MemoryManager** (79 lines): Token budgeting (128k limit), 80% compression trigger
  - Consolidation: Automatic when >102.4k tokens
  - Context window: Last 30 messages
  - Token counting: Via gpt-tokenizer with fallback

### ✅ NSV & Authority (9.2/10)
- **NSV Ownership**: 5 authority domains (Agnes, Titan, Atlas, Ledger, Scout)
- **Read Permissions**: Filtered by module (e.g., trauma markers → Agnes ONLY)
- **Soul Authority Guard**: Write enforcement via NSV_OWNERSHIP matrix
  - `SoulAuthorityGuard.canWrite()` + `assertCanWrite()`
  - Orchestrator super-authority for synthesis
- **Trauma Markers**: Clinical exclusive (never leaves Agnes)

### ✅ Action Hub & Orchestration (9/10)
- **ModuleActionHub**: Dependency-aware routing (module → deps → orchestrator)
- **ActionContext**: Rich (NSV access, Spine emitter, soul updater, delegator)
- **Module Coverage**: 6/12 modules have dedicated handlers
  - ✅ agnes, titan, atlas, ledger, scout, forge
  - ❌ soma, documents, hub, bridge, profile

### ✅ Streaming & Interactivity (8.5/10)
- **Delta Emission**: Only new public text streamed (no duplicates)
- **Interruption Handling**: Provider control packets detected, skipped
- **Scoped Conversations**: Three tiers (general, scoped, field-crud)
  - General: Full context, all actions, persisted
  - Scoped: Entity-only context, entity actions, ephemeral
  - Field-CRUD: Schema only (no wellness data), field actions, ephemeral
  - Action filtering: Runtime block + console warning

---

## KEY GAPS

### ❌ TIER 1: CRITICAL BLOCKERS

1. **Episodic Memory Encryption** (Backlog item)
   - Status: Sessions stored in plaintext before Firestore
   - Fix: Wrap `commitSession()` with AES-GCM encryption
   - Impact: HIGH (violates "private by architecture")
   - ETA: 2-3 hours

2. **RAG Context Injection** (Services exist, not wired)
   - Status: Embedding service + episodic retrieval exist; not in system prompt
   - Fix: Call `retrieveRelevantMemories()` in `enhanceContextForModule()`
   - Impact: MEDIUM (enables semantic memory)
   - ETA: 3-4 hours

3. **LLM Field Validation** (Keyword fallback still active)
   - Status: Dynamic field system designed for LLM validation; keyword gates remain
   - Fix: Replace keyword validation with LLM prompt
   - Impact: HIGH (product spec calls for LLM-only)
   - ETA: 4-6 hours

### ⚠️ TIER 2: HIGH PRIORITY

4. **Atlas Predictive Engine**
   - Status: Task storage exists; no burnout detection, energy-wave flattening, deep-work windows
   - Impact: HIGH (core planning feature incomplete)
   - ETA: 8-10 hours

5. **Ledger Behavioral Analysis**
   - Status: ROI computation exists; no emotional spending correlation
   - Impact: MEDIUM (financial-emotional synthesis missing)
   - ETA: 6-8 hours

6. **Orchestrator Synthesis Display**
   - Status: Routing exists; no conflict detection, risk pre-surfacing, dual-domain crisis UI
   - Impact: MEDIUM (system mind incomplete)
   - ETA: 6-8 hours

### ⚠️ TIER 3: MEDIUM PRIORITY

7. **Per-Module Encryption Keys** (Not implemented)
   - Status: All modules use same master key
   - Fix: Implement PBKDF2 derivation per module
   - Impact: LOW (privacy nice-to-have)
   - ETA: 1-2 hours

8. **Module Action Coverage**
   - Status: 6/12 modules have actions
   - Fix: Define or explicitly zero-out for soma, documents, hub, bridge, profile
   - Impact: MEDIUM (enables module-specific workflows)
   - ETA: 2-4 hours per module

---

## PERSONA SYSTEM

### Maturity by Module
```
Agnes:       312 lines  ✅ EXCELLENT (9.5/10)  — Clinical depth, trauma protocols
Atlas:       101 lines  ⚠️ MODERATE  (6.5/10)  — Planning-focused, no prediction
Scout:       138 lines  ✅ GOOD     (7.5/10)  — Research-focused
Forge:       172 lines  ✅ GOOD     (7.5/10)  — Execution-focused
Orchestrator: 92 lines  ⚠️ LIGHT    (6/10)    — Routing, no synthesis UI
Ledger:       25 lines  ❌ MINIMAL  (3/10)    — No behavioral analysis
Documents:    9 lines  ❌ STUB     (1/10)    — Placeholder only
```

### PersonaFactory
- ✅ Injects user name, pronouns, gender personality
- ✅ Gender-aware linguistic framing (feminine, masculine, non-binary, gender-fluid)
- ✅ Biological context for AFAB users (menstrual cycle awareness)
- ⚠️ No persona overlay system (defined but unused)

---

## MEMORY ARCHITECTURE

### Episodic Memory
- **Service**: `ModuleMemoryService`
- **Storage**: Firestore (`module_memory` collection)
- **Encryption**: Optional (encryptionKey parameter)
- **Gap**: Sessions stored in plaintext if key not provided

### Semantic Memory
- **Service**: `SemanticMemoryService`
- **Storage**: Firestore (`semantic_memory` collection)
- **Format**: Fact-based (text + confidence + timestamp)
- **Retrieval**: Episodic memory service has cosine similarity search

### Embeddings
- **Service**: `EmbeddingService`
- **Model**: Gemini Embedding API (768-dim)
- **Fallback**: Lexical embedding if API fails
- **Gap**: Not wired into module context

### Consolidation
- **Trigger**: At 80% capacity (102,400 tokens)
- **Method**: LLM summarization + fact extraction
- **Window**: Active context = last 30 messages
- **Gap**: Consolidation logic delegated to `useConsolidation` hook

---

## SCHEMA REGISTRY & DYNAMIC FIELDS

### Structure
```
Core Schema (immutable)
  ↓
Template Fields (always present)
  ↓
Extension Fields (user/AI-created at runtime)
  ↓
Dashboard (core + custom section)
```

### Field Definition (JSON Schema v7)
- Type: TEXT | NUMBER | RANGE | SELECT | MULTI_SELECT | BOOLEAN | DATE | TEXTAREA | OBJECT
- Validation: min, max, pattern, enum, etc.
- Metadata: category, order, uiHint, icon, helpText

### Validation
- **Structural** (Code): Uniqueness, type consistency, count limits
- **Domain** (Intended LLM): Semantic relevance, scope checking
- **Gap**: Keyword-based validation still active (should be LLM-only)

### Field Creation Flows
1. **Via Chat**: Ephemeral field-CRUD conversation → LLM generates action → validation
2. **Via Button**: Minimal form → single LLM call → SchemaRegistry
3. **AI Suggestion**: Inline card during general conversation

### Context Injection
- Extension fields auto-injected into system prompt as `[CUSTOM TRACKED FIELDS]`
- Values included (not just definitions)
- Clear formatting distinguishes custom fields

---

## CRITICAL FILES

| System | File | Lines | Status |
|--------|------|-------|--------|
| AI Engine | CognitiveAgent.ts | 84 | ✅ |
| Tool Loop | Orchestrator.ts | 332 | ✅ |
| Memory | MemoryManager.ts | 79 | ✅ |
| Models | ModelRegistry.ts | 111 | ⚠️ |
| Authority | nsv-ownership.ts | 100+ | ✅ |
| Soul Guard | soul-authority-service.ts | 116 | ✅ |
| Actions | action-hub.ts | 125 | ✅ |
| Scoped Chat | use-scoped-conversation.ts | 250+ | ✅ |
| Episodic | module-memory-service.ts | 250+ | ⚠️ |
| Embeddings | embedding-service.ts | 60 | ⚠️ |
| Schemas | schema-registry.ts | 380 | ✅ |
| Context | global-soul-context.tsx | 200+ | ✅ |
| Agnes | /agnes/personas.ts | 312 | ✅ |
| Atlas | /atlas/personas.ts | 101 | ⚠️ |
| Ledger | /ledger/personas.ts | 25 | ❌ |

---

## SCORE BREAKDOWN

```
AI Engine Architecture:          9.1/10  ✅
Persona System:                  7.5/10  ⚠️
Memory Systems:                  7.5/10  ⚠️
Tool-Calling & Actions:          8.2/10  ✅
NSV Management:                  9.2/10  ✅
Encryption & Security:           6.8/10  ⚠️
Dynamic Field System:            6.5/10  ⚠️
Streaming Implementation:        8.5/10  ✅
Context Injection:               8.8/10  ✅
────────────────────────────────────────
OVERALL:                         8.2/10  ✅
```

---

## NEXT STEPS (Prioritized)

### THIS SPRINT (Tier 1: 10-15 hours)
1. Episodic memory E2EE wrapper
2. RAG context injection hook
3. LLM field validation replacement

### NEXT SPRINT (Tier 2: 20-25 hours)
4. Atlas predictive engine
5. Ledger behavioral analysis
6. Orchestrator synthesis display

### LATER (Tier 3: 10-15 hours)
7. Per-module key derivation
8. Module action coverage completion

---

## KEY DESIGN PRINCIPLES OBSERVED

✅ **Agent-as-Root**: AI is behavioral foundation, UI is downstream  
✅ **Soul Before Surface**: NSV is primary, dashboards are secondary  
✅ **State-Aware Behavior**: Agents adapt from NSV context  
✅ **AI-Validated Mutation**: Field creation, NSV writes gated by authority  
✅ **Module Isolation**: Each module keeps own logic; orchestration via Spine  
✅ **Living Data Structure**: Schemas evolve via validated custom fields  
✅ **Private by Architecture**: E2EE at vault level (episodic gap noted)  

---

**Analysis Date:** March 2025  
**Full Report:** `/docs/LLM_AI_DESIGN_ANALYSIS.md` (1463 lines)
