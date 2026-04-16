import type { RagAdapter, RagRetrieveOptions, RagRetrieveResult } from '../rag-adapter';
import type { UnifiedMemoryResult } from '@/lib/types';
import { getAraDataLayer } from '@/lib/data-layer/provider';
import { cosineSimilarity, computeKeywordScore, EmbeddingService } from '@/lib/services/embedding-service';

/** Maximum chunks to fetch from Firestore per query. */
const FIRESTORE_FETCH_LIMIT = 200;
/** Default number of top results to return. */
const DEFAULT_TOP_K = 6;
/** Minimum combined score to include a result. */
const MIN_SCORE_THRESHOLD = 0.15;
/** Weight given to semantic similarity vs keyword score when both available. */
const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

interface RagChunkDocument {
  content?: string;
  text?: string;
  uid?: string;
  moduleId?: string;
  source?: string;
  embedding?: number[];
  metadata?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Scores a RAG chunk against the query using a hybrid strategy:
 * 1. Semantic similarity (cosine) when both query and chunk embeddings are available
 * 2. BM25-inspired keyword score as fallback / supplement
 */
function scoreChunk(
  chunkText: string,
  chunkEmbedding: number[] | undefined,
  queryEmbedding: number[],
  queryText: string,
): number {
  const hasChunkEmbedding = chunkEmbedding && chunkEmbedding.length > 0;

  const semanticScore = hasChunkEmbedding
    ? cosineSimilarity(queryEmbedding, chunkEmbedding)
    : 0;

  const keywordScore = computeKeywordScore(chunkText, queryText);

  if (hasChunkEmbedding) {
    // Hybrid: weighted combination of semantic + keyword
    return semanticScore * SEMANTIC_WEIGHT + keywordScore * KEYWORD_WEIGHT;
  }

  // Keyword-only fallback
  return keywordScore;
}

function toUnifiedMemoryResult(
  chunk: RagChunkDocument & { id: string },
  moduleId: string,
  score: number,
): UnifiedMemoryResult {
  const text = chunk.content || chunk.text || '';
  const resolvedModuleId = chunk.moduleId || moduleId;
  const timestamp = chunk.updatedAt || chunk.createdAt || new Date().toISOString();

  return {
    id: `rag:${chunk.id}`,
    type: 'rag',
    moduleId: resolvedModuleId,
    text,
    score,
    confidence: score,
    timestamp,
    citation: {
      type: 'rag',
      moduleId: resolvedModuleId,
      entityId: chunk.id,
      label: text.length > 120 ? text.slice(0, 117) + '...' : text,
    },
  };
}

/**
 * Web adapter for vault-safe retrieval.
 * Queries the `rag_chunks` Firestore collection with hybrid semantic + keyword scoring.
 */
export const WebRagAdapter: RagAdapter = {
  id: 'web-vault-safe',
  runtime: 'web',
  async retrieve({ moduleId, query, userId, encryptionKey, requiresVault, topK }: RagRetrieveOptions): Promise<RagRetrieveResult> {
    if (!query.trim()) return { facts: [], status: 'ok' };

    if (requiresVault && !encryptionKey) {
      console.warn(`[RagService] Retrieval blocked: ${moduleId} requires vault key.`);
      return { facts: [], status: 'vault_blocked' };
    }

    if (!userId) {
      console.warn('[RagService] No userId provided — cannot query rag_chunks.');
      return { facts: [], status: 'ok' };
    }

    const resultLimit = topK ?? DEFAULT_TOP_K;

    try {
      const dataLayer = getAraDataLayer();

      // Build query filters: always filter by uid, optionally by moduleId
      const whereFilters: { field: string; op: '==' | 'in'; value: unknown }[] = [
        { field: 'uid', op: '==', value: userId },
      ];
      if (moduleId && moduleId !== 'ara') {
        // 'ara' is the orchestrator — search all modules for it
        whereFilters.push({ field: 'moduleId', op: '==', value: moduleId });
      }

      const chunks = await dataLayer.query<RagChunkDocument>({
        collection: 'rag_chunks',
        where: whereFilters,
        limit: FIRESTORE_FETCH_LIMIT,
      });

      if (chunks.length === 0) return { facts: [], status: 'ok' };

      // Embed the query for semantic comparison
      const queryEmbedding = await EmbeddingService.embed(query);

      // Score and rank all chunks
      const scored = chunks
        .map((chunk) => {
          const text = chunk.content || chunk.text || '';
          if (!text) return null;
          const score = scoreChunk(text, chunk.embedding, queryEmbedding, query);
          return { chunk, score };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.score >= MIN_SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, resultLimit);

      const facts: UnifiedMemoryResult[] = scored.map(({ chunk, score }) =>
        toUnifiedMemoryResult(chunk, moduleId, score),
      );

      return { facts, status: 'ok' };
    } catch (error) {
      console.error('[RagService] WebRagAdapter retrieval failed:', error);
      // Graceful degradation — return empty rather than crashing the memory pipeline
      return { facts: [], status: 'ok' };
    }
  }
};
