# Module README Template

**Copy this template when creating a new module.**

---

# {Module Name} Module

**Purpose:** {One-line description of what this module does}  
**Route:** `/{route-name}`  
**Last Updated:** {YYYY-MM-DD}

---

## Quick Reference

| Aspect | Value |
|--------|-------|
| **Primary File** | `{ModuleName}Page.tsx` |
| **AI Persona** | `personas.ts` or `prompts/` |
| **Service** | `services/{module}-service.ts` |
| **Firestore Collection** | `{module}_profiles` |
| **Encryption Required** | ✅ Yes / ❌ No |
| **Spine Events** | {List key events emitted/subscribed} |

---

## Module Overview

### What This Module Does
{2-3 sentences explaining the module's purpose and primary functionality}

### Key Features
- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

### Integration Points
- **Uses from GlobalSoul:** {e.g., emotional resilience score, physical readiness}
- **Contributes to GlobalSoul:** {e.g., training intensity, recovery metrics}
- **Spine Events:** {List events this module emits/listens to}

---

## File Structure

```
{module}/
├── {Module}Page.tsx           # Main page component
├── components/
│   ├── {Feature}Component.tsx # Feature-specific UI
│   └── {Other}Component.tsx
├── services/
│   └── {module}-service.ts    # Business logic and persistence
├── onboarding/
│   └── {Module}Onboarding.tsx # First-time setup flow
├── personas.ts                # AI personality definitions
├── types.ts                   # Module-specific TypeScript types
└── README.md                  # This file
```

---

## Data Model

### Profile Structure
```typescript
interface {Module}Profile {
  userId: string;
  // Add actual fields
  field1: string;
  field2: number;
  metadata: {
    createdAt: number;
    lastUpdated: number;
  };
}
```

### Firestore Collection
```
{module}_profiles/
  {userId}/
    encryptedData: string
    iv: string
    metadata: {
      lastUpdated: number
      version: string
    }
```

---

## Key Components

### 1. {Module}Page.tsx
**Purpose:** Main entry point and layout orchestration

**Responsibilities:**
- Load/subscribe to profile
- Handle onboarding gate
- Render dashboard or workspace
- Manage AI conversation state

**Usage:**
```typescript
// Routed from App.tsx
<Route path="/{route}" element={<{Module}Page />} />
```

### 2. {Feature}Component.tsx
**Purpose:** {Describe component purpose}

**Props:**
```typescript
interface {Feature}Props {
  // Document props
}
```

**Usage:**
```typescript
<{Feature}Component prop1={value} prop2={handler} />
```

---

## AI Integration

### Personas
```typescript
// personas.ts
export const {module}Personas = {
  default: {
    name: '{Persona Name}',
    systemPrompt: 'You are a {description}...',
    modelPreference: 'deepseek'
  }
};
```

### Allowed Actions
```typescript
const allowedActions = [
  'UPDATE_PROFILE',
  'CREATE_{ENTITY}',
  'DELETE_{ENTITY}'
];
```

### Example Conversation Flow
```typescript
const { sendMessage } = useModuleAI({
  moduleName: '{module}',
  allowedActions,
  onActionComplete: handleActionComplete
});

await sendMessage({
  userMessage: 'User input',
  systemPrompt: personas.default.systemPrompt,
  history: conversationHistory
});
```

---

## Service Layer

### {Module}Service
**Location:** `services/{module}-service.ts`

**Key Methods:**
```typescript
class {Module}Service {
  // Load profile from Firestore
  async loadProfile(userId: string): Promise<{Module}Profile>
  
  // Save profile to Firestore (encrypted)
  async saveProfile(userId: string, profile: {Module}Profile): Promise<void>
  
  // Subscribe to real-time updates
  subscribe(userId: string, callback: (profile: {Module}Profile) => void): Unsubscribe
  
  // Other methods...
}
```

**Usage:**
```typescript
const service = {Module}Service.getInstance();
const profile = await service.loadProfile(userId);
```

---

## Onboarding Flow

### Steps
1. {Step 1 description}
2. {Step 2 description}
3. {Step 3 description}

### Completion Criteria
```typescript
const isOnboarded = profile.metadata?.onboardingComplete === true;
```

---

## Spine Integration

### Events Emitted
```typescript
// Event when {action happens}
Spine.emit({
  type: '{MODULE}_{EVENT}',
  source: '{module}',
  data: {
    // Event payload
  }
});
```

### Events Subscribed
```typescript
// Listen for events from other modules
Spine.on('{OTHER_MODULE}_EVENT', (event) => {
  // Handle event
});
```

---

## GlobalSoul Contribution

### Neural State Vector (NSV) Updates
```typescript
import { GlobalProjectionService } from '@/lib/services/global-projection-service';

// Update NSV after significant actions
await GlobalProjectionService.updateNSV(userId, {
  {metric}: newValue
});
```

### Insights Contributed
```typescript
// Add module insights to GlobalSoul
await globalSoul.updateInsights('{module}', [
  'Insight 1: ...',
  'Insight 2: ...'
]);
```

---

## Common Patterns

### Pattern 1: Loading Profile with Vault
```typescript
const { user } = useAuth();
const { isUnlocked, getMasterKey } = useVault();
const [profile, setProfile] = useState<{Module}Profile | null>(null);

useEffect(() => {
  if (!user || !isUnlocked) return;
  
  const service = {Module}Service.getInstance();
  const unsubscribe = service.subscribe(user.uid, setProfile);
  
  return unsubscribe;
}, [user, isUnlocked]);
```

### Pattern 2: Updating Profile
```typescript
const handleUpdate = async (updates: Partial<{Module}Profile>) => {
  setProfile(prev => ({
    ...prev!,
    ...updates,
    metadata: {
      ...prev!.metadata,
      lastUpdated: Date.now()
    }
  }));
  
  await service.saveProfile(user.uid, updatedProfile);
  
  // Emit Spine event
  Spine.emit({
    type: '{MODULE}_PROFILE_UPDATED',
    source: '{module}',
    data: updates
  });
};
```

### Pattern 3: AI-Driven Actions
```typescript
const { sendMessage, executeAction } = useModuleAI({
  moduleName: '{module}',
  allowedActions: ['UPDATE_PROFILE'],
  onActionComplete: async (action, result) => {
    if (action === 'UPDATE_PROFILE') {
      // Refresh profile after update
      await service.loadProfile(user.uid);
    }
  }
});
```

---

## Testing Checklist

When modifying this module:

- [ ] Test with guest user (mock data)
- [ ] Test with authenticated user
- [ ] Test vault lock/unlock flow
- [ ] Verify Firestore encryption
- [ ] Test AI conversation flow
- [ ] Test action execution
- [ ] Verify Spine event emission
- [ ] Check GlobalSoul NSV updates
- [ ] Test onboarding flow
- [ ] Run `npm run build`

---

## Common Issues

### Issue: Profile not loading
**Cause:** Vault not unlocked or user not authenticated  
**Fix:** Check `isUnlocked` and `user` state before loading

### Issue: AI not responding
**Cause:** Missing persona or invalid system prompt  
**Fix:** Verify persona definition and API key configuration

### Issue: Actions not executing
**Cause:** Action not in `allowedActions` list  
**Fix:** Add action to allowed list and register handler

---

## Performance Considerations

- **Lazy Loading:** Page is lazy-loaded in `App.tsx` for optimal bundle size
- **Subscription Cleanup:** Always return unsubscribe from useEffect
- **Memoization:** Use `useMemo` for expensive computations
- **Virtualization:** If displaying large lists, use virtual scrolling

---

## Accessibility

- [ ] All interactive elements have ARIA labels
- [ ] Keyboard navigation fully supported
- [ ] Color contrast meets WCAG AA standards
- [ ] Screen reader tested
- [ ] Focus management in modals/dialogs

---

## Documentation Maintenance

**Update this README when:**
- Adding new features or components
- Changing data model structure
- Adding/removing Spine events
- Modifying AI personas or actions
- Changing onboarding flow

**Git Commit Format:**
```bash
git commit -m "feat({module}): Add {feature}
- Implementation details
- Update {module}/README.md"
```

---

## See Also

- [CODE_DOCUMENTATION.md](../../../CODE_DOCUMENTATION.md) - Overall architecture
- [AGENTS.md](../../../AGENTS.md) - Agent protocol
- [src/lib/README.md](../../lib/README.md) - Shared runtime layer
- [src/llm-engine/README.md](../../llm-engine/README.md) - AI engine interface
