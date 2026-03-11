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

// ─── 1a. verifyFinancialCoherence ────────────────────────────────────────────

/**
 * Runs a deterministic ruleset over the profile and returns a CoherenceReport.
 *
 * Scoring: start at 100, −20 per error, −10 per warning, clamped to [0, 100].
 *
 * Time complexity: O(n) where n = total line items + debt items + budget categories.
 *
 * @param profile - Current LedgerIntakeProfile to validate.
 * @returns       - CoherenceReport with issue list, score, and hasErrors flag.
 */
export function verifyFinancialCoherence(profile: LedgerIntakeProfile): CoherenceReport {
  const issues: CoherenceIssue[] = [];

  // Derived metrics — single-pass accumulation
  const totalIncome = Math.max(profile.monthlyIncome, 0);
  const totalExpenses = sumLineItems(profile.fixedExpenses) + sumLineItems(profile.variableExpenses);
  const monthlyDebtPayments = profile.debtItems.reduce((s, d) => s + d.minPayment, 0);
  const debtToIncomeRatio = totalIncome > 0 ? monthlyDebtPayments / totalIncome : 0;
  const savingsRate = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;

  // Rule 1: Expenses > 150 % of income → error
  if (totalExpenses > totalIncome * 1.5) {
    issues.push({
      severity: 'error',
      field: 'expenses',
      message: 'Expenses exceed 150% of income',
      suggestion: 'Review and reduce variable or fixed expenses to bring spending below 150% of income.',
    });
  }

  // Rule 2: DTI above mortgage qualification threshold → warning
  if (debtToIncomeRatio > 0.43) {
    issues.push({
      severity: 'warning',
      field: 'debtToIncomeRatio',
      message: 'DTI above 43% (mortgage qualification threshold)',
      suggestion: 'Consider reducing debt obligations or increasing income to bring DTI below 43%.',
    });
  }

  // Rule 3: Negative savings rate → warning
  if (savingsRate < 0) {
    issues.push({
      severity: 'warning',
      field: 'savingsRate',
      message: 'Negative savings rate — spending exceeds income',
      suggestion: 'Identify discretionary expenses to cut in order to return to a positive savings rate.',
    });
  }

  // Rule 4: No income configured → warning
  if (totalIncome === 0) {
    issues.push({
      severity: 'warning',
      field: 'monthlyIncome',
      message: 'No income sources configured',
      suggestion: 'Add at least one income source to enable accurate financial analysis.',
    });
  }

  // Rule 5: Negative budget allocation → error per category
  for (const cat of profile.budgetCategories ?? []) {
    if (cat.allocated < 0) {
      issues.push({
        severity: 'error',
        field: `budgetCategory.${cat.id}`,
        message: `Negative budget allocation for ${cat.name}`,
        suggestion: `Set the allocated amount for "${cat.name}" to 0 or a positive value.`,
      });
    }
  }

  // Rule 6: Debt item missing minimum payment → warning per item
  for (const debt of profile.debtItems) {
    if (!debt.minPayment || debt.minPayment <= 0) {
      issues.push({
        severity: 'warning',
        field: `debtItem.${debt.id}`,
        message: `Debt item missing minimum payment`,
        suggestion: `Set the minimum payment for "${debt.name}" to ensure accurate DTI calculation.`,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const score = Math.max(0, 100 - errorCount * 20 - warningCount * 10);

  return { issues, score, hasErrors: errorCount > 0 };
}

// ─── 1b. computeNSVFinancialPatch ────────────────────────────────────────────

/**
 * Maps Ledger metrics to the NeuralStateVector patch shape understood by
 * `updateCrossFunctionalState`.
 *
 * Mappings:
 *   resource.financialFriction  — computeFinancialFriction() × 10  (0–10)
 *   cognitive.energyBudget      — piecewise-linear from savingsRate (0→3, 20%→7, 40%+→10)
 *
 * Note: `resourceStress` and `energyBudget` in resource domain do not exist in
 * the current NeuralStateVector schema. energyBudget lives in the `cognitive`
 * domain; resourceStress is omitted until the schema is extended.
 *
 * @param profile - Current LedgerIntakeProfile.
 * @returns       - Partial NSV patch (resource + cognitive domains only).
 */
export function computeNSVFinancialPatch(profile: LedgerIntakeProfile): NeuralStateVectorPatch {
  // Financial friction: 0–1 raw → 0–10 NSV scale (one decimal)
  const rawFriction = computeFinancialFriction(profile);
  const financialFriction = Math.round(rawFriction * 10 * 10) / 10;

  // Energy budget: piecewise-linear from savingsRate
  const totalIncome = Math.max(profile.monthlyIncome, 0);
  const totalExpenses = sumLineItems(profile.fixedExpenses) + sumLineItems(profile.variableExpenses);
  const savingsRate = totalIncome > 0 ? (totalIncome - totalExpenses) / totalIncome : 0;

  let energyBudget: number;
  if (savingsRate <= 0) {
    // No savings headroom → minimum energy
    energyBudget = 3;
  } else if (savingsRate <= 0.2) {
    // Linear: 0% → 3, 20% → 7
    energyBudget = 3 + (savingsRate / 0.2) * 4;
  } else if (savingsRate <= 0.4) {
    // Linear: 20% → 7, 40% → 10
    energyBudget = 7 + ((savingsRate - 0.2) / 0.2) * 3;
  } else {
    energyBudget = 10;
  }
  energyBudget = Math.round(energyBudget * 10) / 10;

  return {
    resource: { financialFriction },
    cognitive: { energyBudget },
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

  const monthlyDebtPayments = profile.debtItems.reduce((s, d) => s + d.minPayment, 0);
  const dti = totalIncome > 0 ? monthlyDebtPayments / totalIncome : 0;
  const frictionScore = computeFinancialFriction(profile) * 10;

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
      priority: 'alert',
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

  return events;
}
