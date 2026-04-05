/**
 * cross-verification-service.ts  (S2-L-004)
 *
 * Pure financial intelligence layer — no React, no side-effects.
 * Responsibilities:
 *   1. verifyFinancialCoherence  — deterministic rule-based coherence checks
 *   2. computeNSVFinancialPatch  — maps Ledger metrics → NSV resource/cognitive domains
 *   3. buildLedgerSpineEvents    — constructs SpineEventPayload[] ready for Spine.publish()
 *
 * Complexity: all operations are O(n) over the profile's expense / debt /
 * budget-category arrays. No nested loops; total work is proportional to the
 * sum of array lengths in the profile.
 */

import type { NeuralStateVectorPatch, SpineEventPayload } from '@/lib/types';
import type { LedgerIntakeProfile } from './ledger-intake-service';
import { computeFinancialFriction } from './resonance-roi-service';
import { CrossVerificationServiceJs } from '@cortex-logic';

const _crossVerification = new CrossVerificationServiceJs();

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface CoherenceIssue {
  severity: 'warning' | 'error';
  field: string;
  message: string;
  suggestion: string;
}

export interface CoherenceReport {
  /** Ordered list of detected issues — errors precede warnings when present. */
  issues: CoherenceIssue[];
  /** 0–100 composite health score (100 = fully coherent). */
  score: number;
  hasErrors: boolean;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/** Sums BudgetLineItem amounts in a single pass. O(n). */
function sumLineItems(items: LedgerIntakeProfile['fixedExpenses']): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

/** Serialize a LedgerIntakeProfile to the slim JSON format KMP expects. */
function toSnapshotJson(profile: LedgerIntakeProfile): string {
  return JSON.stringify({
    monthlyIncome: profile.monthlyIncome,
    fixedExpenses: profile.fixedExpenses.map(e => ({ amount: e.amount })),
    variableExpenses: profile.variableExpenses.map(e => ({ amount: e.amount })),
    debtItems: profile.debtItems.map(d => ({ id: d.id, name: d.name, minPayment: d.minPayment })),
    budgetCategories: (profile.budgetCategories ?? []).map(c => ({ id: c.id, name: c.name, allocated: c.allocated, spent: c.spent })),
    savingsGoals: profile.savingsGoals.map(g => ({ monthlyContribution: g.monthlyContribution ?? 0 })),
  });
}

// ─── 1a. verifyFinancialCoherence ────────────────────────────────────────────

/**
 * Runs a deterministic ruleset over the profile and returns a CoherenceReport.
 * Delegates to cortex-logic KMP for identical results on both platforms.
 */
export function verifyFinancialCoherence(profile: LedgerIntakeProfile): CoherenceReport {
  return JSON.parse(_crossVerification.verifyCoherence(toSnapshotJson(profile)));
}

// ─── 1b. computeNSVFinancialPatch ────────────────────────────────────────────

/**
 * Maps Ledger metrics to the NeuralStateVector patch shape.
 * Delegates to cortex-logic KMP for identical results on both platforms.
 */
export function computeNSVFinancialPatch(profile: LedgerIntakeProfile): NeuralStateVectorPatch {
  const patch = JSON.parse(_crossVerification.computeNsvFinancialPatch(toSnapshotJson(profile)));
  return {
    resource: { financialFriction: patch.financialFriction },
    cognitive: { energyBudget: patch.energyBudget },
  };
}

// ─── 1c. buildLedgerSpineEvents ──────────────────────────────────────────────

/**
 * Constructs the array of SpineEventPayload objects that reflect the current
 * (and optionally delta from previous) financial state.
 *
 * Caller is responsible for publishing each payload via `Spine.publish()`.
 *
 * Event matrix:
 *   CASHFLOW_POSITIVE        — netCashflow > 0
 *   CASHFLOW_NEGATIVE        — netCashflow < 0
 *   FINANCIAL_FRICTION_UPDATED — DTI > 43 %
 *   INCOME_CHANGE            — |income delta| > 10 % of previous income (requires prev)
 *   OVERSPEND_DETECTED       — budget category spent > allocated × 1.2 (per category)
 *
 * @param profile - Current LedgerIntakeProfile.
 * @param prev    - Optional previous profile for delta-based events.
 * @returns       - Array of payloads (may be empty if no conditions are met).
 */
export function buildLedgerSpineEvents(
  profile: LedgerIntakeProfile,
  prev?: LedgerIntakeProfile,
): SpineEventPayload[] {
  const events: SpineEventPayload[] = [];

  const totalIncome = Math.max(profile.monthlyIncome, 0);
  const totalExpenses = sumLineItems(profile.fixedExpenses) + sumLineItems(profile.variableExpenses);
  const netCashflow = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? netCashflow / totalIncome : 0;
  const budgetCategories = profile.budgetCategories ?? [];
  const totalBudgetAllocated = budgetCategories.reduce((sum, cat) => sum + Math.max(cat.allocated, 0), 0);
  const totalBudgetSpent = budgetCategories.reduce((sum, cat) => sum + Math.max(cat.spent, 0), 0);

  const monthlyDebtPayments = profile.debtItems.reduce((s, d) => s + d.minPayment, 0);
  const dti = totalIncome > 0 ? monthlyDebtPayments / totalIncome : 0;
  const frictionScore = computeFinancialFriction(profile) * 10;
  const prevIncome = prev ? Math.max(prev.monthlyIncome, 0) : null;
  const prevTotalExpenses = prev
    ? sumLineItems(prev.fixedExpenses) + sumLineItems(prev.variableExpenses)
    : null;
  const prevBudgetCategories = prev?.budgetCategories ?? [];

  const milestoneThresholds = [0.25, 0.5, 0.75, 1];

  // Cashflow direction
  if (netCashflow > 0) {
    events.push({
      type: 'CASHFLOW_POSITIVE',
      source: 'ledger',
      domain: 'R',
      priority: 'info',
      data: { netCashflow, savingsRate },
    });
  } else if (netCashflow < 0) {
    events.push({
      type: 'CASHFLOW_NEGATIVE',
      source: 'ledger',
      domain: 'R',
      priority: 'alert',
      data: { netCashflow, deficit: -netCashflow },
    });
  }

  // High DTI → friction update
  if (dti > 0.43) {
    events.push({
      type: 'FINANCIAL_FRICTION_UPDATED',
      source: 'ledger',
      domain: 'R',
      priority: 'info',
      data: { dti, frictionScore },
    });
  }

  // Income change relative to previous snapshot (threshold: 10 % of previous)
  if (prev !== undefined) {
    const prevIncome = Math.max(prev.monthlyIncome, 0);
    if (prevIncome > 0 && Math.abs(totalIncome - prevIncome) > prevIncome * 0.1) {
      events.push({
        type: 'INCOME_CHANGE',
        source: 'ledger',
        domain: 'R',
        priority: 'info',
        data: { previousIncome: prevIncome, currentIncome: totalIncome },
      });
    }
  }

  // Per-category overspend (spent > allocated × 1.2)
  for (const cat of profile.budgetCategories ?? []) {
    if (cat.allocated > 0 && cat.spent > cat.allocated * 1.2) {
      events.push({
        type: 'OVERSPEND_DETECTED',
        source: 'ledger',
        domain: 'R',
        priority: 'alert',
        data: {
          categoryId: cat.id,
          categoryName: cat.name,
          allocated: cat.allocated,
          spent: cat.spent,
          overspendPercent: Math.round(((cat.spent - cat.allocated) / cat.allocated) * 100),
        },
      });
    }
  }

  // Budget alert: overall overspend against income or allocated budget
  if (totalIncome > 0) {
    const overspendRatio = totalExpenses / totalIncome;
    if (overspendRatio > 1.05) {
      events.push({
        type: 'BUDGET_ALERT',
        source: 'ledger',
        domain: 'R',
        priority: 'alert',
        data: {
          totalIncome,
          totalExpenses,
          overspendRatio: Math.round(overspendRatio * 100) / 100,
          deficit: Math.max(0, totalExpenses - totalIncome),
        },
      });
    }
  }

  if (totalBudgetAllocated > 0 && totalBudgetSpent > totalBudgetAllocated * 1.1) {
    events.push({
      type: 'BUDGET_ALERT',
      source: 'ledger',
      domain: 'R',
      priority: 'alert',
      data: {
        totalBudgetAllocated,
        totalBudgetSpent,
        overspendRatio: Math.round((totalBudgetSpent / totalBudgetAllocated) * 100) / 100,
      },
    });
  }

  // Expense spike vs previous snapshot (requires prev)
  if (prevTotalExpenses !== null && prevTotalExpenses > 0) {
    const delta = totalExpenses - prevTotalExpenses;
    if (delta > prevTotalExpenses * 0.25) {
      events.push({
        type: 'EXPENSE_SPIKE',
        source: 'ledger',
        domain: 'R',
        priority: 'alert',
        data: {
          previousExpenses: prevTotalExpenses,
          currentExpenses: totalExpenses,
          delta,
          percentChange: Math.round((delta / prevTotalExpenses) * 100),
        },
      });
    }
  }

  // Debt payoff milestones (requires prev)
  if (prev) {
    const prevDebtById = new Map(prev.debtItems.map((item) => [item.id, item]));
    for (const debt of profile.debtItems) {
      const prevDebt = prevDebtById.get(debt.id);
      const baseline = debt.originalBalance ?? prevDebt?.originalBalance ?? prevDebt?.balance ?? debt.balance;
      if (!baseline || baseline <= 0) continue;
      const prevBalance = prevDebt ? Math.max(prevDebt.balance, 0) : baseline;
      const currentBalance = Math.max(debt.balance, 0);
      const prevProgress = Math.min(1, Math.max(0, (baseline - prevBalance) / baseline));
      const currentProgress = Math.min(1, Math.max(0, (baseline - currentBalance) / baseline));

      for (const milestone of milestoneThresholds) {
        if (prevProgress < milestone && currentProgress >= milestone) {
          events.push({
            type: 'DEBT_MILESTONE',
            source: 'ledger',
            domain: 'R',
            priority: milestone >= 1 ? 'info' : 'alert',
            data: {
              debtId: debt.id,
              debtName: debt.name,
              milestone,
              balance: currentBalance,
              originalBalance: baseline,
              progressPercent: Math.round(currentProgress * 100),
            },
          });
        }
      }
    }
  }

  // Savings milestones (requires prev)
  if (prev) {
    const prevSavingsById = new Map((prev.savingsGoals ?? []).map((goal) => [goal.id, goal]));
    for (const goal of profile.savingsGoals ?? []) {
      if (!goal.targetAmount || goal.targetAmount <= 0) continue;
      const prevGoal = prevSavingsById.get(goal.id);
      const prevAmount = Math.max(prevGoal?.currentAmount ?? 0, 0);
      const currentAmount = Math.max(goal.currentAmount, 0);
      const prevProgress = Math.min(1, prevAmount / goal.targetAmount);
      const currentProgress = Math.min(1, currentAmount / goal.targetAmount);

      for (const milestone of milestoneThresholds) {
        if (prevProgress < milestone && currentProgress >= milestone) {
          events.push({
            type: 'SAVINGS_MILESTONE',
            source: 'ledger',
            domain: 'R',
            priority: milestone >= 1 ? 'info' : 'alert',
            data: {
              goalId: goal.id,
              goalName: goal.name,
              milestone,
              currentAmount,
              targetAmount: goal.targetAmount,
              progressPercent: Math.round(currentProgress * 100),
            },
          });
        }
      }
    }

    const prevFinancialGoalsById = new Map((prev.financialGoals ?? []).map((goal) => [goal.id, goal]));
    for (const goal of profile.financialGoals ?? []) {
      if (goal.type !== 'savings' || !goal.targetAmount || goal.targetAmount <= 0) continue;
      const prevGoal = prevFinancialGoalsById.get(goal.id);
      const prevAmount = Math.max(prevGoal?.currentAmount ?? 0, 0);
      const currentAmount = Math.max(goal.currentAmount, 0);
      const prevProgress = Math.min(1, prevAmount / goal.targetAmount);
      const currentProgress = Math.min(1, currentAmount / goal.targetAmount);

      for (const milestone of milestoneThresholds) {
        if (prevProgress < milestone && currentProgress >= milestone) {
          events.push({
            type: 'SAVINGS_MILESTONE',
            source: 'ledger',
            domain: 'R',
            priority: milestone >= 1 ? 'info' : 'alert',
            data: {
              goalId: goal.id,
              goalName: goal.name,
              milestone,
              currentAmount,
              targetAmount: goal.targetAmount,
              progressPercent: Math.round(currentProgress * 100),
              goalType: 'financial',
            },
          });
        }
      }
    }
  }

  return events;
}
