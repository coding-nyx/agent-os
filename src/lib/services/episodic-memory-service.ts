import { getAraDataLayer } from '@/lib/data-layer/provider';
import {
  MemorySearchOptions,
  ModuleMemoryEnvelope,
  RetrievedMemory,
  SessionEventSummary,
  UnifiedMemoryResult,
} from '@/lib/types';
import { cosineSimilarity, EmbeddingService } from './embedding-service';

function scoreEvent(event: SessionEventSummary, queryEmbedding: number[], recencyWeight: number): number {
  const eventEmbedding = event.embedding || [];
  const similarity = eventEmbedding.length > 0 ? cosineSimilarity(queryEmbedding, eventEmbedding) : 0;
  const ageMs = Date.now() - new Date(event.timestamp).getTime();
  const ageDays = Math.max(ageMs / (1000 * 60 * 60 * 24), 0);
  const recencyBoost = Math.max(0, 1 - ageDays / 30);
  return similarity * (1 - recencyWeight) + recencyBoost * recencyWeight;
}

function rankEvents(
  envelopes: ModuleMemoryEnvelope[],
  queryEmbedding: number[],
  recencyWeight: number,
  topK: number,
  minScore?: number,
): RetrievedMemory[] {
  const retrievals: RetrievedMemory[] = [];

  envelopes.forEach((envelope) => {
    envelope.eventHistory.forEach((event) => {
      if (!event.summary) return;
      const score = scoreEvent(event, queryEmbedding, recencyWeight);
      if (minScore !== undefined && score < minScore) return;
      retrievals.push({
        sessionId: event.id,
        sessionDate: event.timestamp,
        summary: event.summary,
        keyInsights: event.keyInsights || [],
        score,
        moduleId: envelope.moduleId
      });
    });
  });

  return retrievals.sort((a, b) => b.score - a.score).slice(0, topK);
}

function toUnifiedMemoryResult(memory: RetrievedMemory): UnifiedMemoryResult {
  return {
    id: `episodic:${memory.moduleId}:${memory.sessionId ?? memory.sessionDate}`,
    type: 'episodic',
    moduleId: memory.moduleId,
    text: memory.summary,
    score: memory.score,
    timestamp: memory.sessionDate,
    citation: {
      type: 'episodic',
      moduleId: memory.moduleId,
      entityId: memory.sessionId,
      label: memory.summary,
    },
  };
}

export const EpisodicMemoryService = {
  async retrieveRelevant(
    uid: string,
    query: string,
    options: MemorySearchOptions
  ): Promise<RetrievedMemory[]> {
    if (!uid || !query.trim()) return [];

    const topK = options.topK ?? 5;
    const recencyWeight = options.recencyWeight ?? 0.3;
    const queryEmbedding = await EmbeddingService.embed(query);
    const dataLayer = getAraDataLayer();

    const envelopes: ModuleMemoryEnvelope[] = [];

    await Promise.all(
      options.moduleIds.map(async (moduleId) => {
        const envelope = await dataLayer.getDocument<ModuleMemoryEnvelope>('module_memory', `${uid}_${moduleId}`);
        if (!envelope) return;
        envelopes.push(envelope);
      })
    );

    return rankEvents(envelopes, queryEmbedding, recencyWeight, topK, options.minScore);
  },

  async retrieveRelevantUnified(
    uid: string,
    query: string,
    options: MemorySearchOptions,
  ): Promise<UnifiedMemoryResult[]> {
    const results = await this.retrieveRelevant(uid, query, options);
    return results.map(toUnifiedMemoryResult);
  },

  async retrieveRelevantFromEnvelopes(
    query: string,
    envelopes: ModuleMemoryEnvelope[],
    options: MemorySearchOptions
  ): Promise<RetrievedMemory[]> {
    if (!query.trim()) return [];
    const topK = options.topK ?? 5;
    const recencyWeight = options.recencyWeight ?? 0.3;
    const queryEmbedding = await EmbeddingService.embed(query);
    return rankEvents(envelopes, queryEmbedding, recencyWeight, topK, options.minScore);
  },

  async retrieveRelevantUnifiedFromEnvelopes(
    query: string,
    envelopes: ModuleMemoryEnvelope[],
    options: MemorySearchOptions,
  ): Promise<UnifiedMemoryResult[]> {
    const results = await this.retrieveRelevantFromEnvelopes(query, envelopes, options);
    return results.map(toUnifiedMemoryResult);
  },
};
