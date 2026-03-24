import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';

export function useOrchestrationProfileSync() {
  const { profile, isGuest } = useAuth();
  const hydrateFromPreferences = useOrchestrationStore((state) => state.hydrateFromPreferences);
  const resetShell = useOrchestrationStore((state) => state.resetShell);

  useEffect(() => {
    if (isGuest || !profile) {
      resetShell();
      return;
    }

    hydrateFromPreferences(profile.orchestrationPreferences ?? null);
  }, [
    hydrateFromPreferences,
    isGuest,
    profile?.uid,
    profile?.orchestrationPreferences?.autopilotLevel,
    profile?.orchestrationPreferences?.historyMode,
    resetShell,
  ]);
}
