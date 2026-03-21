import React from 'react';
import { GoalTracker } from '../components/GoalTracker';
import { DebtStrategist } from '../components/DebtStrategist';
import { FinancialGoal, DebtItem } from '../services/ledger-intake-service';

interface GoalsTabProps {
  financialGoals: FinancialGoal[];
  currency?: string;
  monthlyIncome: number;
  totalMonthlyExpenses: number;
  debtItems: DebtItem[];
  extraDebtPayment: number;
  setExtraDebtPayment: (val: number) => void;
  recommendSnowball: boolean;
}

export function GoalsTab({ 
  financialGoals, 
  currency, 
  monthlyIncome, 
  totalMonthlyExpenses, 
  debtItems, 
  extraDebtPayment, 
  setExtraDebtPayment, 
  recommendSnowball 
}: GoalsTabProps) {
  return (
    <div className="px-4 md:px-8 space-y-8">
      <GoalTracker
        goals={financialGoals}
        currency={currency}
        monthlyIncome={monthlyIncome}
        totalMonthlyExpenses={totalMonthlyExpenses}
      />
      <DebtStrategist
        debtItems={debtItems}
        currency={currency}
        extraMonthlyPayment={extraDebtPayment}
        onExtraPaymentChange={setExtraDebtPayment}
        recommendSnowball={recommendSnowball}
      />
    </div>
  );
}
