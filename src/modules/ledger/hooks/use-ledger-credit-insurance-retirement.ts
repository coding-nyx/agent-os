import { useCallback } from 'react';
import type {
  LedgerIntakeProfile,
  CreditScoreEntry,
  CreditBureau,
  InsurancePolicy,
  InsuranceBillingCycle,
  InsurancePolicyType,
  RetirementPlan,
} from '../services/ledger-intake-service';
import { inferCreditFactors } from '../services/aggregation/credit-aggregation';
import { toMonthlyPremium } from '../services/aggregation/insurance-aggregation';
import { projectRetirement } from '../services/aggregation/retirement-calculator';

export interface LedgerCreditActions {
  handleAddCreditScoreEntry: (data: { score: number; bureau: CreditBureau; recordedAt?: string; notes?: string }) => void;
  handleDeleteCreditScoreEntry: (entryId: string) => void;
}

export interface LedgerInsuranceActions {
  handleCreateInsurancePolicy: (data: Partial<InsurancePolicy>) => void;
  handleUpdateInsurancePolicy: (policyId: string, data: Partial<InsurancePolicy>) => void;
  handleDeleteInsurancePolicy: (policyId: string) => void;
}

export interface LedgerRetirementActions {
  handleCreateRetirementPlan: (data: Partial<RetirementPlan>) => void;
  handleUpdateRetirementPlan: (planId: string, data: Partial<RetirementPlan>) => void;
  handleDeleteRetirementPlan: (planId: string) => void;
  handleProjectRetirement: (planId?: string) => void;
}

export function useLedgerCredit(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerCreditActions {
  const handleAddCreditScoreEntry = useCallback((data: { score: number; bureau: CreditBureau; recordedAt?: string; notes?: string }) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const entry: CreditScoreEntry = {
      id: crypto.randomUUID(),
      score: Math.max(300, Math.min(850, data.score)),
      bureau: data.bureau,
      recordedAt: data.recordedAt ?? now,
      notes: data.notes,
    };
    const factors = inferCreditFactors(entry.score);
    persistUpdate({ ...profile, creditScoreHistory: [...(profile.creditScoreHistory ?? []), entry], creditFactors: factors, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteCreditScoreEntry = useCallback((entryId: string) => {
    if (!profile) return;
    const history = (profile.creditScoreHistory ?? []).filter(e => e.id !== entryId);
    const latestScore = history.length > 0 ? history[history.length - 1].score : 0;
    persistUpdate({ ...profile, creditScoreHistory: history, creditFactors: history.length > 0 ? inferCreditFactors(latestScore) : [], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return { handleAddCreditScoreEntry, handleDeleteCreditScoreEntry };
}

export function useLedgerInsurance(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerInsuranceActions {
  const handleCreateInsurancePolicy = useCallback((data: Partial<InsurancePolicy>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const billingCycle = (data.billingCycle ?? 'monthly') as InsuranceBillingCycle;
    const premium = data.premium ?? 0;
    const policy: InsurancePolicy = {
      id: crypto.randomUUID(),
      name: data.name ?? 'Policy',
      type: (data.type ?? 'other') as InsurancePolicyType,
      provider: data.provider ?? '',
      premium,
      billingCycle,
      monthlyPremium: toMonthlyPremium(premium, billingCycle),
      coverageAmount: data.coverageAmount,
      deductible: data.deductible,
      policyNumber: data.policyNumber,
      nextRenewalDate: data.nextRenewalDate ?? now.split('T')[0],
      startDate: data.startDate ?? now.split('T')[0],
      isActive: data.isActive !== false,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    persistUpdate({ ...profile, insurancePolicies: [...(profile.insurancePolicies ?? []), policy], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateInsurancePolicy = useCallback((policyId: string, data: Partial<InsurancePolicy>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const policies = (profile.insurancePolicies ?? []).map(p => {
      if (p.id !== policyId) return p;
      const premium = data.premium ?? p.premium;
      const billingCycle = data.billingCycle ?? p.billingCycle;
      return { ...p, ...data, premium, billingCycle, monthlyPremium: toMonthlyPremium(premium, billingCycle), updatedAt: now };
    });
    persistUpdate({ ...profile, insurancePolicies: policies, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteInsurancePolicy = useCallback((policyId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, insurancePolicies: (profile.insurancePolicies ?? []).filter(p => p.id !== policyId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return { handleCreateInsurancePolicy, handleUpdateInsurancePolicy, handleDeleteInsurancePolicy };
}

export function useLedgerRetirement(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerRetirementActions {
  const handleCreateRetirementPlan = useCallback((data: Partial<RetirementPlan>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const plan: RetirementPlan = {
      id: crypto.randomUUID(),
      name: data.name ?? 'My Retirement Plan',
      currentAge: data.currentAge ?? 30,
      targetRetirementAge: data.targetRetirementAge ?? 65,
      currentSavings: data.currentSavings ?? 0,
      monthlyContribution: data.monthlyContribution ?? 500,
      expectedAnnualReturnPct: data.expectedAnnualReturnPct ?? 7,
      inflationRatePct: data.inflationRatePct ?? 3,
      targetMonthlyIncome: data.targetMonthlyIncome ?? 5000,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    const projection = projectRetirement(plan);
    persistUpdate({ ...profile, retirementPlans: [...(profile.retirementPlans ?? []), plan], lastRetirementProjection: projection, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateRetirementPlan = useCallback((planId: string, data: Partial<RetirementPlan>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const plans = (profile.retirementPlans ?? []).map(p => p.id === planId ? { ...p, ...data, updatedAt: now } : p);
    const updatedPlan = plans.find(p => p.id === planId);
    const projection = updatedPlan ? projectRetirement(updatedPlan) : profile.lastRetirementProjection;
    persistUpdate({ ...profile, retirementPlans: plans, lastRetirementProjection: projection, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteRetirementPlan = useCallback((planId: string) => {
    if (!profile) return;
    persistUpdate({ ...profile, retirementPlans: (profile.retirementPlans ?? []).filter(p => p.id !== planId), updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleProjectRetirement = useCallback((planId?: string) => {
    if (!profile) return;
    const plans = profile.retirementPlans ?? [];
    const plan = planId ? plans.find(p => p.id === planId) : plans[0];
    if (!plan) return;
    const projection = projectRetirement(plan);
    persistUpdate({ ...profile, lastRetirementProjection: projection, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return { handleCreateRetirementPlan, handleUpdateRetirementPlan, handleDeleteRetirementPlan, handleProjectRetirement };
}
