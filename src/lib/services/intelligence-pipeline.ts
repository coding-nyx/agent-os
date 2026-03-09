import { Spine, useSpineEvent } from '../spine/spine-event-bus';
import { DerivedInsightsService } from './derived-insights-service';
import { useAuth } from '../auth-context';
import { useEffect } from 'react';

/**
 * IntelligencePipeline
 * 
 * Listens to Spine events and derives firm conclusions (insights)
 * that are persisted to the DerivedInsights store.
 */
export const IntelligencePipeline = {
  /**
   * Initialize global listeners for concluding insights from events.
   * This is called once at the app root or inside the GlobalSoulProvider.
   */
  init(userId: string) {
    // 1. Stress-Spending Detection (Ledger + Agnes correlation)
    Spine.on('SPENDING_DETECTED', async (event) => {
       const { amount, category, stressLevelAtTime } = event.data;
       if (Number(stressLevelAtTime ?? 0) >= 7 && (amount as number) > 50) {
         await DerivedInsightsService.addInsight(userId, {
           moduleId: 'ledger',
           type: 'stress_spending',
           content: `Identified potential stress-spending: ${amount} ${category}. Stress load was ${stressLevelAtTime}/10 at time of transaction.`,
           severity: 'warning'
         });
       }
    });

    // 2. Overtraining Risk (Titan + Soma correlation)
    Spine.on('SOMA_READINESS_UPDATED', async (event) => {
      const { score, level } = event.data;
      if (Number(score ?? 100) < 40 && level === 'critical') {
        await DerivedInsightsService.addInsight(userId, {
          moduleId: 'titan',
          type: 'overtraining_risk',
          content: `Critical recovery deficit detected (Readiness: ${score}/100). High-intensity training is currently unsafe.`,
          severity: 'critical'
        });
      }
    });

    // 3. Burnout Momentum (Atlas + Spine events)
    Spine.on('DEADLINE_CRUNCH', async (event) => {
       await DerivedInsightsService.addInsight(userId, {
         moduleId: 'atlas',
         type: 'deadline_crunch',
         content: `Multiple approaching deadlines detected. Schedule compression is mandatory to avoid burnout.`,
         severity: 'warning'
       });
    });
  }
};

/**
 * Hook to keep the pipeline active in the React tree.
 */
export function useIntelligencePipeline() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;
    IntelligencePipeline.init(user.uid);
  }, [user?.uid]);
}
