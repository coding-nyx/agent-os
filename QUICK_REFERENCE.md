# Nexus Quick Reference Card

**Print or bookmark this page for instant reference**

---

## 🏗 Architecture At-a-Glance

```
User Interface (src/modules/*)
      ↓
Core Components (src/core/)
      ↓
Shared Runtime (src/lib/)
      ↓
LLM Engine (src/llm-engine/) ← External boundary
      ↓
OpenRouter/Firebase APIs
```

---

## 📂 Directory Structure

```
src/
├── core/           # Reusable UI (ModuleLayout, NexusChat, GlassCard)
├── lib/            # Services, contexts, Spine, Vault, GlobalSoul
├── llm-engine/     # AI runtime (DO NOT MODIFY without approval)
├── modules/        # Feature domains (agnes, titan, ledger, etc.)
├── App.tsx         # Provider hierarchy + routing
└── main.tsx        # Entry point
```

---

## 🔗 Provider Hierarchy (Order Matters!)

```jsx
<ThemeProvider>
  <AuthProvider>           // Firebase auth + guest mode
    <VaultProvider>        // E2EE key management
      <GlobalSoulProvider> // Cross-module state
        <AIProvider>       // LLM engine wrapper
          <Router />
```

---

## 🎨 Module Colors

| Module | Color | Use |
|--------|-------|-----|
| agnes | indigo | Mental wellness |
| titan | orange | Fitness |
| ledger | emerald | Health records |
| soma | cyan | Physical readiness |
| atlas | violet | Energy mapping |
| scout | blue | Data exploration |
| forge | amber | Habit formation |
| hub | purple | Command center |

---

## 🔐 Encryption Pattern

```typescript
// ALWAYS encrypt sensitive data
const key = await vault.getModuleKey('moduleName');
const encrypted = await encryptWithKey(data, key);

await db.collection('profiles').doc(userId).set({
  encryptedData: encrypted.data,
  iv: encrypted.iv,
  metadata: { lastUpdated: Date.now() }
});
```

---

## 🤖 AI Usage

```typescript
// Option 1: Direct engine access
const { sendMessage } = useAI();
await sendMessage({
  userMessage: 'Hello',
  systemPrompt: 'You are...',
  history: []
});

// Option 2: Module AI (recommended)
const { sendMessage, executeAction } = useModuleAI({
  moduleName: 'agnes',
  allowedActions: ['UPDATE_PROFILE']
});
```

---

## 🔄 State Management

```typescript
// ✅ RIGHT: Functional update
setState(prev => ({ ...prev, field: value }));

// ❌ WRONG: Direct mutation
setState({ field: value });

// ✅ RIGHT: Cleanup in useEffect
useEffect(() => {
  const unsubscribe = subscribe();
  return unsubscribe;
}, []);
```

---

## 📡 Spine Events

```typescript
// Emit event
Spine.emit({
  type: 'MODULE_ACTION',
  source: 'moduleName',
  data: { key: 'value' }
});

// Subscribe to event
Spine.on('OTHER_MODULE_ACTION', (event) => {
  console.log(event.data);
});
```

---

## 🧩 Component Imports

```typescript
// Core components
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NexusChat } from '@/core/components/NexusChat';
import { NeuralButton } from '@/core/components/NeuralButton';
import { GlassCard } from '@/core/components/GlassCard';

// Contexts
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAI } from '@/llm-engine/ai-context';

// Icons
import { Save, User, Settings } from 'lucide-react';
```

---

## ✅ Common Checklist

### Before Commit
- [ ] Run `npm run build`
- [ ] Test guest + authenticated flows
- [ ] Test vault lock/unlock
- [ ] Update relevant README.md
- [ ] Check for console errors

### New Feature
- [ ] Add to appropriate module directory
- [ ] Update module README.md
- [ ] Register actions if needed
- [ ] Add Spine events if cross-module
- [ ] Test with GlobalSoul integration

