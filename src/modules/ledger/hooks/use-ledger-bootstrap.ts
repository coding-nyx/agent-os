/**
 * useLedgerBootstrap — Side effects that run on profile load
 *
 * Owns:
 *   - Planner bootstrap (creates starter plan if none exists)
 *   - Resonance ROI sync (pushes financial friction to GlobalSoul)
 *   - Spine event listener (collects recent toast-worthy events)
 *   - AI greeting (sends initial agent message on first load)
 *   - recentEvents state
 */

import { useEffect, useRef, useState } from 'react';
import type { SpineEvent, GlobalProjection } from '@/lib/types';
import type { Message } from '@/cortex-bridge/types';
import { Spine } from '@/lib/spine/spine-event-bus';
import { LEDGER_TOAST_EVENTS } from '@/modules/ledger/actions/ledger-field-actions';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeResonanceROI } from '../services/resonance-roi-service';
import type {
  LedgerIntakeProfile,
  FinancialPlan,
} from '../services/ledger-intake-service';

interface BootstrapAI {
  messages: Message[];
  isProcessing: boolean;
  streamingText: string;
  setMessages: (msgs: Message[]) => void;
}

interface BootstrapDeps {
  profile: LedgerIntakeProfile | null;
  persistUpdate: (next: LedgerIntakeProfile) => void;
  userId: string | undefined;
  isGuest: boolean;
  globalSoul: GlobalProjection | null;
  agentAlias: string;
  ai: BootstrapAI;
}

function createStarterPlan(profile: LedgerIntakeProfile): FinancialPlan {
  const totalFixed = profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0);
  const baselineSpend = totalFixed + totalVariable;
  const monthlyTarget = Math.max(profile.monthlyIncome - baselineSpend, 0);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: 'Starter Financial Plan',
    summary: 'Baseline cashflow stabilization with weekly execution checkpoints.',
    monthlyTarget,
    allocation: {
      essentials: 60,
      growth: 25,
      buffer: 15,
    },
    tasks: [
      'Track every variable expense for the next 7 days.',
      'Cap discretionary spending at 80% of current baseline.',
      'Apply first buffer deposit to emergency reserve this month.',
    ],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function useLedgerBootstrap(deps: BootstrapDeps): {
  recentEvents: SpineEvent[];
} {
  const { profile, persistUpdate, userId, isGuest, globalSoul, agentAlias, ai } = deps;

  const plannerBootstrappedRef = useRef(false);
  const [recentEvents, setRecentEvents] = useState<SpineEvent[]>([]);

  // ── Planner bootstrap ────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || !profile.onboardingComplete || plannerBootstrappedRef.current) return;
    if (profile.activePlanId) return;

    const starterPlan = createStarterPlan(profile);
    const nextProfile: LedgerIntakeProfile = {
      ...profile,
      plans: [starterPlan, ...profile.plans.filter((plan) => plan.id !== starterPlan.id)].slice(
        0,
        50,
      ),
      activePlanId: starterPlan.id,
      plannerBotState: 'active',
      lastPlanGeneratedAt: new Date().toISOString(),
      summary: profile.summary || 'Starter plan auto-generated from current baseline.',
    };

    plannerBootstrappedRef.current = true;
    persistUpdate(nextProfile);
  }, [profile, persistUpdate]);

  // ── Resonance ROI sync ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userId || isGuest || !profile || !profile.onboardingComplete) return;

    const metrics = computeResonanceROI(profile);
    const current = globalSoul?.crossFunctionalState?.resource;
    const hasChange =
      metrics.resonanceROI !== current?.resonanceROI ||
      metrics.financialFriction !== current?.financialFriction;

    if (!hasChange) return;

    GlobalProjectionService.updateCrossFunctionalState(userId, {
      resource: {
        resonanceROI: metrics.resonanceROI,
        financialFriction: metrics.financialFriction,
      },
    }).catch((err) => console.error('Failed to update resonance ROI:', err));
  }, [userId, isGuest, profile, globalSoul?.crossFunctionalState?.resource]);

  // ── Spine event listener ────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = (LEDGER_TOAST_EVENTS as any[]).map((evtType) =>
      Spine.on(evtType, (evt: SpineEvent) => {
        setRecentEvents((prev) => [evt, ...prev].slice(0, 10));
      }),
    );
    return () => unsubs.forEach((fn) => fn());
  }, []);

  // ── AI greeting ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (
      profile?.onboardingComplete &&
      ai.messages.length === 0 &&
      !ai.isProcessing &&
      !ai.streamingText
    ) {
      const greeting = !profile.activePlanId
        ? `No active plan was found. I created a starter financial plan and activated planner mode. Tell me what constraint to optimize first: debt reduction, savings speed, or monthly cashflow.`
        : `Resource link active. I am ${agentAlias}. I optimize your budget, spending strategy, and plan execution. What should we optimize first this week?`;

      ai.setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [
    profile?.onboardingComplete,
    profile?.activePlanId,
    agentAlias,
    ai.messages.length,
    ai.isProcessing,
    ai.streamingText,
    ai.setMessages,
  ]);

  return { recentEvents };
}
