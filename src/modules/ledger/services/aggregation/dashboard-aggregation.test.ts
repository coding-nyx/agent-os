import { describe, expect, it } from 'vitest';
import { computeRunwayProjection } from './dashboard-aggregation';
import { createEmptyLedgerProfile } from '../ledger-intake-service';

describe('computeRunwayProjection', () => {
  it('projects finite runway from liquidity and negative burn', () => {
    const profile = createEmptyLedgerProfile();
    profile.monthlyIncome = 3_000;
    profile.fixedExpenses = [
      { id: 'rent', label: 'Rent', amount: 2_800 },
    ];
    profile.variableExpenses = [
      { id: 'food', label: 'Food', amount: 1_100 },
    ];
    profile.debtItems = [
      { id: 'card', name: 'Card', balance: 2_400, minPayment: 300, apr: 19.99 },
    ];
    profile.savingsGoals = [
      { id: 'reserve', name: 'Emergency Fund', currentAmount: 1_500, targetAmount: 5_000 },
    ];
    profile.transactions = [
      {
        id: 'income-1',
        date: '2025-03-01',
        description: 'Paycheck',
        amount: 2_000,
        type: 'income',
        category: 'Income',
      },
      {
        id: 'income-2',
        date: '2025-03-15',
        description: 'Paycheck',
        amount: 1_500,
        type: 'income',
        category: 'Income',
      },
      {
        id: 'expense-1',
        date: '2025-03-02',
        description: 'Rent',
        amount: 1_000,
        type: 'expense',
        category: 'Housing',
      },
    ];

    const runway = computeRunwayProjection(profile);

    expect(runway).toEqual({
      source: 'profile+transactions',
      modeledLiquidity: 4_000,
      ledgerBalance: 2_500,
      reserveSavings: 1_500,
      monthlyIncome: 3_000,
      monthlyExpenseBaseline: 4_200,
      monthlyBurn: 1_200,
      monthlyBuffer: -1_200,
      monthsRemaining: 3.33,
      daysRemaining: 101,
      status: 'watch',
    });
  });

  it('marks runway stable when monthly cashflow covers the baseline', () => {
    const profile = createEmptyLedgerProfile();
    profile.monthlyIncome = 6_000;
    profile.fixedExpenses = [
      { id: 'rent', label: 'Rent', amount: 2_000 },
    ];
    profile.variableExpenses = [
      { id: 'life', label: 'Life', amount: 1_500 },
    ];
    profile.savingsGoals = [
      { id: 'reserve', name: 'Emergency Fund', currentAmount: 500, targetAmount: 2_000 },
    ];
    profile.transactions = [
      {
        id: 'paycheck',
        date: '2025-03-01',
        description: 'Paycheck',
        amount: 4_000,
        type: 'income',
        category: 'Income',
      },
      {
        id: 'groceries',
        date: '2025-03-05',
        description: 'Groceries',
        amount: 500,
        type: 'expense',
        category: 'Food',
      },
    ];

    const runway = computeRunwayProjection(profile);

    expect(runway?.monthlyBurn).toBe(0);
    expect(runway?.monthsRemaining).toBeNull();
    expect(runway?.daysRemaining).toBeNull();
    expect(runway?.status).toBe('stable');
    expect(runway?.modeledLiquidity).toBe(4_000);
  });
});
