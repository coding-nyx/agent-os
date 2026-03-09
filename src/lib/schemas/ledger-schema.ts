/**
 * Ledger Module (Financial) Core Schema Definition
 */

import { ModuleSchemaDefinition } from '../schema-registry';
import { FieldType } from '../field-system/types';

export const LEDGER_CORE_SCHEMA: ModuleSchemaDefinition = {
  moduleId: 'ledger',
  version: '1.0.0',
  allowExtensions: true,
  maxExtensionFields: 15,
  coreSchema: {
    version: '1.0.0',
    coreFields: [
      {
        id: 'userId',
        name: 'User ID',
        type: FieldType.TEXT,
        required: true,
        description: 'Unique identifier for the user',
      },
      {
        id: 'monthlyIncome',
        name: 'Monthly Income',
        type: FieldType.NUMBER,
        description: 'Average monthly income',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'currency',
        name: 'Currency',
        type: FieldType.SELECT,
        description: 'Primary currency',
        defaultValue: 'USD',
        options: [
          { value: 'USD', label: 'USD ($)' },
          { value: 'EUR', label: 'EUR (€)' },
          { value: 'GBP', label: 'GBP (£)' },
          { value: 'CAD', label: 'CAD ($)' },
          { value: 'AUD', label: 'AUD ($)' },
        ],
      },
      {
        id: 'financialGoals',
        name: 'Financial Goals',
        type: FieldType.MULTI_SELECT,
        description: 'Active financial goals',
        options: [
          { value: 'emergency_fund', label: 'Build Emergency Fund' },
          { value: 'debt_payoff', label: 'Pay Off Debt' },
          { value: 'save_investment', label: 'Save & Invest' },
          { value: 'retirement', label: 'Retirement Planning' },
          { value: 'home_purchase', label: 'Home Purchase' },
          { value: 'education', label: 'Education Fund' },
          { value: 'financial_independence', label: 'Financial Independence' },
        ],
      },
      {
        id: 'budgetCategories',
        name: 'Budget Categories',
        type: FieldType.MULTI_SELECT,
        description: 'Active budget categories',
        options: [
          { value: 'housing', label: 'Housing' },
          { value: 'transportation', label: 'Transportation' },
          { value: 'food', label: 'Food & Groceries' },
          { value: 'utilities', label: 'Utilities' },
          { value: 'entertainment', label: 'Entertainment' },
          { value: 'healthcare', label: 'Healthcare' },
          { value: 'insurance', label: 'Insurance' },
          { value: 'savings', label: 'Savings' },
          { value: 'debt', label: 'Debt Payments' },
        ],
      },
      {
        id: 'totalDebt',
        name: 'Total Debt',
        type: FieldType.NUMBER,
        description: 'Total outstanding debt',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'totalSavings',
        name: 'Total Savings',
        type: FieldType.NUMBER,
        description: 'Total savings and emergency fund',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'totalInvestments',
        name: 'Total Investments',
        type: FieldType.NUMBER,
        description: 'Total investment portfolio value',
        validation: {
          minimum: 0,
        },
      },
      {
        id: 'riskTolerance',
        name: 'Investment Risk Tolerance',
        type: FieldType.SELECT,
        description: 'Comfort level with investment risk',
        options: [
          { value: 'conservative', label: 'Conservative' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'aggressive', label: 'Aggressive' },
        ],
      },
      {
        id: 'spendingHabits',
        name: 'Spending Habits',
        type: FieldType.SELECT,
        description: 'General spending behavior',
        options: [
          { value: 'frugal', label: 'Frugal' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'liberal', label: 'Liberal Spender' },
        ],
      },
      {
        id: 'financialStressLevel',
        name: 'Financial Stress Level',
        type: FieldType.RANGE,
        description: 'Current financial stress (0-10)',
        validation: {
          minimum: 0,
          maximum: 10,
        },
      },
      {
        id: 'creditScore',
        name: 'Credit Score',
        type: FieldType.NUMBER,
        description: 'Current credit score',
        validation: {
          minimum: 300,
          maximum: 850,
        },
      },
      {
        id: 'paymentSchedule',
        name: 'Payment Schedule',
        type: FieldType.SELECT,
        description: 'How often you get paid',
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Bi-weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'irregular', label: 'Irregular' },
        ],
      },
      {
        id: 'lastBudgetReview',
        name: 'Last Budget Review',
        type: FieldType.DATE,
        description: 'Date of last budget review',
      },
      {
        id: 'nextBudgetReview',
        name: 'Next Budget Review',
        type: FieldType.DATE,
        description: 'Date of next scheduled budget review',
      },
    ],
    extensionFields: [],
    metadata: {
      createdAt: Date.now(),
      description: 'Financial tracking and budgeting profile',
      category: 'finance',
    },
  },
};
