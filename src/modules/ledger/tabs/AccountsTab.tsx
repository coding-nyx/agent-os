import React from 'react';
import { AccountManager } from '../components/AccountManager';
import type { Account, AccountTransfer } from '../services/ledger-intake-service';

interface AccountsTabProps {
  accounts: Account[];
  transferHistory: AccountTransfer[];
  currency?: string;
  disabled?: boolean;
  onAddAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>) => void;
  onUpdateAccount: (id: string, updates: Partial<Account>) => void;
  onDeleteAccount: (id: string) => void;
  onTransfer: (transfer: Omit<AccountTransfer, 'id'>) => void;
}

export function AccountsTab({
  accounts,
  transferHistory: _transferHistory,
  currency,
  disabled,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onTransfer,
}: AccountsTabProps) {
  return (
    <div className="px-4 md:px-8 space-y-8">
      <AccountManager
        accounts={accounts}
        currency={currency}
        disabled={disabled}
        onAddAccount={onAddAccount}
        onUpdateAccount={onUpdateAccount}
        onDeleteAccount={onDeleteAccount}
        onTransfer={onTransfer}
      />
    </div>
  );
}
