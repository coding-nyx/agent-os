# Core Components (`src/core/`)

**Purpose:** Shared UI components, layouts, and cross-cutting UI patterns  
**Last Updated:** 2026-03-10

---

## Quick Reference

This directory contains reusable UI components and shells used across multiple modules.

**Key Principle:** Components here should be generic and configurable via props. Module-specific UI belongs in `src/modules/{module}/components/`.

---

## Directory Structure

```
core/
├── components/         # Reusable UI components
│   ├── ModuleLayout.tsx      # Standard module shell
│   ├── AraChat.tsx         # AI chat interface
│   ├── NeuralButton.tsx      # Themed button component
│   ├── NeuralInput.tsx       # Themed input component
│   ├── NeuralModal.tsx       # Themed modal/dialog
│   ├── GlassCard.tsx         # Glassmorphism card
│   ├── VaultUnlockModal.tsx  # Vault password prompt
│   ├── AuthModal.tsx         # Authentication dialogs
│   └── RouteGuard.tsx        # Protected route wrapper
├── diagnosis/          # System health monitoring UI
├── intake/             # Guided intake orchestration
│   └── IntakeOrchestrator.tsx
└── layout/             # Layout primitives
    └── AppShell.tsx
```

---

## Key Components

### 1. ModuleLayout.tsx
**Purpose:** Standard shell for all module pages with consistent header, navigation, and E2EE status.

**Props:**
```typescript
interface ModuleLayoutProps {
  moduleName: string;           // For theme color
  title: string;                // Header title
  subtitle?: string;            // Header subtitle
  children: React.ReactNode;    // Page content
  headerActions?: React.ReactNode; // Custom header buttons
  showVaultStatus?: boolean;    // Show E2EE lock indicator
}
```

**Usage:**
```typescript
import { ModuleLayout } from '@/core/layout/ModuleLayout';

function MyModulePage() {
  return (
    <ModuleLayout
      moduleName="agnes"
      title="Mental Wellness"
      subtitle="Your safe space for reflection"
      showVaultStatus
    >
      {/* Page content */}
    </ModuleLayout>
  );
}
```

**Design Features:**
- Glassmorphism header with module-specific theme color
- Animated transitions on mount/unmount
- Responsive layout (mobile-first)
- Vault unlock indicator
- Exit button with smooth navigation

---

### 2. AraChat.tsx
**Purpose:** Reusable AI chat interface with streaming, action handling, and message history.

**Props:**
```typescript
interface AraChatProps {
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  isProcessing?: boolean;
  placeholder?: string;
  systemAvatar?: string;
  userAvatar?: string;
  theme?: 'default' | 'therapy' | 'fitness';
  showActions?: boolean;
  onActionClick?: (action: string, params: any) => void;
}
```

**Usage:**
```typescript
import { AraChat } from '@/core/components/AraChat';

function MyPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const { sendMessage, isProcessing } = useModuleAI({ ... });
  
  return (
    <AraChat
      messages={messages}
      onSendMessage={async (content) => {
        const response = await sendMessage({ userMessage: content });
        setMessages(prev => [...prev, response]);
      }}
      isProcessing={isProcessing}
      theme="therapy"
      placeholder="Share your thoughts..."
    />
  );
}
```

**Features:**
- Markdown rendering in messages
- Code syntax highlighting
- Auto-scroll to latest message
- Streaming response animation
- Action button rendering (when AI emits action tags)
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)
- Accessible (ARIA labels, keyboard nav)

---

### 3. NeuralButton.tsx
**Purpose:** Themed button component with Ara visual language.

**Props:**
```typescript
interface NeuralButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}
```

**Usage:**
```typescript
import { NeuralButton } from '@/core/components/NeuralButton';
import { Save } from 'lucide-react';

<NeuralButton
  variant="primary"
  size="md"
  icon={<Save className="w-4 h-4" />}
  onClick={handleSave}
  isLoading={isSaving}
>
  Save Profile
</NeuralButton>
```

**Accessibility:**
- ✅ Proper focus states
- ✅ Disabled state handling
- ✅ Loading spinner with screen reader text
- ✅ Keyboard navigation support

