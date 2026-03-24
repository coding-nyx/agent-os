import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LedgerDashboard } from './LedgerDashboard';
import { createEmptyLedgerProfile } from '../services/ledger-intake-service';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('./FinancialCharts', () => ({
  CashFlowChart: () => <div data-testid="cash-flow-chart" />,
  DebtPayoffTracker: () => <div data-testid="debt-payoff-tracker" />,
}));

vi.mock('./SpendingTrendsChart', () => ({
  SpendingTrendsChart: () => <div data-testid="spending-trends-chart" />,
}));

vi.mock('./AIFinancialAdvisor', () => ({
  AIFinancialAdvisor: () => <div data-testid="ai-financial-advisor" />,
}));

describe('LedgerDashboard runway presentation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => 'false'),
        setItem: vi.fn(),
      },
      configurable: true,
    });
  });

  it('surfaces runway math with auditable liquidity and burn details', () => {
    const profile = createEmptyLedgerProfile();
    profile.monthlyIncome = 3_000;
    profile.fixedExpenses = [
      { id: 'rent', label: 'Rent', amount: 2_600 },
    ];
    profile.variableExpenses = [
      { id: 'food', label: 'Food', amount: 900 },
    ];
    profile.savingsGoals = [
      { id: 'reserve', name: 'Emergency Fund', currentAmount: 2_000, targetAmount: 5_000 },
    ];
    profile.transactions = [
      {
        id: 'income-1',
        date: '2025-03-01',
        description: 'Paycheck',
        amount: 3_000,
        type: 'income',
        category: 'Income',
      },
      {
        id: 'expense-1',
        date: '2025-03-05',
        description: 'Rent',
        amount: 1_000,
        type: 'expense',
        category: 'Housing',
      },
    ];

    render(
      <LedgerDashboard
        soul={null}
        profile={profile}
        recentEvents={[]}
      />,
    );

    expect(screen.getByText(/runway projection/i)).toBeInTheDocument();
    expect(screen.getByText(/modeled liquidity/i)).toBeInTheDocument();
    expect(screen.getByText(/^monthly burn$/i)).toBeInTheDocument();
    expect(screen.getByText(/formula:/i)).toBeInTheDocument();
  });
});
