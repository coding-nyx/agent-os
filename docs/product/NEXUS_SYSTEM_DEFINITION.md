# Nexus System Definition (Product + Runtime + Module Logic)

Status: Canonical implementation-facing definition  
Date: March 2026  
Scope: Whole-product logic, subsystem contracts, module boundaries, live UI behavior, data and AI runtime flow

---

## 1) Product Definition

Nexus is a modular AI life operating system.

It is not a single chatbot with tabs. It is a coordinated multi-agent platform where:
- each module is a domain specialist,
- modules keep their own profile/data/workflow boundaries,
- modules share constrained cross-domain context through the Global Soul (NSV),
- cross-module signals propagate through the Spine event bus,
- the Orchestrator (Nexus) coordinates, routes, and synthesizes.

Core product goal:
- unify emotional, physical, financial, cognitive/planning, research, and execution support into one coherent user runtime without collapsing module boundaries.

---

## 2) Product Blocks (Top-Level)

Nexus is built from these blocks:
- UX Shell + Route Modules (`src/core/*`, `src/modules/*`)
- Platform Runtime (`src/lib/*`)
- LLM Runtime Boundary (`src/llm-engine/*`)
- Storage + Auth + Security (Firebase + Vault + encryption)

Current route topology in `src/App.tsx`:
- `/` landing
- `/orchestrator`, `/hub`, `/profile`
- `/agnes`, `/titan`, `/ledger`, `/soma`
- `/atlas`, `/scout`, `/forge`
- `bridge` exists in manifest but has no page route (`hasPage: false`)

---

## 3) Runtime Composition (Actual Current Order)

From `src/App.tsx`, providers are mounted in this active order:
- `ThemeProvider`
- `DataLayerProvider`
- `Router`
- `AuthProvider`
- `AIProvider` (via `AIWrapper`, guest-aware)
- `VaultProvider`
- `GlobalSoulProvider`
- `AppErrorBoundary`
- `AIRuntimeGate`

Cross-cutting live overlays mounted globally in app content:
- `NexusOverlay`
- `SpineOverlay`
- `NeuralDraftPanel`
- `SpineToastProvider`
- `NexusRouteBanner`

---

## 4) Core Subsystems

### 4.1 Data Layer (Persistence Abstraction)

Primary contract: `NexusDataLayer` (`src/lib/data-layer/index.ts`)

Capabilities:
- CRUD (`getDocument`, `setDocument`, `updateDocument`, `deleteDocument`)
- query (`where`, `orderBy`, `limit`)
- real-time subscriptions (`subscribeToDocument`, `subscribeToQuery`)
- batch writes

Implementations:
- Firebase adapter (`firebase-data-layer.ts`)
- in-memory adapter (`InMemoryDataProvider`) for test/offline/dev

Why this matters:
- app logic depends on the `NexusDataLayer` interface, not directly on Firebase SDK calls,
- this is the portability boundary for future backend/runtime changes.

---

### 4.2 Auth + Profile Lifecycle

`AuthProvider` (`src/lib/auth-context.tsx`) handles:
- Firebase auth state
- guest mode
- core profile subscription
- profile refresh + initialization

Profile source of truth:
- `CoreProfileService` + `global_souls` sync via `GlobalProjectionService`.

Behavior:
- authenticated users get realtime profile subscription,
- guest users run local-session flows without cloud identity.

---

### 4.3 Vault + Encryption (Security Runtime)

`VaultProvider` (`src/lib/vault-context.tsx`) handles:
- vault existence/unlock state,
- password-derived key derivation,
- canary verification,
- module access checks against security policy (`MODULE_MANIFEST` + user preferences),
- session persistence modes (`STRICT` / `SESSION` / `GRACE`),
- guest-to-user sync post unlock.

Security model:
- modules marked vault-sensitive are blocked when vault is locked,
- encrypted module data is unreadable without key,
- unlock path is explicit through `/vault-gate`.

---

### 4.4 Global Soul + NSV Logic

Global state model:
- `GlobalProjection` with `crossFunctionalState` (`NeuralStateVector`) in `global_souls`.

NSV logic layers:
- schema + normalization (`nsv-service.ts`)
- read/write ownership (`nsv-ownership.ts`)
- module-specific filtered prompt context (`enhanceContextForModule`)

Ownership (write authority):
- Agnes: emotional metrics
- Titan: biological metrics
- Ledger: resource metrics
- Atlas: cognitive/planning metrics
- Scout/Forge: read-only for soul writes
- Orchestrator: synthesis, not direct domain override

Read-permission matrix:
- each module receives only allowed NSV fields in prompt context,
- sensitive fields like trauma markers are scoped narrowly (Agnes-focused).