---

### 4. GlassCard.tsx
**Purpose:** Glassmorphism card with consistent styling.

**Props:**
```typescript
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;           // Enable hover effect
  blur?: 'sm' | 'md' | 'lg'; // Backdrop blur intensity
}
```

**Usage:**
```typescript
import { GlassCard } from '@/core/components/GlassCard';

<GlassCard hover blur="md" className="p-6">
  <h3>Card Title</h3>
  <p>Card content...</p>
</GlassCard>
```

**Visual Style:**
- Semi-transparent background
- Backdrop blur
- Subtle border glow
- Smooth hover transitions

---

### 5. VaultUnlockModal.tsx
**Purpose:** Password prompt for vault unlocking.

**Props:**
```typescript
interface VaultUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (password: string) => Promise<boolean>;
  error?: string;
}
```

**Usage:**
```typescript
import { VaultUnlockModal } from '@/core/components/VaultUnlockModal';

const [showUnlock, setShowUnlock] = useState(false);

<VaultUnlockModal
  isOpen={showUnlock}
  onClose={() => setShowUnlock(false)}
  onUnlock={async (password) => {
    const success = await vault.unlockVault(password);
    if (success) setShowUnlock(false);
    return success;
  }}
  error={unlockError}
/>
```

**Security Features:**
- Password input masking
- Rate limiting UI feedback
- Error message display
- No password storage in state

---

### 6. AuthModal.tsx
**Purpose:** Authentication dialogs (sign up, sign in, password reset).

**Props:**
```typescript
interface AuthModalProps {
  mode: 'signin' | 'signup' | 'reset';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}
```

**Usage:**
```typescript
import { AuthModal } from '@/core/components/AuthModal';

<AuthModal
  mode="signin"
  isOpen={showAuth}
  onClose={() => setShowAuth(false)}
  onSuccess={() => {
    setShowAuth(false);
    navigate('/hub');
  }}
/>
```

---

### 7. RouteGuard.tsx
**Purpose:** Wrapper for protected routes requiring authentication or vault unlock.

**Props:**
```typescript
interface RouteGuardProps {
  requiresAuth?: boolean;
  requiresVault?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}
```

**Usage:**
```typescript
import { RouteGuard } from '@/core/components/RouteGuard';

<RouteGuard requiresAuth requiresVault>
  <MyProtectedPage />
</RouteGuard>
```

**Behavior:**
- If `requiresAuth` and not authenticated → redirect to landing
- If `requiresVault` and vault locked → show unlock modal
- Otherwise → render children

---

## Design System Tokens

### Colors (Module Themes)
```typescript
const moduleColors = {
  agnes: 'indigo',    // Therapy/mental wellness
  titan: 'orange',    // Fitness/training
  ledger: 'emerald',  // Health records
  soma: 'cyan',       // Physical readiness
  atlas: 'violet',    // Energy mapping
  scout: 'blue',      // Data exploration
  forge: 'amber',     // Habit formation
  hub: 'purple',      // Command center
};
```

### Typography
```css
/* Headlines */
.text-neural-h1 { @apply text-4xl font-bold tracking-tight; }
.text-neural-h2 { @apply text-3xl font-semibold; }
.text-neural-h3 { @apply text-2xl font-medium; }

/* Body */
.text-neural-body { @apply text-base font-normal; }
.text-neural-small { @apply text-sm; }
```

### Spacing
```css
/* Consistent spacing scale */
.space-neural-xs { @apply p-2; }
.space-neural-sm { @apply p-4; }
.space-neural-md { @apply p-6; }
.space-neural-lg { @apply p-8; }
```

---

## Accessibility Standards

All core components MUST meet WCAG AA:

### Required Attributes
- ✅ Semantic HTML (`<button>` not `<div>` for clickable elements)
- ✅ ARIA labels for icons and non-text content
- ✅ `role` attributes where appropriate
- ✅ Focus indicators (visible outline)
- ✅ Keyboard navigation support

