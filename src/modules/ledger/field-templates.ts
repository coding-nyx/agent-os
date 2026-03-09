/**
 * Ledger Module — Extension Field Templates & Financial Utilities
 *
 * Suggested extension fields for the "Add Field" flow (chat and button paths).
 * NOT registered automatically — these serve as quick-add templates.
 *
 * Architecture rules:
 *   - LLM is the sole semantic domain validator — no keyword gates
 *   - Structural validation (ID uniqueness, type checks) handled by SchemaRegistry
 *   - Type restriction: only NUMBER, RANGE, SELECT, MULTI_SELECT, DATE
 *   - All currency-denominated fields respect user's currency setting
 */

import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';

// ============================================================================
// Default Extension Field Suggestions (10 fields)
// ============================================================================

export const LEDGER_SUGGESTED_EXTENSIONS: FieldDefinition[] = [
  // ── Income ─────────────────────────────────────────────────────────────
  {
    id: 'side-hustle-income',
    name: 'Side Hustle Income',
    type: FieldType.NUMBER,
    description:
      'Monthly income from freelance work, gig economy, or secondary employment',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 1_000_000, multipleOf: 0.01 },
    metadata: {
      category: 'income',
      order: 1,
      icon: 'Briefcase',
      helpText:
        'Track your monthly side income — Ledger uses this to compute accurate cashflow',
      placeholder: 'e.g., 1200',
      uiHint: 'currency',
    },
  },

  // ── Assets ─────────────────────────────────────────────────────────────
  {
    id: 'crypto-portfolio',
    name: 'Crypto Portfolio',
    type: FieldType.NUMBER,
    description:
      'Current market value of cryptocurrency holdings across all wallets and exchanges',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 100_000_000, multipleOf: 0.01 },
    metadata: {
      category: 'assets',
      order: 2,
      icon: 'Bitcoin',
      helpText:
        'Update periodically to keep net worth and investment allocation accurate',
      placeholder: 'e.g., 8400',
      uiHint: 'currency',
    },
  },
  {
    id: 'emergency-fund-months',
    name: 'Emergency Fund Months',
    type: FieldType.NUMBER,
    description:
      'Number of months of essential expenses covered by liquid emergency savings',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 24, multipleOf: 0.1 },
    metadata: {
      category: 'assets',
      order: 3,
      icon: 'ShieldCheck',
      helpText:
        'Financial advisors recommend 3–6 months. Ledger tracks your progress toward this target.',
      placeholder: 'e.g., 3.2',
      uiHint: 'number',
    },
  },
  {
    id: 'net-worth',
    name: 'Net Worth',
    type: FieldType.NUMBER,
    description:
      'Total assets minus total liabilities — your overall financial position',
    required: false,
    defaultValue: 0,
    validation: { minimum: -100_000_000, maximum: 100_000_000, multipleOf: 0.01 },
    metadata: {
      category: 'assets',
      order: 4,
      icon: 'TrendingUp',
      helpText:
        'Can be negative if liabilities exceed assets. Track monthly for trend analysis.',
      placeholder: 'e.g., 42600',
      uiHint: 'currency',
    },
  },
  {
    id: 'investment-return-rate',
    name: 'Investment Return Rate',
    type: FieldType.NUMBER,
    description:
      'Annualized return rate on investment portfolio as a percentage',
    required: false,
    defaultValue: 0,
    validation: { minimum: -100, maximum: 500, multipleOf: 0.01 },
    metadata: {
      category: 'assets',
      order: 5,
      icon: 'LineChart',
      helpText:
        "Your portfolio's annualized return — negative values indicate losses",
      placeholder: 'e.g., 7.2',
      uiHint: 'percentage',
    },
  },

  // ── Expenses ───────────────────────────────────────────────────────────
  {
    id: 'subscription-total',
    name: 'Subscription Total',
    type: FieldType.NUMBER,
    description:
      'Total monthly cost of all recurring subscriptions (streaming, SaaS, memberships)',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 100_000, multipleOf: 0.01 },
    metadata: {
      category: 'expenses',
      order: 6,
      icon: 'RotateCw',
      helpText:
        'Sum of Netflix, Spotify, gym, cloud storage, etc. Subscription creep is a top friction source.',
      placeholder: 'e.g., 247',
      uiHint: 'currency',
    },
  },
  {
    id: 'rent-mortgage',
    name: 'Rent / Mortgage',
    type: FieldType.NUMBER,
    description:
      'Monthly housing payment — rent or mortgage principal + interest',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 100_000, multipleOf: 0.01 },
    metadata: {
      category: 'expenses',
      order: 7,
      icon: 'Home',
      helpText:
        'Your largest fixed expense. Ledger uses this for housing-to-income ratio analysis.',
      placeholder: 'e.g., 1850',
      uiHint: 'currency',
    },
  },
  {
    id: 'insurance-premium',
    name: 'Insurance Premium',
    type: FieldType.NUMBER,
    description:
      'Total monthly insurance costs (health, auto, renters, life, umbrella)',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 50_000, multipleOf: 0.01 },
    metadata: {
      category: 'expenses',
      order: 8,
      icon: 'Shield',
      helpText:
        'Aggregate all insurance premiums for accurate fixed expense tracking',
      placeholder: 'e.g., 380',
      uiHint: 'currency',
    },
  },
  {
    id: 'charitable-giving',
    name: 'Charitable Giving',
    type: FieldType.NUMBER,
    description:
      'Monthly charitable donations and philanthropic contributions',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 1_000_000, multipleOf: 0.01 },
    metadata: {
      category: 'expenses',
      order: 9,
      icon: 'Heart',
      helpText:
        'Track for tax deduction records and Resonance ROI computation — giving can increase wellbeing return',
      placeholder: 'e.g., 100',
      uiHint: 'currency',
    },
  },

  // ── Liabilities ────────────────────────────────────────────────────────
  {
    id: 'tax-liability',
    name: 'Tax Liability',
    type: FieldType.NUMBER,
    description:
      'Estimated annual tax liability or most recent tax bill amount',
    required: false,
    defaultValue: 0,
    validation: { minimum: 0, maximum: 10_000_000, multipleOf: 0.01 },
    metadata: {
      category: 'liabilities',
      order: 10,
      icon: 'FileText',
      helpText:
        'Estimated annual taxes owed. Helps Ledger compute effective tax rate and plan withholding.',
      placeholder: 'e.g., 8500',
      uiHint: 'currency',
    },
  },
];

