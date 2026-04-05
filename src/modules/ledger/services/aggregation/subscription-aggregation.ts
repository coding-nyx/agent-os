// Bridge: delegates to KMP SubscriptionAggregationJs.

import { SubscriptionAggregationJs } from '@cortex-logic';
import type { Subscription, SubscriptionBillingCycle } from '../ledger-intake-service';

export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  trialCount: number;
  pausedCount: number;
  cancelledCount: number;
}

const _subAgg = new SubscriptionAggregationJs();

export function toMonthlyEquivalent(amount: number, cycle: SubscriptionBillingCycle): number {
  return _subAgg.toMonthlyEquivalent(amount, cycle);
}

export function toAnnualEquivalent(amount: number, cycle: SubscriptionBillingCycle): number {
  return _subAgg.toAnnualEquivalent(amount, cycle);
}

export function computeSubscriptionSummary(subscriptions: Subscription[]): SubscriptionSummary {
  return JSON.parse(
    _subAgg.computeSubscriptionSummary(JSON.stringify(subscriptions)),
  ) as SubscriptionSummary;
}

/** Returns subscriptions whose trial ends within `withinDays` days. */
export function getExpiringTrials(subscriptions: Subscription[], withinDays = 7): Subscription[] {
  return JSON.parse(
    _subAgg.getExpiringTrials(JSON.stringify(subscriptions), withinDays, Date.now()),
  ) as Subscription[];
}

/** Returns active/trial subscriptions renewing within `withinDays` days. */
export function getUpcomingRenewals(subscriptions: Subscription[], withinDays = 7): Subscription[] {
  return JSON.parse(
    _subAgg.getUpcomingRenewals(JSON.stringify(subscriptions), withinDays, Date.now()),
  ) as Subscription[];
}
