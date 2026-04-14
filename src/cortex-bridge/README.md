# cortex-bridge (`src/cortex-bridge/`)

**Purpose:** TypeScript bridge layer between the agnes React app and the `cortex-logic` KMP library.

The KMP JS bundle (`cortex.js`) is published as the `cortex-logic` npm package and aliased to `@cortex-logic` by Vite. All access from app code goes through this directory — never import directly from `cortex-logic/build/dist/…`.

---

## Directory layout

```
cortex-bridge/
├── cortex-logic-runtime.ts   # Master re-exporter — pre-loads Kotlin/Ktor runtime JARs,
│                             # runs a DFS over the UMD namespace, and exports ~80 *Js classes.
│                             # 5 exports are lazy-guarded (null if the KMP build omits them):
│                             #   ActionHubJs, CancellableTask, PersonaPromptCatalogJs,
│                             #   TitanPromptBuilderJs, RagChunkingServiceJs.
│                             # Callers of lazy-guarded exports must null-check at call site.
│
├── ai-context.tsx            # React AIProvider / useAI() — wraps CognitiveEngineJs,
│                             # handles init timeout (8 s), degraded-mode fallback, and
│                             # credential store integration.
│
├── action-hub-bridge.ts      # ActionHubJs + NsvOwnershipServiceJs singleton management.
│                             # Call setActionHubUser(uid) on login; invalidateActionHubBridge()
│                             # on logout.
│
├── credential-store-bridge.ts# CredentialStoreJs singleton; encrypts API keys in Firestore.
│                             # Includes a legacy localStorage → vault migration path.
│
├── nexus-synthesis-bridge.ts # NexusSynthesisServiceJs singleton.
├── nexus-data-layer-bridge.ts# Action-hub callback glue for the data layer.
├── persona-factory.ts        # PersonaFactoryJs wrapper + fallback persona strings.
├── sanitize.ts               # LlmSanitizerJs wrapper.
├── kmp-parse.ts              # Safe JSON.parse helper for KMP JSON string returns.
│
├── ws-browser-shim.ts        # Maps `ws` module import to the browser's native WebSocket.
│                             # Required by Ktor's JS HTTP client.
│
├── js-joda-global.ts         # Sets up @js-joda/timezone global before cortex.js loads.
│
├── types.ts                  # Shared types for bridge layer (not KMP-generated).
│
└── engine/                   # Pre-KMP local engine; still in use for CognitiveAgent,
    ├── CognitiveAgent.ts     # MemoryManager, and streaming plumbing. Wraps KMP
    ├── MemoryManager.ts      # CognitiveEngineJs internally.
    └── types.ts
```

---

## How to use the KMP layer

### 1. LLM / chat — `useAI()` or `useModuleAI()`

```typescript
import { useAI } from '@/cortex-bridge/ai-context';

const { sendMessage, streamMessage, generateJSON, isInitialized, initFailed } = useAI();
```

`useModuleAI()` (`@/lib/ai-adapters/module-ai-adapter`) is the recommended hook for module pages — it wraps `useAI()` with persona resolution, orchestration gate checks, and action dispatch.

### 2. Direct KMP exports

Import named exports from the `@cortex-logic` alias (resolved by Vite to `cortex-logic-runtime.ts`):

```typescript
import { SessionArcJs, NsvServiceJs, ExerciseLibraryJs } from '@cortex-logic';
```

Always null-check the 5 lazy-guarded exports before constructing them:

```typescript
import { TitanPromptBuilderJs } from '@cortex-logic';

if (!TitanPromptBuilderJs) throw new Error('TitanPromptBuilderJs unavailable in this build');
const builder = new TitanPromptBuilderJs();
```

### 3. Action hub

```typescript
import { setActionHubUser, invalidateActionHubBridge } from '@/cortex-bridge/action-hub-bridge';
// Called in SpineRuntimeBootstrap (App.tsx) — do not call from modules directly.
```

---

## Adding a new KMP export

1. Ensure the Kotlin class has `@JsExport` in `cortex-logic/src/jsMain`.
2. Add `export const FooJs = requireEngineExport('FooJs');` to `cortex-logic-runtime.ts`.
3. Add the TypeScript declaration to `src/types/cortex-logic.d.ts`.
4. If the export may be absent in some builds, use the lazy-guard pattern (see lines 65/76/120/140/146 in the runtime).

---

## TypeScript types

`src/types/cortex-logic.d.ts` is the authoritative TS declaration for `@cortex-logic`. It is hand-maintained. When cortex-logic ships new exports, update this file to match. The generated `.d.ts` inside `node_modules/cortex-logic/` is not wired into tsconfig.
