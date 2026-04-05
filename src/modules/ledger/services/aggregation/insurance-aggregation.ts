// Bridge: delegates to KMP InsuranceAggregationJs.
// toMonthlyPremium and toAnnualPremium are not in KMP — they remain as local
// TS helpers since callers import them directly from this module.

import { InsuranceAggregationJs } from '@cortex-logic';
import type { InsurancePolicy, InsuranceBillingCycle } from '../ledger-intake-service';

export interface InsuranceSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  inactiveCount: number;
  byType: Record<string, number>;
}

const _insuranceAgg = new InsuranceAggregationJs();

// Not in KMP — retained locally as a pure utility used by callers.
export function toMonthlyPremium(premium: number, cycle: InsuranceBillingCycle): number {
  switch (cycle) {
    case 'monthly':   return premium;
    case 'quarterly': return premium / 3;
    case 'biannual':  return premium / 6;
    case 'yearly':    return premium / 12;
    default:          return premium;
  }
}

// Not in KMP — retained locally.
export function toAnnualPremium(premium: number, cycle: InsuranceBillingCycle): number {
  switch (cycle) {
    case 'monthly':   return premium * 12;
    case 'quarterly': return premium * 4;
    case 'biannual':  return premium * 2;
    case 'yearly':    return premium;
    default:          return premium * 12;
  }
}

export function computeInsuranceSummary(policies: InsurancePolicy[]): InsuranceSummary {
  return JSON.parse(
    _insuranceAgg.computeInsuranceSummary(JSON.stringify(policies)),
  ) as InsuranceSummary;
}

export function getUpcomingRenewals(
  policies: InsurancePolicy[],
  withinDays = 30,
): InsurancePolicy[] {
  return JSON.parse(
    _insuranceAgg.getUpcomingRenewals(JSON.stringify(policies), withinDays, Date.now()),
  ) as InsurancePolicy[];
}

export function detectCoverageGaps(policies: InsurancePolicy[]): string[] {
  return JSON.parse(
    _insuranceAgg.detectCoverageGaps(JSON.stringify(policies)),
  ) as string[];
}
