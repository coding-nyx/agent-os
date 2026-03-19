# AGNES Architecture Review — 2026
**Scope:** Full codebase static analysis across 10 architectural dimensions.  
**Reviewer:** Lead Module Architect  
**Date:** 2026  
**Branch:** current HEAD

---

## Executive Summary

AGNES is a well-structured, modular SPA with strong conceptual boundaries and a clear runtime layering philosophy. The `NexusDataLayer` abstraction, `ActionHub` dispatch model, NSV ownership matrix, and Spine event bus represent genuinely sound architectural choices. The main architectural debt clusters around three themes:

1. **Data-layer bypass** — Module service files (`titan`, `ledger`, `module-memory`, etc.) continue to import the Firebase SDK directly instead of going through `NexusDataLayer`, undermining the abstraction's value and breaking testability.
2. **(Resolved) Cross-module UI leak** — `RoutingSuggestion` previously lived under `orchestrator` and was imported by other modules. This has been moved to `src/core/components/RoutingSuggestion.tsx` and all imports updated.
3. **(Resolved) Vault key API mismatch** — the app uses a single master key; the misleading `getModuleKey(moduleName)` API has been replaced with `getMasterKey()` (with a backwards-compatible alias).

Everything else is mostly sound with low/medium defects.

---

## Scoring Summary

| # | Area | Score | Verdict |
|---|------|-------|---------|
| 1 | Provider hierarchy & context design | **8/10** | ✅ Good — one ordering anomaly |
| 2 | Module isolation | **6/10** | ⚠️ Cross-module import violation |
| 3 | Vault & encryption flow | **7/10** | ⚠️ `getModuleKey` stub; `any` cast |
| 4 | Data persistence patterns | **5/10** | 🔴 Data-layer bypass is widespread |
| 5 | Spine event bus | **9/10** | ✅ Excellent; minor issues |
| 6 | GlobalSoul & NSV | **8/10** | ✅ NSV matrix strong; dual-write risk |
| 7 | Build configuration | **9/10** | ✅ Clean chunking; strict mode gap |
| 8 | ActionHub | **8/10** | ✅ Clean; one `as any` cast |
| 9 | Type safety | **6/10** | ⚠️ Scattered `any` casts; loose generics |
| 10 | Dependency inversion | **8/10** | ✅ Boundary is clean at module level |

---

## 1. Provider Hierarchy & Context Design

### Hierarchy (App.tsx)
```
ThemeProvider
└── DataLayerProvider          ← NEW: wraps Router (correct)
    └── Router
        └── AuthProvider
            └── VaultProvider
                └── GlobalSoulProvider
                    └── AIWrapper (guest-aware AIProvider)
                        └── AppErrorBoundary
                            └── AIRuntimeGate
                                └── AppContent
```

### Findings

**✅ Correct ordering:** Auth → Vault → GlobalSoul respects the dependency chain. Vault needs Auth (`user`), GlobalSoul needs both.

**✅ `AIWrapper` pattern is elegant.** Wrapping `AIProvider` in a thin component that reads `useAuth().isGuest` avoids exposing `isGuest` as a prop drilled through the tree. Clean.

**✅ `SpineRuntimeBootstrap`** is a renderless component inside `AppContent` — the correct pattern for bootstrapping a singleton.

