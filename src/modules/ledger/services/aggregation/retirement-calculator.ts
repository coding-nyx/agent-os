/**
 * Retirement Calculator — thin bridge over cortex-logic's RetirementCalculatorJs.
 * Algorithm lives in KMP commonMain so both Agnes and nexus-android produce
 * identical projections.
 */

import type { RetirementPlan, RetirementProjection } from '../ledger-intake-service';
import { RetirementCalculatorJs } from '@cortex-logic';

const calculator = new RetirementCalculatorJs();

export function projectRetirement(plan: RetirementPlan): RetirementProjection {
  const planJson = JSON.stringify({
    id: plan.id,
    currentAge: plan.currentAge,
    targetRetirementAge: plan.targetRetirementAge,
    currentSavings: plan.currentSavings,
    monthlyContribution: plan.monthlyContribution,
    expectedAnnualReturnPct: plan.expectedAnnualReturnPct,
    inflationRatePct: plan.inflationRatePct,
    targetMonthlyIncome: plan.targetMonthlyIncome,
  });
  const currentYear = new Date().getFullYear();
  const result = JSON.parse(calculator.project(planJson, currentYear));
  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}

export function requiredMonthlyContribution(plan: RetirementPlan): number {
  const planJson = JSON.stringify({
    id: plan.id,
    currentAge: plan.currentAge,
    targetRetirementAge: plan.targetRetirementAge,
    currentSavings: plan.currentSavings,
    monthlyContribution: plan.monthlyContribution,
    expectedAnnualReturnPct: plan.expectedAnnualReturnPct,
    inflationRatePct: plan.inflationRatePct,
    targetMonthlyIncome: plan.targetMonthlyIncome,
  });
  return calculator.requiredMonthlyContribution(planJson);
}
