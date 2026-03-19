# Shared Runtime Layer (`src/lib/`)

**Purpose:** Core services, contexts, utilities, and orchestration logic  
**Last Updated:** 2026-03-10

---

## Quick Reference

This directory contains the shared runtime infrastructure for Nexus. All cross-cutting concerns and platform-level services live here.

**Key Principle:** Module-specific logic should NOT be here. This is only for shared, reusable platform code.

---

## Directory Structure

```
lib/
├── actions/                 # Action execution framework (ActionHub)
├── ai-adapters/            # LLM engine adapters for app layer
├── data-layer/             # Data persistence abstractions
├── field-system/           # Dynamic form field system
├── hooks/                  # Shared React hooks
├── onboarding/             # Onboarding flow orchestration
├── schemas/                # Zod validation schemas
├── services/               # Business logic services
├── spine/                  # Event bus and cascade rules
├── stores/                 # Zustand global stores
├── validation/             # Validation utilities
├── auth-context.tsx        # Firebase auth + guest mode provider
├── vault-context.tsx       # E2EE vault provider
├── global-soul-context.tsx # Cross-module state synthesis provider
├── module-manifest.ts      # Module registry and configuration
├── encryption.ts           # Web Crypto API utilities
├── firebase.ts             # Firebase initialization
└── types.ts                # Global TypeScript types
```

---

## Key Systems

### 1. Auth System (`auth-context.tsx`)
**Responsibilities:**
- Firebase Auth state management
- Guest mode support
- Core profile subscription
- User lifecycle (signup, login, logout)

**Usage:**
```typescript
import { useAuth } from '@/lib/auth-context';

function MyComponent() {
  const { user, isGuest, signOut } = useAuth();
  // ...
}
```

### 2. Vault System (`vault-context.tsx`)
**Responsibilities:**
- E2EE key derivation (PBKDF2)
- Master key management
- Single master key (module-agnostic access)
- Vault lock/unlock state
- Canary verification

**Usage:**
```typescript
import { useVault } from '@/lib/vault-context';

function MyComponent() {
  const { isUnlocked, getMasterKey, unlockVault } = useVault();
  
  const key = await getMasterKey();
  // Use key for encryption/decryption
}
```

**Critical Pattern:**
```typescript
// Always check vault status before accessing encrypted data
if (!isUnlocked) {
  return <VaultUnlockPrompt />;
}
```

### 3. GlobalSoul System (`global-soul-context.tsx`)
**Responsibilities:**
- Cross-module state synthesis
- Neural State Vector (NSV) aggregation
- Context enhancement for AI conversations
- Tool call handling for AI actions

**Usage:**
```typescript
import { useGlobalSoul } from '@/lib/global-soul-context';

function MyComponent() {
  const { globalSoul, enhanceContext, updateInsights } = useGlobalSoul();
  
  // Enhance AI context with cross-module insights
  const enhancedContext = enhanceContext({
    systemPrompt: 'You are a helpful assistant',
    history: messages
  });
}
```

### 4. Spine Event Bus (`spine/`)
**Responsibilities:**
- Decoupled pub/sub communication
- Cross-module event coordination
- Cascade rule automation
- Event persistence

**Usage:**
```typescript
import { Spine } from '@/lib/spine/spine-event-bus';

// Emit event
Spine.emit({
  type: 'TRAINING_COMPLETED',
  source: 'titan',
  data: { intensity: 8, duration: 60 }
});

// Subscribe to events
Spine.on('EMOTIONAL_STATE_CHANGED', (event) => {
  console.log('Emotional state:', event.data);
});
```

**Cascade Rules:** See `spine/cascade-rules.ts` for automation logic (e.g., blocking high-intensity training based on emotional resilience).

### 5. Action Hub (`actions/`)
**Responsibilities:**
- AI action execution
- Action schema validation
- Permission checking
- Side effect coordination

**Usage:**
```typescript
import { ActionHub } from '@/lib/actions/action-hub';

// Register action handler
ActionHub.register('UPDATE_PROFILE', async (params) => {
  // Execute action
  await profileService.update(params);
});

// Execute action (typically called by AI adapter)
await ActionHub.execute('UPDATE_PROFILE', { name: 'New Name' });
```

### 6. Services (`services/`)
Each service encapsulates specific business logic:

| Service | Purpose |
|---------|---------|
| `core-profile-service.ts` | User identity and profile persistence |
| `global-soul-service.ts` | GlobalSoul CRUD and synthesis |
| `nexus-handoff-service.ts` | Cross-module delegations and handoffs |
| `global-projection-service.ts` | Neural State Vector calculations |
| `nsv-service.ts` | NSV aggregation and updates |
| `session-persistence-service.ts` | Chat history persistence |
| `soul-termination-service.ts` | Account deletion and cleanup |

