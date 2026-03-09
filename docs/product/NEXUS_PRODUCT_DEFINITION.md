# Nexus Product Definition

> **Status:** Living product definition  
> **Platform Reference:** AGNES React 19 SPA  
> **Purpose:** Canonical product definition for verification, reimplementation, migration, and architectural alignment  
> **Scope:** Product vision, system structure, data model, LLM runtime, validation model, security model, and detailed agent definitions  

---

## Executive Definition

Nexus is a user-centric, multi-agent life operating system built around one idea: a person should be able to manage the emotional, physical, planning, financial, research, and execution layers of their life through specialized AI agents that share a unified understanding of the user without collapsing into a monolith.

The product is not "one chatbot with tabs." It is a coordinated ecosystem of applications, each with:

- a distinct domain,
- a distinct agent persona,
- a distinct workspace and data model,
- a bounded set of actions,
- shared access to a compressed user truth called the **Global Soul**,
- and a shared nervous system called the **Spine**.

Nexus is the sovereign orchestrator of that ecosystem. Agnes is the emotional authority. Titan is the physical authority. Atlas is the planning authority. Ledger is the resource authority. Scout and Forge are utility agents that inform or execute but do not define the user's soul.

This document describes the intended product, the current implementation shape, and the degree to which the codebase conforms to that vision.

---

## Table of Contents

