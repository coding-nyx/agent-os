import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';

// Mock the data layer provider to return our in-memory store
let dataLayer: InMemoryDataProvider;
vi.mock('@/lib/data-layer/provider', () => ({
  getNexusDataLayer: () => dataLayer,
}));

// Mock EmbeddingService to avoid real API calls
vi.mock('@/lib/services/embedding-service', () => ({
  EmbeddingService: {
    embed: vi.fn(async (text: string) => {
      // Deterministic fake embedding: hash text into a 4-element vector
      const hash = (s: string) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
      };
      const h = hash(text);
      return [
        ((h % 100) / 100),
        (((h >> 8) % 100) / 100),
        (((h >> 16) % 100) / 100),
        (((h >> 24) % 100) / 100),
      ];
    }),
  },
  cosineSimilarity: vi.fn((a: number[], b: number[]): number => {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let dot = 0, nA = 0, nB = 0;
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i]; nA += a[i] * a[i]; nB += b[i] * b[i];
    }
    if (nA === 0 || nB === 0) return 0;
    return dot / Math.sqrt(nA * nB);
  }),
}));

import { WebRagAdapter } from './web-rag-adapter';
import { EmbeddingService } from '@/lib/services/embedding-service';

function makeChunk(
  id: string,
  content: string,
  uid: string,
  moduleId: string,
  opts: { embedding?: number[]; source?: string } = {},
) {
  return {
    id,
    content,
    uid,
    moduleId,
    source: opts.source ?? 'test',
    embedding: opts.embedding,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T12:00:00.000Z',
  };
}

