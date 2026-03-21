/**
 * scout-query-service.ts
 * 
 * Implements Retrieval-Augmented Generation (RAG) over the local Scout research library.
 * Allows users to ask questions like "What does my library say about X?"
 */

import { EmbeddingService, cosineSimilarity } from '@/lib/services/embedding-service';
import { loadKnowledgeNodes, queryKnowledgeNodes } from './scout-knowledge-service';
import { loadSources } from './scout-sources-service';
import { generateJSONWithAgent } from '@/lib/ai-adapters/json-generation-agent';
import type { ScoutKnowledgeNode, SourceEntry } from '../types';

interface QueryResult {
  answer: string;
  supportingNodes: ScoutKnowledgeNode[];
  supportingSources: SourceEntry[];
  confidence: number;
}

export const ScoutQueryService = {
  /**
   * Performs a RAG query over the local knowledge base.
   */
  async queryLibrary(
    query: string,
    { userId, encryptionKey }: { userId?: string | null; encryptionKey?: CryptoKey | null }
  ): Promise<QueryResult | null> {
    if (!userId || !encryptionKey) return null;

    // 1. Retrieve relevant findings via semantic search
    const relevantNodes = await queryKnowledgeNodes(query, { userId, encryptionKey }, { limit: 5, threshold: 0.65 });
    
    // 2. Retrieve all sources to map back from nodes
    const allSources = await loadSources({ userId, encryptionKey });
    
    // 3. Collect unique source IDs from relevant nodes
    const sourceIds = new Set<string>();
    relevantNodes.forEach(node => {
      (node.evidence || []).forEach(id => sourceIds.add(id));
    });
    
    const relevantSources = allSources.filter(s => sourceIds.has(s.id));

    // 4. Build context for LLM
    const findingsContext = relevantNodes
      .map((n, i) => `Finding ${i+1}: ${n.claim} (Confidence: ${Math.round(n.similarity * 100)}%)`)
      .join('\n');
      
    const sourcesContext = relevantSources
      .map((s, i) => `Source ${i+1} [${s.domain}]: ${s.title} - ${s.snippet}`)
      .join('\n');

    const prompt = `You are a research assistant answering a question based ONLY on the provided local research library context.
    
Question: "${query}"

## Local Research Findings
${findingsContext || 'No specific findings found in the library for this query.'}

## Supporting Evidence Sources
${sourcesContext || 'No supporting sources available.'}

Instructions:
1. Synthesize an answer based on the findings and sources.
2. If the library doesn't contain enough information, state that clearly.
3. Be objective and cite the "Findings" or "Sources" in your answer.
4. Respond with a JSON object: {"answer": "...", "confidence": 0.0-1.0}`;

    try {
      const openrouterKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('VITE_OPENROUTER_API_KEY') : null) || (import.meta.env.VITE_OPENROUTER_API_KEY as string);
      const response = await generateJSONWithAgent<any>({
        prompt,
        openrouterKey,
        systemPrompt: 'You are a professional research analyst. Answer based on local context.',
        temperature: 0.3,
      });

      return {
        answer: response.answer || 'I could not synthesize an answer from your library.',
        confidence: response.confidence || 0.5,
        supportingNodes: relevantNodes,
        supportingSources: relevantSources
      };
    } catch (err) {
      console.error('[ScoutQueryService] RAG query failed:', err);
      return null;
    }
  }
};
