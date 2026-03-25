import React from 'react';
import { AccountManager } from '../components/AccountManager';
import { BankConnectionManager } from '../components/BankConnectionManager';
import type { Account, AccountTransfer, PlaidConnection, Transaction } from '../services/ledger-intake-service';

interface AccountsTabProps {
  accounts: Account[];
  transferHistory: AccountTransfer[];
  plaidConnections: PlaidConnection[];
  currency?: string;
  disabled?: boolean;
  onAddAccount: (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>) => void;
  onUpdateAccount: (id: string, updates: Partial<Account>) => void;
  onDeleteAccount: (id: string) => void;
  onTransfer: (transfer: Omit<AccountTransfer, 'id'>) => void;
  onConnectionAdded: (connection: PlaidConnection, newAccounts: Account[]) => void;
  onConnectionRemoved: (connectionId: string) => void;
  onTransactionsSynced: (transactions: Transaction[]) => void;
  onSyncStatusUpdate: (connectionId: string, status: PlaidConnection['status'], cursor?: string) => void;
}

export function AccountsTab({
  accounts,
  transferHistory: _transferHistory,
  plaidConnections,
  currency,
  disabled,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onTransfer,
  onConnectionAdded,
  onConnectionRemoved,
  onTransactionsSynced,
  onSyncStatusUpdate,
}: AccountsTabProps) {
  return (
    <div className="px-4 md:px-8 space-y-8">
      <BankConnectionManager
        connections={plaidConnections}
        accounts={accounts}
        currency={currency}
        disabled={disabled}
        onConnectionAdded={onConnectionAdded}
        onConnectionRemoved={onConnectionRemoved}
        onTransactionsSynced={onTransactionsSynced}
        onSyncStatusUpdate={onSyncStatusUpdate}
      />
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
