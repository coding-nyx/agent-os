/**
 * scout-projection-listener.ts
 *
 * Listens for Scout activity events and updates the Global Soul (NSV) metrics.
 * This decouples data persistence from cross-functional projection updates.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';

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
     // NOTE: KNOWLEDGE_SYNTHESIZED event could also carry metrics
     // to avoid re-decryption here. For now, we rely on profile updates
     // which are usually triggered after node additions in workflows.
  });

  unsubscribes.push(sub1, sub2);
}
