# GitHub Copilot Instructions — Nexus

## Commands

```bash
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # tsc && vite build → out/
npm run preview      # Serve production build locally
npm run lint         # ESLint
npm run test         # Vitest (unit tests)
npx vitest run src/lib/encryption.test.ts   # Run a single test file
npx playwright test e2e/landing.spec.ts     # Run a single E2E test
```

Unit tests live in `src/**/*.test.{ts,tsx}` (jsdom env). E2E tests live in `e2e/` (Playwright, Chromium, requires dev server on `:5173`).

---

## Architecture Overview

Nexus is a React 19 + Vite SPA. Entry: `index.html` → `src/main.tsx` → `src/App.tsx`.

### Provider Hierarchy (`src/App.tsx`)

```
ThemeProvider
└── DataLayerProvider         (Firestore/InMemory abstraction — NexusDataLayer)
    └── BrowserRouter
        └── AuthProvider      (Firebase Auth + guest mode)
            └── VaultProvider (E2EE key derivation — PBKDF2 + AES-GCM)
                └── GlobalSoulProvider  (cross-module NSV state + context enhancement)
                    └── AIWrapper
                        └── AIProvider  (LLM engine — zero app-layer dependencies)
                            └── AppErrorBoundary
                                └── AIRuntimeGate  (blocks render until auth+AI ready)
                                    └── <Routes>
```

### The Four Runtime Systems

**1. LLM Engine (`src/llm-engine/`) — treat as external black box**
Internal pipeline: `CognitiveAgent → Orchestrator → ModelRegistry`. Zero imports from `src/lib/` or `src/modules/`. Interact only through:
- `useAI()` → `{ sendMessage, streamMessage, isInitialized }`
- `ConversationContext` → `{ systemPrompt, history, memoryContext, summary }`
- In practice, modules never call `useAI()` directly — they use `useModuleAI()`.

**2. Spine Event Bus (`src/lib/spine/`) — the nervous system**
Decoupled pub/sub with cascade automation. Non-`info` events are persisted to `spine_events/{uid}/events`.
```typescript
// Publish
Spine.publish({ type: 'VITAL_UPDATED', source: 'agnes', domain: 'B', priority: 'alert', data: { cnsFatigue: 0.8 } });
// Subscribe
const unsub = Spine.subscribe('VITAL_UPDATED', handler, { minPriority: 'alert' });
// In React components
useSpineEvent('HEALTH_CONTEXT_STALE', () => refreshGlobalSoul());
```
Cascade rules live in `src/lib/spine/cascade-rules.ts` — e.g., `BURNOUT_WARNING` → `REDUCE_TRAINING_LOAD`, `deadlinePressure ≥ 8` → `DEADLINE_CRUNCH`.

**3. GlobalSoul / NSV (`src/lib/global-soul-context.tsx`) — the synthesized state**
Aggregates the **NeuralStateVector** (NSV) across all modules. Domains: `biological`, `emotional`, `cognitive`, `planning`, `resource`. Each module owns specific NSV fields (Atlas → `planning.*`, Ledger → `resource.*`, Scout → `cognitive.interestDiversity`).
- `enhanceContext(ctx)` — injects full NSV + compacted insights into AI system prompt (used by Orchestrator only)
- `enhanceContextForModule(ctx, moduleId)` — injects permission-filtered NSV (used by all other modules)
- `updateCrossFunctionalState(patch)` — merges NSV updates to `global_souls/{uid}`

**4. ActionHub (`src/lib/actions/action-hub.ts`) — action execution registry**
AI responses may include `{"action": "actionType", "payload": {...}}`. The hub routes these to registered handlers per module. Handlers receive `ActionContext` with `updateGlobalSoul`, `emitSpineEvent`, `delegateToModule`, `sendMessage`, `markProfileDirty`. Scout/Forge are NSV read-only; other modules have full write access.

---

## Module System

### `useModuleAI` — the primary AI hook for all module pages

Defined in `src/lib/hooks/use-module-ai.ts`. Composes: `useAI` + `useGlobalSoul` + `useMemoryIntegration` + `useConsolidation` + `useHandoffProcessor` + `usePendingRecovery`.

