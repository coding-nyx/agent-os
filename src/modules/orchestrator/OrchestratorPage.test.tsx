/**
 * OrchestratorPage critical-path tests
 *
 * T-01 — Guest mode renders guest overlay, not full onboarding
 * T-02 — handleComplete Firestore failure shows error (BUG-C4)
 * T-03 — Vault nudge appears after delay for users without vault
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import OrchestratorPage from './OrchestratorPage';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { CoreProfileService } from '@/lib/services/core-profile-service';

// ─── Framer Motion ────────────────────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

// ─── React Router ─────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// ─── Context hooks ─────────────────────────────────────────────────────────────
vi.mock('@/lib/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/vault-context', () => ({ useVault: vi.fn() }));
vi.mock('@/lib/hooks/use-module-ai', () => ({ useModuleAI: vi.fn() }));

// ─── Services ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/services/core-profile-service', () => ({
  CoreProfileService: {
    updateProfile: vi.fn(),
  },
}));

// ─── Layout + UI shells ────────────────────────────────────────────────────────
vi.mock('@/core/layout/ModuleLayout', () => ({
  ModuleLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="module-layout">{children}</div>
  ),
}));

vi.mock('@/core/components/GuestModePanel', () => ({
  GuestModePanel: () => <div data-testid="guest-mode-panel" />,
}));

/**
 * OrchestratorOnboarding is mocked with a trigger button so T-02 can programmatically call onComplete.
 */
vi.mock('@/modules/orchestrator/onboarding/OrchestratorOnboarding', () => ({
  OrchestratorOnboarding: ({
    onComplete,
  }: {
    onComplete: (u: Record<string, unknown>) => Promise<void>;
  }) => (
    <div data-testid="orchestrator-onboarding">
      <button
        data-testid="complete-onboarding-btn"
        onClick={() =>
          onComplete({
            preferredName: 'Alice',
            pronouns: 'she/her',
            onboardingComplete: true,
          })
        }
      >
        Complete
      </button>
    </div>
  ),
}));

vi.mock('@/modules/orchestrator/components/NexusDashboard', () => ({
  NexusDashboard: () => <div data-testid="nexus-dashboard" />,
}));

vi.mock('@/core/components/VaultSetupNudge', () => ({
  VaultSetupNudge: () => <div data-testid="vault-setup-nudge" />,
}));

// ─── Shared fixture builders ───────────────────────────────────────────────────
const makeModuleAI = () => ({
  messages: [],
  setMessages: vi.fn(),
  isProcessing: false,
  streamingText: '',
  error: null,
  quota: null,
  handleSendMessage: vi.fn(),
  clearSession: vi.fn(),
});

const makeVault = (overrides: Record<string, unknown> = {}) => ({
  hasVault: true,
  isUnlocked: false,
  isLoading: false,
  isHandshaking: false,
  vaultSetupNudgeSeen: false,
  isVaultGateVisible: false,
  isModuleAccessible: vi.fn().mockReturnValue(false),
  initializeVault: vi.fn(),
  dismissVaultSetupNudge: vi.fn(),
  unlockVault: vi.fn(),
  lockVault: vi.fn(),
  refreshVaultStatus: vi.fn(),
  ...overrides,
});

const AUTHED_USER = { uid: 'user-123', email: 'alice@test.com' };

// ─────────────────────────────────────────────────────────────────────────────
describe('OrchestratorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useModuleAI as any).mockReturnValue(makeModuleAI());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── T-01 ───────────────────────────────────────────────────────────────────
  it('T-01 — guest mode renders guest overlay, not full onboarding', () => {
    (useAuth as any).mockReturnValue({
      isGuest: true,
      user: null,
      profile: null,
      loading: false,
      refreshProfile: vi.fn(),
      initializeNewUser: vi.fn(),
    });
    (useVault as any).mockReturnValue(makeVault());

    render(<OrchestratorPage />);

    expect(screen.getByTestId('guest-mode-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('orchestrator-onboarding')).not.toBeInTheDocument();
  });

  // ── T-02 ───────────────────────────────────────────────────────────────────
  it('T-02 — handleComplete Firestore failure shows error message (regression BUG-C4)', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    (CoreProfileService.updateProfile as any).mockRejectedValueOnce(
      new Error('Network error')
    );

    (useAuth as any).mockReturnValue({
      isGuest: false,
      user: AUTHED_USER,
      profile: { onboardingComplete: false, preferredName: 'Alice' },
      loading: false,
      refreshProfile: vi.fn(),
      initializeNewUser: vi.fn(),
    });
    (useVault as any).mockReturnValue(makeVault());

    render(<OrchestratorPage />);

    await user.click(screen.getByTestId('complete-onboarding-btn'));

    expect(await screen.findByTestId('onboarding-error')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-error')).toHaveTextContent(/try again/i);
    // isSubmitting must reset so user can retry
    expect(screen.getByTestId('complete-onboarding-btn')).not.toBeDisabled();
  });

  // ── T-03 ───────────────────────────────────────────────────────────────────
  it('T-03 — vault nudge appears after 1200 ms delay for users without vault', async () => {
    vi.useFakeTimers();

    (useAuth as any).mockReturnValue({
      isGuest: false,
      user: AUTHED_USER,
      // Provide a profile so initializeNewUser isn't triggered; leave
      // onboardingComplete false so the page stays in ONBOARDING state.
      profile: { onboardingComplete: false, preferredName: 'Alice' },
      loading: false,
      refreshProfile: vi.fn(),
      initializeNewUser: vi.fn(),
    });
    (useVault as any).mockReturnValue(
      makeVault({
        hasVault: false,
        vaultSetupNudgeSeen: false,
        isLoading: false,   // aliased as vaultLoading in OrchestratorPage
      })
    );

    render(<OrchestratorPage />);

    // Nudge must NOT be present before the timer fires
    expect(screen.queryByTestId('vault-setup-nudge')).not.toBeInTheDocument();

    // Advance past the 1200 ms setTimeout threshold
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    // Nudge must now be visible
    expect(screen.getByTestId('vault-setup-nudge')).toBeInTheDocument();
  });
});
