import type { Account, AccountType, DebtItem } from '../ledger-intake-service';
import { round2 } from './utils';

const ASSET_ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'investment', 'cash', 'other'];
const LIABILITY_ACCOUNT_TYPES: AccountType[] = ['credit_card'];

export interface AccountSummary {
  totalAssets: number;
  totalLiabilities: number;
  liquidAssets: number;
  creditCardDebt: number;
  investmentValue: number;
  byType: Partial<Record<AccountType, { count: number; total: number }>>;
}

export function computeAccountSummary(accounts: Account[]): AccountSummary {
  const byType: Partial<Record<AccountType, { count: number; total: number }>> = {};

  let totalAssets = 0;
  let totalLiabilities = 0;
  let liquidAssets = 0;
  let creditCardDebt = 0;
  let investmentValue = 0;

  for (const account of accounts) {
    const existing = byType[account.type];
    byType[account.type] = {
      count: (existing?.count ?? 0) + 1,
      total: round2((existing?.total ?? 0) + account.balance),
    };

    if (ASSET_ACCOUNT_TYPES.includes(account.type)) {
      totalAssets = round2(totalAssets + Math.max(0, account.balance));
      if (account.type === 'checking' || account.type === 'savings' || account.type === 'cash') {
        liquidAssets = round2(liquidAssets + Math.max(0, account.balance));
      }
      if (account.type === 'investment') {
        investmentValue = round2(investmentValue + Math.max(0, account.balance));
      }
    } else if (LIABILITY_ACCOUNT_TYPES.includes(account.type)) {
      const debt = Math.max(0, -account.balance); // credit cards stored as negative
      totalLiabilities = round2(totalLiabilities + debt);
      creditCardDebt = round2(creditCardDebt + debt);
    }
  }

  return { totalAssets, totalLiabilities, liquidAssets, creditCardDebt, investmentValue, byType };
}

/** Compute net liquid assets = checking + savings + cash − credit card debt. */
export function computeNetLiquidAssets(accounts: Account[]): number {
  const summary = computeAccountSummary(accounts);
  return round2(summary.liquidAssets - summary.creditCardDebt);
}

/** Compute total balance across all accounts (assets - liabilities). */
export function computeTotalBalance(accounts: Account[]): number {
  return round2(accounts.reduce((sum, a) => sum + a.balance, 0));
}

/** Find the default account, or the first checking account, or the first account. */
export function getDefaultAccount(accounts: Account[]): Account | null {
  if (accounts.length === 0) return null;
  return (
    accounts.find((a) => a.isDefault) ??
    accounts.find((a) => a.type === 'checking') ??
    accounts[0]
  );
}

/** Get the total debt from DebtItems (for net worth — separate from credit card balances). */
export function computeTotalDebtFromItems(debtItems: DebtItem[]): number {
  return round2(debtItems.reduce((sum, d) => sum + d.balance, 0));
}
