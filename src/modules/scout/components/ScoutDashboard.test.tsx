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
  it('renders hero, metrics, quick-actions, interests, graph and sessions', () => {
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

    // Research health metric cards
    expect(screen.getByText(/knowledge nodes/i)).toBeInTheDocument();
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.getByText(/sources saved/i)).toBeInTheDocument();
    expect(screen.getByText(/active sessions/i)).toBeInTheDocument();

    // Quick-action buttons
    expect(screen.getByRole('button', { name: /new research session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate digest/i })).toBeInTheDocument();

    // Trending interests pill
    expect(screen.getByText('Semiconductors')).toBeInTheDocument();

    // Session list and knowledge graph
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
    expect(screen.getByTestId('knowledge-graph')).toHaveTextContent('Knowledge node 1 | Knowledge node 2');

    // Trend briefings
    expect(screen.getByText('Trend briefings')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/average confidence across your knowledge grid is 50%/i);
  });

  it('shows empty-interests prompt when profile has no interests', () => {
    const noInterestsProfile: ScoutProfile = { ...profile, interests: [] };

    render(
      <ScoutDashboard
        soul={null}
        profile={noInterestsProfile}
        sessions={sessions}
      />
    );

    expect(screen.getByText(/add interests in your profile/i)).toBeInTheDocument();
  });

  it('shows empty news briefs state when profile has no briefs', () => {
    const noBriefsProfile: ScoutProfile = { ...profile, newsBriefs: [] };

    render(
      <ScoutDashboard
        soul={null}
        profile={noBriefsProfile}
        sessions={sessions}
      />
    );

    expect(screen.getAllByText(/no news briefs yet/i).length).toBeGreaterThan(0);
  });

  it('calls onStartSession when New Research Session button is clicked', () => {
    const onStartSession = vi.fn();

    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
        onStartSession={onStartSession}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /new research session/i }));
    expect(onStartSession).toHaveBeenCalledOnce();
  });

  it('calls onGenerateDigest when Generate Digest button is clicked', () => {
    const onGenerateDigest = vi.fn();

    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
        onGenerateDigest={onGenerateDigest}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /generate digest/i }));
    expect(onGenerateDigest).toHaveBeenCalledOnce();
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

    const button = screen.getByRole('button', { name: /refreshing news/i });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onRefreshNews).not.toHaveBeenCalled();
  });

  it('shows Refresh News button when onRefreshNews prop is provided', () => {
    const onRefreshNews = vi.fn();

    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
        onRefreshNews={onRefreshNews}
        isRefreshingNews={false}
      />
    );

    const button = screen.getByRole('button', { name: /refresh news/i });
    fireEvent.click(button);
    expect(onRefreshNews).toHaveBeenCalledOnce();
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

  it('renders verified percentage correctly in metric cards', () => {
    render(
      <ScoutDashboard
        soul={null}
        profile={profile}
        sessions={sessions}
      />
    );

    // 1 verified out of 2 nodes = 50%
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows em dash for verified % when there are no nodes', () => {
    const emptyProfile: ScoutProfile = { ...profile, knowledgeNodes: [] };

    render(
      <ScoutDashboard
        soul={null}
        profile={emptyProfile}
        sessions={sessions}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
