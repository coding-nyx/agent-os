/**
 * scout-projection-listener.ts
 *
 * Listens for Scout activity events and updates the Global Soul (NSV) metrics.
 * Also subscribes to events from other modules to trigger proactive background
 * research, enriching the knowledge base automatically over time.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { ScoutDigest, ScoutKnowledgeNode } from '../types';
import { ScoutExternalSignalService } from './scout-external-signal-service';
import { addKnowledgeNode } from './scout-knowledge-service';

let unsubscribes: Array<() => void> = [];

/**
 * Extracts a short research topic from an event's data payload.
 * Returns null if no usable topic can be derived.
 */
function extractTopicFromEventData(data: Record<string, unknown>): string | null {
  const candidates = [
    data.title, data.topic, data.name, data.label,
    data.activityType, data.category, data.type,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 3) return c.trim();
  }
  return null;
}

/**
 * Creates a pending knowledge node representing a research interest triggered
 * by another module's activity. Low confidence — needs verification.
 */
async function queueBackgroundResearch(
  topic: string,
  sourceEvent: string,
  userId: string,
): Promise<void> {
  try {
    const node = await addKnowledgeNode(
      {
        claim: `[Pending research] ${topic}`,
        confidence: 0.1,
        evidence: [],
        status: 'pending',
        source: `spine:${sourceEvent}`,
      },
      { userId },
    );
    if (node) {
      Spine.publish({
        type: 'SCOUT_KNOWLEDGE_ENRICHED',
        source: 'scout',
        domain: 'C',
        priority: 'info',
        data: { userId, nodeId: node.id, claim: node.claim, via: sourceEvent, status: 'pending' },
      });
    }
  } catch (err) {
    console.warn('[ScoutProjectionListener] Failed to queue background research:', err);
  }
}

/**
 * Initializes listeners for Scout events and cross-module enrichment triggers.
 */
export function registerScoutProjectionListeners() {
  if (unsubscribes.length > 0) return;

  // Handle profile updates (metrics calculated by service)
  const sub1 = Spine.subscribe('SCOUT_PROFILE_UPDATED', async (event) => {
    const data = event.data as { userId: string; metrics: any };
    const { userId, metrics } = data;
    if (!userId || !metrics) return;

    try {
      await GlobalProjectionService.updateCrossFunctionalState(userId, {
        cognitive: { 
          researchLoad: metrics.researchLoad, 
          researchDepth: metrics.researchDepth,
          interestDiversity: metrics.interestDiversity
        }
      });
    } catch (err) {
      console.error('[ScoutProjectionListener] Failed to update NSV from profile update:', err);
    }
  });

  // Handle new findings synthesized - trigger a re-sync
  const sub2 = Spine.subscribe('KNOWLEDGE_SYNTHESIZED', async (event) => {
    const data = event.data as { userId?: string; node?: ScoutKnowledgeNode };
    if (!data?.userId || !data.node) return;

    try {
      await ScoutExternalSignalService.syncKnowledgeNode(getNexusDataLayer(), data.userId, data.node);
    } catch (err) {
      console.error('[ScoutProjectionListener] Failed to sync knowledge node into memory surfaces:', err);
    }
  });

  const sub3 = Spine.subscribe('DIGEST_GENERATED', async (event) => {
    const data = event.data as { userId?: string; digest?: Pick<ScoutDigest, 'id' | 'generatedAt' | 'generationType' | 'summary' | 'topClaims' | 'trendingInterests' | 'synthesizedContent'> };
    if (!data?.userId || !data.digest) return;

    try {
      await ScoutExternalSignalService.syncDigest(getNexusDataLayer(), data.userId, data.digest);
    } catch (err) {
      console.error('[ScoutProjectionListener] Failed to sync digest into memory surfaces:', err);
    }
  });

  // Proactive enrichment: queue research when other modules create relevant entities
  const sub4 = Spine.subscribe('WORKOUT_COMPLETED', async (event) => {
    const data = event.data as Record<string, unknown> & { userId?: string };
    const userId = typeof data.userId === 'string' ? data.userId : null;
    if (!userId) return;
    const topic = extractTopicFromEventData(data) ?? 'workout recovery and adaptation';
    await queueBackgroundResearch(topic, 'WORKOUT_COMPLETED', userId);
  });

  const sub5 = Spine.subscribe('ATLAS_TASK_CREATED', async (event) => {
    const data = event.data as Record<string, unknown> & { userId?: string };
    const userId = typeof data.userId === 'string' ? data.userId : null;
    if (!userId) return;
    const topic = extractTopicFromEventData(data);
    if (!topic) return;
    await queueBackgroundResearch(topic, 'ATLAS_TASK_CREATED', userId);
  });

  const sub6 = Spine.subscribe('SOMA_BIOMARKER_COMMITTED', async (event) => {
    const data = event.data as Record<string, unknown> & { userId?: string };
    const userId = typeof data.userId === 'string' ? data.userId : null;
    if (!userId) return;
    const topic = extractTopicFromEventData(data) ?? 'biomarker health implications';
    await queueBackgroundResearch(`health implications of: ${topic}`, 'SOMA_BIOMARKER_COMMITTED', userId);
  });

  const sub7 = Spine.subscribe('FINANCIAL_STRESS', async (event) => {
    const data = event.data as Record<string, unknown> & { userId?: string };
    const userId = typeof data.userId === 'string' ? data.userId : null;
    if (!userId) return;
    await queueBackgroundResearch('stress management and financial resilience', 'FINANCIAL_STRESS', userId);
  });

  unsubscribes.push(sub1, sub2, sub3, sub4, sub5, sub6, sub7);
}

