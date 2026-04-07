/**
 * scout-web-search-service.ts
 *
 * Wraps WebCrawlerService with auto-indexing: search results are automatically
 * saved as `pending` knowledge nodes so the local knowledge base grows over time.
 *
 * Scout is now focused purely on research and does not react to other module states
 * to maintain its mission as an independent, aggressive research tool.
 *
 * Falls back gracefully when no userId/encryptionKey is provided (guest mode).
 */

import {
  WebCrawlerService,
  type WebCrawlerResult as ScoutWebResult,
  type WebCrawlerResponse as ScoutWebSearchResponse,
} from '@/lib/services/web-crawler-service';
import { addKnowledgeNode } from './scout-knowledge-service';
import { NexusLogger } from '@/lib/nexus-logger';

export type { ScoutWebResult, ScoutWebSearchResponse };

interface SearchAndIndexOptions {
  maxResults?: number;
  includeImages?: boolean;
  /** If provided, top results are auto-saved as pending knowledge nodes. */
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
  /** Max nodes to auto-index from results (default: 3) */
  autoIndexLimit?: number;
}

export const ScoutWebSearchService = {
  /**
   * Performs a web search. When userId + encryptionKey are provided, the top
   * results are automatically indexed as `pending` knowledge nodes so subsequent
   * RAG queries benefit from fresh web data without re-searching.
   */
  async search(
    query: string,
    options: SearchAndIndexOptions = {},
  ): Promise<ScoutWebSearchResponse> {
    const response = await WebCrawlerService.search(query, {
      maxResults: options.maxResults,
      includeImages: options.includeImages,
    });

    if (options.userId && options.encryptionKey && response.results.length > 0) {
      const indexLimit = options.autoIndexLimit ?? 3;
      const context = { userId: options.userId, encryptionKey: options.encryptionKey };

      const nodesToIndex = response.results
        .slice(0, indexLimit)
        .filter((r): r is ScoutWebResult & { content: string } => Boolean(r.content));

      // Fire-and-forget — don't block returning the search response.
      // We no longer emit SCOUT_KNOWLEDGE_ENRICHED during auto-indexing to avoid notification spam
      // and keep the "aggressive" background work silent and efficient.
      Promise.allSettled(
        nodesToIndex.map((result) =>
          addKnowledgeNode(
            {
              claim: result.content.slice(0, 500),
              confidence: typeof result.score === 'number' ? Math.min(result.score, 0.85) : 0.5,
              evidence: [],
              status: 'pending',
              source: result.url,
              sources: [result.url],
            },
            context,
          )
        ),
      ).catch((e) => { NexusLogger.warn('ScoutWebSearch', 'Batch indexing failed', e); });
    }

    return response;
  },

  /** Pass-through for batch searches (no auto-indexing). */
  searchBatch: WebCrawlerService.searchBatch.bind(WebCrawlerService),
};
