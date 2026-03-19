import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActiveResearchWorkspace } from './ActiveResearchWorkspace';

const chatInterfaceSpy = vi.fn();

vi.mock('@/core/components/ChatInterface', () => ({
  ChatInterface: (props: unknown) => {
    chatInterfaceSpy(props);
    return <div data-testid="chat-interface">Chat</div>;
  },
}));

describe('ActiveResearchWorkspace', () => {
  beforeEach(() => {
    chatInterfaceSpy.mockReset();
  });

  const session = {
    id: 'session-1',
    userId: 'user-1',
    topic: 'Trace a supply chain disruption',
    status: 'searching',
    subQuestions: [
      { id: 'sq-1', text: 'What failed first?', intent: 'causal', status: 'searching' },
      { id: 'sq-2', text: 'How quickly did supply recover?', intent: 'temporal', status: 'completed' },
    ],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T12:00:00.000Z',
  } as const;

  const baseProps = {
    session,
    encryptionKey: null,
    onStartDeepResearch: vi.fn(),
    onSendMessage: vi.fn(),
    onUpdateSession: vi.fn(async () => {}),
    onAddSource: vi.fn(async () => null),
    knowledgeNodes: [],
    sources: [],
    messages: [],
    isProcessing: false,
    aiState: undefined,
    streamingText: '',
    error: null,
    quota: null,
  };

  it('keeps Scout activity cues in the workspace while muting internal signal chrome', () => {
    render(
      <ActiveResearchWorkspace
        {...baseProps}
        knowledgeNodes={[{ id: 'node-1', claim: 'Ports slowed', confidence: 0.8, evidence: [], status: 'verified', updatedAt: '2024-01-02T12:00:00.000Z', parentSessionId: 'session-1' }]}
        sources={[{ id: 'source-1', url: 'https://example.com', normalizedUrl: 'https://example.com', title: 'Freight update', domain: 'example.com', snippet: 'Delay details', addedAt: '2024-01-02T12:00:00.000Z', discoveredVia: 'search', readStatus: 'read', starred: false, archived: false, tags: [], citingNodeIds: ['node-1'] }]}
        isProcessing={true}
      />,
    );

    expect(screen.getByText('Current activity')).toBeInTheDocument();
    expect(screen.getAllByText(/searching sources/i)).toHaveLength(2);
    expect(screen.getByText(/linked items/i)).toBeInTheDocument();

    expect(chatInterfaceSpy).toHaveBeenCalled();
    expect(chatInterfaceSpy.mock.lastCall?.[0]).toMatchObject({
      showInternalSignals: false,
      isLoading: true,
      isProcessing: true,
    });
  });

  it('delegates artifact toggles to the shell orchestrator', () => {
    const onToggleArtifacts = vi.fn();

    render(
      <ActiveResearchWorkspace
        {...baseProps}
        artifactsMode="hidden"
        onToggleArtifacts={onToggleArtifacts}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /show artifacts/i }));
    expect(onToggleArtifacts).toHaveBeenCalledTimes(1);
  });

  it('updates the artifact toggle copy when artifacts are already visible in a sheet', () => {
    render(
      <ActiveResearchWorkspace
        {...baseProps}
        artifactsMode="sheet"
        onToggleArtifacts={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /hide artifacts/i })).toBeInTheDocument();
    expect(screen.getByText(/opened as a mobile sheet/i)).toBeInTheDocument();
  });

  it('renders a docked artifacts region only when requested', () => {
    const { rerender } = render(
      <ActiveResearchWorkspace
        {...baseProps}
        artifactsMode="hidden"
        artifactsPanel={<div>Artifacts panel</div>}
      />,
    );

    expect(screen.queryByText('Artifacts panel')).not.toBeInTheDocument();

    rerender(
      <ActiveResearchWorkspace
        {...baseProps}
        artifactsMode="docked"
        artifactsPanel={<div>Artifacts panel</div>}
      />,
    );

    expect(screen.getByText('Artifacts panel')).toBeInTheDocument();
    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
  });
});
