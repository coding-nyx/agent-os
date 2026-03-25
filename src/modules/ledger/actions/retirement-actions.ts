import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { RetirementPlan } from '@/modules/ledger/services/ledger-intake-service';
import { projectRetirement } from '@/modules/ledger/services/aggregation/retirement-calculator';
import type { SpineEventType } from '@/lib/types';

let registered = false;

async function handleCreateRetirementPlan(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const plan: RetirementPlan = {
    id: crypto.randomUUID(),
    name: typeof payload.name === 'string' ? payload.name.trim() : 'My Retirement Plan',
    currentAge: typeof payload.currentAge === 'number' ? payload.currentAge : 30,
    targetRetirementAge: typeof payload.targetRetirementAge === 'number' ? payload.targetRetirementAge : 65,
    currentSavings: typeof payload.currentSavings === 'number' ? payload.currentSavings : 0,
    monthlyContribution: typeof payload.monthlyContribution === 'number' ? payload.monthlyContribution : 500,
    expectedAnnualReturnPct: typeof payload.expectedAnnualReturnPct === 'number' ? payload.expectedAnnualReturnPct : 7,
    inflationRatePct: typeof payload.inflationRatePct === 'number' ? payload.inflationRatePct : 3,
    targetMonthlyIncome: typeof payload.targetMonthlyIncome === 'number' ? payload.targetMonthlyIncome : 5000,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    createdAt: now,
    updatedAt: now,
  };

  const projection = projectRetirement(plan);
  await saveLedgerProfile(
    { ...profile, retirementPlans: [...(profile.retirementPlans ?? []), plan], lastRetirementProjection: projection, updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('RETIREMENT_PLAN_CREATED' as SpineEventType, { planId: plan.id, onTrack: projection.onTrack });
}

async function handleUpdateRetirementPlan(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const plans = (profile.retirementPlans ?? []).map(p =>
    p.id === payload.planId ? { ...p, ...payload, updatedAt: now } : p
  );
  // Re-project for the updated plan
  const updatedPlan = plans.find(p => p.id === payload.planId);
  const projection = updatedPlan ? projectRetirement(updatedPlan) : profile.lastRetirementProjection;
  await saveLedgerProfile({ ...profile, retirementPlans: plans, lastRetirementProjection: projection, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function handleDeleteRetirementPlan(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  await saveLedgerProfile(
    { ...profile, retirementPlans: (profile.retirementPlans ?? []).filter(p => p.id !== payload.planId), updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

async function handleProjectRetirement(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const plans = profile.retirementPlans ?? [];
  const plan = payload.planId ? plans.find(p => p.id === payload.planId) : plans[0];
  if (!plan) return;

  const projection = projectRetirement(plan);
  await saveLedgerProfile({ ...profile, lastRetirementProjection: projection, updatedAt: new Date().toISOString() }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

export function registerLedgerRetirementActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    create_retirement_plan:  handleCreateRetirementPlan,
    update_retirement_plan:  handleUpdateRetirementPlan,
    delete_retirement_plan:  handleDeleteRetirementPlan,
    project_retirement:      handleProjectRetirement,
  });
}
