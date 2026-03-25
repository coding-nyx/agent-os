import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryDataLayer } from '@/lib/data-layer/in-memory-data-layer';
import { ScoutExternalSignalService } from './scout-external-signal-service';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';

describe('ScoutExternalSignalService', () => {
  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('syncs verified knowledge nodes into semantic memory and alive entities with provenance', async () => {
    const dataLayer = new InMemoryDataLayer();

    const changed = await ScoutExternalSignalService.syncKnowledgeNode(dataLayer, 'user-1', {
      id: 'node-1',
      claim: 'Short walking breaks restore focus during long research sessions.',
      confidence: 0.86,
      evidence: ['source-1', 'source-2'],
      status: 'verified',
      updatedAt: '2026-03-24T12:00:00.000Z',
      parentSessionId: 'session-1',
      provenance: {
        source: 'scout',
        sourceEntityId: 'node-1',
        sourceIds: ['source-1', 'source-2'],
        sessionId: 'session-1',
        synthesizedAt: '2026-03-24T12:00:00.000Z',
      },
    });

    expect(changed).toBe(true);

    const fact = await dataLayer.getDocument<any>('semantic_memory/user-1/facts', 'scout-knowledge:node-1');
    expect(fact).toMatchObject({
      moduleId: 'scout',
      fact: 'Short walking breaks restore focus during long research sessions.',
      confidence: 0.86,
      provenance: {
        source: 'scout',
        sourceEntityId: 'node-1',
        sourceEntityType: 'knowledge_node',
        sourceIds: ['source-1', 'source-2'],
        sessionId: 'session-1',
      },
    });

    const aliveEntity = await dataLayer.getDocument<any>('users/user-1/alive_entities', 'alive.scout.knowledge.node-1');
    expect(aliveEntity).toMatchObject({
      sourceModule: 'scout',
      sourceEntityId: 'node-1',
      provenance: 'native',
    });
    expect(aliveEntity?.semantic_tags).toEqual(expect.arrayContaining(['scout', 'research', 'knowledge', 'verified']));
  });

  it('syncs digests into semantic memory and alive entities', async () => {
    const dataLayer = new InMemoryDataLayer();

    const changed = await ScoutExternalSignalService.syncDigest(dataLayer, 'user-1', {
      id: 'digest-1',
      generatedAt: '2026-03-24T18:00:00.000Z',
      generationType: 'manual',
      summary: {
        totalNodes: 4,
        newNodesThisPeriod: 2,
        verifiedCount: 3,
        contestedCount: 1,
      },
      topClaims: [
        {
          nodeId: 'node-1',
          claim: 'Walking breaks restore focus.',
          confidence: 0.86,
          evidenceCount: 2,
        },
      ],
      trendingInterests: [
        {
          topic: 'focus recovery',
          score: 0.8,
          trend: 'rising',
        },
      ],
      synthesizedContent: 'Walking breaks and reduced tab churn were the strongest research themes this cycle.',
    });

    expect(changed).toBe(true);

    const fact = await dataLayer.getDocument<any>('semantic_memory/user-1/facts', 'scout-digest:digest-1');
    expect(fact).toMatchObject({
      moduleId: 'scout',
      provenance: {
        source: 'scout',
        sourceEntityId: 'digest-1',
        sourceEntityType: 'digest',
        sourceIds: ['node-1'],
      },
      attributes: {
        generationType: 'manual',
        verifiedCount: 3,
      },
    });

    const aliveEntity = await dataLayer.getDocument<any>('users/user-1/alive_entities', 'alive.scout.digest.digest-1');
    expect(aliveEntity).toMatchObject({
      sourceModule: 'scout',
      sourceEntityId: 'digest-1',
      provenance: 'native',
      label: 'Scout digest 2026-03-24',
    });
  });

  it('does not sync pending nodes with confidence below 0.6', async () => {
    const dataLayer = new InMemoryDataLayer();

    const changed = await ScoutExternalSignalService.syncKnowledgeNode(dataLayer, 'user-1', {
      id: 'node-low',
      claim: 'A low-confidence fact that should not sync.',
      confidence: 0.4,
      evidence: [],
      status: 'pending',
      updatedAt: '2026-03-24T12:00:00.000Z',
    });

    expect(changed).toBe(false);
    expect(await dataLayer.getDocument('semantic_memory/user-1/facts', 'scout-knowledge:node-low')).toBeNull();
  });
});
