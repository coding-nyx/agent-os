import { Spine } from '../spine/spine-event-bus';
import { DerivedInsightsService } from './derived-insights-service';
import { useAuth } from '../auth-context';
import { useEffect } from 'react';
import { isCriticalReadiness, resolveReadinessScore } from '@/lib/spine/flow-contracts';

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
    const unsubs: Array<() => void> = [];

    // 1. Stress-Spending Detection (Ledger + Agnes correlation)
    unsubs.push(Spine.on('SPENDING_DETECTED', async (event) => {
       const { amount, category, stressLevelAtTime } = event.data;
       if (Number(stressLevelAtTime ?? 0) >= 7 && (amount as number) > 50) {
         await DerivedInsightsService.addInsight(userId, {
           moduleId: 'ledger',
           type: 'stress_spending',
           content: `Identified potential stress-spending: ${amount} ${category}. Stress load was ${stressLevelAtTime}/10 at time of transaction.`,
           severity: 'warning'
         });
       }
    }));

    // 2. Overtraining Risk (Titan + Soma correlation)
    unsubs.push(Spine.on('SOMA_READINESS_UPDATED', async (event) => {
      const score = resolveReadinessScore(event.data);
      if (isCriticalReadiness(event.data)) {
        await DerivedInsightsService.addInsight(userId, {
          moduleId: 'titan',
          type: 'overtraining_risk',
          content: `Critical recovery deficit detected (Readiness: ${score ?? 'unknown'}/100). High-intensity training is currently unsafe.`,
          severity: 'critical'
        });
      }
    }));

    // 3. Burnout Momentum (Atlas + Spine events)
    unsubs.push(Spine.on('DEADLINE_CRUNCH', async (event) => {
       await DerivedInsightsService.addInsight(userId, {
         moduleId: 'atlas',
         type: 'deadline_crunch',
         content: `Multiple approaching deadlines detected. Schedule compression is mandatory to avoid burnout.`,
         severity: 'warning'
       });
    }));

    // 4. Emotional Regulation Success (Agnes)
    unsubs.push(Spine.on('SOMATIC_SESSION_COMPLETE', async (event) => {
      const { exerciseType, completedFully } = event.data;
      if (completedFully) {
        await DerivedInsightsService.addInsight(userId, {
          moduleId: 'agnes',
          type: 'regulation_success',
          content: `Successfully completed ${exerciseType} somatic session. Nervous system recalibration in progress.`,
          severity: 'info'
        });
      }
    }));

    // 5. High-Intensity Training Recognition (Titan)
    unsubs.push(Spine.on('WORKOUT_COMPLETED', async (event) => {
      const { rpe, totalVolume } = event.data;
      if (Number(rpe ?? 0) >= 9) {
        await DerivedInsightsService.addInsight(userId, {
          moduleId: 'titan',
          type: 'intensity_milestone',
          content: `High-intensity session registered (RPE ${rpe}). Volume: ${totalVolume}. Central nervous system fatigue will be elevated.`,
          severity: 'info'
        });
      }
    }));

    // 6. Financial Stability Shift (Ledger)
    unsubs.push(Spine.on('FINANCIAL_FRICTION_CHANGED', async (event) => {
      const { level, delta } = event.data;
      if (Number(level ?? 0) >= 7 && Number(delta ?? 0) > 0) {
        await DerivedInsightsService.addInsight(userId, {
          moduleId: 'ledger',
          type: 'stability_risk',
          content: `Financial friction has increased significantly. Resource stability is trending downward.`,
          severity: 'warning'
        });
      }
    }));

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          // Non-critical cleanup — ignore.
        }
      });
    };
  }
};

/**
 * Hook to keep the pipeline active in the React tree.
 */
export function useIntelligencePipeline() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;
    return IntelligencePipeline.init(user.uid);
  }, [user?.uid]);
}
