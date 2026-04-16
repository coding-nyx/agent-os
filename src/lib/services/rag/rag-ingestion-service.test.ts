import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';

// ── Mocks (hoisted above module-under-test import) ─────────────────────────

let dataLayer: InMemoryDataProvider;
vi.mock('@/lib/data-layer/provider', () => ({
  getAraDataLayer: () => dataLayer,
}));

vi.mock('@/lib/services/embedding-service', () => ({
  EmbeddingService: {
    embed: vi.fn(async (text: string) => {
      // Deterministic fake embedding: 4-element vector from text hash
      const hash = (s: string) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return Math.abs(h);
      };
      const h = hash(text);
      return [
        (h % 100) / 100,
        ((h >> 8) % 100) / 100,
        ((h >> 16) % 100) / 100,
        ((h >> 24) % 100) / 100,
      ];
    }),
  },
}));

import { RagIngestionService } from './rag-ingestion-service';
import { EmbeddingService } from '@/lib/services/embedding-service';

// ── Helpers ─────────────────────────────────────────────────────────────────

const USER_ID = 'user-test-abc123';
const MODULE_ID = 'scout';
const SOURCE = 'test-report.pdf';

function makeDefaultOptions(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    moduleId: MODULE_ID,
    source: SOURCE,
    ...overrides,
  };
}

