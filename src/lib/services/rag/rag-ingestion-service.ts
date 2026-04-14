import { RagChunkingServiceJs } from '@cortex-logic';
import { EmbeddingService } from '@/lib/services/embedding-service';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { BatchOperation } from '@/lib/data-layer';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TextChunk {
  index: number;
  text: string;
  startChar: number;
  endChar: number;
}

export interface RagIngestionOptions {
  /** Firestore UID of the document owner. */
  userId: string;
  /** Module that produced the document (e.g. 'soma', 'ledger', 'scout'). */
  moduleId: string;
  /** Original filename or title for metadata. */
  source: string;
  /** Maximum concurrent embedding requests. */
  concurrency?: number;
}

export interface RagIngestionResult {
  /** Number of chunks written to Firestore. */
  chunksWritten: number;
  /** Chunk IDs created in `rag_chunks`. */
  chunkIds: string[];
}

// ── Lazy singleton chunker (avoids eager instantiation in test environments) ──

let _chunker: InstanceType<NonNullable<typeof RagChunkingServiceJs>> | null = null;
function getChunker(): { chunkText: (text: string, chunkSize?: number, chunkOverlap?: number, minChunkSize?: number) => string } | null {
  if (!_chunker && RagChunkingServiceJs) {
    _chunker = new RagChunkingServiceJs() as any;
  }
  return _chunker as any;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateChunkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Run async tasks with bounded concurrency.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Service ────────────────────────────────────────────────────────────────────

/**
 * RAG ingestion pipeline: chunk text (KMP) → embed chunks → batch-write to Firestore.
 *
 * This is the **write side** of the RAG system. The read side lives in
 * `WebRagAdapter` which queries `rag_chunks` with hybrid scoring.
 *
 * All computation (chunking) is delegated to KMP `RagChunkingService`.
 * This service handles I/O only: embedding API calls + Firestore writes.
 *
 * TODO-LATER: Semantic chunking, re-ranking, deduplication against existing chunks.
 */
export const RagIngestionService = {
  /**
   * Ingest raw document text into the `rag_chunks` Firestore collection.
   *
   * @param text    The full parsed document text.
   * @param options Ingestion options (userId, moduleId, source).
   * @returns       Result with chunk count and IDs. Returns `{ chunksWritten: 0 }` on failure.
   */
  async ingest(text: string, options: RagIngestionOptions): Promise<RagIngestionResult> {
    const { userId, moduleId, source, concurrency = 3 } = options;

    if (!text.trim() || !userId) {
      return { chunksWritten: 0, chunkIds: [] };
    }

    try {
      // 1. Chunk text using KMP
      const chunker = getChunker();
      if (!chunker) {
        console.warn('[RagIngestion] RagChunkingServiceJs not available — skipping ingestion');
        return { chunksWritten: 0, chunkIds: [] };
      }
      const chunksJson = chunker.chunkText(text);
      const chunks: TextChunk[] = JSON.parse(chunksJson);

      if (chunks.length === 0) {
        return { chunksWritten: 0, chunkIds: [] };
      }

      // 2. Generate embeddings with bounded concurrency
      const embeddings = await mapWithConcurrency(chunks, concurrency, (chunk) =>
        EmbeddingService.embed(chunk.text),
      );

      // 3. Build batch write operations
      const now = new Date().toISOString();
      const chunkIds: string[] = [];
      const ops: BatchOperation[] = chunks.map((chunk, i) => {
        const id = generateChunkId();
        chunkIds.push(id);
        return {
          type: 'set' as const,
          collection: 'rag_chunks',
          id,
          data: {
            id,
            uid: userId,
            moduleId,
            content: chunk.text,
            embedding: embeddings[i],
            source,
            metadata: {
              chunkIndex: String(chunk.index),
              startChar: String(chunk.startChar),
              endChar: String(chunk.endChar),
              totalChunks: String(chunks.length),
            },
            createdAt: now,
            updatedAt: now,
          },
        };
      });

      // 4. Write to Firestore in a single batch
      const dataLayer = getNexusDataLayer();
      await dataLayer.batchWrite(ops);

      console.info(
        `[RagIngestion] Ingested ${chunks.length} chunks for "${source}" (module: ${moduleId}, uid: ${userId.slice(0, 8)}...)`,
      );

      return { chunksWritten: chunks.length, chunkIds };
    } catch (error) {
      console.error('[RagIngestion] Ingestion failed:', error);
      // Graceful degradation — don't break the document upload flow
      return { chunksWritten: 0, chunkIds: [] };
    }
  },

  /**
   * Remove all RAG chunks for a given source document.
   * Useful when a document is re-uploaded or deleted.
   */
  async deleteBySource(userId: string, source: string): Promise<void> {
    try {
      const dataLayer = getNexusDataLayer();
      const existing = await dataLayer.query<{ uid: string; source: string }>({
        collection: 'rag_chunks',
        where: [
          { field: 'uid', op: '==', value: userId },
          { field: 'source', op: '==', value: source },
        ],
        limit: 500,
      });

      if (existing.length === 0) return;

      const ops: BatchOperation[] = existing.map((doc) => ({
        type: 'delete' as const,
        collection: 'rag_chunks',
        id: doc.id,
      }));

      await dataLayer.batchWrite(ops);
      console.info(`[RagIngestion] Deleted ${existing.length} chunks for source "${source}"`);
    } catch (error) {
      console.error('[RagIngestion] deleteBySource failed:', error);
    }
  },
};
