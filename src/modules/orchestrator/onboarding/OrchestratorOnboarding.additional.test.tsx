/**
 * OrchestratorOnboarding — additional critical-path tests (supplement, not replacement)
 *
 * T-04 — Fast-track: disabled when both fields empty
 * T-05 — Fast-track: disabled when only one field filled
 * T-06 — Fast-track: calls onComplete with correct payload
 * T-07 — useCommandPalette: ⌘K opens palette, Escape closes it
 * T-08 — useCommandPalette: locked module execute calls onOpenAuth, not navigate (BUG-C1 regression)
 * T-09 — useNexusSynthesis: COMPOUND_STRESS fires at threshold (stress ≥ 7, cnsFatigue ≥ 6, friction ≥ 6)
 * T-10 — useNexusSynthesis: ask_nexus action carries correct payload for onInjectChat
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';

// ─── Module-level mocks (hoisted by Vitest) ───────────────────────────────────

// Framer Motion — strip motion-specific props so they don't leak to the DOM
const stripMotion = ({ children, whileHover, whileTap, initial, animate, exit,
  transition, variants, custom, layout, layoutId, ...rest }: any) =>
  ({ children, ...rest });

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: (p: any) => { const { children, ...r } = stripMotion(p); return <div {...r}>{children}</div>; },
    button: (p: any) => { const { children, ...r } = stripMotion(p); return <button {...r}>{children}</button>; },
  },
}));

// NeuralButton / NeuralInput — thin DOM stubs so motion props don't leak
vi.mock('@/core/components/NeuralButton', () => ({
  NeuralButton: ({ children, disabled, loading, onClick, type, className }: any) => (
    <button
      type={type ?? 'button'}
      disabled={disabled || !!loading}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/core/components/NeuralInput', () => ({
  NeuralInput: ({ label: _label, icon: _icon, ...rest }: any) => <input {...rest} />,
}));

// React Router — needed by useCommandPalette
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Auth / Vault / Global Soul context
vi.mock('@/lib/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/vault-context', () => ({ useVault: vi.fn() }));
vi.mock('@/lib/global-soul-context', () => ({ useGlobalSoul: vi.fn() }));

// AI context (needed indirectly by useGuidedChatIntake if not mocked)
vi.mock('@/llm-engine/ai-context', () => ({ useAI: vi.fn() }));

// Spine event bus — getRecentEvents must return an array
vi.mock('@/lib/spine/spine-event-bus', () => ({
  Spine: {
    getRecentEvents: vi.fn().mockReturnValue([]),
  },
}));

// Diagnosis registry — prevents real registry side-effects in command palette tests
vi.mock('@/core/diagnosis/diagnosis-registry', () => ({
  getAllDiagnosisSpecs: vi.fn().mockReturnValue([]),
}));

// GuidedIntakeFrame — renders prelude **directly** (bypasses collapsible toggle)
// This lets fast-track tests interact with the inputs/button without extra clicks.
vi.mock('@/core/intake/GuidedIntakeFrame', () => ({
  GuidedIntakeFrame: ({ children, prelude }: any) => (
    <div data-testid="intake-frame">
      {prelude && <div data-testid="intake-prelude">{prelude}</div>}
      {children}
    </div>
  ),
}));

// NexusChat — opaque stub; fast-track tests don't exercise chat
vi.mock('@/core/components/NexusChat', () => ({
  NexusChat: () => <div data-testid="nexus-chat" />,
}));

// Intake orchestration hooks — stubs with minimal return shapes
vi.mock('@/core/intake/use-intake-orchestrator', () => ({
  useIntakeOrchestrator: vi.fn(),
}));
vi.mock('@/core/intake/use-guided-chat-intake', () => ({
  useGuidedChatIntake: vi.fn(),
}));

// ─── Late imports (after mocks are registered) ────────────────────────────────
import { OrchestratorOnboarding } from './OrchestratorOnboarding';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useNexusSynthesis } from '../hooks/useNexusSynthesis';

// Context hook references for mockReturnValue setup
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useIntakeOrchestrator } from '@/core/intake/use-intake-orchestrator';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';

// ─── Shared fixture builders ───────────────────────────────────────────────────

const INTAKE_SPEC_STUB = {
  placeholder: 'Respond to Nexus...',
  moduleId: 'orchestrator',
  initialState: { profileUpdates: {}, stepProgress: 0 },
  initialMessages: [],
  summary: '',
  systemPrompt: '',
};

const INTAKE_RESULT_STUB = {
  messages: [{ role: 'assistant', content: 'Welcome to Nexus guided onboarding.' }],
  isProcessing: false,
  streamingText: '',
  error: null,
  handleSendMessage: vi.fn(),
  stepIndex: 0,
};

const makeVaultMock = (overrides: Record<string, unknown> = {}) => ({
  hasVault: false,
  isUnlocked: false,
  isLoading: false,
  vaultSetupNudgeSeen: false,
  isModuleAccessible: vi.fn().mockReturnValue(true),
  initializeVault: vi.fn(),
  dismissVaultSetupNudge: vi.fn(),
  ...overrides,
});

// ═════════════════════════════════════════════════════════════════════════════
// ── T-04 / T-05 / T-06  Fast-track panel ─────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('OrchestratorOnboarding — fast-track panel', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as any).mockReturnValue({
      user: { uid: 'test-user' },
    });

    (useIntakeOrchestrator as any).mockReturnValue(INTAKE_SPEC_STUB);
    (useGuidedChatIntake as any).mockReturnValue({ ...INTAKE_RESULT_STUB });
  });

  function renderOnboarding() {
    return render(
      <OrchestratorOnboarding
        profile={null}
        isSubmitting={false}
        onComplete={mockOnComplete}
      />
    );
  }

  // ── T-04 ───────────────────────────────────────────────────────────────────
  it('T-04 — Execute button is disabled when both name and pronouns are empty', () => {
    renderOnboarding();

    const btn = screen.getByRole('button', { name: /execute/i });
    expect(btn).toBeDisabled();
  });

  // ── T-05 ───────────────────────────────────────────────────────────────────
  it('T-05 — Execute button stays disabled when only one field is filled', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    const nameInput = screen.getByPlaceholderText(/preferred name/i);
    const pronounsInput = screen.getByPlaceholderText(/pronouns/i);
    const btn = screen.getByRole('button', { name: /execute/i });

    // Fill name, leave pronouns empty
    await user.type(nameInput, 'Alice');
    expect(btn).toBeDisabled();

    // Clear name, fill pronouns
    await user.clear(nameInput);
    await user.type(pronounsInput, 'she/her');
    expect(btn).toBeDisabled();
  });

  // ── T-06 ───────────────────────────────────────────────────────────────────
  it('T-06 — Execute button calls onComplete with correct payload when both fields filled', async () => {
    const user = userEvent.setup();
    mockOnComplete.mockResolvedValue(undefined);
    renderOnboarding();

    await user.type(screen.getByPlaceholderText(/preferred name/i), 'Alice');
    await user.type(screen.getByPlaceholderText(/pronouns/i), 'she/her');

    await user.click(screen.getByRole('button', { name: /execute/i }));

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredName: 'Alice',
          pronouns: 'she/her',
          onboardingComplete: true,
        })
      );
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ── T-07 / T-08  useCommandPalette ───────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('useCommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    // Default vault: all modules accessible
    (useVault as any).mockReturnValue(makeVaultMock({ isModuleAccessible: vi.fn().mockReturnValue(true) }));
  });

  // ── T-07 ───────────────────────────────────────────────────────────────────
  it('T-07 — ⌘K opens palette; Escape closes it', () => {
    const { result } = renderHook(() => useCommandPalette());

    expect(result.current.isOpen).toBe(false);

    // Fire ⌘K on window
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
      );
    });
    expect(result.current.isOpen).toBe(true);

    // Fire Escape — handler captures current isOpen=true so close() runs
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      );
    });
    expect(result.current.isOpen).toBe(false);
  });

  // ── T-08 ───────────────────────────────────────────────────────────────────
  it('T-08 — locked module execute calls onOpenAuth, NOT navigate (BUG-C1 regression)', () => {
    const onOpenAuth = vi.fn();

    // Agnes is defaultLocked=true; returning false from isModuleAccessible
    // ensures isLocked=true for the nav:agnes command.
    (useVault as any).mockReturnValue(
      makeVaultMock({
        isModuleAccessible: vi.fn().mockReturnValue(false),
      })
    );

    const { result } = renderHook(() =>
      useCommandPalette({ onOpenAuth })
    );

    const agnesCommand = result.current.commands.find((c) => c.id === 'nav:agnes');
    expect(agnesCommand).toBeDefined();
    expect(agnesCommand!.isLocked).toBe(true);

    // Execute should NOT navigate and MUST call onOpenAuth
    act(() => {
      agnesCommand!.execute();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(onOpenAuth).toHaveBeenCalledWith('agnes');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ── T-09 / T-10  useNexusSynthesis ───────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('useNexusSynthesis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: build a minimal NSV that triggers (or avoids) COMPOUND_STRESS
  function makeGlobalSoul(stressLoad: number, cnsFatigue = 6, financialFriction = 6) {
    return {
      globalSoul: {
        crossFunctionalState: {
          emotional: { stressLoad },
          biological: { cnsFatigue },
          resource: { financialFriction },
        },
      },
      isLoading: false,
    };
  }

  // ── T-09 ───────────────────────────────────────────────────────────────────
  it('T-09 — COMPOUND_STRESS alert fires at threshold (stress=7, cnsFatigue=6, friction=6)', () => {
    // AT threshold — should trigger
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoul(7, 6, 6));
    const { result: atThreshold } = renderHook(() => useNexusSynthesis());

    const compound = atThreshold.current.alerts.find((a) => a.id === 'COMPOUND_STRESS');
    expect(compound).toBeDefined();
    expect(compound?.severity).toBe('critical');

    // BELOW threshold (stress=6) — should NOT trigger
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoul(6, 6, 6));
    const { result: belowThreshold } = renderHook(() => useNexusSynthesis());

    const noCompound = belowThreshold.current.alerts.find((a) => a.id === 'COMPOUND_STRESS');
    expect(noCompound).toBeUndefined();
  });

  // ── T-10 ───────────────────────────────────────────────────────────────────
  it('T-10 — ask_nexus action from COMPOUND_STRESS carries the correct onInjectChat payload', () => {
    // Trigger COMPOUND_STRESS so the alert + its actions are present
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoul(7, 6, 6));
    const { result } = renderHook(() => useNexusSynthesis());

    const compound = result.current.alerts.find((a) => a.id === 'COMPOUND_STRESS');
    expect(compound).toBeDefined();

    const askAction = compound!.suggestedActions.find((a) => a.type === 'ask_nexus');
    expect(askAction).toBeDefined();

    // Simulate what SynthesisPanel.AlertAction does when the button is clicked:
    // it calls onInjectChat(action.payload) for ask_nexus type.
    const onInjectChat = vi.fn();
    if (askAction?.type === 'ask_nexus') {
      onInjectChat(askAction.payload);
    }

    expect(onInjectChat).toHaveBeenCalledWith(
      'Tell me more about the compound stress pattern you detected.'
    );
  });
});
