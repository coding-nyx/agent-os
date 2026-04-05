// Bridge: delegates to KMP AccountAggregationJs.

import { AccountAggregationJs } from '@cortex-logic';
import type { Account, AccountType, DebtItem } from '../ledger-intake-service';

export interface AccountSummary {
  totalAssets: number;
  totalLiabilities: number;
  liquidAssets: number;
  creditCardDebt: number;
  investmentValue: number;
  byType: Partial<Record<AccountType, { count: number; total: number }>>;
}

const _accountAgg = new AccountAggregationJs();

export function computeAccountSummary(accounts: Account[]): AccountSummary {
  return JSON.parse(
    _accountAgg.computeAccountSummary(JSON.stringify(accounts)),
  ) as AccountSummary;
}

export function computeNetLiquidAssets(accounts: Account[]): number {
  return _accountAgg.computeNetLiquidAssets(JSON.stringify(accounts));
}

export function computeTotalBalance(accounts: Account[]): number {
  return _accountAgg.computeTotalBalance(JSON.stringify(accounts));
}

export function getDefaultAccount(accounts: Account[]): Account | null {
  const result = _accountAgg.getDefaultAccount(JSON.stringify(accounts));
  return result === null ? null : (JSON.parse(result) as Account);
}

export function computeTotalDebtFromItems(debtItems: DebtItem[]): number {
  return _accountAgg.computeTotalDebtFromItems(JSON.stringify(debtItems));
}
