// Bridge: delegates to KMP NetWorthAggregationJs.

import { NetWorthAggregationJs } from '@cortex-logic';
import type { Account, DebtItem, NetWorthSnapshot } from '../ledger-intake-service';

export interface NetWorthResult {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface NetWorthTrend {
  direction: 'up' | 'down' | 'flat';
  /** Absolute change from previous snapshot. */
  absoluteChange: number;
  /** Percent change from previous snapshot (null if no prior snapshot). */
  percentChange: number | null;
  lastSnapshot: NetWorthSnapshot | null;
}

const _netWorthAgg = new NetWorthAggregationJs();

export function computeCurrentNetWorth(accounts: Account[], debtItems: DebtItem[]): NetWorthResult {
  return JSON.parse(
    _netWorthAgg.computeCurrentNetWorth(JSON.stringify(accounts), JSON.stringify(debtItems)),
  ) as NetWorthResult;
}

export function computeNetWorthTrend(history: NetWorthSnapshot[]): NetWorthTrend {
  return JSON.parse(
    _netWorthAgg.computeNetWorthTrend(JSON.stringify(history)),
  ) as NetWorthTrend;
}

/** Build a new NetWorthSnapshot from current computed values. */
export function buildNetWorthSnapshot(
  accounts: Account[],
  debtItems: DebtItem[],
  note?: string,
): NetWorthSnapshot {
  return JSON.parse(
    _netWorthAgg.buildNetWorthSnapshot(
      JSON.stringify(accounts),
      JSON.stringify(debtItems),
      Date.now(),
      note ?? null,
    ),
  ) as NetWorthSnapshot;
}
