import type { RetirementPlan, RetirementProjection } from '../ledger-intake-service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compound growth formula: FV = PV*(1+r)^n + PMT*[((1+r)^n - 1)/r]
 * where r = monthly rate, n = months, PMT = monthly contribution.
 */
function futureValue(presentValue: number, monthlyRate: number, months: number, monthlyContribution: number): number {
  if (monthlyRate === 0) return presentValue + monthlyContribution * months;
  const growth = Math.pow(1 + monthlyRate, months);
  return presentValue * growth + monthlyContribution * ((growth - 1) / monthlyRate);
}

export function projectRetirement(plan: RetirementPlan): RetirementProjection {
  const yearsToRetirement = plan.targetRetirementAge - plan.currentAge;
  const months = yearsToRetirement * 12;
  const nominalMonthlyRate = plan.expectedAnnualReturnPct / 100 / 12;
  const realMonthlyRate = ((1 + plan.expectedAnnualReturnPct / 100) / (1 + plan.inflationRatePct / 100) - 1) / 12;

  const projectedNestEgg = round2(futureValue(plan.currentSavings, nominalMonthlyRate, months, plan.monthlyContribution));

  // Required nest egg using 4% safe withdrawal rate for target monthly income
  const annualIncomeNeeded = plan.targetMonthlyIncome * 12;
  const requiredNestEgg = round2(annualIncomeNeeded / 0.04);

  const fourPercentRuleMonthly = round2((projectedNestEgg * 0.04) / 12);
  const shortfallOrSurplus = round2(projectedNestEgg - requiredNestEgg);

  // Build milestones (every 5 years)
  const milestones: RetirementProjection['milestones'] = [];
  for (let y = 5; y <= yearsToRetirement; y += 5) {
    const age = plan.currentAge + y;
    const projectedBalance = round2(futureValue(plan.currentSavings, nominalMonthlyRate, y * 12, plan.monthlyContribution));
    milestones.push({ year: new Date().getFullYear() + y, age, projectedBalance });
  }

  return {
    planId: plan.id,
    generatedAt: new Date().toISOString(),
    yearsToRetirement,
    projectedNestEgg,
    requiredNestEgg,
    monthlyIncomeSupported: fourPercentRuleMonthly,
    onTrack: projectedNestEgg >= requiredNestEgg,
    shortfallOrSurplus,
    fourPercentRuleMonthly,
    milestones,
  };
}

/** How much monthly contribution is needed to reach the target. */
export function requiredMonthlyContribution(plan: RetirementPlan): number {
  const months = (plan.targetRetirementAge - plan.currentAge) * 12;
  const r = plan.expectedAnnualReturnPct / 100 / 12;
  const annualIncomeNeeded = plan.targetMonthlyIncome * 12;
  const target = annualIncomeNeeded / 0.04;
  const growth = Math.pow(1 + r, months);
  // PMT = (target - PV * growth) * r / (growth - 1)
  if (growth === 1) return (target - plan.currentSavings) / months;
  return round2(((target - plan.currentSavings * growth) * r) / (growth - 1));
}
