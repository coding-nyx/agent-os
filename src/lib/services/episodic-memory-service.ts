import { doc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { MemorySearchOptions, ModuleMemoryEnvelope, RetrievedMemory, SessionEventSummary } from '@/lib/types';
import { cosineSimilarity, EmbeddingService } from './embedding-service';
import { readDocOnce } from './firestore-once';

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
  topK: number
): RetrievedMemory[] {
  const retrievals: RetrievedMemory[] = [];

  envelopes.forEach((envelope) => {
    envelope.eventHistory.forEach((event) => {
      if (!event.summary) return;
      const score = scoreEvent(event, queryEmbedding, recencyWeight);
      retrievals.push({
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

export const EpisodicMemoryService = {
  async retrieveRelevant(
    uid: string,
    query: string,
    options: MemorySearchOptions
  ): Promise<RetrievedMemory[]> {
    const { db } = getFirebase();
    if (!db || !uid || !query.trim()) return [];

    const topK = options.topK ?? 5;
    const recencyWeight = options.recencyWeight ?? 0.3;
    const queryEmbedding = await EmbeddingService.embed(query);

    const envelopes: ModuleMemoryEnvelope[] = [];

    await Promise.all(
      options.moduleIds.map(async (moduleId) => {
        const ref = doc(db, 'module_memory', `${uid}_${moduleId}`);
        const snap = await readDocOnce(ref);
        if (!snap.exists()) return;
        envelopes.push(snap.data() as ModuleMemoryEnvelope);
      })
    );

    return rankEvents(envelopes, queryEmbedding, recencyWeight, topK);
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
    return rankEvents(envelopes, queryEmbedding, recencyWeight, topK);
  }
};