---

### 4.5 Spine Event Bus (Cross-Module Nervous System)

`Spine` (`src/lib/spine/spine-event-bus.ts`) provides:
- pub/sub for typed events,
- recent in-memory event ring,
- optional persistence for non-info severity,
- cascade rule execution with depth control.

Event semantics:
- modules emit domain events (`B`, `E`, `C`, `R`, `system`),
- listeners and overlays react in real time,
- cascades generate derivative events via rules (`cascade-rules.ts`).

Purpose:
- decouple modules while still enabling coordinated system behavior.

---

### 4.6 LLM Engine Boundary

Runtime entrypoint:
- `AIProvider` + `useAI` (`src/llm-engine/ai-context.tsx`)

Engine internals:
- `CognitiveAgent`
- `Orchestrator`
- `MemoryManager`
- `ModelRegistry`

App-layer integration surface:
- module pages use `useModuleAI` (not engine internals)
- scoped side conversations use `useScopedConversation`

Engine responsibilities:
- generation + streaming,
- model orchestration,
- action-tag extraction/parsing.

App responsibilities:
- auth/vault/session gating,
- context assembly,
- action execution side effects,
- persistence,
- Spine/NSV updates.

---

### 4.7 Action Execution Layer

`ActionHub` (`src/lib/actions/action-hub.ts`) is the app-side executor.

Behavior:
- module registers allowed handlers,
- parsed actions from LLM are schema/allowlist-gated per module,
- handlers execute side effects (profile writes, Spine emits, NSV updates, etc.),
- read-only modules are blocked from soul write action types.

Why this matters:
- separates model output from trusted state mutation,
- enforces module policy and side-effect control.

---

### 4.8 Memory + Conversation Persistence

Two memory surfaces:
- active sessions (`active_sessions`) for in-progress chat continuity
- long-term module envelope (`module_memory`) for episodic summaries/facts

Key services:
- `ModuleMemoryService`
- memory integration hooks in `useModuleAI`
- consolidation hooks for long conversations
- pending-recovery hook for interrupted requests

Modes:
- authenticated mode persists to backend + session fallback
- guest mode persists locally
- vault modules require key for encrypted payload access

---

### 4.9 Routing + Handoff

Delegation model:
- intent classification in handoff processor,
- handoff payload storage via `NexusHandoffService`,
- route prompts via Spine events (`MODULE_DELEGATED`),
- Orchestrator can open submodule consultation workflows from overlay.

Purpose:
- allow module specialization without user manually context-switching every time.

---

### 4.10 Alive UI (Live/Reactive UX Layer)

Nexus has always-on reactive UI surfaces:
- `NexusOverlay`: global Orchestrator side panel for cross-module consultation
- `SpineOverlay`: live domain pulse visual driven by real-time Spine events
- `SpineToastProvider`: alert/critical event toasts with event-source labeling
- `NeuralDraftPanel`: proposed draft actions requiring user acknowledgement
- `NexusRouteBanner`: route/delegation prompts based on Spine delegation events
- `NexusChat`: streaming-first chat UI with transient stream rendering and retry/recovery hooks

This “alive UI” layer is the product’s operational nervous feedback, not cosmetic chrome.

---

## 5) Module Definition (Per Module)

### 5.1 Orchestrator (`/orchestrator`)

Role:
- sovereign coordination agent,
- system synthesis across modules,
- delegation and cross-module consultation.

Owns:
- orchestration prompts/actions,
- routing hints and system-level actions,
- draft proposal flows.

Does not own:
- primary domain truth writes (emotional/biological/financial/planning values belong to domain owners).

---

### 5.2 Agnes (`/agnes`)

Role:
- emotional/therapeutic authority.

Core logic:
- therapy-oriented onboarding and session mode,
- emotional context updates into NSV emotional domain,
- encrypted profile/session memory,
- integration with global state and cross-module events.

Security posture:
- vault-mandatory in manifest defaults.

---

### 5.3 Titan (`/titan`)

Role:
- physical performance/training authority.

Core logic:
- routines, workouts, performance tracking,
- recovery/biological-aware coaching flows,
- biomarker-adjacent awareness while remaining module-bounded.

State relation:
- owns biological NSV write metrics.

---

### 5.4 Soma (`/soma`)

Role:
- biomarker/medical-clearance domain.

Core logic:
- biomedical tracking surfaces,
- module-specific profile + data service flows,
- medical-readiness signal participation in system events.

State relation:
- interacts with biological readiness context; model is evolving with Titan boundary decisions.

---

### 5.5 Ledger (`/ledger`)

