/**
 * use-ledger-cross-verify.ts  (S2-L-004)
 *
 * React hook that bridges the pure cross-verification service to the NSV and
 * Spine event bus. Runs verification whenever the profile reference changes,
 * then:
 *   1. Publishes computed Spine events (CASHFLOW_*, INCOME_CHANGE, etc.)
 *   2. Writes the NSV financial patch via updateCrossFunctionalState()
 *
 * All side-effects are isolated here — the service layer stays pure.
 */

import { useEffect, useRef, useState } from 'react';
import { useGlobalSoulActions } from '@/lib/global-soul-context';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVectorPatch, SpineEventPayload } from '@/lib/types';
import type { LedgerIntakeProfile } from '../services/ledger-intake-service';
import {
  verifyFinancialCoherence,
  computeNSVFinancialPatch,
  buildLedgerSpineEvents,
  type CoherenceReport,
} from '../services/cross-verification-service';

export interface LedgerCrossVerifyResult {
  coherenceReport: CoherenceReport | null;
  nsvPatch: NeuralStateVectorPatch | null;
  isVerifying: boolean;
}

const FINANCIAL_STREAK_STEP = 3;

interface StreakResult {
  event: SpineEventPayload | null;
  nextStreakCount: number;
  nextStreakLastMilestone: number;
}

function buildFinancialStreakEvent(profile: LedgerIntakeProfile): StreakResult {
  try {
    const totalIncome = Math.max(profile.monthlyIncome, 0);
    const totalExpenses = profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0)
      + profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0);
    const netCashflow = totalIncome - totalExpenses;

    const prevStreak = profile.financialStreakCount ?? 0;
    const nextStreak = netCashflow > 0 ? prevStreak + 1 : 0;

    if (nextStreak === 0) {
      return { event: null, nextStreakCount: 0, nextStreakLastMilestone: 0 };
    }

    const lastMilestone = profile.financialStreakLastMilestone ?? 0;
    const isMilestone = nextStreak % FINANCIAL_STREAK_STEP === 0 && nextStreak !== lastMilestone;

    if (!isMilestone) {
      return { event: null, nextStreakCount: nextStreak, nextStreakLastMilestone: lastMilestone };
    }

    return {
      event: {
        type: 'FINANCIAL_STREAK_MILESTONE',
        source: 'ledger',
        domain: 'R',
        priority: 'info',
        data: {
          streak: nextStreak,
          netCashflow,
          cadence: profile.planningHorizon ?? 'monthly',
        },
      },
      nextStreakCount: nextStreak,
      nextStreakLastMilestone: nextStreak,
    };
  } catch {
    return { event: null, nextStreakCount: 0, nextStreakLastMilestone: 0 };
  }
}

/**
 * Runs the cross-verification pipeline on every profile change.
 *
 * @param profile       - Current LedgerIntakeProfile or null (e.g. before data loads).
 * @param persistUpdate - Optional callback to persist profile changes (used for streak tracking).
 * @returns             - Coherence report, NSV patch, and loading state for UI consumption.
 */
export function useLedgerCrossVerify(
  profile: LedgerIntakeProfile | null,
  persistUpdate?: (next: LedgerIntakeProfile) => void,
): LedgerCrossVerifyResult {
  const { updateCrossFunctionalState } = useGlobalSoulActions();

  const [coherenceReport, setCoherenceReport] = useState<CoherenceReport | null>(null);
  const [nsvPatch, setNsvPatch] = useState<NeuralStateVectorPatch | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Keep a stable reference to the previous profile for delta-based Spine events.
  const prevProfileRef = useRef<LedgerIntakeProfile | null>(null);

  useEffect(() => {
    if (profile === null) {
      setCoherenceReport(null);
      setNsvPatch(null);
      prevProfileRef.current = null;
      return;
    }

    setIsVerifying(true);

    // --- Pure computation (synchronous, no I/O) ---
    const report = verifyFinancialCoherence(profile);
    const patch = computeNSVFinancialPatch(profile);
    const spineEvents = buildLedgerSpineEvents(
      profile,
      prevProfileRef.current ?? undefined,
    );
    const streak = buildFinancialStreakEvent(profile);
    if (streak.event) spineEvents.push(streak.event);

    // Persist streak values back into the profile (encrypted, not localStorage)
    if (
      persistUpdate &&
      (streak.nextStreakCount !== (profile.financialStreakCount ?? 0) ||
        streak.nextStreakLastMilestone !== (profile.financialStreakLastMilestone ?? 0))
    ) {
      persistUpdate({
        ...profile,
        financialStreakCount: streak.nextStreakCount,
        financialStreakLastMilestone: streak.nextStreakLastMilestone,
      });
    }

    // --- Side-effects ---

    // 1. Publish Spine events (fire-and-forget; Spine debounces internally)
    for (const payload of spineEvents) {
      Spine.publish(payload);
    }

    // 2. Push NSV patch (async; errors are swallowed at the service layer)
    updateCrossFunctionalState(patch).catch((err: unknown) => {
      console.warn('[useLedgerCrossVerify] NSV patch failed:', err);
    });

    // --- State updates ---
    setCoherenceReport(report);
    setNsvPatch(patch);
    setIsVerifying(false);

    // Advance the prev-profile cursor for the next render cycle
    prevProfileRef.current = profile;
  }, [profile, persistUpdate, updateCrossFunctionalState]);

  return { coherenceReport, nsvPatch, isVerifying };
}
