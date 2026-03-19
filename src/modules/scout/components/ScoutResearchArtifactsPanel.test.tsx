import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoutResearchArtifactsPanel } from './ScoutResearchArtifactsPanel';

describe('ScoutResearchArtifactsPanel', () => {
  const session = {
    id: 'session-1',
    userId: 'user-1',
    topic: 'Trace a supply chain disruption',
    status: 'searching',
    subQuestions: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T12:00:00.000Z',
  } as const;

  it('renders only findings and sources linked to the active session', () => {
    render(
      <ScoutResearchArtifactsPanel
        session={session}
        knowledgeNodes={[
          {
            id: 'node-1',
            claim: 'Port congestion increased transit times.',
            confidence: 0.82,
            evidence: ['source-1'],
            status: 'verified',
            updatedAt: '2024-01-02T12:00:00.000Z',
            parentSessionId: 'session-1',
          },
          {
            id: 'node-2',
            claim: 'Unrelated claim',
            confidence: 0.63,
            evidence: ['source-2'],
            status: 'verified',
            updatedAt: '2024-01-02T12:00:00.000Z',
            parentSessionId: 'session-2',
          },
        ]}
        sources={[
          {
            id: 'source-1',
            url: 'https://example.com/source-1',
            normalizedUrl: 'https://example.com/source-1',
            title: 'Shipping update',
            domain: 'example.com',
            snippet: 'Transit delays',
            addedAt: '2024-01-02T12:00:00.000Z',
            discoveredVia: 'search',
            readStatus: 'read',
            starred: false,
            archived: false,
            tags: [],
            citingNodeIds: ['node-1'],
          },
          {
            id: 'source-2',
            url: 'https://example.com/source-2',
            normalizedUrl: 'https://example.com/source-2',
            title: 'Other source',
            domain: 'example.com',
            snippet: 'Other details',
            addedAt: '2024-01-02T12:00:00.000Z',
            discoveredVia: 'search',
            readStatus: 'read',
            starred: false,
            archived: false,
            tags: [],
            citingNodeIds: ['node-2'],
          },
        ]}
      />,
    );

    expect(screen.getByText('Port congestion increased transit times.')).toBeInTheDocument();
    expect(screen.getByText('Shipping update')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated claim')).not.toBeInTheDocument();
    expect(screen.queryByText('Other source')).not.toBeInTheDocument();
  });

  it('shows empty states when the session has no linked artifacts', () => {
    render(
      <ScoutResearchArtifactsPanel
        session={session}
        knowledgeNodes={[]}
        sources={[]}
      />,
    );

    expect(screen.getByText(/no findings synthesized yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no sources linked yet/i)).toBeInTheDocument();
  });
});
