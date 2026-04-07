import type { NexusDataLayer } from '@/lib/data-layer';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { SemanticFact, UnifiedMemoryResult } from '@/lib/types';

function normalizeConfidence(confidence?: number): number {
  if (typeof confidence !== 'number') return 0.7;
  return Math.min(1, Math.max(0, confidence));
}

function toUnifiedMemoryResult(fact: SemanticFact): UnifiedMemoryResult {
  return {
    id: `semantic:${fact.id}`,
    type: 'semantic',
    moduleId: fact.moduleId,
    text: fact.fact,
    score: fact.confidence,
    confidence: fact.confidence,
    timestamp: fact.updatedAt,
    citation: {
      type: 'semantic',
      moduleId: fact.moduleId,
      entityId: fact.id,
      label: fact.fact,
    },
  };
}

export const SemanticMemoryService = {
  async getFacts(uid: string, moduleIds: string[]): Promise<SemanticFact[]> {
    if (!uid || moduleIds.length === 0) return [];

    try {
      const dataLayer = getNexusDataLayer();
      const facts = await dataLayer.listDocuments<Omit<SemanticFact, 'id'>>(`semantic_memory/${uid}/facts`, { limit: 0 });

      return facts
        .filter((fact) => moduleIds.includes(fact.moduleId))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10);
    } catch (error) {
      console.error('[SemanticMemoryService] Failed to get facts:', error);
      return [];
    }
  },

  getFactsUnifiedFromFacts(facts: SemanticFact[], moduleIds: string[]): UnifiedMemoryResult[] {
    return facts
      .filter((fact) => moduleIds.includes(fact.moduleId))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10)
      .map(toUnifiedMemoryResult);
  },

  async getFactsUnified(uid: string, moduleIds: string[]): Promise<UnifiedMemoryResult[]> {
    const facts = await this.getFacts(uid, moduleIds);
    return this.getFactsUnifiedFromFacts(facts, moduleIds);
  },

  subscribeFacts(uid: string, onUpdate: (facts: SemanticFact[]) => void): () => void {
    if (!uid) {
      onUpdate([]);
      return () => {};
    }
    const dataLayer = getNexusDataLayer();
    return dataLayer.subscribeToQuery<Omit<SemanticFact, 'id'>>(
      { collection: `semantic_memory/${uid}/facts` },
      (facts) => onUpdate(facts as SemanticFact[])
    );
  },

  async upsertFact(
    uid: string,
    fact: Omit<SemanticFact, 'id' | 'updatedAt'> & { id?: string },
    dataLayerOverride?: NexusDataLayer,
  ): Promise<void> {
    if (!uid || !fact.fact.trim()) return;

    const dataLayer = dataLayerOverride ?? getNexusDataLayer();
    const factId = fact.id || crypto.randomUUID();
    try {
      await dataLayer.setDocument(`semantic_memory/${uid}/facts`, factId, {
        moduleId: fact.moduleId,
        fact: fact.fact.trim(),
        confidence: normalizeConfidence(fact.confidence),
        updatedAt: new Date().toISOString(),
        provenance: fact.provenance,
        attributes: fact.attributes,
      });
    } catch (error) {
      console.error('[SemanticMemoryService] Failed to upsert fact:', error);
    }
  }
};
