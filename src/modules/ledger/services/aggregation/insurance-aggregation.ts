import type { InsurancePolicy, InsuranceBillingCycle } from '../ledger-intake-service';

export function toMonthlyPremium(premium: number, cycle: InsuranceBillingCycle): number {
  switch (cycle) {
    case 'monthly':   return premium;
    case 'quarterly': return premium / 3;
    case 'biannual':  return premium / 6;
    case 'yearly':    return premium / 12;
    default:          return premium;
  }
}

export function toAnnualPremium(premium: number, cycle: InsuranceBillingCycle): number {
  switch (cycle) {
    case 'monthly':   return premium * 12;
    case 'quarterly': return premium * 4;
    case 'biannual':  return premium * 2;
    case 'yearly':    return premium;
    default:          return premium * 12;
  }
}

export interface InsuranceSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  inactiveCount: number;
  byType: Record<string, number>;
}

export function computeInsuranceSummary(policies: InsurancePolicy[]): InsuranceSummary {
  let totalMonthly = 0;
  let totalAnnual = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  const byType: Record<string, number> = {};

  for (const policy of policies) {
    if (policy.isActive) {
      totalMonthly += policy.monthlyPremium;
      totalAnnual += toAnnualPremium(policy.premium, policy.billingCycle);
      activeCount++;
      byType[policy.type] = (byType[policy.type] ?? 0) + policy.monthlyPremium;
    } else {
      inactiveCount++;
    }
  }

  return { totalMonthly, totalAnnual, activeCount, inactiveCount, byType };
}

export function getUpcomingRenewals(policies: InsurancePolicy[], withinDays = 30): InsurancePolicy[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 86_400_000);
  return policies.filter(p => {
    if (!p.isActive) return false;
    const d = new Date(p.nextRenewalDate);
    return d >= now && d <= cutoff;
  });
}

export function detectCoverageGaps(policies: InsurancePolicy[]): string[] {
  const gaps: string[] = [];
  const activeTypes = new Set(policies.filter(p => p.isActive).map(p => p.type));
  if (!activeTypes.has('health')) gaps.push('No active health insurance policy detected.');
  if (!activeTypes.has('life') && !activeTypes.has('disability')) gaps.push('No life or disability insurance — consider coverage for income protection.');
  if (!activeTypes.has('auto')) gaps.push('No auto insurance detected (required in most jurisdictions).');
  return gaps;
}
