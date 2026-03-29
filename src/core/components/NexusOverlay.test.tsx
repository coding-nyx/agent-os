import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NexusOverlay } from './NexusOverlay';
import { CommandIntelligenceService } from '@/lib/services/command-intelligence-service';
import { MasterThreadService } from '@/lib/services/master-thread-service';

const mockNavigate = vi.fn();
const moduleAiMock = vi.hoisted(() => ({
  messages: [],
  isProcessing: false,
  streamingText: '',
  error: null,
  quota: null,
  lastParsedCommand: null,
  handleSendMessage: vi.fn().mockResolvedValue(undefined),
  clearSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    aside: ({ children, ...props }: any) => <aside {...props}>{children}</aside>,
  },
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/atlas' }),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    isGuest: false,
    profile: { onboardingComplete: true, preferredName: 'Pac' },
  }),
}));

vi.mock('@/lib/global-soul-context', () => ({
  useGlobalSoulStore: Object.assign(
    (selector: any) => selector({ globalSoul: null, isLoading: false }),
    { getState: () => ({ globalSoul: null, isLoading: false }), subscribe: () => () => {} },
  ),
  useGlobalSoulActions: () => ({ refreshGlobalSoul: vi.fn(), enhanceContext: vi.fn(), enhanceContextForModule: vi.fn(), updateCrossFunctionalState: vi.fn(), getFilteredSoulForModule: vi.fn() }),
}));

vi.mock('@/lib/vault-context', () => ({
  useVault: () => ({ hasVault: true, isUnlocked: true }),
}));

vi.mock('@/lib/hooks/use-module-ai', () => ({
  useModuleAI: () => moduleAiMock,
}));

vi.mock('@/llm-engine/ai-context', () => ({
  useAI: () => ({
    sendMessage: vi.fn(),
    analyzeImage: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/use-nexus-cross-module-blocker', () => ({
  useNexusCrossModuleBlocker: () => ({ isCrossModuleBusy: false, pendingTargets: [] }),
}));

vi.mock('@/lib/hooks/use-nexus-conflict-blocker', () => ({
  useNexusConflictBlocker: () => ({ isConflictBlocking: false }),
}));

vi.mock('@/lib/hooks/use-routine-proposals', () => ({
  useRoutineProposals: () => ({ activeProposal: null }),
}));

vi.mock('@/modules/nexus/components/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/core/components/NexusChat', () => ({
  NexusChat: () => <div data-testid="nexus-overlay-chat">Nexus Chat</div>,
}));

vi.mock('@/core/components/NexusSubModulePanel', () => ({
  NexusSubModulePanel: () => <div data-testid="nexus-submodule-panel" />,
}));

vi.mock('@/core/components/NexusAgentPresenceStack', () => ({
  NexusAgentPresenceStack: ({ participants }: { participants: Array<{ moduleId: string }> }) => (
    <div data-testid="nexus-agent-presence">Agents present: {participants.map((p) => p.moduleId).join(', ')}</div>
  ),
}));

vi.mock('@/lib/stores/ui-store', () => ({
  useUIStore: <T,>(selector: (state: any) => T) =>
    selector({
      isChatOverlayOpen: false,
      hideGlobalFAB: false,
      setChatOverlayOpen: vi.fn(),
      setActiveLayout: vi.fn(),
    }),
}));

vi.mock('@/lib/stores/orchestration-store', () => ({
  areThreadMessagesEqual: () => true,
  areThreadParticipantsEqual: () => true,
  areThreadTurnsEqual: () => true,
  useOrchestrationStore: <T,>(selector: (state: any) => T) =>
    selector({
      activeThreadId: null,
      lastTurnRuntime: null,
      threadParticipantsByThreadId: {},
      threadMessagesByThreadId: {},
      threadTurnsByThreadId: {},
      threadRoutingSuggestionByThreadId: {},
      threadPlanningSuggestionByThreadId: {},
      setThreadParticipants: vi.fn(),
      setThreadMessages: vi.fn(),
      setThreadTurns: vi.fn(),
      applyThreadSnapshot: vi.fn(),
    }),
}));

vi.mock('@/lib/services/master-thread-service', () => ({
  MasterThreadService: {
    createNexusShellSnapshot: vi.fn(() => ({
      thread: {
        threadId: 'nexus.dashboard',
        participants: [{ moduleId: 'atlas', state: 'joined', presence: 'online' }],
        messages: [],
        turns: [],
      },
      runtimeSummary: null,
      proposalCard: null,
      proposals: [],
    })),
  },
}));

vi.mock('@/modules/nexus/personas', () => ({
  ORCHESTRATOR_PERSONA: 'nexus persona',
}));

describe('NexusOverlay', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    moduleAiMock.lastParsedCommand = null;
    moduleAiMock.handleSendMessage.mockClear();
    moduleAiMock.clearSession.mockClear();
  });

  it('renders the overlay with the same minimal chat-first chrome as Nexus home', async () => {
    render(<NexusOverlay />);

    await act(async () => {
      window.dispatchEvent(new Event('open-nexus'));
    });

    expect(screen.getByLabelText('Nexus overlay')).toBeInTheDocument();
    expect(screen.getByText(/Good (morning|afternoon|evening), Pac\./i)).toBeInTheDocument();
    expect(screen.getByText(/Welcome back\. Nexus is online and listening\./i)).toBeInTheDocument();
    expect(screen.getByTestId('nexus-agent-presence')).toHaveTextContent('atlas');
    expect(screen.getByTestId('nexus-overlay-open-ops')).toBeInTheDocument();
    expect(screen.getByTestId('nexus-overlay-open-home')).toBeInTheDocument();
    expect(screen.getByTestId('nexus-overlay-clear-chat')).toBeInTheDocument();
    expect(screen.getByTestId('nexus-overlay-chat')).toBeInTheDocument();
    expect(screen.queryByTestId('nexus-shell-hud')).not.toBeInTheDocument();
    expect(screen.queryByTestId('master-thread-status-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('operational-command-center-card')).not.toBeInTheDocument();
  });

  it('keeps only compact navigation and clear actions in the overlay header', async () => {
    render(<NexusOverlay />);

    await act(async () => {
      window.dispatchEvent(new Event('open-nexus'));
    });

    fireEvent.click(screen.getByTestId('nexus-overlay-open-ops'));
    expect(mockNavigate).toHaveBeenCalledWith('/nexus/ops');

    await act(async () => {
      window.dispatchEvent(new Event('open-nexus'));
    });
    fireEvent.click(screen.getByTestId('nexus-overlay-open-home'));
    expect(mockNavigate).toHaveBeenCalledWith('/nexus');

    await act(async () => {
      window.dispatchEvent(new Event('open-nexus'));
    });
    fireEvent.click(screen.getByTestId('nexus-overlay-clear-chat'));
    expect(moduleAiMock.clearSession).toHaveBeenCalledTimes(1);
  });

  it('reflects mention-derived participants in the overlay presence stack without forcing navigation', async () => {
    moduleAiMock.lastParsedCommand = CommandIntelligenceService.parse(
      'Agnes, I feel anxious about my relationship',
      { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
    );

    render(<NexusOverlay />);

    await act(async () => {
      window.dispatchEvent(new Event('open-nexus'));
    });

    expect(MasterThreadService.createNexusShellSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        mentionedParticipants: ['agnes'],
      }),
    );
    expect(mockNavigate).not.toHaveBeenCalledWith('/agnes');
  });
});