```typescript
const ai = useModuleAI({
  moduleId: 'agnes',
  systemPrompt: PERSONA.system_prompt,
  encryptionKey: vaultKey,    // optional, for vault-locked modules
  contextPolicy: 'prompted',  // 'doc-only' | 'base-context' | 'prompted'
});
// Returns: { messages, sendUserMessage, isProcessing, streamingText, routingSuggestion, quota }
```

### Standard Module File Shape

```
src/modules/{name}/
├── {Name}Page.tsx            # Route entry, loads profile, gates on onboarding
├── components/               # All UI for this module
├── onboarding/               # Multi-step onboarding component
├── services/
│   ├── {name}-profile-service.ts   # Firestore CRUD for this module's profile
│   └── actions.ts                  # ActionHub registrations
├── personas.ts               # Agent personality defaults
├── prompts/                  # System prompt templates
└── types.ts                  # Module-specific types
```

**Module IDs** (from `src/lib/module-manifest.ts`): `orchestrator`, `agnes`, `titan`, `soma`, `ledger`, `atlas`, `scout`, `forge`, `bridge`. `bridge` has no page route (`hasPage: false`).

### Cross-Module Communication

- **Spine**: fire-and-forget events, cascade automation
- **NexusHandoffService** (`src/lib/services/nexus-handoff-service.ts`): session-storage-based delegation between modules (max 4000 chars, TTL 10 min). Use for `delegate` or `query/query_result` patterns.
- **GlobalProjectionService** (`src/lib/services/global-projection-service.ts`): Firestore-backed NSV reads/writes.

---

## Encryption & Vault

All sensitive data is E2EE'd client-side before Firestore. Firestore documents store `{ encryptedData, iv, metadata }` — only `metadata` is plaintext (for querying).

```typescript
// Pattern in module page components:
const { getModuleKey } = useVault();
const key = await getModuleKey('agnes');          // Derives module key from master key
const encrypted = await encryptWithKey(data, key); // src/lib/encryption.ts
const decrypted = await decryptWithKey(doc, key);
```

`VaultProvider` exposes `isModuleAccessible(moduleId)` — checked by `ModuleLayout` which auto-renders the unlock modal when needed. Vault security policy (mandatory vs. optional lock) is defined per module in `MODULE_MANIFEST`.

---

## Data Layer

`DataLayerProvider` wraps a `NexusDataLayer` interface (Firestore in prod, InMemory for tests). Always access Firestore through this abstraction, never import Firebase SDK directly in module code.

**Active Firestore collections:** `users`, `global_souls`, `vaults`, `chat_threads`, `documents`, `notebook_cells`, `derived_insights`, `{module}_profiles` (e.g., `atlas_profiles`), `spine_events/{uid}/events`.

---

## Key Conventions

- **Path alias**: `@/` → `src/`
- **UI**: Shadcn UI (new-york style) + custom Neural components (`NeuralButton`, `NeuralInput`, `NeuralModal`, `GlassCard`). Icons: Lucide React only.
- **Styling**: Dark-first, glassmorphism, Framer Motion. Per-module theme colors set via `ModuleLayout`'s `themeColor` prop. Module → color mapping in `MODULE_MANIFEST[id].themeColor`.
- **State hierarchy**: local `useState` → React Context (provider-scoped) → Zustand (global stores). Don't reach for Zustand until cross-component sharing is required.
- **TypeScript**: Strict mode. Only use `any` for Web Crypto API `Uint8Array → ArrayBuffer` casts.
- **Vite chunking** (`vite.config.ts`): manual chunks for `gpt-tokenizer` (`vendor-gpt`), `pdfjs-dist` (`vendor-pdf`), rest of `node_modules` (`vendor`). Keep this deterministic — no overlapping substring rules.
- **API keys**: `VITE_OPENROUTER_API_KEY`, `VITE_GROK_API_KEY`, `VITE_GOOGLE_API_KEY` in `.env.local`. App gracefully degrades to localStorage mock when unconfigured.
- **Build output**: `out/`. Firebase Hosting rewrites all routes to `index.html` (SPA).
