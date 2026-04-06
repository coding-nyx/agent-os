/**
 * LedgerCrossVerificationEngine — delegates all pure computation to KMP CrossVerificationServiceJs.
 *
 * `checkAndEmitFinancialFriction` remains here (async + GlobalProjectionService side-effect).
 * All exported types/interfaces are preserved for UI consumers.
 */

import { CrossVerificationServiceJs } from '@cortex-logic';
import type { BudgetLineItem, LedgerIntakeProfile, TaxCategory } from './ledger-intake-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeFinancialFriction } from './resonance-roi-service';

// Re-export for consumers that want the type from the engine file.
export type { TaxCategory };

export type TaxDeductionCategory =
  | 'home_office'
  | 'equipment'
  | 'professional_development'
  | 'health_fsa_hsa'
  | 'charitable'
  | 'business_travel'
  | 'subscriptions_software'
  | 'retirement_contribution'
  | 'other_deductible';

export interface DebtInput {
  name: string;
  balance: number;
  /** APR as a decimal (e.g. 0.22 for 22 %). */
  rate: number;
  minPayment: number;
}

export interface DebtPayoffPlan {
  name: string;
  originalBalance: number;
  /** 1 = first debt to be cleared. */
  payoffOrder: number;
  monthsToPayoff: number;
  totalInterestPaid: number;
  effectiveRate: number;
}

export interface SavingsGoalInput {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
}

export interface SavingsProjection {
  goalId: string;
  label: string;
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
  monthsToGoal: number;
  achieveByDate: string;
  confidenceBand: {
    optimistic: number;
    base: number;
    pessimistic: number;
  };
  percentComplete: number;
}

export interface LedgerAnalysisSummary {
  categorizedExpenses: Array<BudgetLineItem & { taxCategory: TaxCategory }>;
  ytdDeductibleTotal: number;
  estimatedTaxSaving: number;
  roiScores: Array<{ item: BudgetLineItem; usageFrequency: number; roiScore: number }>;
  debtSnowballPlan: DebtPayoffPlan[];
  savingsProjections: SavingsProjection[];
}

const _svc = new (CrossVerificationServiceJs as any)();

export function categorizeTax(expense: BudgetLineItem): TaxCategory {
  return _svc.categorizeTax(JSON.stringify(expense)) as TaxCategory;
}

export function calculateBehavioralROI(item: BudgetLineItem, usageFrequency: number): number {
  return _svc.calculateBehavioralROI(JSON.stringify(item), usageFrequency) as number;
}

export function estimateUsageFrequency(expense: BudgetLineItem): number {
  return _svc.estimateUsageFrequency(JSON.stringify(expense)) as number;
}

export function planDebtSnowball(debts: DebtInput[], extraBudget: number): DebtPayoffPlan[] {
  return JSON.parse(_svc.planDebtSnowball(JSON.stringify(debts), extraBudget)) as DebtPayoffPlan[];
}

export function projectSavingsGoal(goal: SavingsGoalInput): SavingsProjection {
  return JSON.parse(_svc.projectSavingsGoal(JSON.stringify(goal))) as SavingsProjection;
}

export function estimateQuarterlyTax(
  monthlyIncome: number,
  monthlyDeductibles: number,
): { estimatedLiability: number; nextDeadline: string } {
  return JSON.parse(_svc.estimateQuarterlyTax(monthlyIncome, monthlyDeductibles));
}

export function suggestTaxOptimizations(
  expenses: Array<BudgetLineItem & { taxCategory: TaxCategory }>,
): Array<{ fieldId: string; current: string; suggested: string; reason: string }> {
  return JSON.parse(_svc.suggestTaxOptimizations(JSON.stringify(expenses)));
}

export function analyzeProfile(
  profile: LedgerIntakeProfile,
  savingsContributions: Record<string, number> = {},
): LedgerAnalysisSummary {
  return JSON.parse(
    _svc.analyzeProfile(JSON.stringify(profile), JSON.stringify(savingsContributions)),
  ) as LedgerAnalysisSummary;
}

// ─── Cross-module side-effect (stays in TS) ───────────────────────────────────

export async function checkAndEmitFinancialFriction(
  profile: LedgerIntakeProfile,
  uid: string | undefined | null,
): Promise<void> {
  if (!uid || !profile || profile.monthlyIncome <= 0) return;
  const frictionScore = Math.round(computeFinancialFriction(profile) * 10);
  try {
    await GlobalProjectionService.updateCrossFunctionalState(
      uid,
      { resource: { financialFriction: frictionScore } },
    );
  } catch (err) {
    console.error('[LedgerCrossVerificationEngine] Failed to emit financialFriction:', err);
  }
}
