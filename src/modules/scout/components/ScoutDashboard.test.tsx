import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScoutDashboard } from './ScoutDashboard';
import type { ResearchSession } from '../types';
import type { ScoutProfile } from '../services/scout-knowledge-service';

vi.mock('./graph/KnowledgeGraph', () => ({
  KnowledgeGraph: ({ nodes }: { nodes: Array<{ claim: string }> }) => (
    <div data-testid="knowledge-graph">{nodes.map((node) => node.claim).join(' | ')}</div>
  ),
}));

const sessions: ResearchSession[] = [
  {
    id: 'session-1',
    userId: 'user-1',
    topic: 'Trace chip shortages',
    status: 'searching',
    subQuestions: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T12:00:00.000Z',
  },
  {
    id: 'session-2',
    userId: 'user-1',
    topic: 'Review trade barriers',
    status: 'complete',
    subQuestions: [],
    createdAt: '2024-01-03T00:00:00.000Z',
    updatedAt: '2024-01-04T12:00:00.000Z',
  },
];

const profile: ScoutProfile = {
  onboardingComplete: true,
  researchFocus: ['Semiconductors'],
  summary: 'Track supply chain risks.',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z',
  interests: [
    {
      id: 'interest-1',
      topic: 'Semiconductors',
      score: 0.9,
      trend: 'rising',
      lastSeenAt: '2024-01-02T00:00:00.000Z',
    },
  ],
  knowledgeNodes: [
    { id: 'node-1', status: 'verified', confidence: 0.55 },
    { id: 'node-2', status: 'pending', confidence: 0.45 },
  ],
  newsBriefs: [
    {
      topic: 'Fab capacity',
      summary: 'Foundries in two regions reported new utilization constraints.',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  ],
};

describe('ScoutDashboard', () => {
  it('renders current scout dashboard sections and normalizes legacy profile nodes for the graph', () => {
    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
        activeSessionId="session-1"
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
      />
    );

    expect(screen.getByText(/Scout · Knowledge Cartographer/i)).toBeInTheDocument();
    expect(screen.getByText(/1 active inquiry in progress/i)).toBeInTheDocument();
    expect(screen.getByText('Research sessions')).toBeInTheDocument();
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
    expect(screen.getByText('Trend briefings')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-graph')).toHaveTextContent('Knowledge node 1 | Knowledge node 2');
    expect(screen.getByRole('alert')).toHaveTextContent(/average confidence across your knowledge grid is 50%/i);
  });

  it('delegates the refresh action and reflects its busy label', () => {
    const onRefreshNews = vi.fn();

    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
        onRefreshNews={onRefreshNews}
        isRefreshingNews
      />
    );

    const button = screen.getByRole('button', { name: /refreshing briefs/i });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onRefreshNews).not.toHaveBeenCalled();
  });

  it('falls back to a locked shell when the vault is locked', () => {
    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
        isLocked
      />
    );

    expect(screen.getByText('Scout')).toBeInTheDocument();
    expect(screen.getByText(/unlock your vault to continue/i)).toBeInTheDocument();
  });
});
