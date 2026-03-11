import { LedgerIntakeProfile } from './ledger-intake-service';

/**
 * Canonical financial friction calculator — single source of truth for
 * `nsv.resource.financialFriction`.
 *
 * Formula (weighted combination, result clamped to [0, 1]):
 *   DTI           = monthlyDebtPayments / monthlyIncome          weight 0.40
 *   Expense ratio = totalExpenses       / monthlyIncome          weight 0.40
 *   Savings gap   = max(0, 0.2·income − actualSavings) / income  weight 0.20
 *
 * DTI uses the sum of minimum monthly debt payments (not total debt balance),
 * giving an accurate picture of current cash-flow strain.
 *
 * @returns A float in [0, 1]. Returns 0 when monthlyIncome ≤ 0 (no division by zero).
 */
export function computeFinancialFriction(profile: LedgerIntakeProfile): number {
  const income = Math.max(profile.monthlyIncome, 0);
  if (income === 0) return 0;

  const totalExpenses =
    profile.fixedExpenses.reduce((sum, e) => sum + e.amount, 0) +
    profile.variableExpenses.reduce((sum, e) => sum + e.amount, 0);

  // DTI: monthly minimum debt payments / monthly income — correct per spec
  const monthlyDebtPayments = profile.debtItems.reduce((sum, d) => sum + d.minPayment, 0);
  const dti = Math.min(monthlyDebtPayments / income, 1);

  // Expense ratio: total monthly expenses / monthly income
  const expenseRatio = Math.min(totalExpenses / income, 1);

  // Savings gap: shortfall from 20 % savings target as share of income
  const recommendedMonthlySavings = income * 0.2;
  const actualMonthlySavings = profile.savingsGoals.reduce(
    (sum, g) => sum + (g.monthlyContribution ?? 0),
    0,
  );
  const savingsGap = Math.min(
    Math.max(0, recommendedMonthlySavings - actualMonthlySavings) / income,
    1,
  );

  const friction = dti * 0.4 + expenseRatio * 0.4 + savingsGap * 0.2;
  return Math.min(1, Math.max(0, friction));
}

export function computeResonanceROI(profile: LedgerIntakeProfile): { resonanceROI: number; financialFriction: number } {
  const income = Math.max(profile.monthlyIncome, 0);
  const totalExpenses =
    profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0) +
    profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0);

  const bufferRatio = income > 0 ? (income - totalExpenses) / income : 0;

  // Delegate to the canonical friction function — no duplicate logic here
  const friction = computeFinancialFriction(profile);

  const roi = Math.max(0, Math.min(1, 0.4 + bufferRatio * 0.6 - friction * 0.2));

  return {
    resonanceROI: Number(roi.toFixed(2)),
    // NSV stores friction on a 0-10 scale for UI/tier consumers
    financialFriction: Math.round(friction * 10),
  };
}