### Color Contrast
- Text on background: minimum 4.5:1 ratio
- Large text (18pt+): minimum 3:1 ratio
- Interactive elements: visible in all states

### Keyboard Navigation
- Tab order follows visual flow
- Enter/Space activate buttons
- Escape closes modals
- Arrow keys navigate lists

### Example Accessible Component
```typescript
<button
  className="neural-button"
  onClick={handleClick}
  disabled={isDisabled}
  aria-label="Save profile changes"
  aria-busy={isLoading}
>
  {isLoading ? (
    <>
      <Loader className="animate-spin" aria-hidden="true" />
      <span className="sr-only">Saving...</span>
    </>
  ) : (
    <>
      <Save aria-hidden="true" />
      Save
    </>
  )}
</button>
```

---

## Component Creation Checklist

When creating a new core component:

- [ ] Add TypeScript interface for props
- [ ] Document with JSDoc comments
- [ ] Implement responsive design (mobile-first)
- [ ] Add accessibility attributes (ARIA, semantic HTML)
- [ ] Test keyboard navigation
- [ ] Verify color contrast (WCAG AA)
- [ ] Add loading/error states
- [ ] Export from index file
- [ ] Update this README

---

## Testing Components

### Manual Testing
```bash
# Start dev server
npm run dev

# Test checklist:
# - Desktop view (1920x1080)
# - Tablet view (768x1024)
# - Mobile view (375x667)
# - Keyboard navigation
# - Screen reader (VoiceOver/NVDA)
# - Dark mode
```

### Automated Testing (Future)
```typescript
// Component test example
describe('NeuralButton', () => {
  it('should render with correct accessibility attributes', () => {
    render(<NeuralButton>Click me</NeuralButton>);
    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
  });
});
```

---

## Common Patterns

### Pattern 1: Modal with Overlay
```typescript
import { NeuralModal } from '@/core/components/NeuralModal';

<NeuralModal
  isOpen={isOpen}
  onClose={handleClose}
  title="Confirm Action"
>
  <p>Are you sure?</p>
  <div className="flex gap-2">
    <NeuralButton onClick={handleConfirm}>Confirm</NeuralButton>
    <NeuralButton variant="ghost" onClick={handleClose}>Cancel</NeuralButton>
  </div>
</NeuralModal>
```

### Pattern 2: Form with Validation
```typescript
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralButton } from '@/core/components/NeuralButton';

const [name, setName] = useState('');
const [error, setError] = useState('');

<form onSubmit={handleSubmit}>
  <NeuralInput
    label="Full Name"
    value={name}
    onChange={(e) => setName(e.target.value)}
    error={error}
    required
  />
  <NeuralButton type="submit" disabled={!name}>
    Submit
  </NeuralButton>
</form>
```

### Pattern 3: Loading State
```typescript
import { GlassCard } from '@/core/components/GlassCard';
import { Loader } from 'lucide-react';

{isLoading ? (
  <GlassCard className="flex items-center justify-center p-12">
    <Loader className="animate-spin" />
    <span className="ml-2">Loading...</span>
  </GlassCard>
) : (
  <GlassCard>{content}</GlassCard>
)}
```

---

## Animation Guidelines

Use Framer Motion for animations:

```typescript
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
  transition={{ duration: 0.3 }}
>
  {content}
</motion.div>
```

**Animation Principles:**
- **Subtle:** Animations should enhance, not distract
- **Fast:** Duration 200-400ms for most transitions
- **Purposeful:** Every animation should communicate state change
- **Respectful:** Honor `prefers-reduced-motion` media query

---

## Documentation Maintenance

**Update this README when:**
- Adding new reusable components
- Changing component APIs (props, behavior)
- Adding new design tokens or patterns
- Updating accessibility guidelines

---

## See Also

- [CODE_DOCUMENTATION.md](../../CODE_DOCUMENTATION.md) - Overall architecture
- [Tailwind CSS Docs](https://tailwindcss.com/docs) - Styling reference
- [Framer Motion Docs](https://www.framer.com/motion/) - Animation reference
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/) - Accessibility standards
