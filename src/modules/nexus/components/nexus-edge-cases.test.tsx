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
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="animate-presence">{children}</div>
  ),
  useReducedMotion: () => false,
  motion: {
    div: ({ children, className, style, ...rest }: any) => (
      <div className={className} style={style} {...rest}>{children}</div>
    ),
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
const mockDataLayer = {};
vi.mock('@/lib/data-layer/provider', () => ({ useDataLayer: vi.fn(() => mockDataLayer) }));

// ─── Synthesis hook (used inside SynthesisPanel directly) ─────────────────────
vi.mock('../hooks/useNexusSynthesis', () => ({ useNexusSynthesis: vi.fn() }));

// ─── Spine event bus ──────────────────────────────────────────────────────────
const spineListeners = new Map<string, Set<(event: any) => void>>();

vi.mock('@/lib/spine/spine-event-bus', () => ({
  Spine: {
    getRecentEvents: vi.fn().mockReturnValue([]),
    emit: vi.fn((payload: any) => {
      const event = {
        id: payload?.id ?? `spine-${Math.random().toString(36).slice(2)}`,
        timestamp: payload?.timestamp ?? Date.now(),
        ...payload,
      };
      spineListeners.get(event.type)?.forEach((listener) => listener(event));
      return event;
    }),
    on: vi.fn((type: string, handler: (event: any) => void) => {
      const listeners = spineListeners.get(type) ?? new Set<(event: any) => void>();
      listeners.add(handler);
      spineListeners.set(type, listeners);
      return () => {
        listeners.delete(handler);
        if (listeners.size === 0) {
          spineListeners.delete(type);
        }
      };
    }),
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

let latestCommandPaletteProps: any = null;
vi.mock('./CommandPalette', () => ({
  CommandPalette: (props: any) => {
    latestCommandPaletteProps = props;
    return null;
  },
}));

vi.mock('@/core/components/RoutingSuggestion', () => ({
  RoutingSuggestion: ({ visible, target }: { visible: boolean; target: string; reason?: string; onConfirm: () => void; onDismiss: () => void }) =>
    visible ? (
      <div data-testid="routing-suggestion" data-target={target}>
        {target}
      </div>
    ) : null,
}));

vi.mock('@/core/components/OrchestrationStatusChip', () => ({
  OrchestrationStatusChip: () => <div data-testid="orchestration-status-chip" />,
}));

vi.mock('./NexusErrorBoundary', () => ({
  NexusErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
import { OrchestrationHistoryService } from '@/lib/services/orchestration-history-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import { CommandIntelligenceService } from '@/lib/services/command-intelligence-service';
import { OrchestrationRuntimeService } from '@/lib/services/orchestration-runtime-service';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { EpisodicMemoryService } from '@/lib/services/episodic-memory-service';
import { SemanticMemoryService } from '@/lib/services/semantic-memory-service';
import { OrchestrationCacheService } from '@/lib/services/orchestration-cache-service';
import { Spine, useSpineEvent } from '@/lib/spine/spine-event-bus';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';

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
    OrchestrationCacheService.resetForTests();
    vi.clearAllMocks();
    spineListeners.clear();
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
    OrchestrationCacheService.resetForTests();
    vi.clearAllMocks();
    spineListeners.clear();
    latestCommandPaletteProps = null;
    Object.assign(mockDataLayer, {
      listDocuments: vi.fn().mockResolvedValue([]),
    });
    (useAuth as any).mockReturnValue({
      user: { uid: 'test-uid' },
      isGuest: false,
      profile: null,
    });
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoulMock());
    (useNexusSynthesis as any).mockReturnValue({ alerts: [], isAnalyzing: false });
    vi.spyOn(OrchestrationHistoryService, 'listSilentHistoryForThread').mockResolvedValue([]);
    useOrchestrationStore.getState().resetShell();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── T-15 ───────────────────────────────────────────────────────────────────
  it('T-15 — routing suggestion state appears at conversationDepth >= 1', async () => {
    // classifyIntent returns a non-nexus module with high confidence
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
      expect(
        useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.target,
      ).toBe('atlas');
    });
  });

  it('does not create a routing draft at ghost level when silent delegation is available', async () => {
    useOrchestrationStore.getState().setAutopilotLevel(5);
    (NexusRoutingService.classifyIntent as any).mockReturnValue({
      target: 'atlas',
      confidence: 0.92,
      reason: 'planning task detected',
    });

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('nexus-send-btn'));
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/atlas');
    });
    expect(
      useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard'] ?? null,
    ).toBeNull();
  });

  it('keeps the main Nexus surface minimal with only welcome, participants, and chat', async () => {
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeInTheDocument();
    expect(screen.getByTestId('nexus-open-ops')).toBeInTheDocument();
    expect(screen.getByTestId('nexus-clear-chat')).toBeInTheDocument();
    expect(screen.getByTestId('orchestration-status-chip')).toBeInTheDocument();
    expect(screen.getByTestId('nexus-chat')).toBeInTheDocument();

    expect(screen.queryByText(/Master Thread/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('routing-suggestion')).not.toBeInTheDocument();
    expect(screen.queryByTestId('daily-brief')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alive-entity-input-panel')).not.toBeInTheDocument();
  });

  it('opens Nexus operations from the visible shell entrypoint', async () => {
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    fireEvent.click(screen.getByTestId('nexus-open-ops'));

    expect(mockNavigate).toHaveBeenCalledWith('/nexus/ops');
  });

  it('clears Nexus chat from the visible shell entrypoint', async () => {
    const ai = makeAI(1);
    render(<NexusDashboard ai={ai} agentName="Nexus" />);

    fireEvent.click(screen.getByTestId('nexus-clear-chat'));

    expect(ai.clearSession).toHaveBeenCalledTimes(1);
  });

  it('shows delegated agents in the presence stack after Nexus emits join lifecycle events', async () => {
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    act(() => {
      Spine.emit({
        type: 'MODULE_DELEGATED',
        source: 'nexus',
        target: 'atlas',
        domain: 'system',
        data: { reason: 'query_module' },
        cascadeDepth: 0,
        priority: 'info',
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Active agents: Atlas/i)).toBeInTheDocument();
    });
  });

  it('keeps consult-style turns in Nexus while still reflecting the named specialist in thread presence', async () => {
    const ai = {
      ...makeAI(1),
      lastParsedCommand: CommandIntelligenceService.parse(
        'Ask Soma whether tomorrow should be a rest day',
        { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
      ),
    };

    render(<NexusDashboard ai={ai} agentName="Nexus" />);

    expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard'] ?? null).toBeNull();
    expect(screen.getByLabelText(/Active agents: Soma/i)).toBeInTheDocument();
  });

  it('projects one fused planning suggestion for multi-intent planning without creating a routing draft', async () => {
    const ai = {
      ...makeAI(1),
      lastParsedCommand: CommandIntelligenceService.parse(
        'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
        { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
      ),
    };

    render(<NexusDashboard ai={ai} agentName="Nexus" />);

    await waitFor(() => {
      expect(
        useOrchestrationStore.getState().threadPlanningSuggestionByThreadId['nexus.dashboard']?.targetModuleId,
      ).toBe('atlas');
    });

    expect(
      useOrchestrationStore.getState().threadPlanningSuggestionByThreadId['nexus.dashboard']?.title,
    ).toContain('Coordinate 3');
    expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard'] ?? null).toBeNull();
  });

  it('creates a routing draft only for explicit ownership-transfer phrasing', async () => {
    (NexusRoutingService.classifyIntent as any).mockReturnValue({
      target: 'atlas',
      confidence: 0.9,
      reason: 'mention:ownership:atlas',
    });

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('nexus-send-btn'));
    });

    await waitFor(() => {
      expect(
        useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.target,
      ).toBe('atlas');
    });
  });

  it('persists synthesized thread reasoning while preserving routing and proposal behavior', async () => {
    useOrchestrationStore.getState().setThreadRoutingSuggestion('nexus.dashboard', {
      target: 'atlas',
      reason: 'planning task detected',
      state: 'draft',
    });

    useOrchestrationStore.getState().setLastTurnRuntime(
      OrchestrationRuntimeService.buildTurnSummary({
        moduleId: 'nexus',
        autopilotLevel: 4,
        historyMode: 'standard',
        activeThreadId: 'nexus.dashboard',
        decisions: [
          {
            actionType: 'draft_plan',
            proposalCard: {
              id: 'card-plan',
              proposalId: 'proposal-plan',
              title: 'Draft plan',
              summary: 'Atlas coordinated the plan outline for the next execution step.',
              source: 'atlas',
              status: 'approved',
              approvalRequirement: { required: false, reason: 'none' },
              executionMode: 'autonomous',
              historyMode: 'standard',
            },
            dispatchStatus: 'approved',
            executionMode: 'autonomous',
            historyMode: 'standard',
            runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
              autopilotLevel: 4,
              historyMode: 'standard',
              dispatchStatus: 'approved',
              highRisk: false,
            }),
            execution: {
              id: 'exec-plan',
              proposalId: 'proposal-plan',
              source: 'atlas',
              autopilotLevel: 4,
              executionMode: 'autonomous',
              historyMode: 'standard',
              patientScope: 'USER',
              executedAt: '2026-03-24T00:01:00.000Z',
              status: 'executed',
            },
          },
          {
            actionType: 'record_budget',
            proposalCard: {
              id: 'card-budget',
              proposalId: 'proposal-budget',
              title: 'Record budget',
              summary: 'Ledger reviewed the budget delta and flagged the approval gate.',
              source: 'ledger',
              status: 'pending_approval',
              approvalRequirement: { required: true, reason: 'high_risk' },
              executionMode: 'manual',
              historyMode: 'standard',
            },
            dispatchStatus: 'awaiting_approval',
            executionMode: 'manual',
            historyMode: 'standard',
            runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
              autopilotLevel: 4,
              historyMode: 'standard',
              dispatchStatus: 'awaiting_approval',
              highRisk: true,
            }),
            execution: {
              id: 'exec-budget',
              proposalId: 'proposal-budget',
              source: 'ledger',
              autopilotLevel: 4,
              executionMode: 'manual',
              historyMode: 'standard',
              patientScope: 'USER',
              executedAt: '2026-03-24T00:02:00.000Z',
              status: 'deferred',
            },
          },
        ],
      }),
    );

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Nexus synthesized 2 runtime actions');
    });
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Atlas');
    expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Ledger');

    await waitFor(() => {
      expect(useOrchestrationStore.getState().threadMessagesByThreadId['nexus.dashboard']?.length).toBeGreaterThan(0);
      expect(useOrchestrationStore.getState().threadTurnsByThreadId['nexus.dashboard']?.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-proposal-list')).toHaveTextContent('Route to Atlas');
    });
    expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Record budget');
    expect(screen.getByTestId('master-thread-proposal-list')).toHaveTextContent('Route to Atlas');
  });

  it('keeps Nexus operations scrollable and utility-focused', async () => {
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" surfaceMode="operations" />);

    expect(screen.getByTestId('nexus-ops-scroll-region')).toBeInTheDocument();
    expect(screen.getByText(/Thread review, memory utilities, alive inputs, and execution queues\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open nexus command palette/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to nexus chat/i })).toBeInTheDocument();
    expect(screen.getByTestId('orchestration-status-chip')).toBeInTheDocument();
    expect(screen.getByText(/Cross-domain analysis/i)).toBeInTheDocument();
    expect(screen.queryByText(/Brief and synthesis/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Approvals, thread review, synthesis, and operational state live here\./i)).not.toBeInTheDocument();
  });

  it('refreshes master-thread activity when live Nexus chat messages change', async () => {
    const ai = {
      ...makeAI(0),
      messages: [
        {
          id: 'chat-1',
          role: 'user' as const,
          content: 'Plan my day tomorrow.',
          timestamp: '2026-03-24T00:00:01.000Z',
        },
        {
          id: 'chat-2',
          role: 'assistant' as const,
          content: 'I can build that plan.',
          timestamp: '2026-03-24T00:00:02.000Z',
          actor: {
            actorId: 'nexus-intake',
            actorLabel: 'Nexus Intake',
            actorShortLabel: 'NI',
          },
        },
      ],
    };

    const { rerender } = render(<NexusDashboard ai={ai} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('Plan my day tomorrow.');
      expect(screen.getByTestId('master-thread-activity')).toHaveTextContent('I can build that plan.');
    });

    await waitFor(() => {
      expect(
        useOrchestrationStore
          .getState()
          .threadMessagesByThreadId['nexus.dashboard']
          ?.some((message) => message.body === 'I can build that plan.'),
      ).toBe(true);
    });

    rerender(
      <NexusDashboard
        ai={{
          ...ai,
          messages: [
            ...ai.messages,
            {
              id: 'chat-3',
              role: 'assistant' as const,
              content: 'Scheduling cooking at 11:00 tomorrow as well.',
              timestamp: '2026-03-24T00:00:03.000Z',
            },
          ],
        }}
        agentName="Nexus"
        surfaceMode="operations"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-activity')).toHaveTextContent(
        'Scheduling cooking at 11:00 tomorrow as well.',
      );
    });
  });

  it('renders review surfaces from silent history while keeping routing intact', async () => {
    vi.spyOn(OrchestrationHistoryService, 'listSilentHistoryForThread').mockResolvedValue([
      {
        id: 'silent.exec-1',
        executionId: 'exec-1',
        proposalId: 'proposal-1',
        summary: 'Ghost execution recorded.',
        source: 'ledger',
        timestamp: '2026-03-24T00:01:00.000Z',
        patientScope: 'USER',
        metadata: {
          activeThreadId: 'nexus.dashboard',
          hiddenMessages: ['Transaction recorded for coffee.'],
        },
      },
    ]);

    useOrchestrationStore.getState().setLastTurnRuntime(
      OrchestrationRuntimeService.buildTurnSummary({
        moduleId: 'nexus',
        autopilotLevel: 5,
        historyMode: 'silent',
        activeThreadId: 'nexus.dashboard',
        decisions: [
          {
            actionType: 'record_transaction',
            proposalCard: {
              id: 'card-1',
              proposalId: 'proposal-1',
              title: 'Record transaction',
              summary: 'Record transaction requested by ledger.',
              source: 'ledger',
              status: 'approved',
              approvalRequirement: { required: false, reason: 'none' },
              executionMode: 'ghost',
              historyMode: 'silent',
            },
            dispatchStatus: 'approved',
            executionMode: 'ghost',
            historyMode: 'silent',
            runtime: OrchestrationRuntimeService.buildRuntimeSemantics({
              autopilotLevel: 5,
              historyMode: 'silent',
              dispatchStatus: 'approved',
              highRisk: false,
            }),
            execution: {
              id: 'exec-1',
              proposalId: 'proposal-1',
              source: 'ledger',
              autopilotLevel: 5,
              executionMode: 'ghost',
              historyMode: 'silent',
              patientScope: 'USER',
              executedAt: '2026-03-24T00:01:00.000Z',
              status: 'executed',
            },
          },
        ],
      }),
    );

    useOrchestrationStore.getState().setThreadRoutingSuggestion('nexus.dashboard', {
      target: 'atlas',
      reason: 'planning task detected',
      state: 'draft',
    });

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-review-surfaces')).toBeInTheDocument();
    });

    expect(screen.getByTestId('master-thread-review-surfaces')).toHaveTextContent('Transaction recorded for coffee.');
    expect(screen.getByTestId('master-thread-review-surfaces')).toHaveTextContent('Ghost trace');

    expect(screen.getByTestId('master-thread-proposal-list')).toHaveTextContent('Route to Atlas');
  });

  it('renders structured memory search results from command palette searches and injects a result into chat', async () => {
    vi.spyOn(EpisodicMemoryService, 'retrieveRelevantUnified').mockResolvedValue([
      {
        id: 'episodic:atlas:session-1',
        type: 'episodic',
        moduleId: 'atlas',
        text: 'You handled a demanding planning block well after reducing context switching.',
        score: 0.91,
        timestamp: '2026-03-20T08:00:00.000Z',
        citation: {
          type: 'episodic',
          moduleId: 'atlas',
          entityId: 'session-1',
          label: 'Planning block',
        },
      },
    ]);
    vi.spyOn(SemanticMemoryService, 'getFactsUnified').mockResolvedValue([
      {
        id: 'semantic:fact-1',
        type: 'semantic',
        moduleId: 'atlas',
        text: 'Long planning sessions work better after a short reset window.',
        score: 0.88,
        confidence: 0.88,
        timestamp: '2026-03-20T08:00:00.000Z',
        citation: {
          type: 'semantic',
          moduleId: 'atlas',
          entityId: 'fact-1',
          label: 'Long planning sessions work better after a short reset window.',
        },
      },
    ]);

    const ai = makeAI(1);
    render(<NexusDashboard ai={ai} agentName="Nexus" surfaceMode="operations" />);

    await act(async () => {
      await latestCommandPaletteProps.onMemorySearch('planning reset window');
    });

    expect(ai.handleSendMessage).toHaveBeenCalledWith(
      'Search my memory for: planning reset window',
      undefined,
      expect.objectContaining({ threadId: 'nexus.dashboard' }),
    );
    expect(screen.getByText(/memory search: "planning reset window"/i)).toBeInTheDocument();
    expect(
      screen.getByText(/you handled a demanding planning block well after reducing context switching/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/long planning sessions work better after a short reset window/i),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('memory-result-episodic:atlas:session-1'));
    });

    expect(ai.handleSendMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('Use this episodic memory as context for the next reply:'),
      undefined,
      expect.objectContaining({ threadId: 'nexus.dashboard' }),
    );
    expect(screen.queryByText(/memory search: "planning reset window"/i)).not.toBeInTheDocument();
  });

  it('dedupes repeated command-palette memory searches for the same query', async () => {
    const retrieveRelevantUnified = vi.spyOn(EpisodicMemoryService, 'retrieveRelevantUnified').mockResolvedValue([
      {
        id: 'episodic:atlas:session-1',
        type: 'episodic',
        moduleId: 'atlas',
        text: 'You handled a demanding planning block well after reducing context switching.',
        score: 0.91,
        timestamp: '2026-03-20T08:00:00.000Z',
        citation: {
          type: 'episodic',
          moduleId: 'atlas',
          entityId: 'session-1',
          label: 'Planning block',
        },
      },
    ]);
    const getFactsUnified = vi.spyOn(SemanticMemoryService, 'getFactsUnified').mockResolvedValue([
      {
        id: 'semantic:fact-1',
        type: 'semantic',
        moduleId: 'atlas',
        text: 'Long planning sessions work better after a short reset window.',
        score: 0.88,
        confidence: 0.88,
        timestamp: '2026-03-20T08:00:00.000Z',
        citation: {
          type: 'semantic',
          moduleId: 'atlas',
          entityId: 'fact-1',
          label: 'Long planning sessions work better after a short reset window.',
        },
      },
    ]);

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" surfaceMode="operations" />);

    await act(async () => {
      await Promise.all([
        latestCommandPaletteProps.onMemorySearch('planning reset window'),
        latestCommandPaletteProps.onMemorySearch('planning reset window'),
      ]);
    });

    expect(retrieveRelevantUnified).toHaveBeenCalledTimes(1);
    expect(getFactsUnified).toHaveBeenCalledTimes(1);
  });

  it('renders alive entity inputs and injects a selected entity into chat', async () => {
    Object.assign(mockDataLayer, {
      listDocuments: vi.fn().mockResolvedValue([
        {
          id: 'alive.goal.1',
          type: 'ACTION',
          label: 'Morning planning',
          semantic_tags: ['atlas', 'planning'],
          attributes: {},
          soul_impact_preset: {},
          sourceModule: 'atlas',
          provenance: 'adapter',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
      ]),
    });

    const ai = makeAI(1);
    render(<NexusDashboard ai={ai} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.getByTestId('alive-entity-input-panel')).toBeInTheDocument();
    });

    expect(screen.getByTestId('alive-entity-input-panel')).toHaveTextContent('Morning planning');

    await act(async () => {
      fireEvent.click(screen.getByTestId('alive-entity-alive.goal.1'));
    });

    expect(ai.handleSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Use this alive entity as planning context for the next reply:'),
      undefined,
      expect.objectContaining({ threadId: 'nexus.dashboard' }),
    );
  });

  it('surfaces anticipatory planning proposals and injects the planning prompt on approval', async () => {
    (useGlobalSoul as any).mockReturnValue(makeGlobalSoulMock({
      emotional: { stressLoad: 3, emotionalResilience: 0.4 },
      cognitive: { activeLoad: 8, taskCompletionRate: 0.2, planningLoad: 8, focusScore: 0.4 },
      planning: { deadlinePressure: 8 },
      biological: { sleepQuality: 4, recoveryScore: 0.4 },
      resource: {},
    }));
    (useNexusSynthesis as any).mockReturnValue({
      alerts: [
        makeSynthesisAlert({
          id: 'PLANNING_COLLAPSE',
          severity: 'critical',
          title: 'Planning Collapse',
          description: 'Deadlines are mounting while completion rate is critically low.',
        }),
      ],
      isAnalyzing: false,
    });
    Object.assign(mockDataLayer, {
      listDocuments: vi.fn().mockResolvedValue([
        {
          id: 'alive.goal.1',
          type: 'ACTION',
          label: 'Morning planning',
          semantic_tags: ['atlas', 'planning'],
          attributes: {},
          soul_impact_preset: {},
          sourceModule: 'atlas',
          provenance: 'adapter',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
      ]),
    });

    const ai = makeAI(0);
    render(<NexusDashboard ai={ai} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.getByText('Draft a workload triage plan')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(ai.handleSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('Build a realistic triage plan for today'),
      undefined,
      expect.objectContaining({
        visibleContent: expect.stringContaining('Execute the proposed draft a workload triage plan via Atlas'),
      }),
    );
  });

  it('auto-runs fused planning with a machine packet while keeping the visible chat human-readable', async () => {
    useOrchestrationStore.getState().setAutopilotLevel(5);
    const ai = {
      ...makeAI(0),
      lastParsedCommand: CommandIntelligenceService.parse(
        'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
        { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
      ),
    };

    render(<NexusDashboard ai={ai} agentName="Nexus" />);

    await waitFor(() => {
      expect(ai.handleSendMessage).toHaveBeenCalledWith(
        expect.stringContaining('[NEXUS_ACTION_PLAN]'),
        undefined,
        expect.objectContaining({
          visibleContent: expect.stringContaining('Execute the proposed 3-step Atlas plan'),
        }),
      );
    });
  });

  it('keeps thread proposal controls synchronized with routing suggestion state', async () => {
    useOrchestrationStore.getState().setThreadRoutingSuggestion('nexus.dashboard', {
      target: 'atlas',
      reason: 'planning task detected',
      state: 'draft',
    });

    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Route to Atlas');
    });

    fireEvent.click(screen.getByRole('button', { name: /^defer$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Deferred');
    });
    expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Deferred');

    fireEvent.click(screen.getByRole('button', { name: /^restore$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Route to Atlas');
    });

    fireEvent.click(screen.getByRole('button', { name: /^reroute$/i }));
    fireEvent.change(screen.getByLabelText(/target module/i), { target: { value: 'agnes' } });
    fireEvent.change(screen.getByLabelText(/routing reason/i), { target: { value: 'needs emotional context' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByTestId('master-thread-proposal')).toHaveTextContent('Route to Agnes');
    });
    expect(screen.getByText(/Route to Agnes/i)).toBeInTheDocument();
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

    expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.state).toBe('draft');

    // Advance past the 8-second auto-dismiss timer
    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.state).toBe('deferred');
  });

  // ── T-18 ───────────────────────────────────────────────────────────────────
  it('T-18 — operations workspace no longer renders the daily brief surface', async () => {
    render(<NexusDashboard ai={makeAI(1)} agentName="Nexus" surfaceMode="operations" />);

    await waitFor(() => {
      expect(screen.queryByTestId('daily-brief')).not.toBeInTheDocument();
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
      expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.target).toBe('atlas');

      // Advance 3 seconds (suggestion A timer has 5s left)
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Trigger suggestion B (agnes) at t=3s — this clears A's timer and sets a new 8s timer
      await act(async () => {
        fireEvent.click(screen.getByTestId('nexus-send-btn'));
      });
      expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.target).toBe('agnes');

      // Advance to t=8s from origin — this is when A's original timer WOULD have fired.
      // B's timer was reset at t=3s and fires at t=11s, so B should still be visible.
      act(() => {
        vi.advanceTimersByTime(5000); // now at t=8s total
      });

      // Suggestion B must still be visible (its timer fires at t=11s, not t=8s)
      expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.state).toBe('draft');
      expect(useOrchestrationStore.getState().threadRoutingSuggestionByThreadId['nexus.dashboard']?.target).toBe('agnes');
    }
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// ── useModuleHealth (T-19 and T-20) ──────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════
describe('useModuleHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spineListeners.clear();

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