1. [Product Identity](#1-product-identity)
2. [Product Vision and User Promise](#2-product-vision-and-user-promise)
3. [Canonical Product Structure](#3-canonical-product-structure)
4. [Core Data Model](#4-core-data-model)
5. [Module Data Structures](#5-module-data-structures)
6. [Runtime and LLM Workings](#6-runtime-and-llm-workings)
7. [Validation, Safety, and Guardrails](#7-validation-safety-and-guardrails)
8. [Security and Privacy Model](#8-security-and-privacy-model)
9. [Agent Definitions](#9-agent-definitions)
10. [Cross-Module Contracts](#10-cross-module-contracts)
11. [Vision Conformance Assessment](#11-vision-conformance-assessment)
12. [Reimplementation Guidance](#12-reimplementation-guidance)

---

## 1. Product Identity

### 1.1 One-Sentence Product Definition

Nexus is an integrated AI secretary, healthcare companion, planner, financial guide, research engine, and execution layer that uses specialized agents plus a shared soul/state model to help the user manage every part of life.

### 1.2 Product Identity Model

The product is defined by these truths:

1. **One user, many agents**  
   The user is the center. Each module is a dedicated specialist rather than a generic interface.

2. **One soul, many viewpoints**  
   Agents do not own the user. They contribute structured interpretations to a shared state layer.

3. **One nervous system, many events**  
   Modules communicate through Spine events and cascades, not brittle direct coupling.

4. **Living structure, not rigid forms**  
   Data models and interfaces can evolve with the user through validated custom fields and AI-assisted structure changes.

5. **Private by architecture**  
   Sensitive data is encrypted client-side. Access is constrained by module permissions, vault state, and ownership rules.

### 1.3 What the Product Is Trying to Replace

Nexus is intended to replace fragmented, disconnected personal systems such as:

- a therapist notebook,
- a workout app,
- a health tracker,
- a goal planner,
- a budget tracker,
- a research notebook,
- and a general-purpose assistant.

The product promise is not just "put these in one app." The promise is "let these domains understand each other in a way that actually helps the user."

---

## 2. Product Vision and User Promise

### 2.1 Vision

The long-term vision is a sovereign personal operating system where:

- each major life domain has a specialist agent,
- those agents maintain bounded expertise and personality,
- they share state through a compressed representation of the user,
- the system dynamically adapts data structure and interface to the user's needs,
- and the user can ask Nexus for anything from emotional support to scheduling to tax preparation to research synthesis.

### 2.2 User Promise

The system should feel like:

- a therapist who remembers emotional context,
- a coach who respects body state,
- a planner who accounts for energy and stress,
- a financial guide who understands why spending happens,
- a researcher who grades evidence,
- an executor who knows when the user has capacity and when they do not.

### 2.3 Non-Negotiable Product Principles

#### Agent-as-Root

The agent is not an assistant attached to a screen. The agent is the behavioral root of the module. The UI, fields, and workflows are downstream of the module's agent contract.

#### Soul Before Surface

The system should not optimize for dashboards alone. The real product value is the evolving shared understanding of the user.

#### State-Aware Behavior

Agents should adapt behavior from NSV and Global Soul context without bluntly exposing internal scores to the user.

#### AI-Validated Mutation & Soul Authority

New structure, field creation, and meaningful updates must be domain-validated by the relevant authoritative agent. Global Soul writes are strictly gated by agent-domain authority to prevent state corruption.

#### Module Isolation with Shared Coordination

Each module keeps its own logic, storage shape, onboarding, and actions. Cross-module behavior happens through shared orchestration layers, not through leaking business logic across boundaries.

---

## 3. Canonical Product Structure

### 3.1 Product Topology

Nexus is composed of three layers:

1. **User-facing modules**
2. **Shared coordination/runtime services**
3. **Externalized LLM engine boundary**

### 3.2 Primary Modules

| Module | Role | Status | Soul Role |
|---|---|---|---|
| Nexus / Orchestrator | Sovereign system mind | Core | Reads all, writes none directly |
| Agnes | Emotional and therapeutic authority | Core | Highest soul priority |
| Titan | Physical training and readiness authority | Core | Biological owner |
| Ledger | Financial authority | Core | Resource owner |
| Atlas | Planning and review authority | Extended | Cognitive/planning owner |
| Scout | Research and search tool | Extended | Utility, no soul authority |
| Forge | Execution tool (strictly non-planning) | Extended | Utility, no soul authority |
| Soma | Biomedical layer, delegated from Titan | Sovereign Logic, Shared UI | Biological adjunct |
| Documents | Shared Capability / Library surface | Extended | Support, minimal soul role |
| Bridge | Background alert daemon | Headless | Infrastructure only |
| Hub | Aggregated dashboard | Platform | Read-only overview |
| Profile | Identity and preference management | Platform | User identity management |

### 3.3 Provider and Runtime Composition

Current app-level composition:

1. `ThemeProvider`
2. `AuthProvider`
3. `VaultProvider`
4. `GlobalSoulProvider`
5. `AIProvider`
6. Router / module pages

This stack reflects the intended behavior:

- theme first,
- user identity second,
- vault access third,
- soul/state fourth,
- AI runtime fifth,
- module experience last.

### 3.4 Architectural Boundaries

#### Modules

Module-specific logic belongs in `src/modules/<module>/`.

#### Shared Platform

Shared contracts, contexts, services, and orchestration live in `src/lib/*` and `src/core/*`.

#### LLM Runtime

`src/llm-engine/*` is treated as an external runtime boundary. The app consumes it through stable interfaces rather than embedding module logic inside it.

---

## 4. Core Data Model

### 4.1 Core User Profile

The user's base profile is represented by `CoreUserProfile`.

#### Canonical fields

```ts
CoreUserProfile {
  uid: string
  email: string
  preferredName: string
  pronouns: string
  age?: number
  assignedSexAtBirth?: 'female' | 'male'
  genderIdentity?: string
  occupation?: string
  typicalSleepHours?: number
  onboardingComplete: boolean
  agentPersonalityProvision: AgentPersonalityProvision
  securityPreferences: UserSecurityPreferences
  schemaVersion: number
  createdAt: string
  updatedAt: string
}
```

#### Required onboarding fields

The product intent is that only these are truly mandatory at initial Nexus onboarding:

- `preferredName`
- `pronouns`
- `genderIdentity`

Everything else should be progressively enrichable later through module conversations.

### 4.2 Agent Personality Provision

The user can customize agent identity presentation through:

```ts
AgentPersonalityProvision {
  orchestratorAlias: string
  moduleAliases: Record<string, string>
  agentGenders: Record<string, 'female' | 'male' | 'non-binary' | 'gender-fluid'>
  personaOverlays: Record<string, { tone?: string; style?: string }>
}
```

This is product-significant because Nexus is not only personalized by data, but by relational presentation.

### 4.3 Global Soul

The Global Soul is the product's cross-domain source of truth for the user as understood within Nexus.

It is stored as `GlobalProjection`:

```ts
GlobalProjection {
  lastSync: string
  overallWellnessScore: number | null
  displayNames: Record<string, string>
  agentGenders: Record<string, GenderPersonality>
  crossFunctionalState: NeuralStateVector
  compactedInsights: string[]
  therapeuticBaseline?: {
    isInitialized: boolean
    initializedAt?: string
  }
}
```

### 4.4 Neural State Vector

The NSV is the structured operating snapshot consumed by modules.

```ts
NeuralStateVector {
  biological: {
    cnsFatigue: number | null
    sleepQuality: number | null
    recoveryScore?: number | null
    hormonalContext?: string | null
  }
  emotional: {
    emotionalResilience: number | null
    stressLoad?: number | null
    moodTrend?: string | null
    traumaMarkers?: string[] | null
  }
  cognitive: {
    energyBudget?: number | null
    focusScore?: number | null
    activeLoad?: number | null
    researchLoad?: number | null
    planningLoad?: number | null
    taskCompletionRate?: number | null
    interestDiversity?: number | null
  }
  planning: {
    streakHealth?: number | null
    deadlinePressure?: number | null
  }
  resource: {
    financialFriction?: number | null
    resonanceROI?: number | null
  }
  lastUpdated: Record<string, string>
}
```

### 4.5 NSV Ownership

The ownership model is one of the product's most important contracts.

| Module | Owns / Writes | Reads |
|---|---|---|
| orchestrator | none | all NSV fields |
| agnes | emotional resilience, stress, mood, trauma markers | biological fatigue/sleep/hormonal, selected cognitive/planning/resource |
| titan | biological metrics | biological plus selected emotional/cognitive |
| atlas | cognitive planning metrics and planning metrics | almost all except trauma markers |
| scout | research load and interest diversity | selected biological/cognitive/emotional |
| ledger | financial friction and resonance ROI | selected resource/cognitive/emotional |
| forge | none | selected biological and cognitive |
| documents | none | none |
| bridge | none | none |

### 4.6 Product Meaning of the NSV

NSV is not just telemetry. It is behavioral context.

Examples:

- High `cnsFatigue` means Titan should reduce training load and Atlas should flatten schedule.
- Low `emotionalResilience` means Agnes should slow therapeutic progression and Nexus should surface emotional risk before operational advice.
- High `financialFriction` means Ledger should enter stabilization mode and Atlas should treat money stress as hidden cognitive load.

### 4.7 Memory Model

The product uses both episodic and semantic memory:

```ts
SessionEventSummary {
  id: string
  timestamp: string
  summary: string
  keyInsights: string[]
  sentiment: number
  tokenUsage: number
  embedding?: number[]
}

ModuleMemoryEnvelope {
  moduleId: string
  lastActive: string
  activeSessionId?: string
  latestSnapshot: string
  eventHistory: SessionEventSummary[]
  metadata: Record<string, unknown>
}

SemanticFact {
  id: string
  moduleId: string
  fact: string
  confidence: number
  updatedAt: string
}
```

#### Product meaning

- **episodic memory** preserves conversation continuity,
- **semantic memory** preserves extracted truths,
- **NSV** preserves operational state,
- **Global Soul** preserves synthesized identity and signal.

Together, these form the user context stack.

---

## 5. Module Data Structures

### 5.1 Agnes Data Model

Agnes uses an encrypted therapy profile centered around `BaseContext` and active session state.

```ts
BaseContext {
  identity?: { name?: string; pronouns?: string; ageGroup?: string }
  struggles?: string | string[]
  goals?: string | string[]
  backgroundSummary?: string
  integratedInsights: SessionSummary[]
  communicationStyle?: 'direct' | 'gentle' | 'analytical'
  sessionCount?: number
  lastSessionSummary?: string
  occupation?: string
  typicalSleepHours?: number
  preferredAgnes?: {
    gender?: 'female' | 'male' | 'non-binary' | 'no-preference'
    tone?: string
    traits?: string[]
  }
}

ActiveSession {
  id: string
  messages: Message[]
  emotionalTrend: string[]
  startedAt: number
  lastUpdatedAt: number
}
```

Agnes also maintains a belief-graph layer for durable cognitive and emotional patterning.

### 5.2 Titan Data Model

Titan manages training plus derived readiness context. It consumes clinical state from Soma via agent-level delegation.

Core Titan structures include:

- activity baseline,
- training history,
- routines,
- workout sessions,
- readiness context (consumed from Soma).

### 5.3 Soma Data Model

Soma is the sovereign authority for clinical state. It operates as a background intelligence layer that Titan delegates to for health reasoning.

Soma stores:

- biomarkers,
- clearances,
- lab summaries,
- medications,
- allergies,
- known conditions,
- medical image analyses.

Even when hosted within the Titan UI, Soma remains the exclusive "Write" owner of the biomedical profile (`soma_profiles`).

### 5.4 Atlas Data Model

Atlas owns structured planning:

- tasks,
- goals,
- habits,
- projects,
- routines,
- scheduled tasks,
- daily intentions,
- temporal reviews,
- energy wave points,
- recovery windows,
- preferences.

This model is notable because it stores both intention and review, not just planned work.

### 5.5 Ledger Data Model

Ledger's canonical financial input shape centers on:

- income,
- fixed expenses,
- variable expenses,
- debts,
- savings,
- planning outputs,
- financial friction,
- resonance ROI.

The `computeResonanceROI` service computes:

- a resource pressure metric,
- and a wellness-return estimate on spending.

### 5.6 Scout Data Model

Scout stores:

- research focus areas,
- knowledge nodes,
- interest nodes,
- verification queues,
- trend briefs,
- news briefs,
- confidence-scored claims.

It is a research memory system rather than a soul-authority system.

### 5.7 Firestore Shape

Current persistence surfaces include:

```text
vaults/{uid}
core_profiles/{uid}
agnes_profiles/{uid}
belief_graphs/{uid}
titan_profiles/{uid}
soma_profiles/{uid}         (transitional / planned shape)
atlas_profiles/{uid}
ledger_profiles/{uid}
scout_knowledge/{uid}
module_memory/{uid}_{moduleId}
active_sessions/{uid}_{moduleId}[_{sessionId}]
semantic_memory/{uid}/facts/{factId}
spine_events/{uid}/events/{docId}
global_souls/{uid}
```

---

## 6. Runtime and LLM Workings

### 6.1 Runtime Layers

The app-facing AI pipeline is:

1. module page or hook calls `useAI()` or `useModuleAI()`
2. context is assembled from profile, memory, NSV, and optional documents
3. `CognitiveAgent` prepares final message context
4. `Orchestrator` handles actual provider communication
5. `sanitize.ts` extracts public text, thoughts, actions, and tool calls
6. `ActionHub` dispatches structured actions
7. persistence and NSV updates happen through services

### 6.2 AIProvider

`AIProvider` initializes the LLM agent for the app.

It:

- reads API keys from local storage or env,
- supports guest mode,
- can switch to free models only,
- and exposes `sendMessage`, `streamMessage`, and initialization state.

### 6.3 CognitiveAgent

`CognitiveAgent` is the high-level app-facing agent wrapper.

Its main responsibilities:

- build context via `MemoryManager`,
- combine system prompt plus history plus memory,
- invoke orchestrator,
- return updated conversation state.

### 6.4 Orchestrator

`Orchestrator.ts` is the core request engine.

#### Key behaviors

- supports message sending and streaming,
- can loop through up to five tool-call iterations,
- parses provider output and structured action tags,
- handles interruption and provider-control tokens,
- returns a `StructuredResponse`.

### 6.5 Structured Response Model

The engine returns:

```ts
StructuredResponse {
  fullText: string
  publicText: string
  internalThoughts: string | null
  actions: ParsedAction[]
  isInterrupted: boolean
}
```

### 6.6 MemoryManager

`MemoryManager` manages token budgeting and context assembly.

Known operating characteristics:

- max total token budget around 128k,
- compression threshold around 80 percent,
- active context window around recent 15 messages,
- fallback token estimation when tokenizer is unavailable.

### 6.7 PersonaFactory

`PersonaFactory` personalizes prompts by injecting:

- the agent's alias,
- the agent's gender personality,
- the user's preferred name and pronouns,
- gender-personality framing,
- biological context when relevant.

### 6.8 Prompt Composition

Prompt assembly follows this general structure:

1. base module persona,
2. identity sync block,
3. NSV block filtered by permissions,
4. memory summaries,
5. optional doc context,
6. state-awareness prompt fragments,
7. module-specific mode builders.

### 6.9 Sanitization and Action Extraction

`sanitize.ts` is responsible for turning raw LLM output into safe structured product output.

It:

- strips `<thought>` blocks from public responses,
- extracts `<action type="...">` payloads,
- handles `<tool_call>` blocks,
- strips provider interruption tokens,
- attempts JSON payload cleanup for malformed responses.

### 6.10 useModuleAI Product Role

The module-facing AI integration layer coordinates:

- module memory retrieval,
- handoff processing,
- active-session persistence,
- action execution,
- NSV patch accumulation,
- local and remote persistence,
- context policies such as `base-context` vs `doc-only`,
- persistence policies such as `auto`, `scout-research`, `atlas-planning`, `ledger-financial`, `manual`.

### 6.11 NSV Prompt Fragments

Each module gets behavioral prompt fragments that explain how to interpret NSV data.

Examples:

- Agnes uses high fatigue or low resilience to slow and soften therapeutic behavior.
- Titan treats high CNS fatigue as mandatory rest, not suggestion.
- Atlas converts biological, emotional, and financial state into schedule constraints.
- Ledger simplifies financial decisioning when energy is low or stress is high.
- Forge reduces task complexity when focus or energy are low.
- Nexus surfaces cross-domain conflicts before advice.

---

## 7. Validation, Safety, and Guardrails

### 7.1 Product Validation Philosophy

Nexus does not rely on one validation layer. It uses stacked validation:

1. structural validation,
2. semantic AI validation,
3. action whitelisting,
4. ownership constraints,
5. staleness guards,
6. vault and access checks.

### 7.2 Field and Schema Validation

The dynamic field system supports:

- core fields registered by module,
- extension fields added at runtime,
- structural checks for uniqueness, type consistency, count limits, restricted IDs,
- semantic domain validation through LLM review.

### 7.3 AI Validation Actions

The validation subsystem includes actions such as:

- `suggest_field_fix`
- `validate_with_context`
- `explain_validation`

### 7.4 Action Hub

`ModuleActionHub` is the action registry and dispatcher.

### 7.5 Action Safety

Handlers receive typed context that includes:

- module identity,
- user identity,
- guest flag,
- payload,
- encryption key,
- latest NSV access,
- spine emitter,
- global soul updater,
- module delegation function.

### 7.6 NSV Permission Enforcement

NSV permissioning is implemented by formatter-level scoping:

- Nexus sees all fields.
- Other modules only receive allowed metric paths.
- Trauma markers remain Agnes-exclusive.

### 7.7 Staleness and Sync Guards

Core handlers implement timestamp and freshness checks so modules do not overwrite authoritative state with stale updates.

### 7.8 Provider Control Sanitization

The sanitization layer removes provider-only interruption markers so platform state is not corrupted by transport artifacts.

### 7.9 Forge Risk Protocol

Forge adds its own execution safety model:

- safe,
- low,
- medium,
- high,
- blocked.

---

## 8. Security and Privacy Model

### 8.1 Vault

The vault should be defined as the user's **sealed private safe inside Nexus**.

#### Product role of the vault

The vault exists to:

1. establishing a user-held cryptographic root key,
2. verify that the vault password is correct without storing the password itself,
3. unlock protected memory and protected module state,
4. represent the transition from account access to private-inner-life access.

#### What the vault should gate

The vault should be required for:

- decrypting protected module profiles,
- reading protected session history,
- writing protected memory,
- updating deeply private module state,
- accessing trauma-sensitive Agnes data,
- accessing financial protected records,
- accessing medical/biomarker protected records,
- importing/exporting encrypted protected data,
- merging ephemeral sessions into durable private history.

#### Shell access vs private data access

The intended product behavior is that protected modules should eventually expose two different layers:

- **module shell access** — open the module and see safe top-level UI
- **private data access** — decrypt, load, and mutate sealed payloads

This creates three product states instead of one blurry binary:

1. **Logged out**
2. **Logged in, vault locked**
3. **Logged in, vault unlocked**

---

## 9. Agent Definitions

### 9.1 Nexus / Orchestrator

Nexus is the sovereign intelligence of the platform. It is the cross-domain synthesis layer.

### 9.2 Agnes

Agnes is the emotional and therapeutic authority of Nexus. She has the highest soul priority and defines the emotional truth of the user state.

### 9.3 Titan

#### Product role

Titan is the physical performance and readiness authority. It owns training behavior and currently also hosts derived readiness context.

#### Core identity

- module id: `titan`
- route: `/titan`
- theme: orange
- security: open by default

#### Personality

Titan is an elite AI physical performance strategist.

#### Responsibilities

- training program logic,
- workout and routine management,
- cycle management,
- sleep and readiness tracking (consumed from Soma),
- delegating clinical reasoning to Soma Agent,
- medical clearance-aware adaptation.

### 9.4 Soma

Soma is the body's state layer: biomarkers, lab results, clearances, medications, health conditions, and medical readiness. It operates as a background intelligence layer that Titan delegates to for health reasoning.

### 9.8 Forge

#### Product role

Forge is the execution layer. It is the most tool-like agent in the ecosystem and should transform intent into safe action. It does NOT perform planning or scheduling; those are reserved for Atlas. Forge initiates the execution (drafting, calls, scripts) based on Atlas-defined constraints.

#### Core identity

- module id: `forge`
- route: `/forge`
- theme: rose
- security: open by default

#### Personality

Forge is precise, deliberate, and safety-first. It operates as an "action plugin" for the user's intent.

---

### 9.9 Documents

#### Product role

Documents is a **shared library and capability surface** for ingestion and analysis of files. It is not an agent persona, but a set of tools (OCR, indexing, retrieval) that authoritative agents use to find context.

#### Product meaning

Documents provides a serviceable analysis environment for:

- financial docs (used by Ledger),
- research docs (used by Scout),
- lab reports (used by Soma),
- and imported textual artifacts.

It is a "Knowledge Library" that allows the platform to have a memory of its files.

---

## 10. Cross-Module Contracts

### 10.1 Conversation to State Contract

Canonical product flow:

1. user speaks to module,
2. context assembled from profile plus memory plus NSV,
3. agent responds with public text plus actions,
4. actions execute through ActionHub,
5. module state updates,
6. NSV patch accumulates if owned fields changed,
7. Spine event emitted,
8. cascades fire,
9. Global Soul updated if meaningful,
10. session and semantic memory persist.

### 10.2 Onboarding Contract

Every module may have a conversational onboarding path and template-driven initial dashboard generation.

### 10.3 Dynamic Field Contract

Every module may support core schema, user or AI-created extension fields, and reactive dashboard updates after schema changes.

### 10.4 Spine Contract

Spine events are the legal way for modules to influence shared system behavior.

### 10.5 Soul Update Contract

No module directly mutates the soul as an unrestricted blob. Instead, modules own limited metrics, and compaction controls whether signal becomes durable soul insight.

---

## 11. Vision Conformance Assessment

### 11.1 Conformance Summary

| Vision Pillar | Intended Product Behavior | Current Conformance |
|---|---|---|
| Multi-agent modular ecosystem | Each domain has its own module and identity | High |
| Global Soul as source of truth | Shared compressed user state across domains | High |
| Spine as coordination layer | Event-driven cross-module communication with cascades | High |
| Agent-as-root UX | Agent deeply integrated into module behavior | Moderate to high |
| Living data schema | Dynamic fields and template evolution | High |
| AI-validated mutation | Validation + field suggestion + contextual checks | High |
| Strong privacy boundaries | Vault, per-module locks, NSV read filters | High |
| Full cross-domain planning intelligence | Atlas deeply predicts and coordinates based on Agnes/Titan/Ledger | Partial |
| Financial contextual intelligence | Ledger correlates resource behavior with emotional/physical state | Partial |
| Distinct Soma identity | Health-state module separate from Titan | High (Data-Level) / Shared (UI) |
| Utility modules stay bounded | Scout and Forge remain non-soul authorities | High |
| Documents as shared library | Documents functions as a shared capability surface | Moderate |

---

## 12. Reimplementation Guidance

### 12.1 What Must Be Preserved

1. module isolation,
2. Global Soul plus NSV model,
3. Spine event bus and cascades,
4. action-based mutation model,
5. prompt personalization via persona factory,
6. permission-scoped state injection,
7. layered validation,
8. client-side privacy and vault model,
9. dynamic field extensibility,
10. memory fusion model.

---

## Closing Definition

Nexus is best understood as a coordinated ecosystem of expert agents sharing a compressed, privacy-respecting model of the user.

Agnes defines emotional truth. Titan defines bodily truth. Atlas defines actionable truth. Ledger defines resource truth. Scout and Forge expand capability without claiming authority over identity. Documents acts as the shared library for the ecosystem. Nexus binds all of them into one coherent operating system.

The current codebase already conforms strongly to that product definition at the architectural level. The remaining work is not discovering what Nexus is. It is finishing the expression of what Nexus has already become.
