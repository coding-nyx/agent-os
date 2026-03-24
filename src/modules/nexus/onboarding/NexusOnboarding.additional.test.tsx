/**
 * NexusOnboarding — additional critical-path tests (supplement, not replacement)
 *
 * T-04 — Fast-track: validates required preferred name before submit
 * T-05 — Fast-track: pronouns alone do not satisfy required identity baseline
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
vi.mock('@/lib/data-layer/provider', () => ({ useDataLayer: vi.fn(() => ({})) }));

// AI context (needed indirectly by useGuidedChatIntake / useOnboardingSchema)
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
import { NexusOnboarding } from './NexusOnboarding';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { useNexusSynthesis } from '../hooks/useNexusSynthesis';

// Context hook references for mockReturnValue setup
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import { useIntakeOrchestrator } from '@/core/intake/use-intake-orchestrator';
import { useGuidedChatIntake } from '@/core/intake/use-guided-chat-intake';
import { useAI } from '@/llm-engine/ai-context';

// ─── Shared fixture builders ───────────────────────────────────────────────────

const INTAKE_SPEC_STUB = {
  placeholder: 'Respond to Nexus...',
  moduleId: 'nexus',
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
describe('NexusOnboarding — fast-track panel', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });

    (useAuth as any).mockReturnValue({
      user: { uid: 'test-user' },
    });
    (useAI as any).mockReturnValue({
      generateJSON: vi.fn(),
      isInitialized: false,
    });

    (useIntakeOrchestrator as any).mockReturnValue(INTAKE_SPEC_STUB);
    (useGuidedChatIntake as any).mockReturnValue({ ...INTAKE_RESULT_STUB });
  });

  async function renderOnboarding() {
    render(
      <NexusOnboarding
        profile={null}
        isSubmitting={false}
        onComplete={mockOnComplete}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /express/i }));
  }

  // ── T-04 ───────────────────────────────────────────────────────────────────
  it('T-04 — preferred name is required before express submit can complete', async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    await user.click(screen.getByRole('button', { name: /complete/i }));

    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  // ── T-05 ───────────────────────────────────────────────────────────────────
  it('T-05 — pronouns alone do not satisfy the express identity requirement', async () => {
    const user = userEvent.setup();
    await renderOnboarding();

    const pronounsInput = screen.getByLabelText(/pronouns/i);
    await user.type(pronounsInput, 'she/her');
    await user.click(screen.getByRole('button', { name: /complete/i }));

    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(mockOnComplete).not.toHaveBeenCalled();
  });

  // ── T-06 ───────────────────────────────────────────────────────────────────
  it('T-06 — express submit calls onComplete with correct payload when identity fields are filled', async () => {
    const user = userEvent.setup();
    mockOnComplete.mockResolvedValue(undefined);
    await renderOnboarding();

    await user.type(screen.getByLabelText(/preferred name/i), 'Alice');
    await user.type(screen.getByLabelText(/pronouns/i), 'she/her');

    await user.click(screen.getByRole('button', { name: /complete/i }));

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
    (useAuth as any).mockReturnValue({ user: null, isGuest: false });
    // Default vault: all modules accessible
    (useVault as any).mockReturnValue(makeVaultMock({ isModuleAccessible: vi.fn().mockReturnValue(true) }));
    useOrchestrationStore.setState({
      autopilotLevel: 2,
      historyMode: 'standard',
      activeThreadId: null,
    });
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

  it('T-08b — consult command captures the typed question before execution', () => {
    const onAskModule = vi.fn();
    const { result } = renderHook(() =>
      useCommandPalette({ onAskModule })
    );

    const agnesConsult = result.current.commands.find((command) => command.id === 'ai:consult:agnes');
    expect(agnesConsult).toBeDefined();

    act(() => {
      agnesConsult!.execute();
    });

    expect(result.current.search).toBe('Ask Agnes: ');

    act(() => {
      result.current.setSearch('Ask Agnes: help me understand my current stress spiral');
    });

    act(() => {
      result.current.executeSelected();
    });

    expect(onAskModule).toHaveBeenCalledWith('agnes', 'help me understand my current stress spiral');
  });

  it('adds automation commands that update the autopilot level', () => {
    const { result } = renderHook(() => useCommandPalette());

    const ghostCommand = result.current.commands.find((command) => command.id === 'sys:automation:5');
    expect(ghostCommand).toBeDefined();
    expect(ghostCommand?.label).toMatch(/Set automation to L5 Ghost/i);

    act(() => {
      ghostCommand!.execute();
    });

    expect(useOrchestrationStore.getState().autopilotLevel).toBe(5);
    expect(useOrchestrationStore.getState().historyMode).toBe('silent');
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
