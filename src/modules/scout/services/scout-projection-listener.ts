/**
 * scout-projection-listener.ts
 *
 * Listens for Scout activity events and updates the Global Soul (NSV) metrics.
 * Scout is now focused purely on research and does not react to other module states
 * to maintain its mission as an independent, aggressive research tool.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import { getAraDataLayer } from '@/lib/data-layer/provider';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { ScoutDigest, ScoutKnowledgeNode } from '../types';
import { ScoutExternalSignalService } from './scout-external-signal-service';

let unsubscribes: Array<() => void> = [];

/**
 * Initializes listeners for Scout events.
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
      await ScoutExternalSignalService.syncKnowledgeNode(getAraDataLayer(), data.userId, data.node);
    } catch (err) {
      console.error('[ScoutProjectionListener] Failed to sync knowledge node into memory surfaces:', err);
    }
  });

  const sub3 = Spine.subscribe('DIGEST_GENERATED', async (event) => {
    const data = event.data as { userId?: string; digest?: Pick<ScoutDigest, 'id' | 'generatedAt' | 'generationType' | 'summary' | 'topClaims' | 'trendingInterests' | 'synthesizedContent'> };
    if (!data?.userId || !data.digest) return;

    try {
      await ScoutExternalSignalService.syncDigest(getAraDataLayer(), data.userId, data.digest);
    } catch (err) {
      console.error('[ScoutProjectionListener] Failed to sync digest into memory surfaces:', err);
    }
  });

  unsubscribes.push(sub1, sub2, sub3);
}
