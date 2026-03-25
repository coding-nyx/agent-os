import type { Account, DebtItem, NetWorthSnapshot } from '../ledger-intake-service';
import { round2 } from './utils';
import { computeAccountSummary } from './account-aggregation';

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

/**
 * Compute the live net worth from current account balances and debt items.
 * Assets = sum of positive account balances (checking/savings/investment/cash).
 * Liabilities = credit card debt + debt items.
 */
export function computeCurrentNetWorth(accounts: Account[], debtItems: DebtItem[]): NetWorthResult {
  const summary = computeAccountSummary(accounts);
  const debtBalance = round2(debtItems.reduce((sum, d) => sum + d.balance, 0));
  const liabilities = round2(summary.totalLiabilities + debtBalance);
  const netWorth = round2(summary.totalAssets - liabilities);
  return { assets: summary.totalAssets, liabilities, netWorth };
}

/**
 * Compute trend from historical snapshots (newest first order expected).
 */
export function computeNetWorthTrend(history: NetWorthSnapshot[]): NetWorthTrend {
  if (history.length === 0) {
    return { direction: 'flat', absoluteChange: 0, percentChange: null, lastSnapshot: null };
  }

  const sorted = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const latest = sorted[0];
  const previous = sorted[1];

  if (!previous) {
    return { direction: 'flat', absoluteChange: 0, percentChange: null, lastSnapshot: latest };
  }

  const absoluteChange = round2(latest.netWorth - previous.netWorth);
  const percentChange =
    previous.netWorth !== 0
      ? round2((absoluteChange / Math.abs(previous.netWorth)) * 100)
      : null;

  const direction: 'up' | 'down' | 'flat' =
    absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat';

  return { direction, absoluteChange, percentChange, lastSnapshot: latest };
}

/** Build a new NetWorthSnapshot from current computed values. */
export function buildNetWorthSnapshot(
  accounts: Account[],
  debtItems: DebtItem[],
  note?: string,
): NetWorthSnapshot {
  const { assets, liabilities, netWorth } = computeCurrentNetWorth(accounts, debtItems);
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    assets,
    liabilities,
    netWorth,
    note,
  };
}
