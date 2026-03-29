import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { InsurancePolicy, InsurancePolicyType, InsuranceBillingCycle } from '@/modules/ledger/services/ledger-intake-service';
import { toMonthlyPremium } from '@/modules/ledger/services/aggregation/insurance-aggregation';
import type { SpineEventType } from '@/lib/types';

let registered = false;

const POLICY_TYPES: InsurancePolicyType[] = ['health','dental','vision','auto','home','renters','life','disability','umbrella','pet','other'];
const BILLING_CYCLES: InsuranceBillingCycle[] = ['monthly','quarterly','biannual','yearly'];

async function handleCreateInsurancePolicy(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const billingCycle: InsuranceBillingCycle = BILLING_CYCLES.includes(payload.billingCycle as InsuranceBillingCycle)
    ? payload.billingCycle as InsuranceBillingCycle : 'monthly';
  const premium = typeof payload.premium === 'number' ? payload.premium : 0;

  const policy: InsurancePolicy = {
    id: crypto.randomUUID(),
    name: typeof payload.name === 'string' ? payload.name.trim() : 'Policy',
    type: POLICY_TYPES.includes(payload.type as InsurancePolicyType) ? payload.type as InsurancePolicyType : 'other',
    provider: typeof payload.provider === 'string' ? payload.provider : '',
    premium,
    billingCycle,
    monthlyPremium: toMonthlyPremium(premium, billingCycle),
    coverageAmount: typeof payload.coverageAmount === 'number' ? payload.coverageAmount : undefined,
    deductible: typeof payload.deductible === 'number' ? payload.deductible : undefined,
    policyNumber: typeof payload.policyNumber === 'string' ? payload.policyNumber : undefined,
    nextRenewalDate: typeof payload.nextRenewalDate === 'string' ? payload.nextRenewalDate : now.split('T')[0],
    startDate: typeof payload.startDate === 'string' ? payload.startDate : now.split('T')[0],
    isActive: payload.isActive !== false,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await saveLedgerProfile(
    { ...profile, insurancePolicies: [...(profile.insurancePolicies ?? []), policy], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('INSURANCE_POLICY_CREATED' as SpineEventType, { policyId: policy.id, type: policy.type });
}

async function handleUpdateInsurancePolicy(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const policies = (profile.insurancePolicies ?? []).map(p => {
    if (p.id !== payload.policyId) return p;
    const premium = typeof payload.premium === 'number' ? payload.premium : p.premium;
    const billingCycle = BILLING_CYCLES.includes(payload.billingCycle as InsuranceBillingCycle) ? payload.billingCycle as InsuranceBillingCycle : p.billingCycle;
    return { ...p, ...payload, premium, billingCycle, monthlyPremium: toMonthlyPremium(premium, billingCycle), updatedAt: now };
  });
  await saveLedgerProfile({ ...profile, insurancePolicies: policies, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function handleDeleteInsurancePolicy(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  await saveLedgerProfile(
    { ...profile, insurancePolicies: (profile.insurancePolicies ?? []).filter(p => p.id !== payload.policyId), updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

export function registerLedgerInsuranceActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    create_insurance_policy:  handleCreateInsurancePolicy,
    update_insurance_policy:  handleUpdateInsurancePolicy,
    delete_insurance_policy:  handleDeleteInsurancePolicy,
    analyze_insurance_coverage: async ({ pushAssistantMessage }) => {
      pushAssistantMessage?.('This analysis is coming soon.');
    },
  });
}