**Service Pattern:**
```typescript
// All services follow this pattern
class MyService {
  private static instance: MyService;
  
  static getInstance(): MyService {
    if (!MyService.instance) {
      MyService.instance = new MyService();
    }
    return MyService.instance;
  }
  
  async doSomething() {
    // Business logic
  }
}

// Usage
const service = MyService.getInstance();
await service.doSomething();
```

---

## Common Patterns

### Pattern 1: Encrypted Data Persistence
```typescript
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';
import { useVault } from '@/lib/vault-context';
import { db } from '@/lib/firebase';

async function saveProfile(userId: string, data: any) {
  const key = await vault.getMasterKey();
  const encrypted = await encryptWithKey(data, key);
  
  await db.collection('agnes_profiles').doc(userId).set({
    encryptedData: encrypted.data,
    iv: encrypted.iv,
    metadata: { lastUpdated: Date.now() }
  });
}

async function loadProfile(userId: string) {
  const doc = await db.collection('agnes_profiles').doc(userId).get();
  const key = await vault.getMasterKey();
  
  return await decryptWithKey(doc.data().encryptedData, key, doc.data().iv);
}
```

### Pattern 2: Service with Firestore Subscription
```typescript
class MyService {
  subscribe(userId: string, callback: (data: any) => void) {
    return db.collection('my_collection')
      .doc(userId)
      .onSnapshot(async (snapshot) => {
        if (!snapshot.exists) return;
        
        const encrypted = snapshot.data();
        const key = await vault.getMasterKey();
        const decrypted = await decryptWithKey(
          encrypted.encryptedData,
          key,
          encrypted.iv
        );
        
        callback(decrypted);
      });
  }
}

// Usage in component
useEffect(() => {
  const unsubscribe = service.subscribe(userId, setData);
  return unsubscribe; // Cleanup
}, [userId]);
```

### Pattern 3: Cross-Module Coordination
```typescript
import { Spine } from '@/lib/spine/spine-event-bus';
import { useGlobalSoul } from '@/lib/global-soul-context';

function MyComponent() {
  const { updateInsights } = useGlobalSoul();
  
  // Emit event to other modules
  const handleAction = async () => {
    // Update local state
    await updateProfile(newData);
    
    // Emit Spine event
    Spine.emit({
      type: 'PROFILE_UPDATED',
      source: 'my_module',
      data: { field: 'value' }
    });
    
    // Update GlobalSoul insights
    await updateInsights('my_module', {
      insight: 'New insight from action'
    });
  };
  
  return <button onClick={handleAction}>Do Action</button>;
}
```

---

## Testing Checklist

When modifying code in `src/lib/`:

- [ ] Run `npm run build` to verify TypeScript compilation
- [ ] Test with guest user (no Firebase auth)
- [ ] Test with authenticated user
- [ ] Test vault lock/unlock flow
- [ ] Verify Firestore security rules still work
- [ ] Check for race conditions in async operations
- [ ] Ensure proper cleanup in subscriptions

---

## Common Pitfalls

### ❌ Don't Do This
```typescript
// DON'T: Module-specific logic in global context
const GlobalSoulProvider = () => {
  const [titanProfile, setTitanProfile] = useState();
  // This should be in src/modules/titan/
};

// DON'T: Bypass encryption
await db.collection('profiles').doc(userId).set(sensitiveData);

// DON'T: Forget cleanup
useEffect(() => {
  const unsubscribe = subscribe();
  // Missing: return unsubscribe;
}, []);
```

### ✅ Do This Instead
```typescript
// DO: Keep module logic in module
// GlobalSoul only stores synthesized insights
const GlobalSoulProvider = () => {
  const [insights, setInsights] = useState({});
};

// DO: Always encrypt
const encrypted = await encryptWithKey(data, key);
await db.collection('profiles').doc(userId).set(encrypted);

// DO: Cleanup subscriptions
useEffect(() => {
  const unsubscribe = subscribe();
  return unsubscribe;
}, []);
```

---

## Documentation Maintenance

**Update this README when:**
- Adding a new service to `services/`
- Adding a new context provider
- Changing the Spine event structure
- Modifying encryption patterns
- Adding new shared hooks

**Format for new services:**
```markdown
### Service Name (`filename.ts`)
**Purpose:** One-line description
**Usage:**
\`\`\`typescript
// Code example
\`\`\`
```

---

## See Also

- [CODE_DOCUMENTATION.md](../../CODE_DOCUMENTATION.md) - Overall architecture
- [AGENTS.md](../../AGENTS.md) - Agent protocol and standards
- `src/modules/*/README.md` - Module-specific documentation