// ============================================================================
// Field Category Definitions
// ============================================================================

export const LEDGER_FIELD_CATEGORIES = {
  income: {
    icon: 'Wallet',
    color: 'green',
    description: 'Revenue streams and income sources',
  },
  assets: {
    icon: 'TrendingUp',
    color: 'cyan',
    description: 'Savings, investments, and net position',
  },
  expenses: {
    icon: 'CreditCard',
    color: 'amber',
    description: 'Recurring costs and spending categories',
  },
  liabilities: {
    icon: 'AlertTriangle',
    color: 'red',
    description: 'Debts, obligations, and financial risks',
  },
} as const;

export type LedgerFieldCategory = keyof typeof LEDGER_FIELD_CATEGORIES;

/**
 * Get the category config for a given field based on its metadata.
 * Falls back to a generic "custom" category if no match.
 */
export function getFieldCategory(field: FieldDefinition): {
  name: string;
  icon: string;
  color: string;
  description: string;
} {
  const categoryName = field.metadata?.category || 'custom';
  const config =
    LEDGER_FIELD_CATEGORIES[categoryName as LedgerFieldCategory];

  if (config) {
    return { name: categoryName, ...config };
  }

  return {
    name: categoryName,
    icon: field.metadata?.icon || 'Database',
    color: 'slate',
    description: 'User-defined custom financial field',
  };
}

// ============================================================================
// Currency-Aware Validation Helpers
// ============================================================================

/**
 * Validate a monetary value within reasonable bounds.
 */
export function validateMonetaryValue(
  value: number,
  field: string = 'amount',
  allowNegative: boolean = false,
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: `${field} must be a finite number` };
  }
  if (!allowNegative && value < 0) {
    return { valid: false, message: `${field} cannot be negative` };
  }
  if (Math.abs(value) > 100_000_000) {
    return { valid: false, message: `${field} exceeds maximum ($100M) — verify input` };
  }
  return { valid: true };
}

/**
 * Validate a percentage value (e.g., investment return rate, tax rate).
 */
export function validatePercentageValue(
  value: number,
  field: string = 'rate',
  min: number = -100,
  max: number = 500,
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: `${field} must be a finite number` };
  }
  if (value < min) {
    return { valid: false, message: `${field} cannot be below ${min}%` };
  }
  if (value > max) {
    return { valid: false, message: `${field} exceeds maximum (${max}%)` };
  }
  return { valid: true };
}

/**
 * Determine if a field should display its value as currency.
 */
export function isCurrencyField(field: FieldDefinition): boolean {
  if (field.metadata?.uiHint === 'currency') return true;
  if (field.type !== FieldType.NUMBER) return false;
  const financialCategories = ['income', 'expenses', 'assets', 'liabilities'];
  return financialCategories.includes(field.metadata?.category || '');
}

/**
 * Determine if a field should display its value as a percentage.
 */
export function isPercentageField(field: FieldDefinition): boolean {
  return field.metadata?.uiHint === 'percentage';
}

// ============================================================================
// Financial Friction Score Utilities
// ============================================================================

export type FrictionTier = 'low' | 'moderate' | 'elevated' | 'critical';

/**
 * Compute the friction tier from a 0-10 score.
 */
export function getFrictionTier(score: number): FrictionTier {
  if (score <= 2) return 'low';
  if (score <= 5) return 'moderate';
  if (score <= 7) return 'elevated';
  return 'critical';
}

/**
 * Get Tailwind color classes for a friction tier.
 */
export function getFrictionColor(tier: FrictionTier): {
  text: string;
  bg: string;
  border: string;
  hex: string;
} {
  switch (tier) {
    case 'low':
      return { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', hex: '#22C55E' };
    case 'moderate':
      return { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', hex: '#06B6D4' };
    case 'elevated':
      return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', hex: '#F59E0B' };
    case 'critical':
      return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', hex: '#EF4444' };
  }
}

/**
 * Locale-aware currency formatter.
 */
export function formatCurrency(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Compact currency formatter for large numbers ("$12.4K", "$1.2M").
 */
export function formatCurrencyCompact(
  value: number,
  currency: string = 'USD',
  locale: string = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Format a percentage value.
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}