**⚠️ `DataLayerProvider` sits outside `Router` but inside `ThemeProvider`.** This is architecturally correct (the data layer doesn't need routing), but it means `DataLayerProvider` is the second child of `ThemeProvider` rather than a true platform primitive before theming. Not a violation, but the placement is slightly surprising since `DataLayerProvider` has no visual concern.

**⚠️ `GlobalSoulProvider` mixes Zustand and React Context.** It exports a Zustand store (`useGlobalSoulStore`) AND a React Context (`GlobalSoulActionsContext`) and merges them in `useGlobalSoul()`. While this works and solves the stale-closure problem, the split is invisible from the consumer's perspective and creates a hidden dual-update channel. Consumers who subscribe to `useGlobalSoulStore` directly bypass the Actions context and will miss the profile/user guard in the actions.

**⚠️ `AIRuntimeGate` blocks on `!aiReady` globally.** If AI initialization fails silently (timeout fires at 8 s with `setIsInitialized(true)`), the gate passes but `agent` is still `null`. Any `sendMessage` call will then throw `"Agent not initialized"`. The timeout should set a degraded state flag, not `isInitialized: true`.

### Recommendations
- **Low:** Add a comment on `DataLayerProvider` position explaining the outside-Router placement is intentional (platform infrastructure, not routing-dependent).
- **Medium:** Add an `isDegraded` flag to `AIContextType` and expose it; `AIRuntimeGate` should render a non-blocking warning when `isInitialized && !agent`.
- **Low:** Document the Zustand+Context hybrid in `GlobalSoulProvider` with a comment explaining why both are used.

---

## 2. Module Isolation

### Boundary Scan

Each module lives in `src/modules/<id>/` with `components/`, `services/`, `onboarding/`, `personas.ts`. This is structurally correct.

### Violations Found (Resolved)

**✅ RESOLVED — `RoutingSuggestion` moved to core:**
```ts
// src/modules/agnes/AgnesPage.tsx
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
```

**✅ RESOLVED — `scout` uses core component as well:**
```ts
// src/modules/scout/ScoutPage.tsx
import { RoutingSuggestion } from '@/core/components/RoutingSuggestion';
```

Both `agnes` and `scout` render the `RoutingSuggestion` UI element, which lives inside the orchestrator module. This breaks the boundary — changes to `RoutingSuggestion` can silently break two unrelated modules.

**✅ All other inter-module references** go through `@/lib/` shared layer (module-manifest, services, Spine, ActionHub), which is the correct pattern.

**✅ No module imports from another module's `services/`** except through `@/lib/services/` shared services.

### Recommendations
- **Done:** `RoutingSuggestion` is now a core UI primitive under `src/core/components/`.

---

## 3. Vault & Encryption Flow

### Key Derivation
- Uses PBKDF2 (SHA-256) + AES-GCM. ✅
- OWASP 2024 iteration count (600k) for `encryptData`. ✅  
- Legacy 100k path preserved for existing vault canaries. ✅  
- Web Worker offloads PBKDF2 from the main thread. ✅  
- Canary verification (`'NEXUS'` plaintext) before accepting a key. ✅

### Issues Found

**✅ RESOLVED — single master key API made explicit:**
```ts
// src/lib/vault-context.tsx
const getMasterKey = useCallback(async (): Promise<CryptoKey | null> => {
  return masterKeyRef.current;
}, []);
```
The contract implies per-module key derivation (different key per module), but the implementation returns the single master key to every caller. This means all encrypted module data is encrypted under the same key. If any module is compromised, all vault data is compromised. The interface is misleading.

**⚠️ `checkModuleVault` only checks document existence, not decryptability:**
```ts
const checkModuleVault = useCallback(async (collectionName: string): Promise<boolean> => {
  const vaultDoc = await dataLayer.getDocument(collectionName, user.uid);
  return !!vaultDoc;  // ← does NOT verify the document is decryptable with current key
}, [user?.uid, dataLayer]);
```
A stale or corrupted vault document will return `true`, giving a false positive. Modules may render as "vault ready" when the actual decryption would fail.

**⚠️ `any` cast in `decryptWithKey`:**
```ts
// src/lib/encryption.ts:145
ciphertext as any
```
`ciphertext` is `Uint8Array`, and `window.crypto.subtle.decrypt` accepts `BufferSource` which includes `Uint8Array`. The cast is unnecessary and should be replaced with `ciphertext.buffer` or simply removed (the type is compatible).

**⚠️ Salt is 16 bytes (128-bit).** OWASP recommends 32 bytes (256-bit) for PBKDF2 salts. The current 16-byte salt is within acceptable bounds but not at the recommended level.

**✅ Auto-unlock from `sessionStorage` correctly skips STRICT mode.**  
**✅ Master key held in `useRef`, not state — no unnecessary re-renders.**  
**✅ Guest sync to user triggered only after vault unlock.**

### Recommendations
- **Done:** The public API is `getMasterKey()` (module-agnostic single-key design).
- **Medium:** Update `checkModuleVault` to attempt a probe decryption (e.g., decrypt the module's profile envelope header) before returning `true`.
- **Low:** Remove the `ciphertext as any` cast — the type is compatible without it.
- **Low:** Increase salt entropy to 32 bytes.

---

## 4. Data Persistence Patterns

### The NexusDataLayer Abstraction

The `NexusDataLayer` interface (`src/lib/data-layer/index.ts`) is well-designed:
- Clean CRUD + subscription contract
- `InMemoryDataProvider` for tests/offline
- `DataLayerProvider` + `useDataLayer()` for injection
- Services that accept `dataLayer` as parameter (`GlobalProjectionService`, `CoreProfileService`, etc.)

### Critical Finding: Widespread Data-Layer Bypass

**🔴 Multiple high-traffic module services still import Firebase SDK directly:**

```ts
// src/modules/titan/services/titan-profile-service.ts:1-5
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
// ... uses readDocOnce, doc(), setDoc() directly

// src/modules/ledger/services/ledger-intake-service.ts:1-4
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';

// src/lib/services/module-memory-service.ts:1
import { doc, setDoc, deleteDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
```

This is the most significant architectural issue. These services:
1. Cannot be unit-tested without a real Firebase connection.
2. Bypass the `InMemoryDataLayer` injected in tests.
3. Violate the abstraction boundary that `NexusDataLayer` establishes.

**✅ Services that correctly use `NexusDataLayer`:**
- `GlobalProjectionService` — accepts `dataLayer` parameter ✅
- `CoreProfileService` — uses data layer ✅
- `VaultProvider` — uses `useDataLayer()` ✅
- `GlobalSoulProvider` — uses `useDataLayer()` ✅

**⚠️ `updateCrossFunctionalState` in `GlobalProjectionService` does a `getDocument` + `setDocument` (read-modify-write) without a transaction.** This is a race condition: two concurrent NSV updates (e.g., Titan and Agnes both writing simultaneously) will silently overwrite each other. For most users this is low probability, but the correctness risk is real.

**⚠️ `syncFromProfile` in `GlobalProjectionService` uses `JSON.stringify` equality to detect changes.** This is order-sensitive: `{a:1,b:2}` and `{b:2,a:1}` compare unequal despite being semantically identical. Object key ordering in Firestore snapshots may vary.

### Recommendations
- **High:** Migrate `titan-profile-service.ts`, `ledger-intake-service.ts`, and `module-memory-service.ts` to accept and use `NexusDataLayer`. This is the most impactful refactor for testability.
- **Medium:** Replace the read-modify-write in `updateCrossFunctionalState` with a Firestore `updateDoc` / field-level merge to reduce the race window.
- **Low:** Replace `JSON.stringify` comparison in `syncFromProfile` with a stable-serialization utility or a structural deep-equal.

---

## 5. Spine Event Bus

### Architecture
- Singleton `SpineEventBus` class exported as `Spine`. ✅
- `publish/subscribe` aliases for `emit/on` (both APIs work). ✅
- Cascade rules capped at depth 3 — prevents infinite cascade loops. ✅
- Priority filtering on listeners. ✅
- 500ms debounce per `type:source` pair — prevents event flooding. ✅
- Non-`info` events persisted to Firestore/DataLayer. ✅
- `NexusDataLayer` injection via `setDataLayer()` — correct test seam. ✅

### Issues Found

**✅ RESOLVED — debounce key includes `target`.** Debounce now uses `type:source:target` so semantically distinct targeted events are not merged.

**⚠️ Cascade rules include two deprecated `CLEARANCE_DENIED` rules (marked `@deprecated — 90 days`).** Both trigger `condition: () => true` (always fire). The deprecation comment says "target: Q3 2026" — this deadline should be tracked and enforced.

**⚠️ `useSpineEvent` in `GlobalSoulProvider` for `HEALTH_CONTEXT_STALE` is called at the top level of the Provider component body, making it a component-level subscription that re-subscribes on every Provider render.** The `useSpineEvent` hook uses a `useRef` for the handler, so the subscription only fires once (because `type` is stable), but this pattern is fragile if `type` ever becomes dynamic.

**⚠️ `Spine.setUser(user?.uid ?? null)` is called in two places:** `SpineRuntimeBootstrap` in `App.tsx` AND inside `use-module-ai.ts:122`. The one inside `useModuleAI` is redundant — every module AI instance calls it on every user change, causing multiple identical writes.

**✅ Event schema validation in `validateAndNormalize` is thorough:** checks type, source, domain, priority, data.  
**✅ Cascade rule definitions are clearly typed with `CascadeRule`.** 

### Recommendations
- **Done:** Debounce key now includes `target`.
- **Medium:** Add a CI-level lint rule or test that verifies deprecated cascade rules are removed before Q3 2026. Consider making the deprecation date a `const` in code that throws at runtime after the deadline.
- **Low:** Remove the redundant `Spine.setUser()` call from `useModuleAI` — `SpineRuntimeBootstrap` handles this centrally.

---

## 6. GlobalSoul & Cross-Module Coordination

### NSV Architecture
- NSV has 5 domains: `biological`, `emotional`, `cognitive`, `planning`, `resource`. Well-typed. ✅
- `NSV_OWNERSHIP` declares which module _writes_ which fields. ✅
- `NSV_READ_PERMISSIONS` enforces which fields each module's LLM sees (principle of minimum viable context). ✅
- `normalizeNSV` handles legacy flat aliases (e.g., `cnsFatigue` at root) alongside the new nested structure. ✅
- `formatNSVForAtlasPlanner` produces derived planning intelligence (max load, deep work window, overrides). ✅
- Atlas gets a special `formatNSVForAtlasPlanner` (richer, planning-optimized) — appropriate given Atlas owns the planning domain.

### Issues Found

**⚠️ NSV has legacy flat aliases at the root level:**
```ts
// src/lib/services/nsv-service.ts (DEFAULT_NSV)
cnsFatigue: null,          // ← root-level alias
emotionalResilience: null, // ← root-level alias
sleepQuality: null,
hormonalContext: null,
traumaMarkers: null
```
These exist for backward compatibility but create a confusing dual-path update surface. `buildNSVUpdatePayload` in `GlobalProjectionService` handles both paths, but the `stamp + alias` pattern is complex and error-prone. This technical debt should be migrated away.

**⚠️ `GlobalProjectionService.updateCrossFunctionalState` performs a full document read then full `setDocument` write (not a field-level `updateDocument`).** For NSV updates this is a read-modify-write cycle that:
- Makes two round trips to Firestore
- Risks last-write-wins race conditions when multiple modules update simultaneously

**⚠️ `getFilteredSoulForModule` calls `useGlobalSoulStore.getState()` imperatively inside a `useCallback`:**
```ts
const getFilteredSoulForModule = useCallback((moduleId: ModuleId) => {
  return filterGlobalSoulForModule(useGlobalSoulStore.getState().globalSoul, moduleId);
}, []);
```
This bypasses React's reactivity — the returned value won't update when the store changes. Callers who expect a reactive filtered soul will get a stale snapshot.

**✅ `enhanceContextForModule` correctly reads NSV from state (not `getState()`) and memoizes with `useCallback`.**  
**✅ Spine's `HEALTH_CONTEXT_STALE` → `refreshGlobalSoul` wiring is the correct push-based invalidation pattern.**

### Recommendations
- **Medium:** Fix `getFilteredSoulForModule` — it should be either a selector passed to `useGlobalSoulStore(selector)` or it should accept the current soul as an argument from the caller rather than imperatively pulling from the store.
- **Medium:** Migrate NSV writes in `updateCrossFunctionalState` to `updateDocument` (field-level merge) rather than full-document `setDocument`.
- **Low:** Establish a migration path to deprecate flat NSV aliases at root level. Consider adding a `schemaVersion` gate in `normalizeNSV`.

---

## 7. Build Configuration

### vite.config.ts
```ts
manualChunks(id) {
  if (!id.includes('node_modules')) return;
  if (id.includes('/gpt-tokenizer/')) return 'vendor-gpt';
  if (id.includes('/pdfjs-dist/')) return 'vendor-pdf';
  return 'vendor';
}
```
- **✅ Strategy is correct and deterministic.** Large data-processor libraries (`gpt-tokenizer`, `pdfjs-dist`) are isolated to prevent bloating the main vendor chunk.
- **✅ Three-chunk model avoids Rollup initialization-order issues** (noted inline comment about `useLayoutEffect`).
- **⚠️ No `sourcemap` in production** (`sourcemap: false`). This is appropriate for security but means production errors will be hard to diagnose. Consider uploading sourcemaps to an error-tracking service (Sentry) separately.

### tsconfig.json
```json
"strict": true,
"noUnusedLocals": false,
"noUnusedParameters": false,
```
- **⚠️ `strict: true` is set** — good. But `noUnusedLocals` and `noUnusedParameters` are both `false`. These are valuable guards against dead code and param drift. They're likely disabled because some files have intentional unused params (e.g., `_active` in `UnifiedModulePage`), but the right fix is targeted `// eslint-disable` comments, not globally disabling the check.
- **⚠️ `src/modules/titan/components/TitanDashboard.tsx` is explicitly excluded from compilation.** This is a code smell — a source file that cannot be type-checked should either be fixed or deleted.

### firebase.json
- **✅ SPA rewrite rule `** → /index.html` is correct for React Router.**
- **✅ Security headers are well-configured:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Permissions-Policy`.
- **✅ RESOLVED — CSP added.** A production CSP header has been added to `firebase.json` to reduce XSS/exfiltration risk while allowing required AI + Firebase connectivity.

### Recommendations
- **Done:** CSP header added to `firebase.json`.
- **Medium:** Enable `noUnusedLocals: true` and `noUnusedParameters: true`. Fix or suppress individual violations.
- **Medium:** Delete or fix `TitanDashboard.tsx` — a file excluded from compilation is unverified dead code.

---

## 8. ActionHub

### Architecture
```ts
class ModuleActionHub {
  private registry = new Map<string, Map<string, ActionHandler>>();
  private dependencies = new Map<string, Set<string>>();
  // ...
  execute(moduleId, actionType, context): Promise<boolean>
  getAllowedActions(moduleId): string[]
}
```

**✅ Dispatch resolution order is clear:** own module → declared dependencies → orchestrator fallback.  
**✅ `getAllowedActions(moduleId)` is used by `useModuleAI` as a schema guard before executing LLM-emitted actions.** This is the correct architecture — the LLM cannot trigger unregistered side effects.  
**✅ `registerCoreActions()` called from `main.tsx` before the React tree mounts** — correct bootstrap order.  
**✅ `ActionContext` type is well-defined** with clearly typed callbacks.

### Issues Found

**⚠️ `update_agnes_profile` action in `agnes/services/actions.ts:66` uses `as any`:**
```ts
baseContext: {
  ...current.baseContext,
  ...(payload as any)  // ← unsafe spread
}
```
LLM-generated payload is spread directly onto `baseContext` without type narrowing. This could corrupt the profile structure if the LLM emits unexpected keys.

**✅ RESOLVED — `MODULE_PROFILE_UPDATED` is now a typed event:**
```ts
type: 'MODULE_PROFILE_UPDATED'
```
This suggests `MODULE_PROFILE_UPDATED` is not a registered `SpineEventType`. Either it should be added to the type union, or the emission should be removed/replaced with a registered type.

**⚠️ `addDependency` mechanism is powerful but undocumented.** No module currently declares a dependency in `registerCoreActions()`. The mechanism exists but is unused. If modules start using it, the execution order (own → deps → orchestrator) may produce surprising results when the same action is registered in multiple places.

### Recommendations
- **Done:** `MODULE_PROFILE_UPDATED` is included in `SpineEventType`; casts removed.
- **Medium:** Replace `payload as any` in `update_agnes_profile` with a typed normalizer (similar to `normalizeGraph` used for `update_belief_graph` in the same file).
- **Low:** Document the `addDependency` mechanism with usage examples in `action-hub.ts`.

---

## 9. Type Safety

### `any` Inventory

| Location | Pattern | Risk |
|----------|---------|------|
| `src/lib/encryption.ts:145` | `ciphertext as any` | Low — Uint8Array is BufferSource-compatible |
| `src/lib/services/global-projection-service.ts:180` | `Record<string, any>` for `agentGenders` | Medium — masks gender type contract |
| `src/lib/services/global-projection-service.ts:260` | `applyPathValue(target: any, ...)` | Medium — string path mutation on `any` target |
| `src/modules/agnes/services/actions.ts:66` | `payload as any` spread | High — LLM payload directly onto profile |
| `src/lib/hooks/use-module-ai.ts:486` | `'MODULE_PROFILE_UPDATED' as any` | High — bypasses event type system |
| `src/lib/hooks/use-module-ai.ts:406-412` | NSV merge uses `as Record<string, unknown>` casts | Medium — necessary but verbose |

### Missing Generics / Weak Typing

**⚠️ `NexusDataLayer.updateDocument<T>` signature accepts `Partial<T>` but the Firestore adapter implementation accepts any dotted field paths (e.g., `crossFunctionalState.biological.cnsFatigue`).** These Firestore field paths are not representable in `Partial<T>`. The implementation works but the type contract is violated — `Partial<T>` does not include deeply-nested dotted-path strings.

**⚠️ `ModuleActionHub.execute` returns `Promise<boolean>` but there's no structured error surface.** Failed handlers throw and bubble up to the `useModuleAI` catch block, which sets a generic error message. There's no way for UI to distinguish "action blocked by schema guard" from "handler threw unexpectedly."

**⚠️ `callbackMap` in `encryption.ts`:**
```ts
let callbackMap = new Map<number, { resolve: Function, reject: Function }>();
```
`Function` is the widest possible type. Should be `{ resolve: (rawKey: ArrayBuffer) => void; reject: (err: Error) => void }`.

### Recommendations
- **High:** Add `MODULE_PROFILE_UPDATED` to `SpineEventType` — eliminates the highest-risk `as any` cast.
- **Medium:** Replace `payload as any` in Agnes actions with a typed normalizer.
- **Medium:** Replace `Function` in `callbackMap` with properly typed callback signatures.
- **Low:** Replace `Record<string, any>` for `agentGenders` with `Record<string, GenderPersonality>` since the `GenderPersonality` union type already exists.
- **Low:** Consider a structured `ActionError` return type from `ActionHub.execute` instead of throwing.

---

## 10. Dependency Inversion — LLM Engine Boundary

### Boundary Review

Per AGENTS.md: modules must not import from `src/llm-engine/*` internals — only from `useAI`, `AIProvider`, `useModuleAI`.

**✅ All module pages use `useModuleAI` from `@/lib/hooks/use-module-ai`.**  
**✅ `useModuleAI` is the only consumer of `useAI` from `@/llm-engine/ai-context`.**  
**✅ `PersonaFactory` is imported in `use-module-ai.ts` from `@/llm-engine/persona-factory`** — this is a boundary import inside the hook layer (`src/lib/`), not inside a module page. Acceptable.

**⚠️ One exception — `use-module-ai.ts` imports `StructuredResponse` from the engine's internal `engine/types`:**
```ts
// src/lib/actions/action-hub.ts:4
import { StructuredResponse } from '@/llm-engine/engine/types';
```
`ActionHub` (a `src/lib/` service) directly imports an internal engine type. The `StructuredResponse` type should be re-exported from `@/llm-engine/types.ts` (the public surface) rather than sourced from `engine/types` (the internal implementation file).

**✅ No module page directly imports `CognitiveAgent`, `Orchestrator`, `ModelRegistry`, or `MemoryManager`.**  
**✅ `GlobalSoulProvider` imports `ConversationContext` from `@/llm-engine/types` (the public surface) — correct.**

### Recommendations
- **Medium:** Re-export `StructuredResponse` from `@/llm-engine/types.ts` and update the `action-hub.ts` import to use the public surface instead of `@/llm-engine/engine/types`.

---

## Dependency Graph Issues

### Known Issues

```
agnes/AgnesPage.tsx
  ├── @/modules/orchestrator/components/RoutingSuggestion  ← VIOLATION
  └── @/lib/* (correct)

scout/ScoutPage.tsx
  ├── @/modules/orchestrator/components/RoutingSuggestion  ← VIOLATION
  └── @/lib/* (correct)

titan/services/titan-profile-service.ts
  └── firebase/firestore (direct)  ← DATA LAYER BYPASS

ledger/services/ledger-intake-service.ts
  └── firebase/firestore (direct)  ← DATA LAYER BYPASS

lib/services/module-memory-service.ts
  └── firebase/firestore (direct)  ← DATA LAYER BYPASS

lib/actions/action-hub.ts
  └── @/llm-engine/engine/types  ← INTERNAL ENGINE TYPE IMPORT
```

### Healthy Paths
```
Any module page → useModuleAI → useAI → AIProvider → CognitiveAgent ✅
Any module page → useVault → VaultProvider ✅
Any module page → useGlobalSoul → GlobalSoulProvider ✅
Spine events → cascade rules → never → module code ✅
ActionHub execute → module handler → Firestore (via service) ✅
```

---

## Prioritized Refactor Backlog

### 🔴 High Priority

| ID | Task | Rationale |
|----|------|-----------|
| H-1 | Migrate `titan-profile-service`, `ledger-intake-service`, `module-memory-service` to `NexusDataLayer` | Testability, abstraction integrity |
| H-2 | Move `RoutingSuggestion` to `src/core/components/` | Module boundary violation |
| H-3 | Add `MODULE_PROFILE_UPDATED` to `SpineEventType` union | Eliminates `as any` on event bus |
| H-4 | Implement true per-module key derivation OR rename `getModuleKey` to `getMasterKey` | Misleading security API |
| H-5 | Add `Content-Security-Policy` header to `firebase.json` | XSS protection for vault data |

### 🟡 Medium Priority

| ID | Task | Rationale |
|----|------|-----------|
| M-1 | Add `isDegraded` state to `AIContextType`; fix `AIRuntimeGate` timeout handling | Silent agent-null failure |
| M-2 | Replace `JSON.stringify` equality in `syncFromProfile` with stable compare | Order-sensitive false-positives |
| M-3 | Replace `payload as any` in Agnes actions with typed normalizer | LLM payload corruption risk |
| M-4 | Fix `getFilteredSoulForModule` to be reactive (selector pattern) | Stale snapshot on store updates |
| M-5 | Migrate NSV writes to `updateDocument` (field-level merge) | Read-modify-write race condition |
| M-6 | Re-export `StructuredResponse` from `@/llm-engine/types` public surface | Internal engine type leak |
| M-7 | Enable `noUnusedLocals`/`noUnusedParameters` in tsconfig | Dead code detection |
| M-8 | Delete or fix `TitanDashboard.tsx` (excluded from compilation) | Unverified dead code |

### 🟢 Low Priority

| ID | Task | Rationale |
|----|------|-----------|
| L-1 | Remove `ciphertext as any` in `decryptWithKey` | Unnecessary cast |
| L-2 | Type `callbackMap` callbacks in `encryption.ts` | Replace `Function` with proper types |
| L-3 | Replace `Record<string, any>` for `agentGenders` with `Record<string, GenderPersonality>` | Existing union type exists |
| L-4 | Remove redundant `Spine.setUser()` call from `useModuleAI` | Centralized in `SpineRuntimeBootstrap` |
| L-5 | Change Spine debounce key to include `target` | Suppress-merge distinct events |
| L-6 | Increase vault salt from 16 to 32 bytes | OWASP recommendation |
| L-7 | Add deprecation deadline enforcement for cascade rules (Q3 2026) | Tech debt hygiene |
| L-8 | Document Zustand+Context hybrid in `GlobalSoulProvider` | Maintainability |

---

## Appendix: Files Reviewed

- `src/App.tsx`
- `src/lib/auth-context.tsx`
- `src/lib/vault-context.tsx`
- `src/lib/encryption.ts`
- `src/lib/global-soul-context.tsx`
- `src/lib/module-manifest.ts`
- `src/lib/types.ts`
- `src/lib/actions/action-hub.ts`
- `src/lib/actions/core-handlers.ts`
- `src/lib/spine/spine-event-bus.ts`
- `src/lib/spine/cascade-rules.ts`
- `src/lib/services/global-projection-service.ts`
- `src/lib/services/nsv-service.ts`
- `src/lib/services/nsv-ownership.ts`
- `src/lib/services/module-memory-service.ts` (partial)
- `src/lib/services/firestore-utils.ts`
- `src/lib/hooks/use-module-ai.ts`
- `src/lib/data-layer/index.ts`
- `src/lib/data-layer/provider.tsx`
- `src/llm-engine/ai-context.tsx`
- `src/llm-engine/engine/CognitiveAgent.ts`
- `src/llm-engine/engine/Orchestrator.ts`
- `src/modules/agnes/AgnesPage.tsx`
- `src/modules/agnes/services/actions.ts`
- `src/modules/titan/services/titan-profile-service.ts`
- `src/modules/ledger/services/ledger-intake-service.ts`
- `src/modules/atlas/AtlasPage.tsx`
- `src/modules/scout/ScoutPage.tsx`
- `src/modules/forge/ForgePage.tsx`
- `src/core/components/UnifiedModulePage.tsx`
- `vite.config.ts`
- `tsconfig.json`
- `firebase.json`
- `AGENTS.md`
