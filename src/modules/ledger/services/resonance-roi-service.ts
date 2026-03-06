import { LedgerIntakeProfile } from './ledger-intake-service';

export function computeResonanceROI(profile: LedgerIntakeProfile): { resonanceROI: number; financialFriction: number } {
  const totalFixed = profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalDebt = profile.debtItems.reduce((sum, item) => sum + item.balance, 0);
  const income = Math.max(profile.monthlyIncome, 0);
  const totalExpense = totalFixed + totalVariable;

  const bufferRatio = income > 0 ? (income - totalExpense) / income : 0;
  const debtRatio = income > 0 ? Math.min(totalDebt / (income * 12), 1) : 0.5;

  const friction = Math.max(0, Math.min(10, Math.round((1 - bufferRatio) * 6 + debtRatio * 4)));
  const roi = Math.max(0, Math.min(1, 0.4 + bufferRatio * 0.6 - debtRatio * 0.2));

  return {
    resonanceROI: Number(roi.toFixed(2)),
    financialFriction: friction
  };
}
