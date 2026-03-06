# Testing Guide

AGNES uses **Vitest** for unit & component tests and **Playwright** for end-to-end browser tests.

## Quick Start

```bash
# Unit + Component tests
npm run test

# E2E browser tests (auto-starts dev server)
npx playwright test

# E2E with headed browser (for debugging)
npx playwright test --headed

# Run a single test file
npx vitest run src/lib/encryption.test.ts
```

---

## Test Architecture

```
src/
├── lib/
│   ├── utils.test.ts                          # cn() Tailwind-merge
│   ├── encryption.test.ts                     # Base64, E2EE encrypt/decrypt
│   ├── constants.test.ts                      # requiresModuleOnboarding
│   ├── module-manifest.test.ts                # Manifest integrity, vault locks
│   ├── services/
│   │   ├── guest-quota-service.test.ts        # Quota CRUD, hard lock
│   │   ├── nsv-ownership.test.ts              # Metric ownership, staleness
│   │   └── nyx-routing-service.test.ts        # Keyword intent classification
│   ├── spine/
│   │   └── spine-event-bus.test.ts            # Emit, cascade, debounce
│   └── actions/
│       └── action-hub.test.ts                 # Register, execute, fallback
├── llm-engine/
│   ├── sanitize.test.ts                       # Tag stripping, JSON cleanup
│   └── persona-factory.test.ts                # System prompt generation
├── core/components/
│   ├── GlassCard.test.tsx                     # Rendering, glow prop
│   ├── EmptyState.test.tsx                    # Size variants, action slot
│   └── ProtectedRoute.test.tsx                # Auth redirects, loading states
e2e/
├── landing.spec.ts                            # Page load, CTA, title
└── navigation.spec.ts                         # Route guards, unknown routes
```

---

## Stack

| Tool | Role | Config |
|------|------|--------|
| [Vitest](https://vitest.dev/) | Unit + Component runner | `vitest.config.ts` |
| [jsdom](https://github.com/jsdom/jsdom) | DOM environment for Vitest | `vitest.config.ts → test.environment` |
| [React Testing Library](https://testing-library.com/react) | Component rendering + queries | `src/test/setup.ts` |
| [Playwright](https://playwright.dev/) | E2E browser automation | `playwright.config.ts` |

---

## How Authentication is Tested

Authentication-dependent code is tested **without a live Firebase connection** using mocks at each layer.

### Unit / Component Tests — Context Mocking

Auth hooks are mocked with `vi.mock()`, giving each test full control over the auth state:

```tsx
const mockAuth = {
  isAuthenticated: false,
  isGuest: false,
  profile: null,
  loading: false,
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

// In each test, mutate mockAuth to simulate states:
it('redirects when unauthenticated', () => {
  mockAuth.isAuthenticated = false;
  mockAuth.isGuest = false;
  // ... render and assert redirect
});

it('renders content for authenticated user', () => {
  mockAuth.isAuthenticated = true;
  mockAuth.profile = { onboardingComplete: true };
  // ... render and assert children visible
});
```

The same pattern is used for `useVault()` and `useGlobalSoul()`.

### E2E Tests — Unauthenticated Path

Current E2E tests validate the **unauthenticated experience**: route guards block access and redirect correctly. No login is required because the tests verify guard behavior itself.

### Adding Authenticated E2E Tests (Future)

Two approaches for testing logged-in flows:

**Option A — Firebase Emulator** (recommended for realistic E2E):
```bash
firebase emulators:start --only auth
```
Create test users via the emulator API, then set auth tokens in Playwright before navigating.

**Option B — Mock Auth Mode** (faster, less realistic):
Add a `VITE_TEST_MODE=true` env flag that injects a mock user into `AuthProvider`, bypassing Firebase.

---

## Writing New Tests

### Unit Test Convention

Place test files **next to the source file** with a `.test.ts` or `.test.tsx` extension:

```
src/lib/services/my-service.ts
src/lib/services/my-service.test.ts     ← unit test
```

Basic template:

```ts
import { describe, it, expect } from 'vitest';
import { myFunction } from './my-service';

describe('myFunction', () => {
  it('does the expected thing', () => {
    expect(myFunction('input')).toBe('output');
  });
});
```

### Component Test Convention

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Hello" />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### E2E Test Convention

Place in `e2e/` with a `.spec.ts` extension:

```ts
import { test, expect } from '@playwright/test';

test('page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
});
```

---

## Mocking Patterns

### Firebase / External Services
Mock at the module level to prevent real network calls:

```ts
vi.mock('@/lib/firebase', () => ({
  getFirebase: () => ({ db: null }),
}));
```

### localStorage
Available natively in jsdom. Clear between tests:

```ts
beforeEach(() => localStorage.clear());
```

### Timers (for debounce / setTimeout)
Use Vitest fake timers:

```ts
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('debounces', () => {
  trigger();
  vi.advanceTimersByTime(600);
  trigger(); // should work again
});
```

---

## CI Integration

Add to your CI pipeline:

```yaml
- name: Unit & Component Tests
  run: npm run test

- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: E2E Tests
  run: npx playwright test
```

The Playwright config (`playwright.config.ts`) auto-starts the dev server and sets `retries: 2` when `CI=true`.
