import React from 'react';
import { TransactionManager, Transaction } from '../components/TransactionManager';

interface TransactionsTabProps {
  transactions: Transaction[];
  categories: string[];
  currency?: string;
  isAddTransactionModalOpen?: boolean;
  setIsAddTransactionModalOpen?: (open: boolean) => void;
}

export function TransactionsTab({ 
  transactions, 
  categories, 
  currency, 
  isAddTransactionModalOpen, 
  setIsAddTransactionModalOpen 
}: TransactionsTabProps) {
  return (
    <div className="px-4 md:px-8">
      <TransactionManager
        transactions={transactions}
        categories={categories}
        currency={currency}
        isAddModalOpen={isAddTransactionModalOpen}
        onAddModalOpenChange={setIsAddTransactionModalOpen}
        showAddButton={false}
      />
    </div>
  );
}
