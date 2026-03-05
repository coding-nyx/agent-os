# GitHub Copilot Instructions - AGNES Project

## Build & Dev Commands

```bash
npm run dev        # Start Vite dev server (localhost:3000)
npm run build      # tsc && vite build (outputs to out/)
npm run lint       # ESLint
npm run preview    # Preview production build
```

No test framework is configured.

## Architecture

AGNES is a **React 19 Vite SPA** — an AI wellness platform with modular AI agents (Therapy, Trainer, Ledger). Entry point: `index.html` → `src/main.tsx` → `src/App.tsx`.

### Provider Hierarchy (App.tsx)

```
ThemeProvider → AuthProvider → VaultProvider → GlobalSoulProvider → AIProvider → Router
```

- **AuthProvider** (`src/lib/auth-context.tsx`): Firebase Auth + guest mode.
- **VaultProvider** (`src/lib/vault-context.tsx`): E2EE vault using Web Crypto API (PBKDF2 + AES-GCM). Manages master key derivation, canary verification, and generic `checkModuleVault(collectionName)`. Has NO knowledge of specific modules.
- **GlobalSoulProvider** (`src/lib/global-soul-context.tsx`): Owns GlobalSoul CRUD, cross-module insight synthesis, context enhancement (`enhanceContext()`), and tool call handling. Bridges auth/vault with cross-module state.
- **AIProvider** (`src/llm-engine/ai-context.tsx`): Engine-only — initializes the LLM agent and exposes `sendMessage`/`streamMessage`. Has NO dependencies on auth, vault, or GlobalSoul. Receives `onToolCall` via props from `AIWrapper`.

### Module Isolation (Critical)

Each module in `src/modules/` (therapy, trainer, ledger, hub, landing) is a self-contained domain. **All module-specific logic, state, and UI must stay within its directory.** Cross-module data sharing goes through `GlobalSoulService` (`src/lib/services/global-soul-service.ts`), which synthesizes encrypted insights between modules (e.g., therapy emotional resilience ↔ trainer CNS fatigue).

Modules use `ModuleLayout` (`src/core/layout/ModuleLayout.tsx`) as their shell, which provides the themed header, exit transitions, and E2EE status display.

### LLM Engine (`src/llm-engine/`) — External API Service

The engine is fully decoupled — it has **zero imports from `src/lib/` or `src/modules/`**. It has its own internal architecture (Agent → Orchestrator → MemoryManager → ModelRegistry) with adapter interfaces for storage and crypto. **Do not modify engine internals.** Interact only through:
- `useAI()` hook — provides `sendMessage()`, `streamMessage()`, `isInitialized`
- `ConversationContext` type — pass `systemPrompt`, `history`, `insights`, `summary`
- Generic types: `Message`, `Persona`, `SessionSummary`, `LLMProvider`

Each module owns its own personas and domain types:
- Therapy personas → `src/modules/therapy/personas.ts`
- Trainer personas → `src/modules/trainer/prompts/ai-trainer-personas.ts`
- Ledger personas → `src/modules/ledger/personas.ts`
- Therapy-specific types → `src/modules/therapy/types.ts`

Modules enhance their own context using `useGlobalSoul().enhanceContext()` before passing to `sendMessage`/`streamMessage`.

### Encryption & Vault Pattern

All sensitive user data (therapy profiles, trainer profiles, Global Soul) is E2EE'd client-side before reaching Firestore. The pattern is:
1. User unlocks vault with password → `deriveKey()` → master `CryptoKey`
2. Modules get keys via `getModuleKey(moduleName)`
3. Data is encrypted/decrypted with `encryptWithKey()`/`decryptWithKey()` from `src/lib/encryption.ts`
4. Firestore documents store `{ encryptedData, iv, metadata }` — metadata is unencrypted for querying

### Data Layer

- **Firebase**: Firestore for persistence, Firebase Auth for identity, Firebase Storage for assets. Config in `src/lib/firebase.ts`.
- **Mock Mode**: When no API keys are configured, the app falls back to localStorage-based mock services.
- **Session Persistence**: `SessionPersistenceService` saves in-progress chat history to survive page reloads.

## Key Conventions

- **Path alias**: `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`)
- **UI components**: Shadcn UI (new-york style) with Radix primitives. Custom "Neural" components (`NeuralButton`, `NeuralInput`, `NeuralModal`, `GlassCard`) for the futuristic theme.
- **Styling**: Dark-first design with glassmorphism, Framer Motion animations, and per-module theme colors (indigo=therapy, orange=trainer, cyan=global).
- **Icons**: Lucide React exclusively.
- **State**: Zustand for global stores, React Context for provider-scoped state, local `useState` for component state. Prefer local state unless cross-component sharing is needed.
- **API keys**: Stored in `.env.local` or `localStorage`. Keys checked: `VITE_OPENROUTER_API_KEY`, `VITE_GROK_API_KEY`, `VITE_GOOGLE_API_KEY`.
- **Deployment**: Firebase Hosting. Build output dir is `out/`. SPA rewrite rule sends all routes to `index.html`.
- **TypeScript**: Strict mode enabled. Avoid `any` unless required for Web Crypto API compatibility (`as any` casts on `Uint8Array` → `ArrayBuffer`).
