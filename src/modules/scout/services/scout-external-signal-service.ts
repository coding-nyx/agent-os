import type { NexusDataLayer } from '@/lib/data-layer';
import { upsertAliveEntity, adaptScoutDigestToAliveEntity, adaptScoutKnowledgeNodeToAliveEntity } from '@/lib/services/alive-entity-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { SemanticMemoryService } from '@/lib/services/semantic-memory-service';
import type { ScoutDigest, ScoutKnowledgeNode } from '../types';

function normalizeConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function buildDigestSummaryFact(digest: Pick<ScoutDigest, 'synthesizedContent' | 'topClaims'>): string {
  const summary = digest.synthesizedContent.trim();
  if (summary.length > 0) {
    return summary;
  }

  if (digest.topClaims.length > 0) {
    return `Scout digest highlights: ${digest.topClaims.slice(0, 3).map((claim) => claim.claim).join('; ')}`;
  }

  return 'Scout digest generated without synthesized highlights.';
}

export const ScoutExternalSignalService = {
  async syncKnowledgeNode(
    dataLayer: NexusDataLayer,
    uid: string,
    node: ScoutKnowledgeNode,
  ): Promise<boolean> {
    if (!uid || !AutonomyFeatureFlags.isEnabled('scoutExternalSignalLoop')) {
      return false;
    }

    await SemanticMemoryService.upsertFact(uid, {
      id: `scout-knowledge:${node.id}`,
      moduleId: 'scout',
      fact: node.claim,
      confidence: normalizeConfidence(node.confidence),
      provenance: {
        source: 'scout',
        sourceEntityId: node.id,
        sourceEntityType: 'knowledge_node',
        sourceIds: node.evidence,
        sessionId: node.parentSessionId,
      },
      attributes: {
        status: node.status,
        evidenceCount: node.evidence.length,
      },
    }, dataLayer);

    if (node.status === 'verified' || normalizeConfidence(node.confidence) >= 0.7) {
      await upsertAliveEntity(dataLayer, adaptScoutKnowledgeNodeToAliveEntity(node), { uid });
    }

    return true;
  },

  async syncDigest(
    dataLayer: NexusDataLayer,
    uid: string,
    digest: Pick<ScoutDigest, 'id' | 'generatedAt' | 'generationType' | 'summary' | 'topClaims' | 'trendingInterests' | 'synthesizedContent'>,
  ): Promise<boolean> {
    if (!uid || !AutonomyFeatureFlags.isEnabled('scoutExternalSignalLoop')) {
      return false;
    }

    await SemanticMemoryService.upsertFact(uid, {
      id: `scout-digest:${digest.id}`,
      moduleId: 'scout',
      fact: buildDigestSummaryFact(digest),
      confidence: digest.topClaims.length > 0
        ? normalizeConfidence(digest.topClaims.reduce((sum, claim) => sum + normalizeConfidence(claim.confidence), 0) / digest.topClaims.length)
        : 0.72,
      provenance: {
        source: 'scout',
        sourceEntityId: digest.id,
        sourceEntityType: 'digest',
        sourceIds: digest.topClaims.map((claim) => claim.nodeId),
      },
      attributes: {
        generatedAt: digest.generatedAt,
        generationType: digest.generationType,
        totalNodes: digest.summary.totalNodes,
        verifiedCount: digest.summary.verifiedCount,
        contestedCount: digest.summary.contestedCount,
      },
    }, dataLayer);

    await upsertAliveEntity(dataLayer, adaptScoutDigestToAliveEntity(digest), { uid });
    return true;
  },
};
