import { EpisodicMemoryService } from './episodic-memory-service';
import { SemanticMemoryService } from './semantic-memory-service';
import { ModuleMemoryEnvelope, SemanticFact, Message, UnifiedMemoryResult } from '../types';
import { RagService } from './rag/rag-service';

/**
 * Removes near-duplicate results where two entries share >60% word overlap.
 * Results must be pre-sorted by score descending — the higher-scored entry wins.
 */
function deduplicateMemoryResults(results: UnifiedMemoryResult[]): UnifiedMemoryResult[] {
  const seenTexts: string[] = [];
  return results.filter((result) => {
    const words = new Set(result.text.toLowerCase().split(/\s+/).filter(Boolean));
    const isDuplicate = seenTexts.some((prev) => {
      const prevWords = new Set(prev.toLowerCase().split(/\s+/).filter(Boolean));
      const overlap = [...words].filter((w) => prevWords.has(w)).length;
      return overlap / Math.max(words.size, prevWords.size) > 0.6;
    });
    if (!isDuplicate) seenTexts.push(result.text);
    return !isDuplicate;
  });
}

export class MemoryOrchestrator {
  static summarizeUnifiedResults(results: UnifiedMemoryResult[]): {
    recalledSessionsSummary: string;
    recalledFactsSummary: string;
  } {
    const recalledSessionsSummary = results
      .filter((result) => result.type === 'episodic')
      .map((result) => `- [${new Date(result.timestamp).toLocaleDateString()}][${result.moduleId}] ${result.text}`)
      .join('\n');

    const recalledFactsSummary = results
      .filter((result) => result.type !== 'episodic')
      .map((result) => {
        const prefix = result.type === 'rag' ? '[RAG] ' : '';
        const scoreText = typeof result.confidence === 'number' ? ` (confidence ${result.confidence.toFixed(2)})` : '';
        return `- ${prefix}${result.text}${scoreText}`;
      })
      .join('\n');

    return { recalledSessionsSummary, recalledFactsSummary };
  }

  static async retrieveUnifiedContext(
    userId: string,
    moduleId: string,
    memoryQuery: string,
    cachedEnvelopes: ModuleMemoryEnvelope[],
    episodicReady: boolean,
    semanticReady: boolean,
    cachedFacts: SemanticFact[],
    options: { requiresVault: boolean; encryptionKey?: CryptoKey | null }
  ): Promise<{
    results: UnifiedMemoryResult[];
    recalledSessionsSummary: string;
    recalledFactsSummary: string;
    status: 'ok' | 'vault_blocked';
  }> {
    const relevantModuleIds = Array.from(new Set([moduleId, 'nexus']));

    const episodicPromise =
      cachedEnvelopes.length > 0 && episodicReady
        ? EpisodicMemoryService.retrieveRelevantUnifiedFromEnvelopes(memoryQuery, cachedEnvelopes, {
            moduleIds: relevantModuleIds,
            topK: 5,
            recencyWeight: 0.3,
            minScore: 0.35,
          })
        : EpisodicMemoryService.retrieveRelevantUnified(userId, memoryQuery, {
            moduleIds: relevantModuleIds,
            topK: 5,
            recencyWeight: 0.3,
            minScore: 0.35,
          });

    const semanticPromise = semanticReady
      ? Promise.resolve(SemanticMemoryService.getFactsUnifiedFromFacts(cachedFacts, relevantModuleIds))
      : SemanticMemoryService.getFactsUnified(userId, relevantModuleIds);

    const [sessions, facts, ragResult] = await Promise.all([
      episodicPromise,
      semanticPromise,
      RagService.retrieve({
        moduleId,
        query: memoryQuery,
        encryptionKey: options.encryptionKey,
        requiresVault: options.requiresVault,
      }),
    ]);

    const merged = [...sessions, ...facts.slice(0, 5), ...ragResult.facts].sort((left, right) => right.score - left.score);
    const results = deduplicateMemoryResults(merged);
    const summaries = this.summarizeUnifiedResults(results);

    return {
      results,
      recalledSessionsSummary: summaries.recalledSessionsSummary,
      recalledFactsSummary: summaries.recalledFactsSummary,
      status: ragResult.status,
    };
  }

  static async retrieveContext(
    userId: string,
    moduleId: string,
    memoryQuery: string,
    cachedEnvelopes: ModuleMemoryEnvelope[],
    episodicReady: boolean,
    semanticReady: boolean,
    cachedFacts: SemanticFact[],
    options: { requiresVault: boolean; encryptionKey?: CryptoKey | null }
  ): Promise<{ recalledSessionsSummary: string; recalledFactsSummary: string; status: 'ok' | 'vault_blocked' }> {
    const result = await this.retrieveUnifiedContext(
      userId,
      moduleId,
      memoryQuery,
      cachedEnvelopes,
      episodicReady,
      semanticReady,
      cachedFacts,
      options,
    );
    return {
      recalledSessionsSummary: result.recalledSessionsSummary,
      recalledFactsSummary: result.recalledFactsSummary,
      status: result.status,
    };
  }

  static parseInsightLines(raw: string): { summary: string; insights: string[] } {
    const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]*?)(?:\nINSIGHTS:|$)/i);
    const insightsMatch = raw.match(/INSIGHTS:\s*([\s\S]*)/i);

    const summary = summaryMatch ? summaryMatch[1].trim() : raw.trim();
    const insights = insightsMatch
      ? insightsMatch[1]
          .split('\n')
          .map((line) => line.replace(/^-+\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];

    return { summary, insights };
  }
}
