/**
 * scout-query-service.ts
 *
 * Implements Retrieval-Augmented Generation (RAG) over the local Scout research library.
 * Allows users to ask questions like "What does my library say about X?"
 *
 * Confidence gate: if local RAG confidence is below LOW_CONFIDENCE_THRESHOLD,
 * a web search is triggered automatically and the top results are auto-indexed
 * into the knowledge base for future queries.
 */

import { loadKnowledgeNodes, queryKnowledgeNodes } from './scout-knowledge-service';
import { loadSources } from './scout-sources-service';
import { ScoutWebSearchService } from './scout-web-search-service';
import { generateJSONWithAgent } from '@/lib/ai-adapters/json-generation-agent';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';
import { isSearchAvailable } from './scout-news-service';
import type { ScoutKnowledgeNode, SourceEntry } from '../types';

/** When local RAG average similarity drops below this threshold, fall back to web search. */
const LOW_CONFIDENCE_THRESHOLD = 0.55;

interface QueryResult {
  answer: string;
  supportingNodes: ScoutKnowledgeNode[];
  supportingSources: SourceEntry[];
  confidence: number;
  /** True when the answer was enriched with a live web search. */
  webEnriched?: boolean;
}

export const ScoutQueryService = {
  /**
   * Performs a RAG query over the local knowledge base.
   * If the local library has insufficient coverage (confidence < 0.55), a web
   * search is triggered automatically and results are indexed for future use.
   */
  async queryLibrary(
    query: string,
    { userId, encryptionKey }: { userId?: string | null; encryptionKey?: CryptoKey | null }
  ): Promise<QueryResult | null> {
    if (!userId || !encryptionKey) return null;

    // 1. Retrieve relevant findings via semantic search (hybrid BM25 + semantic)
    const relevantNodes = await queryKnowledgeNodes(query, { userId, encryptionKey }, { limit: 5, threshold: 0.55 });

    // 2. Compute average local confidence to decide whether to enrich via web
    const avgLocalConfidence = relevantNodes.length > 0
      ? relevantNodes.reduce((sum, n) => sum + n.similarity, 0) / relevantNodes.length
      : 0;

    let webResults: { title: string; url: string; snippet: string }[] = [];
    let webEnriched = false;

    if (avgLocalConfidence < LOW_CONFIDENCE_THRESHOLD && isSearchAvailable()) {
      try {
        const searchResponse = await ScoutWebSearchService.search(query, {
          maxResults: 5,
          userId,
          encryptionKey,
          autoIndexLimit: 3,
        });
        webResults = searchResponse.results
          .filter(r => r.content)
          .map(r => ({ title: r.title, url: r.url, snippet: (r.content ?? '').slice(0, 280) }));
        webEnriched = webResults.length > 0;
      } catch (err) {
        console.warn('[ScoutQueryService] Web search fallback failed:', err);
      }
    }

    // 3. Retrieve all sources to map back from nodes
    const allSources = await loadSources({ userId, encryptionKey });

    // 4. Collect unique source IDs from relevant nodes
    const sourceIds = new Set<string>();
    relevantNodes.forEach(node => {
      (node.evidence || []).forEach(id => sourceIds.add(id));
    });
    const relevantSources = allSources.filter(s => sourceIds.has(s.id));

    // 5. Build context for LLM
    const findingsContext = relevantNodes
      .map((n, i) => `Finding ${i + 1}: ${n.claim} (Confidence: ${Math.round(n.similarity * 100)}%)`)
      .join('\n');

    const sourcesContext = relevantSources
      .map((s, i) => `Source ${i + 1} [${s.domain}]: ${s.title} - ${s.snippet}`)
      .join('\n');

    const webContext = webResults.length > 0
      ? '\n\n## Live Web Search Results\n' +
        webResults.map((r, i) => `Web ${i + 1} [${new URL(r.url).hostname}]: ${r.title} — ${r.snippet}`).join('\n')
      : '';

    const prompt = `You are a research assistant answering a question based on the provided research library context.
    
Question: "${query}"

## Local Research Findings
${findingsContext || 'No specific findings found in the library for this query.'}

## Supporting Evidence Sources
${sourcesContext || 'No supporting sources available.'}${webContext}

Instructions:
1. Synthesize an answer based on the findings, sources, and web results (if any).
2. If the library doesn't contain enough information, draw on web results and state that clearly.
3. Be objective and cite the "Findings", "Sources", or "Web" in your answer.
4. Respond with a JSON object: {"answer": "...", "confidence": 0.0-1.0}`;

    try {
      const openrouterKey = resolveOpenRouterKey();
      const response = await generateJSONWithAgent<any>({
        prompt,
        openrouterKey,
        systemPrompt: 'You are a professional research analyst. Answer based on provided context.',
        temperature: 0.3,
      });

      return {
        answer: response.answer || 'I could not synthesize an answer from your library.',
        confidence: response.confidence || 0.5,
        supportingNodes: relevantNodes,
        supportingSources: relevantSources,
        webEnriched,
      };
    } catch (err) {
      console.error('[ScoutQueryService] RAG query failed:', err);
      return null;
    }
  }
};
