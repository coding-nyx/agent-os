import React from 'react';
import { BudgetPlanner, BudgetCategory } from '../components/BudgetPlanner';

interface BudgetTabProps {
  budgetWithActuals: BudgetCategory[];
  monthlyIncome: number;
  currency?: string;
}

export function BudgetTab({ budgetWithActuals, monthlyIncome, currency }: BudgetTabProps) {
  return (
    <div className="px-4 md:px-8">
      <BudgetPlanner
        categories={budgetWithActuals}
        monthlyIncome={monthlyIncome}
        currency={currency}
      />
    </div>
  );
}
