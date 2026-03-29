import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { setNexusDataLayer } from '@/lib/data-layer/provider';
import {
  compactBeliefGraph,
  compactBeliefGraphDocument,
  compactBeliefGraphWithLLM,
  loadBeliefGraph,
  saveBeliefGraph,
} from './belief-graph-service';

vi.mock('@/lib/encryption', () => ({
  encryptWithKey: vi.fn(async (plaintext: string) => ({
    ciphertext: plaintext,
    iv: 'iv',
  })),
  decryptWithKey: vi.fn(async ({ ciphertext }: { ciphertext: string }) => ciphertext),
}));

describe('belief-graph-service', () => {
  afterEach(() => {
    setNexusDataLayer(new InMemoryDataProvider());
  });

  it('compacts dense graphs by deduplicating labels and pruning detached edges', () => {
    const compacted = compactBeliefGraph(
      {
        nodes: [
          { id: 'n1', label: 'I am unsafe', valence: 'negative', intensity: 7 },
          { id: 'n2', label: ' i am unsafe ', valence: 'negative', intensity: 9 },
          { id: 'n3', label: 'I can recover', valence: 'positive', intensity: 6 },
        ],
        edges: [
          { from: 'n1', to: 'n3', relation: 'counteracts' },
          { from: 'n2', to: 'n3', relation: 'counteracts' },
        ],
        summary: 'dense',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      2,
    );

    expect(compacted.nodes).toHaveLength(2);
    expect(compacted.nodes[0]).toMatchObject({ label: 'i am unsafe', intensity: 9 });
    expect(compacted.edges).toHaveLength(1);
  });

  it('persists compacted graph with a configurable node cap', async () => {
    setNexusDataLayer(new InMemoryDataProvider());
    const context = { userId: 'user-1', encryptionKey: {} as CryptoKey };

    await saveBeliefGraph(
      {
        nodes: Array.from({ length: 90 }, (_, index) => ({
          id: `n${index}`,
          label: `Belief ${index}`,
          valence: 'neutral' as const,
          intensity: 1,
        })),
        edges: [{ from: 'n0', to: 'n89', relation: 'related' }],
        summary: 'crowded',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      context,
    );

    const result = await compactBeliefGraphDocument(context, { maxNodes: 40 });
    const graph = await loadBeliefGraph(context);

    expect(result).toMatchObject({
      compacted: true,
      nodeCount: 40,
    });
    expect(graph?.nodes).toHaveLength(40);
    expect(graph?.edges).toHaveLength(0);
  });

  it('merges semantically equivalent paraphrased beliefs', () => {
    const compacted = compactBeliefGraph(
      {
        nodes: [
          { id: 'n1', label: 'I am faking my trans identity', valence: 'negative', intensity: 8 },
          { id: 'n2', label: 'My trans identity is fake', valence: 'negative', intensity: 7 },
          { id: 'n3', label: 'I can recover', valence: 'positive', intensity: 5 },
        ],
        edges: [{ from: 'n2', to: 'n3', relation: 'counteracts' }],
        summary: 'semantic dedupe',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      10,
    );

    expect(compacted.nodes).toHaveLength(2);
    expect(compacted.nodes.some((node) => node.label.includes('trans identity'))).toBe(true);
    expect(compacted.edges).toHaveLength(1);
  });

  it('does not merge beliefs with opposite intent', () => {
    const compacted = compactBeliefGraph(
      {
        nodes: [
          { id: 'n1', label: 'I am safe', valence: 'positive', intensity: 6 },
          { id: 'n2', label: 'I am unsafe', valence: 'negative', intensity: 8 },
        ],
        edges: [],
        summary: 'opposite intent',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      10,
    );

    expect(compacted.nodes).toHaveLength(2);
  });

  it('uses LLM second pass merge plan when provided', async () => {
    const compacted = await compactBeliefGraphWithLLM(
      {
        nodes: [
          { id: 'n1', label: 'I am faking my trans identity', valence: 'negative', intensity: 7 },
          { id: 'n2', label: 'my identity is fake', valence: 'negative', intensity: 9 },
          { id: 'n3', label: 'I can recover', valence: 'positive', intensity: 5 },
        ],
        edges: [{ from: 'n2', to: 'n3', relation: 'counteracts' }],
        summary: 'llm merge',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      {
        maxNodes: 10,
        generateJSON: vi.fn(async () => ({
          groups: [
            { canonicalId: 'n2', memberIds: ['n1', 'n2'] },
          ],
        })),
      },
    );

    expect(compacted.nodes).toHaveLength(2);
    expect(compacted.nodes.find((node) => node.id === 'n2')?.intensity).toBe(9);
    expect(compacted.edges).toHaveLength(1);
  });
});
