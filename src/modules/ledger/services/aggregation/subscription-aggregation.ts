import type { Subscription, SubscriptionBillingCycle } from '../ledger-intake-service';

export function toMonthlyEquivalent(amount: number, cycle: SubscriptionBillingCycle): number {
  switch (cycle) {
    case 'weekly':    return amount * 52 / 12;
    case 'monthly':   return amount;
    case 'quarterly': return amount / 3;
    case 'yearly':    return amount / 12;
    case 'lifetime':  return 0;
    default:          return amount;
  }
}

export function toAnnualEquivalent(amount: number, cycle: SubscriptionBillingCycle): number {
  switch (cycle) {
    case 'weekly':    return amount * 52;
    case 'monthly':   return amount * 12;
    case 'quarterly': return amount * 4;
    case 'yearly':    return amount;
    case 'lifetime':  return 0;
    default:          return amount * 12;
  }
}

export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  trialCount: number;
  pausedCount: number;
  cancelledCount: number;
}

export function computeSubscriptionSummary(subscriptions: Subscription[]): SubscriptionSummary {
  let totalMonthly = 0;
  let totalAnnual = 0;
  let activeCount = 0;
  let trialCount = 0;
  let pausedCount = 0;
  let cancelledCount = 0;

  for (const sub of subscriptions) {
    const monthly = toMonthlyEquivalent(sub.amount, sub.billingCycle);
    const annual = toAnnualEquivalent(sub.amount, sub.billingCycle);

    if (sub.status === 'active') {
      totalMonthly += monthly;
      totalAnnual += annual;
      activeCount++;
    } else if (sub.status === 'trial') {
      totalMonthly += monthly;
      totalAnnual += annual;
      trialCount++;
    } else if (sub.status === 'paused') {
      pausedCount++;
    } else {
      cancelledCount++;
    }
  }

  return { totalMonthly, totalAnnual, activeCount, trialCount, pausedCount, cancelledCount };
}

/** Returns subscriptions whose trial ends within `withinDays` days. */
export function getExpiringTrials(subscriptions: Subscription[], withinDays = 7): Subscription[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 86_400_000);
  return subscriptions.filter(s => {
    if (s.status !== 'trial' || !s.trialEndsAt) return false;
    const trialEnd = new Date(s.trialEndsAt);
    return trialEnd >= now && trialEnd <= cutoff;
  });
}

/** Returns active/trial subscriptions renewing within `withinDays` days. */
export function getUpcomingRenewals(subscriptions: Subscription[], withinDays = 7): Subscription[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinDays * 86_400_000);
  return subscriptions.filter(s => {
    if (s.status === 'cancelled' || s.status === 'paused') return false;
    const renewal = new Date(s.nextRenewalDate);
    return renewal >= now && renewal <= cutoff;
  });
}
