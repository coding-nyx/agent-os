import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { setNexusDataLayer } from '@/lib/data-layer/provider';
import { loadBeliefGraph } from './belief-graph-service';
import {
  confirmBeliefGraphProposal,
  loadBeliefGraphWorkflow,
  mergeBeliefGraphs,
  proposeBeliefGraphCandidate,
} from './belief-graph-workflow-service';
import { ORCHESTRATION_PROPOSAL_SUBCOLLECTION } from '@/lib/services/orchestration-persistence-service';

vi.mock('@/lib/encryption', () => ({
  encryptWithKey: vi.fn(async (plaintext: string) => ({
    ciphertext: plaintext,
    iv: 'iv',
  })),
  decryptWithKey: vi.fn(async ({ ciphertext }: { ciphertext: string }) => ciphertext),
}));

describe('belief-graph-workflow-service', () => {
  afterEach(() => {
    setNexusDataLayer(new InMemoryDataProvider());
  });

  it('keeps extracted beliefs pending until the user confirms them', async () => {
    const dataLayer = new InMemoryDataProvider();
    setNexusDataLayer(dataLayer);

    await proposeBeliefGraphCandidate(
      {
        source: 'journal_entry',
        title: 'Review journal belief extraction',
        graph: {
          nodes: [{ id: 'b1', label: 'I am hard to love', valence: 'negative', intensity: 8 }],
          edges: [],
          summary: 'Negative attachment belief detected.',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
        confidence: 0.81,
      },
      { userId: 'user-1', encryptionKey: {} as CryptoKey },
    );

    const persistedGraph = await loadBeliefGraph({ userId: 'user-1', encryptionKey: {} as CryptoKey });
    const workflow = await loadBeliefGraphWorkflow({ userId: 'user-1', encryptionKey: {} as CryptoKey });

    expect(persistedGraph).toBeNull();
    expect(workflow?.proposals).toHaveLength(1);
    expect(workflow?.proposals[0]).toMatchObject({
      source: 'journal_entry',
      status: 'pending',
    });
  });

  it('merges confirmed beliefs into the durable graph and persists invitation runtime artifacts', async () => {
    const dataLayer = new InMemoryDataProvider();
    setNexusDataLayer(dataLayer);

    const proposal = await proposeBeliefGraphCandidate(
      {
        source: 'agnes_session',
        title: 'Review Agnes belief suggestion',
        graph: {
          nodes: [
            { id: 'b1', label: 'I am not enough', valence: 'negative', intensity: 9 },
            { id: 'b2', label: 'I always fail', valence: 'negative', intensity: 8 },
          ],
          edges: [{ from: 'b1', to: 'b2', relation: 'reinforces' }],
          summary: 'Two reinforcing high-intensity beliefs are active.',
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        },
        confidence: 0.87,
      },
      { userId: 'user-1', encryptionKey: {} as CryptoKey },
    );

    await confirmBeliefGraphProposal({
      proposalId: proposal!.id,
      userId: 'user-1',
      encryptionKey: {} as CryptoKey,
      editedGraph: {
        nodes: [
          { id: 'b1', label: 'I feel not enough', valence: 'negative', intensity: 9 },
          { id: 'b2', label: 'I always fail', valence: 'negative', intensity: 8 },
        ],
        edges: [{ from: 'b1', to: 'b2', relation: 'reinforces' }],
        summary: 'Confirmed and edited before persistence.',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      emotionalState: {
        emotionalResilience: 4,
        stressLoad: 8,
        moodTrend: null,
        traumaMarkers: null,
      },
    });

    const persistedGraph = await loadBeliefGraph({ userId: 'user-1', encryptionKey: {} as CryptoKey });
    const workflow = await loadBeliefGraphWorkflow({ userId: 'user-1', encryptionKey: {} as CryptoKey });
    const orchestrationProposals = await dataLayer.listDocuments(
      `users/user-1/${ORCHESTRATION_PROPOSAL_SUBCOLLECTION}`,
    );

    expect(persistedGraph?.nodes.map((node) => node.label)).toEqual(
      expect.arrayContaining(['I feel not enough', 'I always fail']),
    );
    expect(workflow?.proposals).toHaveLength(0);
    expect(workflow?.invitation).toMatchObject({
      status: 'pending',
      title: 'Invite Agnes support session',
    });
    expect(orchestrationProposals).toHaveLength(1);
    expect(orchestrationProposals[0]).toMatchObject({
      moduleId: 'agnes',
      actionType: 'suggest_agnes_session_invitation',
      dispatchStatus: 'awaiting_approval',
    });
  });

  it('caps merged graphs to 80 nodes and removes edges tied to pruned nodes', () => {
    const proposal = {
      nodes: Array.from({ length: 120 }, (_, index) => ({
        id: `n${index}`,
        label: `Belief ${index}`,
        valence: 'neutral' as const,
        intensity: 5,
      })),
      edges: [{ from: 'n0', to: 'n119', relation: 'relates' }],
      summary: 'crowded graph',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    };

    const merged = mergeBeliefGraphs(null, proposal);

    expect(merged.nodes).toHaveLength(80);
    expect(merged.nodes.some((node) => node.id === 'n119')).toBe(true);
    expect(merged.nodes.some((node) => node.id === 'n0')).toBe(false);
    expect(merged.edges).toHaveLength(0);
  });

  it('deduplicates equivalent labels and keeps the strongest belief', () => {
    const current = {
      nodes: [{ id: 'c1', label: 'I am hard to love', valence: 'negative' as const, intensity: 4 }],
      edges: [],
      summary: 'base',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    };

    const proposal = {
      nodes: [{ id: 'p1', label: '  I am hard to love  ', valence: 'neutral' as const, intensity: 8 }],
      edges: [],
      summary: 'updated',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    };

    const merged = mergeBeliefGraphs(current, proposal);

    expect(merged.nodes).toHaveLength(1);
    expect(merged.nodes[0]).toMatchObject({
      id: 'c1',
      label: 'I am hard to love',
      intensity: 8,
      valence: 'neutral',
    });
  });
});