/** Generate text of approximately n characters with sentence boundaries. */
function generateText(charCount: number): string {
  const sentence = 'The quick brown fox jumps over the lazy dog. ';
  const repeats = Math.ceil(charCount / sentence.length);
  return sentence.repeat(repeats).slice(0, charCount);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RagIngestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataLayer = new InMemoryDataProvider();
  });

  // ── ingest() ────────────────────────────────────────────────────────────

  describe('ingest', () => {
    it('returns zero chunks for empty text', async () => {
      const result = await RagIngestionService.ingest('', makeDefaultOptions());
      expect(result.chunksWritten).toBe(0);
      expect(result.chunkIds).toHaveLength(0);
    });

    it('returns zero chunks for whitespace-only text', async () => {
      const result = await RagIngestionService.ingest('   \n\t  ', makeDefaultOptions());
      expect(result.chunksWritten).toBe(0);
      expect(result.chunkIds).toHaveLength(0);
    });

    it('returns zero chunks when userId is empty', async () => {
      const result = await RagIngestionService.ingest('Some real text.', makeDefaultOptions({ userId: '' }));
      expect(result.chunksWritten).toBe(0);
      expect(result.chunkIds).toHaveLength(0);
    });

    it('ingests short text as a single chunk', async () => {
      const text = 'This is a short document about wellness tracking.';
      const result = await RagIngestionService.ingest(text, makeDefaultOptions());

      expect(result.chunksWritten).toBe(1);
      expect(result.chunkIds).toHaveLength(1);

      // Verify the chunk was written to Firestore
      const stored = await dataLayer.query<{
        content: string; uid: string; moduleId: string; source: string; embedding: number[];
      }>({
        collection: 'rag_chunks',
        where: [{ field: 'uid', op: '==', value: USER_ID }],
        limit: 10,
      });
      expect(stored).toHaveLength(1);
      expect(stored[0].content).toBe(text);
      expect(stored[0].uid).toBe(USER_ID);
      expect(stored[0].moduleId).toBe(MODULE_ID);
      expect(stored[0].source).toBe(SOURCE);
      expect(stored[0].embedding).toBeDefined();
      expect(Array.isArray(stored[0].embedding)).toBe(true);
    });

    it('ingests long text as multiple chunks', async () => {
      // Generate text longer than default chunkSize (2000 chars)
      const text = generateText(5000);
      const result = await RagIngestionService.ingest(text, makeDefaultOptions());

      expect(result.chunksWritten).toBeGreaterThan(1);
      expect(result.chunkIds).toHaveLength(result.chunksWritten);

      // Verify all chunks were written to Firestore
      const stored = await dataLayer.query({
        collection: 'rag_chunks',
        where: [{ field: 'uid', op: '==', value: USER_ID }],
        limit: 50,
      });
      expect(stored).toHaveLength(result.chunksWritten);
    });

    it('calls EmbeddingService.embed for each chunk', async () => {
      const text = 'Short text for embedding test.';
      await RagIngestionService.ingest(text, makeDefaultOptions());

      expect(EmbeddingService.embed).toHaveBeenCalledTimes(1);
      expect(EmbeddingService.embed).toHaveBeenCalledWith(text);
    });

    it('stores correct metadata on each chunk', async () => {
      const text = 'A single chunk of text for metadata verification.';
      const result = await RagIngestionService.ingest(text, makeDefaultOptions());

      const stored = await dataLayer.query<{
        id: string; metadata: Record<string, string>; createdAt: string; updatedAt: string;
      }>({
        collection: 'rag_chunks',
        where: [{ field: 'uid', op: '==', value: USER_ID }],
        limit: 10,
      });
      expect(stored).toHaveLength(1);

      const chunk = stored[0];
      expect(chunk.metadata).toBeDefined();
      expect(chunk.metadata.chunkIndex).toBe('0');
      expect(chunk.metadata.startChar).toBeDefined();
      expect(chunk.metadata.endChar).toBeDefined();
      expect(chunk.metadata.totalChunks).toBe('1');
      expect(chunk.createdAt).toBeDefined();
      expect(chunk.updatedAt).toBeDefined();
      // ID should be consistent
      expect(chunk.id).toBe(result.chunkIds[0]);
    });

    it('uses batchWrite for Firestore persistence', async () => {
      const batchSpy = vi.spyOn(dataLayer, 'batchWrite');
      const text = generateText(5000);

      await RagIngestionService.ingest(text, makeDefaultOptions());

      expect(batchSpy).toHaveBeenCalledTimes(1);
      const ops = batchSpy.mock.calls[0][0];
      expect(ops.length).toBeGreaterThan(1);
      expect(ops[0].type).toBe('set');
      expect(ops[0].collection).toBe('rag_chunks');
    });

    it('generates unique chunk IDs', async () => {
      const text = generateText(5000);
      const result = await RagIngestionService.ingest(text, makeDefaultOptions());

      const idSet = new Set(result.chunkIds);
      expect(idSet.size).toBe(result.chunkIds.length);
    });

    it('gracefully degrades on embedding failure', async () => {
      (EmbeddingService.embed as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Embedding API timeout'),
      );
      const text = 'Text that will fail to embed.';
      const result = await RagIngestionService.ingest(text, makeDefaultOptions());

      // Should return zero — graceful failure, not throw
      expect(result.chunksWritten).toBe(0);
      expect(result.chunkIds).toHaveLength(0);
    });

    it('gracefully degrades on batchWrite failure', async () => {
      vi.spyOn(dataLayer, 'batchWrite').mockRejectedValueOnce(
        new Error('Firestore unavailable'),
      );
      const text = 'Text that will fail to write.';
      const result = await RagIngestionService.ingest(text, makeDefaultOptions());

      expect(result.chunksWritten).toBe(0);
      expect(result.chunkIds).toHaveLength(0);
    });

    it('respects custom concurrency option', async () => {
      const text = generateText(5000);
      const embedCalls: number[] = [];
      let concurrent = 0;
      let maxConcurrent = 0;

      (EmbeddingService.embed as ReturnType<typeof vi.fn>).mockImplementation(async (t: string) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        embedCalls.push(concurrent);
        // Simulate some async delay
        await new Promise((r) => setTimeout(r, 5));
        concurrent--;
        const h = t.length;
        return [h % 1, (h >> 8) % 1, 0, 0];
      });

      await RagIngestionService.ingest(text, makeDefaultOptions({ concurrency: 2 }));

      // Max concurrency should not exceed the limit of 2
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  // ── deleteBySource() ──────────────────────────────────────────────────────

  describe('deleteBySource', () => {
    it('deletes all chunks matching userId + source', async () => {
      // Seed some chunks
      const chunkData = (id: string) => ({
        id,
        uid: USER_ID,
        moduleId: MODULE_ID,
        content: `chunk ${id}`,
        source: SOURCE,
        embedding: [0.1, 0.2],
        metadata: {},
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      });

      await dataLayer.createDocument('rag_chunks', chunkData('c1'));
      await dataLayer.createDocument('rag_chunks', chunkData('c2'));
      await dataLayer.createDocument('rag_chunks', chunkData('c3'));

      await RagIngestionService.deleteBySource(USER_ID, SOURCE);

      const remaining = await dataLayer.query({
        collection: 'rag_chunks',
        where: [
          { field: 'uid', op: '==', value: USER_ID },
          { field: 'source', op: '==', value: SOURCE },
        ],
        limit: 100,
      });
      expect(remaining).toHaveLength(0);
    });

    it('does not delete chunks belonging to other sources', async () => {
      await dataLayer.createDocument('rag_chunks', {
        id: 'c1',
        uid: USER_ID,
        moduleId: MODULE_ID,
        content: 'keep me',
        source: 'other-document.pdf',
        embedding: [0.1],
        metadata: {},
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      });
      await dataLayer.createDocument('rag_chunks', {
        id: 'c2',
        uid: USER_ID,
        moduleId: MODULE_ID,
        content: 'delete me',
        source: SOURCE,
        embedding: [0.2],
        metadata: {},
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      });

      await RagIngestionService.deleteBySource(USER_ID, SOURCE);

      const remaining = await dataLayer.query<{ source: string }>({
        collection: 'rag_chunks',
        where: [{ field: 'uid', op: '==', value: USER_ID }],
        limit: 100,
      });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].source).toBe('other-document.pdf');
    });

    it('does not delete chunks belonging to other users', async () => {
      await dataLayer.createDocument('rag_chunks', {
        id: 'c1',
        uid: 'other-user',
        moduleId: MODULE_ID,
        content: 'other user chunk',
        source: SOURCE,
        embedding: [0.1],
        metadata: {},
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      });

      await RagIngestionService.deleteBySource(USER_ID, SOURCE);

      const remaining = await dataLayer.query({
        collection: 'rag_chunks',
        where: [{ field: 'uid', op: '==', value: 'other-user' }],
        limit: 100,
      });
      expect(remaining).toHaveLength(1);
    });

    it('is a no-op when no matching chunks exist', async () => {
      const batchSpy = vi.spyOn(dataLayer, 'batchWrite');
      await RagIngestionService.deleteBySource(USER_ID, 'nonexistent.pdf');

      // batchWrite should NOT be called since there's nothing to delete
      expect(batchSpy).not.toHaveBeenCalled();
    });

    it('gracefully degrades on query failure', async () => {
      vi.spyOn(dataLayer, 'query').mockRejectedValueOnce(new Error('Firestore down'));

      // Should not throw
      await expect(
        RagIngestionService.deleteBySource(USER_ID, SOURCE),
      ).resolves.toBeUndefined();
    });
  });
});
