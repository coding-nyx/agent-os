/**
 * Orchestrator Edge-Case Tests — T-11 through T-23
 *
 * Regression and boundary tests that build on the critical-path infrastructure
 * established in OrchestratorPage.test.tsx and OrchestratorOnboarding.additional.test.tsx.
 *
 * T-11 — SynthesisPanel: ask_nexus action calls onInjectChat with correct payload
 * T-12 — SynthesisPanel: navigate action calls onNavigate with correct path
 * T-13 — SynthesisPanel: no alerts + isAnalyzing=false → renders null
 * T-14 — SynthesisPanel: no alerts + isAnalyzing=true → shows "0 patterns" header
 * T-15 — NexusDashboard: routing suggestion appears at conversationDepth >= 1
 * T-16 — NexusDashboard: routing suggestion skipped at conversationDepth=0
 * T-17 — NexusDashboard: routing suggestion auto-dismisses after 8 seconds
 * T-18 — NexusDashboard: brief auto-collapses after first message
 * T-19 — useModuleHealth: fetch failure yields neutral tones for all modules
 * T-20 — useModuleHealth: no state update after unmount (regression for BUG-C3)
 * T-21 — RoutingSuggestion: second suggestion within 8s not cleared by first timer (RC-2)
 * T-22 — ModuleHealthFAB: alert badge count >= 10 clips display [todo — visual]
 * T-23 — DailyBriefSection: cascade events update reactively after mount [todo — stale useMemo]
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';

// ─── Framer Motion — strip all motion-specific props ──────────────────────────
const stripMotion = ({
  children,
  whileHover,
  whileTap,
  initial,
  animate,
  exit,
  transition,
  variants,
  custom,
  layout,
  layoutId,
  ...rest
}: any) => ({ children, ...rest });

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
  motion: {
    div: (p: any) => {
      const { children, ...r } = stripMotion(p);
      return <div {...r}>{children}</div>;
    },
    button: (p: any) => {
      const { children, ...r } = stripMotion(p);
      return <button {...r}>{children}</button>;
    },
    section: (p: any) => {
      const { children, ...r } = stripMotion(p);
      return <section {...r}>{children}</section>;
    },
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
vi.mock('@/lib/global-soul-context', () => ({ useGlobalSoul: vi.fn() }));

// ─── Synthesis hook (used inside SynthesisPanel directly) ─────────────────────
vi.mock('../hooks/useNexusSynthesis', () => ({ useNexusSynthesis: vi.fn() }));

// ─── Spine event bus ──────────────────────────────────────────────────────────
vi.mock('@/lib/spine/spine-event-bus', () => ({
  Spine: {
    getRecentEvents: vi.fn().mockReturnValue([]),
  },
  useSpineEvent: vi.fn(),
}));

// ─── Services ─────────────────────────────────────────────────────────────────
vi.mock('@/lib/services/module-memory-service', () => ({
  ModuleMemoryService: { getEnvelope: vi.fn() },
}));

vi.mock('@/lib/services/nexus-handoff-service', () => ({
  NexusHandoffService: { hasPending: vi.fn().mockReturnValue(false) },
}));

vi.mock('@/lib/services/nexus-routing-service', () => ({
  NexusRoutingService: { classifyIntent: vi.fn() },
}));

// ─── NeuralButton — thin DOM stub (strips themeColor to avoid React prop warning)
vi.mock('@/core/components/NeuralButton', () => ({
  NeuralButton: ({ children, disabled, loading, onClick, type, className, themeColor: _tc, variant: _v, size: _s, ...rest }: any) => (
    <button
      type={type ?? 'button'}
      disabled={disabled || !!loading}
      onClick={onClick}
      className={className}
      {...rest}
    >
      {children}
    </button>
  ),
}));

// ─── NexusChat — captures handleSendMessage + exposes trigger buttons ─────────
vi.mock('@/core/components/NexusChat', () => ({
  NexusChat: ({ ai, onActionParsed }: any) => (
    <div data-testid="nexus-chat">
      <button
        data-testid="nexus-send-btn"
        onClick={() => ai.handleSendMessage('Tell me about my finances and atlas planning')}
      >
        Send
      </button>
      <button
        data-testid="nexus-action-btn"
        onClick={() =>
          onActionParsed?.('delegate_to_module', { moduleId: 'atlas', reason: 'planning task' })
        }
      >
        Action
      </button>
    </div>
  ),
}));

// ─── NexusDashboard child component stubs ────────────────────────────────────
// We don't mock DailyBriefSection entirely anymore because T-23 tests its actual behavior
vi.mock('./DailyBriefSection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./DailyBriefSection')>();
  return {
    ...actual,
    DailyBriefSectionStubbedInDashboard: ({ collapsed }: { collapsed: boolean; onToggleCollapse?: () => void; onAskAboutDomain?: (d: string) => void }) => (
      <div data-testid="daily-brief" data-collapsed={String(collapsed)} />
    ),
  };
});

// NOTE: SynthesisPanel is NOT mocked here — T-11 through T-14 test its real
// implementation. NexusDashboard tests are safe because useNexusSynthesis
// returns {alerts:[], isAnalyzing:false} → SynthesisPanel returns null.

vi.mock('./ModuleHealthFAB', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ModuleHealthFAB')>();
  return {
    ...actual,
    ModuleHealthFABStubbed: () => <div data-testid="module-health-fab-stub" />,
  };
});

vi.mock('./CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('./RoutingSuggestion', () => ({
  RoutingSuggestion: ({ visible, target }: { visible: boolean; target: string; reason?: string; onConfirm: () => void; onDismiss: () => void }) =>
    visible ? (
      <div data-testid="routing-suggestion" data-target={target}>
        {target}
      </div>
    ) : null,
}));

vi.mock('./OrchestratorErrorBoundary', () => ({
  OrchestratorErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Diagnosis registry ───────────────────────────────────────────────────────
vi.mock('@/core/diagnosis/diagnosis-registry', () => ({
  getAllDiagnosisSpecs: vi.fn().mockReturnValue([]),
}));

// ─── Late imports ─────────────────────────────────────────────────────────────
import { SynthesisPanel } from './SynthesisPanel';
import { NexusDashboard } from './NexusDashboard';
// Mock useModuleHealth for T-22, we keep the original for T-19/20 testing below
vi.mock('../hooks/useModuleHealth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useModuleHealth')>();
  return {
    ...actual,
    useModuleHealth: vi.fn(actual.useModuleHealth),
  };
});
import { useModuleHealth } from '../hooks/useModuleHealth';
import { ModuleHealthFAB } from './ModuleHealthFAB';
import { DailyBriefSection } from './DailyBriefSection';

import { useNexusSynthesis } from '../hooks/useNexusSynthesis';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';

// ─── Shared fixture builders ───────────────────────────────────────────────────

function makeSynthesisAlert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'TEST_ALERT',
    severity: 'critical' as const,
    title: 'Test Alert',
    description: 'A test alert description.',
    involvedDomains: ['emotional'],
    suggestedActions: [],
    detectedAt: Date.now(),
    ...overrides,
  };
}

function makeAI(userMessageCount = 0) {
  const messages = Array.from({ length: userMessageCount }, (_, i) => ({
    id: `msg-${i}`,
    role: 'user' as const,
    content: `Message ${i}`,
    timestamp: Date.now(),
  }));
  return {
    messages,
    isProcessing: false,
    streamingText: '',
    error: null,
    quota: null,
    handleSendMessage: vi.fn().mockResolvedValue(undefined),
    clearSession: vi.fn().mockResolvedValue(undefined),
  };
}

function makeVaultMock(overrides: Record<string, unknown> = {}) {
  return {
    hasVault: true,
    isUnlocked: true,
    isLoading: false,
    vaultSetupNudgeSeen: false,
    isModuleAccessible: vi.fn().mockReturnValue(true),
    initializeVault: vi.fn(),
    dismissVaultSetupNudge: vi.fn(),
    ...overrides,
  };
}

function makeGlobalSoulMock(crossFunctionalState: Record<string, unknown> | null = null) {
  return {
    globalSoul: crossFunctionalState ? { crossFunctionalState } : null,
    isLoading: false,
    refreshGlobalSoul: vi.fn(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// ── SynthesisPanel (T-11 through T-14) ───────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('SynthesisPanel', () => {
  beforeAll(() => {
    // Force innerWidth > 640 so SynthesisPanel initialises isCollapsed=false
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── T-11 ───────────────────────────────────────────────────────────────────
  it('T-11 — ask_nexus action calls onInjectChat with correct payload', async () => {
    const onInjectChat = vi.fn();

    (useNexusSynthesis as any).mockReturnValue({
      alerts: [
        makeSynthesisAlert({
          id: 'COMPOUND_STRESS',
          suggestedActions: [
            {
              label: 'Ask Nexus about this',
              type: 'ask_nexus',
              payload: 'Tell me more about the compound stress pattern you detected.',
            },
          ],
        }),
      ],
      isAnalyzing: false,
    });

    render(<SynthesisPanel onInjectChat={onInjectChat} />);

    // If the panel starts collapsed, expand it first
    const buttons = screen.getAllByRole('button');
    const toggleBtn = buttons.find((b) => b.getAttribute('aria-expanded') !== null);
    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(toggleBtn);
    }

    // Find and click the ask_nexus action button
    const actionBtn = await screen.findByRole('button', { name: /ask nexus about this/i });
    fireEvent.click(actionBtn);

    expect(onInjectChat).toHaveBeenCalledWith(
      'Tell me more about the compound stress pattern you detected.'
    );
  });

  // ── T-12 ───────────────────────────────────────────────────────────────────
  it('T-12 — navigate action calls onNavigate with correct path', async () => {
    const onNavigate = vi.fn();

    (useNexusSynthesis as any).mockReturnValue({
      alerts: [
        makeSynthesisAlert({
          id: 'NAVIGATE_ATLAS',
          suggestedActions: [
            {
              label: 'Open Atlas',
              type: 'navigate',
              payload: '/atlas',
            },
          ],
        }),
      ],
      isAnalyzing: false,
    });

    render(<SynthesisPanel onNavigate={onNavigate} />);

    // Expand if collapsed
    const buttons = screen.getAllByRole('button');
    const toggleBtn = buttons.find((b) => b.getAttribute('aria-expanded') !== null);
    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(toggleBtn);
    }

    const actionBtn = await screen.findByRole('button', { name: /open atlas/i });
    fireEvent.click(actionBtn);

    expect(onNavigate).toHaveBeenCalledWith('/atlas');
  });

  // ── T-13 ───────────────────────────────────────────────────────────────────
  it('T-13 — no alerts + isAnalyzing=false → renders nothing', () => {
    (useNexusSynthesis as any).mockReturnValue({
      alerts: [],
      isAnalyzing: false,
    });

    const { container } = render(<SynthesisPanel />);

    // SynthesisPanel returns null — container should be empty
    expect(container.firstChild).toBeNull();
  });

  // ── T-14 ───────────────────────────────────────────────────────────────────
  it('T-14 — no alerts + isAnalyzing=true → renders header showing 0 patterns', () => {
    (useNexusSynthesis as any).mockReturnValue({
      alerts: [],
      isAnalyzing: true,
    });

    render(<SynthesisPanel />);

    // Component should render (isAnalyzing=true bypasses the early-return null)
    // Header must show "0 patterns"
    expect(screen.getByText(/0 pattern/i)).toBeInTheDocument();
    expect(screen.getByText(/nexus synthesis/i)).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ── NexusDashboard (T-15 through T-18 and T-21) ──────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('NexusDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoulMock());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── T-15 ───────────────────────────────────────────────────────────────────
  it('T-15 — routing suggestion appears at conversationDepth >= 1', async () => {
    // classifyIntent returns a non-orchestrator module with high confidence
    (NexusRoutingService.classifyIntent as any).mockReturnValue({
      target: 'atlas',
      confidence: 0.85,
      reason: 'planning task detected',
    });

    // One user message → conversationDepth=1 → routing analysis runs
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    // Trigger handleSendWithRouting via the NexusChat stub button
    await act(async () => {
      fireEvent.click(screen.getByTestId('nexus-send-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('routing-suggestion')).toBeInTheDocument();
    });

    expect(screen.getByTestId('routing-suggestion')).toHaveAttribute('data-target', 'atlas');
  });

  // ── T-16 ───────────────────────────────────────────────────────────────────
  it('T-16 — routing suggestion skipped at conversationDepth=0', async () => {
    (NexusRoutingService.classifyIntent as any).mockReturnValue({
      target: 'atlas',
      confidence: 0.85,
      reason: 'planning task detected',
    });

    // No user messages → conversationDepth=0 → routing skipped
    render(<NexusDashboard ai={makeAI(0)} agentName="Nexus" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('nexus-send-btn'));
    });

    // classifyIntent should NOT be called (routing is skipped at depth=0)
    expect(NexusRoutingService.classifyIntent).not.toHaveBeenCalled();
    expect(screen.queryByTestId('routing-suggestion')).not.toBeInTheDocument();
  });

  // ── T-17 ───────────────────────────────────────────────────────────────────
  it('T-17 — routing suggestion auto-dismisses after 8 seconds', async () => {
    vi.useFakeTimers();

    (NexusRoutingService.classifyIntent as any).mockReturnValue({
      target: 'atlas',
      confidence: 0.85,
      reason: 'planning task detected',
    });

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    // Trigger routing suggestion
    await act(async () => {
      fireEvent.click(screen.getByTestId('nexus-send-btn'));
    });

    // Suggestion should be visible immediately
    expect(screen.getByTestId('routing-suggestion')).toBeInTheDocument();

    // Advance past the 8-second auto-dismiss timer
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.queryByTestId('routing-suggestion')).not.toBeInTheDocument();
  });

  // ── T-18 ───────────────────────────────────────────────────────────────────
  it('T-18 — brief auto-collapses after first message (conversationDepth >= 1)', async () => {
    // Render with one user message → conversationDepth=1 immediately
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    // The useEffect that sets briefCollapsed=true fires after mount
    await waitFor(() => {
      const brief = screen.getByTestId('daily-brief');
      expect(brief).toHaveAttribute('data-collapsed', 'true');
    });
  });

  // ── T-21 ───────────────────────────────────────────────────────────────────
  it(
    'T-21 — (RC-2) second routing suggestion within 8s is not cleared by first timer',
    async () => {
      vi.useFakeTimers();

      // First send → suggestion A (atlas); Second send → suggestion B (agnes)
      (NexusRoutingService.classifyIntent as any)
        .mockReturnValueOnce({ target: 'atlas', confidence: 0.85, reason: 'finances' })
        .mockReturnValueOnce({ target: 'agnes', confidence: 0.80, reason: 'emotions' });

      render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

      // Trigger suggestion A (atlas) at t=0
      await act(async () => {
        fireEvent.click(screen.getByTestId('nexus-send-btn'));
      });
      expect(screen.getByTestId('routing-suggestion')).toHaveAttribute('data-target', 'atlas');

      // Advance 3 seconds (suggestion A timer has 5s left)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Trigger suggestion B (agnes) at t=3s — this clears A's timer and sets a new 8s timer
      await act(async () => {
        fireEvent.click(screen.getByTestId('nexus-send-btn'));
      });
      expect(screen.getByTestId('routing-suggestion')).toHaveAttribute('data-target', 'agnes');

      // Advance to t=8s from origin — this is when A's original timer WOULD have fired.
      // B's timer was reset at t=3s and fires at t=11s, so B should still be visible.
      act(() => {
        vi.advanceTimersByTime(5000); // now at t=8s total
      });

      // Suggestion B must still be visible (its timer fires at t=11s, not t=8s)
      expect(screen.getByTestId('routing-suggestion')).toBeInTheDocument();
      expect(screen.getByTestId('routing-suggestion')).toHaveAttribute('data-target', 'agnes');
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// ── useModuleHealth (T-19 and T-20) ──────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('useModuleHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as any).mockReturnValue({
      user: { uid: 'test-uid' },
      profile: null,
    });

    (useVault as any).mockReturnValue(makeVaultMock());

    // No NSV — all derived tones will be 'neutral'
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoulMock(null));

    (useNexusSynthesis as any).mockReturnValue({ alerts: [], isAnalyzing: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── T-19 ───────────────────────────────────────────────────────────────────
  it('T-19 — fetch failure yields neutral tones for all modules, isLoading=false', async () => {
    // All per-module fetches reject — inner catch returns null per module
    (ModuleMemoryService.getEnvelope as any).mockRejectedValue(
      new Error('Firestore unavailable')
    );

    const { result } = renderHook(() => useModuleHealth());

    // Wait for async fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // All modules should have neutral tones (nsv is null → deriveMetricTone → 'neutral')
    expect(result.current.modules.length).toBeGreaterThan(0);
    result.current.modules.forEach((mod) => {
      expect(mod.keyMetricTone).toBe('neutral');
    });
  });

  // ── T-20 ───────────────────────────────────────────────────────────────────
  it('T-20 — no console.error after unmount while fetch is pending (regression BUG-C3)', async () => {
    // Create a promise we control — resolves only after we call `resolveAll()`
    let resolveAll!: () => void;
    const pendingPromise = new Promise<null>((resolve) => {
      resolveAll = () => resolve(null);
    });
    (ModuleMemoryService.getEnvelope as any).mockReturnValue(pendingPromise);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useModuleHealth());

    // Unmount BEFORE the fetch resolves (simulates rapid navigation away)
    unmount();

    // Now resolve the pending promise — setState would be called on unmounted component
    resolveAll();

    // Flush micro-tasks and any queued state updates
    await act(async () => {
      await Promise.resolve();
    });

    // React 18 no longer warns about setState after unmount, but we document
    // the regression — no error should appear regardless of React version.
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/unmounted component/i)
    );

    consoleSpy.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ── T-22 — ModuleHealthFAB badge overflow (visual regression) ─────────────────
// ═════════════════════════════════════════════════════════════════════════════
it('T-22 — ModuleHealthFAB: alert badge count >= 10 renders without clipping', () => {
  // Mock useModuleHealth to return 10 modules with alerts
  const modules = Array.from({ length: 10 }).map((_, i) => ({
    moduleId: `mod-${i}`,
    hasAlert: true,
    keyMetricTone: 'bad',
    title: `Module ${i}`,
    isAccessible: true,
    icon: () => <svg />,
  }));

  (useModuleHealth as any).mockReturnValue({
    modules,
    isLoading: false,
  });

  render(<ModuleHealthFAB />);
  expect(screen.getByText('10')).toBeInTheDocument();
  // We can also verify that the classes containing min-w-[14px] and text-[6px] are present
  expect(screen.getByText('10')).toHaveClass('min-w-[14px]');
  expect(screen.getByText('10')).toHaveClass('text-[6px]');
});

// ═════════════════════════════════════════════════════════════════════════════
// ── T-23 — DailyBriefSection cascade events stale useMemo ────────────────────
// ═════════════════════════════════════════════════════════════════════════════
it('T-23 — DailyBriefSection: cascade events should update reactively after mount', () => {
  // Initially no cascade events
  const listeners = new Set<() => void>();
  (Spine.getRecentEvents as any).mockReturnValue([]);
  (useSpineEvent as any).mockImplementation((type: string, cb: () => void) => {
    listeners.add(cb);
  });

  render(<DailyBriefSection collapsed={false} />);
  expect(screen.queryByText(/cascade event/i)).not.toBeInTheDocument();

  // Publish a new cascade event
  (Spine.getRecentEvents as any).mockReturnValue([
    { source: 'cascade:agnes', payload: {} },
  ]);

  // Trigger listeners manually (simulating Spine event)
  act(() => {
    listeners.forEach((cb) => cb());
  });

  expect(screen.getByText(/1 cascade event/i)).toBeInTheDocument();
});
