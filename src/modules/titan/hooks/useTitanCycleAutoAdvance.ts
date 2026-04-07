/**
 * useTitanCycleAutoAdvance
 *
 * Self-contained effect that checks active training cycles on each render
 * and auto-advances to the next phase (or marks complete) when the current
 * phase's duration has elapsed.  Uses a ref guard to prevent concurrent saves.
 */

import { useEffect, useRef } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import type { TitanProfile } from '@/lib/types';
import { saveTitanProfile } from '../services/titan-profile-service';

interface UseTitanCycleAutoAdvanceParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: AuthUser | null;
}

export function useTitanCycleAutoAdvance({
  profile,
  encryptionKey,
  user,
}: UseTitanCycleAutoAdvanceParams) {
  const isAutoAdvancingRef = useRef(false);

  useEffect(() => {
    if (isAutoAdvancingRef.current) return;
    if (!profile?.cycles?.length || !user || !encryptionKey) return;

    const today = new Date().toISOString().slice(0, 10);
    let needsUpdate = false;

    const updatedCycles = profile.cycles.map((cycle) => {
      if (cycle.status !== 'active') return cycle;
      const currentPhase = cycle.phases[cycle.currentPhaseIndex];
      if (!currentPhase?.durationDays) return cycle;

      const phaseStart = new Date(cycle.currentPhaseStartDate);
      const phaseEnd = new Date(phaseStart);
      phaseEnd.setDate(phaseStart.getDate() + currentPhase.durationDays);
      const phaseEndISO = phaseEnd.toISOString().slice(0, 10);

      if (today > phaseEndISO) {
        needsUpdate = true;
        const now = new Date().toISOString();
        const nextPhaseIndex = cycle.currentPhaseIndex + 1;
        if (nextPhaseIndex >= cycle.phases.length) {
          return { ...cycle, status: 'completed' as const, updatedAt: now };
        }
        return { ...cycle, currentPhaseIndex: nextPhaseIndex, currentPhaseStartDate: today, updatedAt: now };
      }
      return cycle;
    });

    if (!needsUpdate) return;

    isAutoAdvancingRef.current = true;
    const updated: TitanProfile = { ...profile, cycles: updatedCycles, updatedAt: new Date().toISOString() };
    saveTitanProfile(updated, { userId: user.uid, encryptionKey })
      .catch((e) => console.error('cycle auto-advance failed:', e))
      .finally(() => { isAutoAdvancingRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.cycles, user, encryptionKey]);
}