### New Component
- [ ] Add TypeScript props interface
- [ ] Add JSDoc comments
- [ ] Ensure WCAG AA compliance
- [ ] Test keyboard navigation
- [ ] Add to core/README.md if reusable

---

## 🚫 DON'Ts

1. ❌ Modify `src/llm-engine/` without explicit approval
2. ❌ Add module-specific logic to global providers
3. ❌ Bypass encryption for "temporary" data
4. ❌ Duplicate existing components
5. ❌ Break provider hierarchy order
6. ❌ Forget cleanup in useEffect
7. ❌ Use `any` type (use `unknown` if needed)
8. ❌ Store passwords in state or localStorage

---

## 🎯 DOs

1. ✅ Keep module logic in module directory
2. ✅ Use functional state updates
3. ✅ Add cleanup to subscriptions
4. ✅ Update docs in same commit as code
5. ✅ Use semantic HTML + ARIA labels
6. ✅ Test responsive design (mobile-first)
7. ✅ Follow existing visual language
8. ✅ Encrypt all sensitive data

---

## 📖 Documentation Quick Links

| Need | Read |
|------|------|
| System overview | [CODE_DOCUMENTATION.md](CODE_DOCUMENTATION.md) |
| Architecture rules | [AGENTS.md](AGENTS.md) |
| All docs index | [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) |
| Shared runtime | [src/lib/README.md](src/lib/README.md) |
| LLM engine | [src/llm-engine/README.md](src/llm-engine/README.md) |
| UI components | [src/core/README.md](src/core/README.md) |
| Module template | [src/modules/MODULE_README_TEMPLATE.md](src/modules/MODULE_README_TEMPLATE.md) |

---

## 🐛 Debug Commands

```bash
# Build and check for errors
npm run build

# Start dev server
npm run dev

# Preview production build
npm run preview

# Lint code
npm run lint

# Install doc reminder hooks
npm run install-doc-hooks
```

---

## 🔍 Common Error Solutions

| Error | Solution |
|-------|----------|
| "Vault not unlocked" | Check `useVault().isUnlocked` |
| "Permission denied" | Check Firebase auth + Firestore rules |
| Infinite re-renders | Use functional state updates |
| Stale data | Add cleanup to useEffect |
| AI not responding | Check API keys in `.env.local` |

---

## 🎨 Accessibility Checklist

- [ ] Semantic HTML (`<button>` not `<div onClick>`)
- [ ] ARIA labels on icons
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Focus indicators visible
- [ ] Color contrast ≥ 4.5:1
- [ ] Screen reader tested

---

## 📏 Code Style

```typescript
// Component structure
export function MyComponent({ prop }: Props) {
  // 1. Hooks
  const { user } = useAuth();
  const [state, setState] = useState();
  
  // 2. Effects
  useEffect(() => {
    // ...
    return cleanup;
  }, [deps]);
  
  // 3. Handlers
  const handleAction = async () => {
    // ...
  };
  
  // 4. Render
  return (
    <div>
      {content}
    </div>
  );
}
```

---

## 🔢 File Naming

- Components: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- Services: `kebab-case.ts` (e.g., `user-service.ts`)
- Utilities: `kebab-case.ts` (e.g., `format-date.ts`)
- Types: `PascalCase` interfaces/types (e.g., `UserProfile`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_TIMEOUT`)

---

## 💡 Performance Tips

- Use `useMemo` for expensive computations
- Use `useCallback` for event handlers passed as props
- Lazy load routes and heavy components
- Virtualize long lists
- Debounce search inputs
- Cleanup subscriptions

---

## 📝 Commit Message Format

```
feat(module): Add feature description
- Detail 1
- Detail 2
- Update module/README.md

fix(component): Fix bug description

docs: Update documentation

refactor(service): Refactor description
```

---

**Print this page and keep it handy!**  
**Last Updated:** 2026-03-10
