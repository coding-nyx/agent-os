import { EpisodicMemoryService } from './episodic-memory-service';
import { SemanticMemoryService } from './semantic-memory-service';
import { ModuleMemoryEnvelope, SemanticFact, Message } from '../types';

export class MemoryOrchestrator {
  static async retrieveContext(
    userId: string,
    moduleId: string,
    memoryQuery: string,
    cachedEnvelopes: ModuleMemoryEnvelope[],
    episodicReady: boolean,
    semanticReady: boolean,
    cachedFacts: SemanticFact[]
  ): Promise<{ recalledSessionsSummary: string; recalledFactsSummary: string }> {
    const relevantModuleIds = Array.from(new Set([moduleId, 'orchestrator']));

    const episodicPromise =
      cachedEnvelopes.length > 0 && episodicReady
        ? EpisodicMemoryService.retrieveRelevantFromEnvelopes(memoryQuery, cachedEnvelopes, {
            moduleIds: relevantModuleIds,
            topK: 5,
            recencyWeight: 0.3
          })
        : EpisodicMemoryService.retrieveRelevant(userId, memoryQuery, {
            moduleIds: relevantModuleIds,
            topK: 5,
            recencyWeight: 0.3
          });

    const semanticPromise = semanticReady
      ? Promise.resolve(
          cachedFacts
            .filter((fact) => relevantModuleIds.includes(fact.moduleId))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10)
        )
      : SemanticMemoryService.getFacts(userId, relevantModuleIds);

    const [sessions, facts] = await Promise.all([episodicPromise, semanticPromise]);

    const recalledSessionsSummary = sessions
      .map((session) => `- [${new Date(session.sessionDate).toLocaleDateString()}][${session.moduleId}] ${session.summary}`)
      .join('\n');

    const recalledFactsSummary = facts
      .slice(0, 5)
      .map((fact) => `- ${fact.fact} (confidence ${fact.confidence.toFixed(2)})`)
      .join('\n');

    return { recalledSessionsSummary, recalledFactsSummary };
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
