import { useCallback } from 'react';
import type {
  LedgerIntakeProfile,
  Account,
  AccountTransfer,
} from '../services/ledger-intake-service';
import { buildNetWorthSnapshot } from '../services/aggregation/networth-aggregation';

export interface LedgerAccountActions {
  handleAddAccount: (data: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>) => void;
  handleUpdateAccount: (id: string, updates: Partial<Account>) => void;
  handleDeleteAccount: (id: string) => void;
  handleTransfer: (transfer: Omit<AccountTransfer, 'id'>) => void;
  handleRecordNetWorthSnapshot: (note?: string) => void;
}

export function useLedgerAccounts(
  profile: LedgerIntakeProfile | null,
  persistUpdate: (next: LedgerIntakeProfile) => void,
): LedgerAccountActions {
  const handleAddAccount = useCallback((accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const accounts = profile.accounts ?? [];
    const newAccount: Account = {
      ...accountData,
      id: crypto.randomUUID(),
      isDefault: accounts.length === 0,
      createdAt: now,
      updatedAt: now,
    };
    persistUpdate({ ...profile, accounts: [...accounts, newAccount], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleUpdateAccount = useCallback((id: string, updates: Partial<Account>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const accounts = (profile.accounts ?? []).map(a => {
      if (a.id === id) return { ...a, ...updates, updatedAt: now };
      if (updates.isDefault === true) return { ...a, isDefault: false, updatedAt: now };
      return a;
    });
    persistUpdate({ ...profile, accounts, updatedAt: now });
  }, [profile, persistUpdate]);

  const handleDeleteAccount = useCallback((id: string) => {
    if (!profile) return;
    const accounts = (profile.accounts ?? []).filter(a => a.id !== id);
    const transactions = (profile.transactions ?? []).map(t =>
      t.accountId === id ? { ...t, accountId: undefined } : t
    );
    persistUpdate({ ...profile, accounts, transactions, updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  const handleTransfer = useCallback((transfer: Omit<AccountTransfer, 'id'>) => {
    if (!profile) return;
    const now = new Date().toISOString();
    const newTransfer: AccountTransfer = { ...transfer, id: crypto.randomUUID() };
    const accounts = (profile.accounts ?? []).map(a => {
      if (a.id === transfer.fromAccountId) return { ...a, balance: a.balance - transfer.amount, updatedAt: now };
      if (a.id === transfer.toAccountId) return { ...a, balance: a.balance + transfer.amount, updatedAt: now };
      return a;
    });
    persistUpdate({ ...profile, accounts, transferHistory: [...(profile.transferHistory ?? []), newTransfer], updatedAt: now });
  }, [profile, persistUpdate]);

  const handleRecordNetWorthSnapshot = useCallback((note?: string) => {
    if (!profile) return;
    const snapshot = buildNetWorthSnapshot(profile.accounts ?? [], profile.debtItems ?? [], note);
    persistUpdate({ ...profile, netWorthHistory: [...(profile.netWorthHistory ?? []), snapshot], updatedAt: new Date().toISOString() });
  }, [profile, persistUpdate]);

  return {
    handleAddAccount,
    handleUpdateAccount,
    handleDeleteAccount,
    handleTransfer,
    handleRecordNetWorthSnapshot,
  };
}