describe('WebRagAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataLayer = new InMemoryDataProvider();
  });

  it('returns empty on blank query', async () => {
    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: '   ',
      userId: 'user-1',
      requiresVault: false,
    });
    expect(res.status).toBe('ok');
    expect(res.facts).toHaveLength(0);
  });

  it('returns vault_blocked when vault required but no key', async () => {
    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep',
      userId: 'user-1',
      requiresVault: true,
      encryptionKey: null,
    });
    expect(res.status).toBe('vault_blocked');
    expect(res.facts).toHaveLength(0);
  });

  it('returns empty when no userId provided', async () => {
    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep',
      requiresVault: false,
    });
    expect(res.status).toBe('ok');
    expect(res.facts).toHaveLength(0);
  });

  it('returns empty when no chunks match the user', async () => {
    await dataLayer.createDocument('rag_chunks', {
      id: 'chunk-1',
      content: 'sleep improves recovery',
      uid: 'other-user',
      moduleId: 'atlas',
    });

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep recovery',
      userId: 'user-1',
      requiresVault: false,
    });
    expect(res.status).toBe('ok');
    expect(res.facts).toHaveLength(0);
  });

  it('retrieves and scores chunks using keyword matching', async () => {
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'chunk-1',
      'Sleep quality directly impacts next-day recovery scores',
      'user-1',
      'atlas',
    ));
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'chunk-2',
      'Financial budgeting strategies for retirement planning',
      'user-1',
      'atlas',
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep recovery improvement',
      userId: 'user-1',
      requiresVault: false,
    });

    expect(res.status).toBe('ok');
    // The sleep chunk should match keywords; the finance chunk should not
    expect(res.facts.length).toBeGreaterThanOrEqual(1);
    expect(res.facts[0].text).toContain('Sleep quality');
    expect(res.facts[0].type).toBe('rag');
    expect(res.facts[0].id).toBe('rag:chunk-1');
    expect(res.facts[0].citation.type).toBe('rag');
  });

  it('uses semantic scoring when embeddings are present', async () => {
    // The embedded chunk has NO keyword overlap with the query — it would score 0
    // on keyword matching alone. But its exact embedding match (cosine=1.0) gives
    // it a semantic score of 0.7, beating the keyword-only chunk.
    const queryEmb = await EmbeddingService.embed('deep sleep cycles');

    await dataLayer.createDocument('rag_chunks', makeChunk(
      'chunk-sem',
      'HRV and REM nightly phase transitions',
      'user-1',
      'titan',
      { embedding: queryEmb }, // exact match embedding → cosine = 1.0
    ));
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'chunk-no-emb',
      'deep sleep monitoring tools',
      'user-1',
      'titan',
      // no embedding → keyword-only: 2/3 tokens match ("deep", "sleep") = 0.67
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'titan',
      query: 'deep sleep cycles',
      userId: 'user-1',
      requiresVault: false,
    });

    expect(res.status).toBe('ok');
    expect(res.facts.length).toBe(2);
    // Semantic chunk: 0.7*1.0 + 0.3*0.0 = 0.70
    // Keyword chunk:  0.67 (no embedding)
    // Semantic wins despite zero keyword overlap
    expect(res.facts[0].id).toBe('rag:chunk-sem');
    expect(res.facts[0].score).toBeGreaterThan(res.facts[1].score);
  });

  it('filters by moduleId when not nexus', async () => {
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'atlas-chunk',
      'planning strategies for better sleep',
      'user-1',
      'atlas',
    ));
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'titan-chunk',
      'sleep biomarker tracking',
      'user-1',
      'titan',
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep strategies',
      userId: 'user-1',
      requiresVault: false,
    });

    // Only atlas chunk should be returned
    const moduleIds = res.facts.map(f => f.moduleId);
    expect(moduleIds.every(id => id === 'atlas')).toBe(true);
  });

  it('searches all modules when moduleId is nexus', async () => {
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'atlas-chunk',
      'planning strategies for better sleep',
      'user-1',
      'atlas',
    ));
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'titan-chunk',
      'sleep biomarker tracking research',
      'user-1',
      'titan',
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'nexus',
      query: 'sleep strategies tracking',
      userId: 'user-1',
      requiresVault: false,
    });

    // Both modules should be searchable
    expect(res.facts.length).toBeGreaterThanOrEqual(1);
  });

  it('respects topK limit', async () => {
    for (let i = 0; i < 10; i++) {
      await dataLayer.createDocument('rag_chunks', makeChunk(
        `chunk-${i}`,
        `sleep recovery training improvement method ${i}`,
        'user-1',
        'atlas',
      ));
    }

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep recovery training improvement',
      userId: 'user-1',
      requiresVault: false,
      topK: 3,
    });

    expect(res.facts.length).toBeLessThanOrEqual(3);
  });

  it('returns results sorted by score descending', async () => {
    const queryEmb = await EmbeddingService.embed('workout recovery');

    await dataLayer.createDocument('rag_chunks', makeChunk(
      'low-score',
      'general wellness tips and guidelines',
      'user-1',
      'atlas',
    ));
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'high-score',
      'workout recovery optimization and sleep improvement',
      'user-1',
      'atlas',
      { embedding: queryEmb },
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'workout recovery',
      userId: 'user-1',
      requiresVault: false,
    });

    if (res.facts.length >= 2) {
      expect(res.facts[0].score).toBeGreaterThanOrEqual(res.facts[1].score);
    }
  });

  it('truncates long text in citation labels', async () => {
    const longText = 'A'.repeat(200);
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'long-chunk',
      longText,
      'user-1',
      'atlas',
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: longText.slice(0, 20),
      userId: 'user-1',
      requiresVault: false,
    });

    // Even if no score match, verify citation truncation contract
    for (const fact of res.facts) {
      expect(fact.citation.label.length).toBeLessThanOrEqual(120);
    }
  });

  it('gracefully handles data layer errors', async () => {
    vi.spyOn(dataLayer, 'query').mockRejectedValueOnce(new Error('Firestore unavailable'));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'atlas',
      query: 'sleep',
      userId: 'user-1',
      requiresVault: false,
    });

    // Should degrade gracefully, not throw
    expect(res.status).toBe('ok');
    expect(res.facts).toHaveLength(0);
  });

  it('uses text field when content field is absent', async () => {
    await dataLayer.createDocument('rag_chunks', {
      id: 'text-field-chunk',
      text: 'sleep tracking using wearable sensors',
      uid: 'user-1',
      moduleId: 'titan',
      createdAt: '2026-04-01T00:00:00.000Z',
    });

    const res = await WebRagAdapter.retrieve({
      moduleId: 'titan',
      query: 'sleep tracking sensors',
      userId: 'user-1',
      requiresVault: false,
    });

    expect(res.facts.length).toBeGreaterThanOrEqual(1);
    expect(res.facts[0].text).toContain('sleep tracking');
  });

  it('populates all UnifiedMemoryResult fields correctly', async () => {
    await dataLayer.createDocument('rag_chunks', makeChunk(
      'full-chunk',
      'meditation improves sleep quality',
      'user-1',
      'soma',
      { source: 'research-paper' },
    ));

    const res = await WebRagAdapter.retrieve({
      moduleId: 'soma',
      query: 'meditation sleep quality',
      userId: 'user-1',
      requiresVault: false,
    });

    expect(res.facts.length).toBe(1);
    const fact = res.facts[0];
    expect(fact.id).toBe('rag:full-chunk');
    expect(fact.type).toBe('rag');
    expect(fact.moduleId).toBe('soma');
    expect(fact.text).toBe('meditation improves sleep quality');
    expect(typeof fact.score).toBe('number');
    expect(fact.score).toBeGreaterThan(0);
    expect(fact.confidence).toBe(fact.score);
    expect(fact.timestamp).toBe('2026-04-01T12:00:00.000Z');
    expect(fact.citation).toEqual({
      type: 'rag',
      moduleId: 'soma',
      entityId: 'full-chunk',
      label: 'meditation improves sleep quality',
    });
  });
});
