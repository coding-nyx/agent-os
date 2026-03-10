# AI Agent Protocol & Project Standards (AGENTS.md)

This document is the baseline instruction set for all AI agents (Codex, Gemini, Copilot, etc.) working in this repository.

## Current Project Snapshot (March 2026)

AGNES is a Vite + React 19 SPA with:
- Route-level module pages under `src/modules/*`.
- Shared runtime and UI layers under `src/core/*` and `src/lib/*`.
- A separate LLM runtime under `src/llm-engine/*`.
- Firebase Auth + Firestore persistence and client-side vault encryption.

Primary routes currently wired in `src/App.tsx`:
- `/` landing
- `/orchestrator`, `/hub`, `/profile`
- `/agnes`, `/titan`, `/ledger`, `/soma`
- `/atlas`, `/scout`, `/forge`

`src/App.tsx` route declarations are the canonical source of truth for active module navigation.

`bridge` is a manifest module (`src/lib/module-manifest.ts`) without a page route (`hasPage: false`).

## Core Mandates

### 1) Code Separability and Modular Integrity
- Confine module logic to its own folder (`src/modules/<module>/`).
- Keep module-specific persistence, prompts, onboarding, and actions inside that module.
- Avoid leaking module behavior into unrelated providers or global utilities.
- Cross-module coordination must use shared orchestration layers:
  - `Spine` event bus (`src/lib/spine/*`)
  - `NexusHandoffService` (`src/lib/services/nexus-handoff-service.ts`)
  - Global projection/NSV services (`src/lib/services/global-projection-service.ts`, `src/lib/services/nsv-service.ts`)

### 2) LLM Engine is an External Runtime Boundary
- Treat `src/llm-engine/*` as a black-box runtime.
- Interact through app-level interfaces (`useAI`, `AIProvider`, `useModuleAI`), not by coupling UI directly to engine internals.
- Do not perform structural refactors inside `src/llm-engine/*` unless explicitly requested.

### 2.1) Responsibility Separation and Dependency Inversion (Mandatory)
- `llm-engine` is for generation/streaming, model orchestration, and action extraction.
- App-layer (`src/modules/*`, `src/lib/*`, `src/core/*`) owns:
  - auth/session lifecycle
  - onboarding state
  - Firestore and storage sync
  - vault key handling and encryption persistence
  - action execution side effects
- Action tags are parsed in engine, but app-layer adapters execute effects via `ActionHub`.
- Destructive lifecycle operations (for example soul termination) must stay in dedicated services (for example `src/lib/services/soul-termination-service.ts`), never embedded directly in UI or engine code.

### 3) Engineering Standards
- Maintain strict TypeScript types.
- Preserve existing visual language and interaction patterns.
- Respect security boundaries: do not bypass vault/E2EE flows, do not expose secrets.

### 4) Build and Chunking Safety (`vite.config.ts`)
- Current manual chunk strategy is:
  - `vendor-gpt` for `gpt-tokenizer`
  - `vendor-pdf` for `pdfjs-dist`
  - `vendor` for remaining `node_modules`
- Keep chunk logic simple and deterministic. Avoid reintroducing overlapping substring rules unless required.
- After modifying build/chunking behavior, validate with:
  - `npm run build`
  - `npm run preview`

## Architecture Map

### Entry and Runtime Composition
- `src/main.tsx`
  - boots React
  - registers core action handlers (`registerCoreActions`)
- `src/App.tsx`
  - wraps providers in this order:
    - `ThemeProvider`
    - `AuthProvider`
    - `VaultProvider`
    - `GlobalSoulProvider`
    - `AIProvider` (guest-aware)
  - initializes Spine runtime cascade rules
  - defines route-level lazy loaded pages

### Core Shared Layers
- `src/core/components/*`: reusable UI and shell components (`ModuleLayout`, `NexusChat`, overlays, auth modals, route guards).
- `src/core/intake/*`: guided intake orchestration primitives.
- `src/lib/*`: platform services, contexts, type contracts, module manifest, actions hub, spine event bus.

### Module Domains (`src/modules/*`)
- Core: `agnes`, `titan`, `ledger`, `soma`
- Extensions: `atlas`, `scout`, `forge`
- Platform: `orchestrator`, `hub`, `landing`, `profile`
- Shared scaffold: `src/modules/_shared/ModuleScaffoldPage.tsx`

Typical module package shape:
- `<Module>Page.tsx`
- `components/*`
- `onboarding/*`
- `services/*`
- `personas.ts`
- optional `prompts/*`

## Functional Runtime Flow

### 1) Auth and Profile
- `AuthProvider` (`src/lib/auth-context.tsx`) manages Firebase auth state, guest mode, and core profile subscription.
- Core identity/profile persistence is handled by `CoreProfileService`.

### 2) Vault and Encryption
- `VaultProvider` (`src/lib/vault-context.tsx`) manages vault unlock state, key derivation, and module access checks.
- Guest-to-user sync after unlock is handled via `syncAllGuestDataToUser`.

### 3) Module Lifecycle
- `UnifiedModulePage` + `useModuleProfile` provide a standard lifecycle:
  - load/subscribe profile
  - handle onboarding gate
  - provide module encryption key
  - render workspace and dashboard pattern

### 4) AI Conversation Pipeline
- Module pages call `useModuleAI`.
- `useModuleAI` composes:
  - `useAI` (engine transport)
  - memory/handoff hooks
  - `ActionHub` execution
  - global NSV updates via `GlobalProjectionService`
- Engine output actions are schema-guarded by allowed actions per module.

### 5) Cross-Module Coordination
- Real-time system events run through `Spine` (`src/lib/spine/spine-event-bus.ts`).
- Cascade automation rules live in `src/lib/spine/cascade-rules.ts`.
- Delegations and async handoffs use `NexusHandoffService`.

### 6) Persistence Surfaces
- Firestore collections in active use include:
  - `users`, `vaults`, `global_souls`
  - `agnes_profiles`, `titan_profiles`, `soma_profiles`, `ledger_profiles`
  - `atlas_profiles`, `scout_knowledge`, `forge_sessions`
  - `module_memory`, `active_sessions`, `spine_events`, `belief_graphs`, `bridge_config`

## Agent Execution Protocol

1. Plan first: inspect local architecture and impacted boundaries before editing.
2. For complex work, provide two paths:
   - Plan A: minimal, safe, immediate change.
   - Plan B: integrated refactor path.
3. Validate after changes:
   - required: `npm run build`
   - recommended when behavior changes: targeted tests (`npm run test`) and preview for routing/chunking changes.
4. Keep changes local to impacted module/service boundaries unless the task explicitly requires cross-cutting edits.