Role:
- financial planning/resource authority.

Core logic:
- budgeting, transactions, goals, debt/tax surfaces,
- ledger-specific analysis + verification hooks,
- financial event emission into Spine.

State relation:
- owns resource NSV metrics (`financialFriction`, `resonanceROI`).

---

### 5.6 Atlas (`/atlas`)

Role:
- cognitive/planning authority.

Core logic:
- planning load, tasks/habits/goal structures,
- predictive planning and review hooks,
- planning-oriented NSV prompt shaping.

State relation:
- owns cognitive + planning NSV metrics.

---

### 5.7 Scout (`/scout`)

Role:
- research extension.

Core logic:
- web/search synthesis,
- research session and knowledge flows.

State relation:
- reads scoped NSV context,
- blocked from direct soul writes.

---

### 5.8 Forge (`/forge`)

Role:
- technical/life execution extension.

Core logic:
- execution workflows (currently technical skew),
- integration points for command/link operations.

State relation:
- reads scoped NSV context,
- blocked from direct soul writes.

---

### 5.9 Hub (`/hub`)

Role:
- aggregate dashboard surface.

Core logic:
- cross-module observability widgets and state views,
- navigation center into module experiences.

---

### 5.10 Profile (`/profile`)

Role:
- user identity/security/preferences control plane.

Core logic:
- identity settings,
- security/vault settings,
- backup/data operations.

---

### 5.11 Bridge (Headless)

Role:
- infrastructure/alert daemon concept.

Current shape:
- listed in manifest with `hasPage: false`,
- no user-facing route.

---

## 6) End-to-End Product Logic (Runtime Flows)

### 6.1 Boot Flow

1. App boots, action handlers and schema systems register.
2. DataLayer is injected (Firebase adapter or in-memory fallback).
3. Auth session resolves.
4. AI runtime initializes (guest-aware model constraints).
5. Vault status resolves and module access is gated.
6. Global soul subscriptions attach.
7. Routes and live overlays become interactive.

---

### 6.2 Module Conversation Flow

1. User sends message in module chat.
2. `useModuleAI` builds contextual request:
- module persona prompt,
- filtered NSV/global context,
- memory summaries/facts,
- session history.
3. `useAI.streamMessage` sends to engine.
4. Engine streams chunks and parses action tags.
5. App receives final response + parsed actions.
6. `ActionHub` executes allowed actions only.
7. Side effects update module profile/global soul/spine events.
8. Active session persists; long-term memory may consolidate.

---

### 6.3 Cross-Module Coordination Flow

1. Module emits Spine event or explicit delegation action.
2. Cascade rules may derive follow-up events.
3. UI surfaces route prompts/alerts/drafts.
4. Handoff service can pass context to target module.
5. Target module picks up handoff and continues specialized interaction.

---

### 6.4 Vault-Constrained Flow

1. User enters vault-locked module.
2. Module gate blocks content and routes to `/vault-gate`.
3. Unlock derives key + verifies canary.
4. Encrypted module memory/profile surfaces become readable.
5. Session continues with secure persistence.

---

### 6.5 Guest Flow

1. Guest session starts without cloud identity.
2. Quotas and local/session persistence constraints apply.
3. On sign-up + vault unlock, guest data syncs to user records.

---

## 7) Data Surfaces (Firestore + Local)

Primary collections in active architecture:
- identity/security: `users`, `vaults`
- global state: `global_souls`
- module profiles: `agnes_profiles`, `titan_profiles`, `soma_profiles`, `ledger_profiles`, `atlas_profiles`, `scout_knowledge`, `forge_sessions`
- chat/memory runtime: `active_sessions`, `module_memory`
- event system: `spine_events`
- specialized: `belief_graphs`, and additional module-specific stores

Local/session storage usage:
- guest state
- vault session key material (session-scoped by mode)
- active-session fallbacks
- handoff and lightweight runtime flags

---

## 8) Guardrails and Non-Negotiables

- Module logic stays within module boundaries.
- App-layer executes side effects; engine never owns app state writes.
- NSV writes respect authority ownership and read-only modules.
- Sensitive data respects vault/E2EE policy.
- Cross-module coordination uses Spine/Handoff services, not ad hoc coupling.

---

## 9) Practical Product Summary

Nexus is a coordinated, stateful, privacy-aware multi-agent operating system with:
- specialized domain modules,
- a shared but permissioned user-state model (Global Soul/NSV),
- an event-driven cross-module nervous system (Spine),
- a strict execution gate between model output and real data writes (ActionHub),
- and a live UI layer that surfaces ongoing system state, delegation, risk, and decisions in real time.

