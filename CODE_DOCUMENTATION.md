# Nexus Code Documentation System

**Last Updated:** 2026-03-10  
**Version:** 1.0.0  
**Purpose:** Low-context reference for LLM code assistants

---

## 🎯 Quick Navigation for LLMs

| Need | Read This | Time |
|------|-----------|------|
| **Project overview** | This file → [Architecture Overview](#architecture-overview) | 2min |
| **Make changes to a module** | `src/modules/{module}/README.md` | 1min |
| **Understand data flow** | [Data Flow Patterns](#data-flow-patterns) | 3min |
| **Add new feature** | [Feature Addition Checklist](#feature-addition-checklist) | 2min |
| **Fix a bug** | [Debugging Guide](#debugging-guide) | 2min |
| **Security/Encryption** | `docs/architecture/VAULT_ARCHITECTURE.md` | 3min |
| **AI/LLM Integration** | `src/llm-engine/README.md` | 2min |

---

## Architecture Overview

### System Identity
**Nexus** (powered by AGNES - Artificial General Neural Ecosystem for Stability) is a React 19 SPA with:
- **Multi-agent AI wellness platform** (mental health + physical optimization)
- **Client-side E2EE** (Web Crypto API: PBKDF2 + AES-GCM)
- **Firebase backend** (Auth, Firestore, Storage)
- **Modular architecture** with strict separation of concerns

### Core Tech Stack
```
Frontend:    React 19 + TypeScript (strict) + Vite
Styling:     Tailwind CSS + Framer Motion + Shadcn UI
AI:          Custom orchestrator (OpenRouter-based)
Encryption:  Web Crypto API (client-side vault)
Backend:     Firebase (Firestore, Auth, Storage)
State:       Zustand + React Context
```

### Directory Structure
```
src/
├── core/           # Shared UI, layouts, reusable components
├── lib/            # Services, contexts, utilities, orchestration
├── llm-engine/     # AI runtime (EXTERNAL BOUNDARY - do not modify)
├── modules/        # Feature domains (agnes, titan, ledger, etc.)
├── guardrails/     # Security and validation
├── App.tsx         # Provider composition + routing
└── main.tsx        # Entry point
```

---

## Architecture Layers

### Layer 1: Entry & Bootstrapping
**File:** `src/main.tsx`  
**Responsibilities:**
- React 19 root render
- Core action handler registration
- Global error boundaries

### Layer 2: Provider Hierarchy
**File:** `src/App.tsx`  
**Order (MUST be maintained):**
```
ThemeProvider
  → AuthProvider (Firebase auth + guest mode)
    → VaultProvider (E2EE key management)
      → GlobalSoulProvider (cross-module state synthesis)
        → AIProvider (LLM engine wrapper)
          → Router (lazy-loaded module pages)
```

### Layer 3: Shared Runtime (`src/lib/`)
| System | Location | Purpose |
|--------|----------|---------|
| **Spine** | `lib/spine/` | Event bus for cross-module communication |
| **Vault** | `lib/vault-context.tsx` | E2EE key derivation and module access |
| **GlobalSoul** | `lib/global-soul-context.tsx` | Unified wellness state (Neural State Vectors) |
| **ActionHub** | `lib/actions/` | Action execution and validation |
| **Services** | `lib/services/` | Business logic (persistence, sync, handoffs) |

### Layer 4: Feature Modules (`src/modules/`)
| Module | Purpose | Route |
|--------|---------|-------|
| **agnes** | Mental wellness therapy | `/agnes` |
| **titan** | Fitness coaching | `/titan` |
| **ledger** | Clinical health records | `/ledger` |
| **soma** | Physical readiness clearance | `/soma` |
| **atlas** | Energy mapping | `/atlas` |
| **scout** | External data exploration | `/scout` |
| **forge** | Habit formation | `/forge` |
| **hub** | 3D visualization command center | `/hub` |
| **orchestrator** | Onboarding (Nyx AI) | `/orchestrator` |
| **profile** | User settings | `/profile` |

### Layer 5: LLM Engine (`src/llm-engine/`)
**CRITICAL:** Treat as black-box external API. Do NOT modify unless explicitly requested.  
**Interfaces:** `useAI()`, `useModuleAI()`, `AIProvider`

---

## Data Flow Patterns

### Pattern 1: User Authentication Flow
```
User Login → AuthProvider → Firebase Auth
  ↓
  Vault Unlock (password) → PBKDF2 key derivation
  ↓
  Module access check → getModuleKey(moduleName)
  ↓
  Encrypted data fetch → Firestore
  ↓
  Client-side decryption → Module state
```

### Pattern 2: Module Lifecycle
```
ModulePage mount
  ↓
  useModuleProfile() → load encrypted profile
  ↓
  Check onboarding gate
  ↓
  Render workspace OR onboarding flow
  ↓
  AI chat → useModuleAI() → ActionHub execution
  ↓
  State updates → Spine events → Cross-module cascades
  ↓
  Persist → encrypt → Firestore
```

### Pattern 3: AI Conversation Pipeline
```
User message → useModuleAI()
  ↓
  Context enhancement (GlobalSoul insights)
  ↓
  LLM Engine (useAI) → OpenRouter API
  ↓
  Parse action tags → ActionHub
  ↓
  Execute side effects (persist, update NSV, emit Spine events)
  ↓
  Update UI state
```

### Pattern 4: Cross-Module Coordination
```
Module A action → Spine.emit(event)
  ↓
  Cascade rules evaluate (src/lib/spine/cascade-rules.ts)
  ↓
  Conditional logic (e.g., block training if low emotional resilience)
  ↓
  Module B receives event → updates state
  ↓
  GlobalSoul synthesizes → Neural State Vector update
```

---

## Critical Design Principles

### 1. Module Isolation
**Rule:** All module-specific logic MUST stay in `src/modules/{module}/`
- ❌ **WRONG:** Adding titan-specific state to GlobalSoulProvider
- ✅ **RIGHT:** titan state in `src/modules/titan/services/titan-profile-service.ts`

**Cross-module sharing:** Use `GlobalSoulService` for synthesized insights only.

### 2. LLM Engine Boundary
**Rule:** `src/llm-engine/` is an external API. Interact via hooks only.
- ❌ **WRONG:** `import { Agent } from '@/llm-engine/engine/Agent'`
- ✅ **RIGHT:** `const { sendMessage } = useModuleAI()`

### 3. E2EE Vault Pattern
**Rule:** All sensitive data encrypted before Firestore write.
```typescript
// Correct encryption pattern
const key = await vault.getModuleKey('agnes');
const encrypted = await encryptWithKey(data, key);
await firestore.collection('agnes_profiles').doc(userId).set({
  encryptedData: encrypted.data,
  iv: encrypted.iv,
  metadata: { lastUpdated: Date.now() } // unencrypted for queries
});
```

### 4. Concurrency & Race Safety
**Rule:** Use functional state updates + cleanup in useEffect.
```typescript
// Correct pattern
useEffect(() => {
  let cancelled = false;
  
  fetchData().then(data => {
    if (!cancelled) setState(data);
  });
  
  return () => { cancelled = true; };
}, []);

// setState with functional update
setProfile(prev => ({ ...prev, newField: value }));
```

### 5. Component Reusability (DRY)
**Rule:** Zero duplication. Extract reusable components.
- ❌ **WRONG:** Copying ChatInterface to create TherapyChatInterface
- ✅ **RIGHT:** `<ChatInterface variant="therapy" onAction={handleTherapyAction} />`

---

## Feature Addition Checklist

When adding a new feature, follow this sequence:

### 1. Identify Scope
- [ ] Is this module-specific or cross-cutting?
- [ ] Does it require new Firestore collections?
- [ ] Does it need encryption?
- [ ] Will it emit Spine events?

### 2. Update Types
- [ ] Add TypeScript types to appropriate `types.ts`
- [ ] Update schema registry if new data structure (`src/lib/schemas/`)

### 3. Implement Service Layer
- [ ] Create service class in `src/lib/services/` or `src/modules/{module}/services/`
- [ ] Add encryption if handling sensitive data
- [ ] Implement Firestore CRUD

### 4. Update UI
- [ ] Create components in `src/core/components/` (shared) or `src/modules/{module}/components/`
- [ ] Ensure accessibility (ARIA labels, keyboard nav, color contrast)
- [ ] Add loading/error states

### 5. Wire Hooks
- [ ] Use existing hooks or create in `src/lib/hooks/`
- [ ] Ensure cleanup in useEffect
- [ ] Handle race conditions

### 6. Test & Validate
- [ ] Run `npm run build`
- [ ] Test auth flows (guest + authenticated)
- [ ] Test vault lock/unlock
- [ ] Verify encryption (check Firestore console)

### 7. Update Documentation
- [ ] Update module README.md
- [ ] Add JSDoc comments to new functions
- [ ] Update this file if architecture changed

---

## Debugging Guide

### Common Issues

#### Issue: "Vault not unlocked" error
**Cause:** Trying to access encrypted data before vault unlock  
**Fix:** Check `VaultProvider` context and ensure `isUnlocked === true`

#### Issue: Firestore permission denied
**Cause:** Security rules require authentication or vault metadata  
**Fix:** Check `firestore.rules` and ensure user is authenticated

#### Issue: Infinite re-render loop
**Cause:** Missing dependency array or non-functional state update  
**Fix:** Add proper dependency array and use `prev => ...` pattern

#### Issue: Stale data after navigation
**Cause:** Component not cleaning up subscriptions  
**Fix:** Return cleanup function in useEffect

#### Issue: AI not responding
**Cause:** API key missing or engine not initialized  
**Fix:** Check `.env.local` and `useAI().isInitialized`

### Debugging Tools
```bash
# Check build errors
npm run build

# View Firestore data (encrypted)
# Firebase Console → Firestore Database

# Check vault status
# Open DevTools → Application → Local Storage → vault_status

# View Spine events
# DevTools → Console → filter "SPINE:"

# Check provider state
# React DevTools → Components → Search for Provider
```

---

## Documentation Maintenance Protocol

### When to Update Documentation

| Change Type | Update Required | Files to Update |
|-------------|-----------------|-----------------|
| **New module** | ✅ Required | This file + new `modules/{module}/README.md` |
| **New service** | ✅ Required | `src/lib/README.md` + service JSDoc |
| **UI component** | ⚠️ If reusable | Component JSDoc + `core/components/README.md` |
| **Bug fix** | ❌ Optional | Only if pattern changed |
| **Refactor** | ✅ Required | All affected README files |
| **New provider** | ✅ Required | This file → Provider Hierarchy section |
| **New Firestore collection** | ✅ Required | This file → Persistence Surfaces |

### Documentation Standards

#### 1. README.md Files
Every major directory MUST have a README.md:
```markdown
# {Component/Module Name}

**Purpose:** One-line description
**Last Updated:** YYYY-MM-DD

## Quick Reference
- Primary file: `filename.tsx`
- Dependencies: List key imports
- Used by: List consumers

## Responsibilities
- Bullet list of what this does
- Be specific and concise

## Usage Example
\`\`\`typescript
// Code example
\`\`\`

## Key Patterns
- Important implementation details
- Gotchas and edge cases
```

#### 2. JSDoc Comments
For services and utilities:
```typescript
/**
 * Encrypts data using AES-GCM with the provided key.
 * 
 * @param data - Plain object to encrypt
 * @param key - CryptoKey from vault
 * @returns Encrypted data with IV
 * @throws {Error} If encryption fails
 * 
 * @example
 * const encrypted = await encryptWithKey(profile, key);
 * await firestore.doc('profiles/123').set(encrypted);
 */
export async function encryptWithKey(data: any, key: CryptoKey) {
  // implementation
}
```

#### 3. Inline Comments
Only comment non-obvious logic:
```typescript
// ❌ BAD: Obvious comment
const userId = user.uid; // Get user ID

// ✅ GOOD: Explains WHY
const userId = user.uid; // Use Firebase UID for consistent Firestore lookup
```

### Update Procedure

After ANY code change:
1. **Check** if documentation needs update (see table above)
2. **Update** relevant README.md or JSDoc
3. **Commit** documentation with code (atomic commit)
4. **Review** that documentation is accurate

#### Git Commit Format
```bash
# Include doc updates in the same commit
git commit -m "feat(titan): Add rest day override
- Add override button to dashboard
- Update TitanService with override logic
- Update modules/titan/README.md with new feature"
```

---

## Quick Reference: File Purposes

### Critical Files (Read First)
| File | Purpose | Read Time |
|------|---------|-----------|
| `AGENTS.md` | AI agent protocol and architecture map | 5min |
| `CODE_DOCUMENTATION.md` | This file - overview and patterns | 5min |
| `src/App.tsx` | Provider hierarchy and routing | 2min |
| `src/lib/module-manifest.ts` | Module registry and configuration | 1min |

### Provider Files
| File | Purpose |
|------|---------|
| `src/lib/auth-context.tsx` | Firebase auth + guest mode |
| `src/lib/vault-context.tsx` | E2EE key management |
| `src/lib/global-soul-context.tsx` | Cross-module state synthesis |
| `src/llm-engine/ai-context.tsx` | AI engine wrapper |

### Service Files
| File | Purpose |
|------|---------|
| `src/lib/services/global-soul-service.ts` | GlobalSoul CRUD and synthesis |
| `src/lib/services/core-profile-service.ts` | User identity persistence |
| `src/lib/services/nexus-handoff-service.ts` | Cross-module delegations |
| `src/lib/services/global-projection-service.ts` | Neural State Vector updates |

### Orchestration Files
| File | Purpose |
|------|---------|
| `src/lib/spine/spine-event-bus.ts` | Decoupled pub/sub system |
| `src/lib/spine/cascade-rules.ts` | Cross-module automation logic |
| `src/lib/actions/action-hub.ts` | Action execution and validation |

---

## For Future LLM Assistants

### Context Budget Strategy
If you have limited context, read in this order:
1. This file (CODE_DOCUMENTATION.md) - 5min
2. AGENTS.md - 5min
3. Target module README.md - 1min
4. Relevant service file - 2min

**Total:** ~13min to be productive

### Don't Make These Mistakes
1. ❌ Modifying `src/llm-engine/` without explicit request
2. ❌ Adding module-specific logic to global providers
3. ❌ Bypassing encryption for "temporary" changes
4. ❌ Duplicating existing components
5. ❌ Breaking provider hierarchy order

### Always Do These Things
1. ✅ Run `npm run build` after changes
2. ✅ Use functional state updates
3. ✅ Add cleanup to useEffect
4. ✅ Update documentation in same commit
5. ✅ Preserve existing visual language

---

## Getting Help

### Documentation Hierarchy
```
1. CODE_DOCUMENTATION.md (this file) - Start here
2. AGENTS.md - Architecture deep dive
3. Module-specific README.md - Feature details
4. Service JSDoc comments - Implementation specifics
5. Inline code comments - Edge case explanations
```

### External Resources
- **React 19 Docs:** https://react.dev
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Web Crypto API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- **Firebase Docs:** https://firebase.google.com/docs

---

## Changelog

### 2026-03-10 - v1.0.0
- Initial documentation system created
- Established maintenance protocol
- Added LLM assistant quick reference
- Corrected product name to Nexus (AGNES is the underlying system)

---

**Maintained by:** AI Agents + Human Developers  
**Contact:** See AGENTS.md for agent protocol
