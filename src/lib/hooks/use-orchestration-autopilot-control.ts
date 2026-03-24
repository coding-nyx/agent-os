import { useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useDataLayer } from '@/lib/data-layer/provider';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { OrchestrationOperatingModeService } from '@/lib/services/orchestration-operating-mode-service';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import type { AutopilotLevel } from '@/lib/contracts/orchestration';

export const AUTOPILOT_LEVELS = [0, 1, 2, 3, 4, 5] as const satisfies readonly AutopilotLevel[];

export function getAutopilotLevelLabel(level: AutopilotLevel) {
  return OrchestrationOperatingModeService.derive({ autopilotLevel: level }).levelLabel;
}

export function useOrchestrationAutopilotControl() {
  const auth = useAuth();
  const dataLayer = useDataLayer();
  const user = auth?.user;
  const isGuest = auth?.isGuest === true;
  const autopilotLevel = useOrchestrationStore((state) => state.autopilotLevel);
  const historyMode = useOrchestrationStore((state) => state.historyMode);
  const setAutopilotLevel = useOrchestrationStore((state) => state.setAutopilotLevel);
  const [isPersisting, setIsPersisting] = useState(false);

  const persistAutopilotLevel = useCallback(async (nextLevel: AutopilotLevel) => {
    if (isPersisting || nextLevel === autopilotLevel) return;

    const previousLevel = autopilotLevel;
    setAutopilotLevel(nextLevel);

    if (!user?.uid || isGuest) return;

    setIsPersisting(true);
    try {
      await CoreProfileService.updateOrchestrationPreferences(
        user.uid,
        { autopilotLevel: nextLevel },
        dataLayer,
      );
    } catch (error) {
      console.error('[useOrchestrationAutopilotControl] Failed to persist autopilot level:', error);
      setAutopilotLevel(previousLevel);
    } finally {
      setIsPersisting(false);
    }
  }, [autopilotLevel, dataLayer, isGuest, isPersisting, setAutopilotLevel, user?.uid]);

  const lowerAutopilotLevel = useCallback(async () => {
    await persistAutopilotLevel(Math.max(0, autopilotLevel - 1) as AutopilotLevel);
  }, [autopilotLevel, persistAutopilotLevel]);

  const raiseAutopilotLevel = useCallback(async () => {
    await persistAutopilotLevel(Math.min(5, autopilotLevel + 1) as AutopilotLevel);
  }, [autopilotLevel, persistAutopilotLevel]);

  return {
    autopilotLevel,
    historyMode,
    isGhost: autopilotLevel === 5,
    isPersisting,
    levelLabel: getAutopilotLevelLabel(autopilotLevel),
    persistAutopilotLevel,
    lowerAutopilotLevel,
    raiseAutopilotLevel,
  };
}
