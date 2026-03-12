/**
 * LedgerCrossVerificationEngine
 *
 * Houses deterministic financial analysis:
 *   - Tax categorisation (deductible / non-deductible / partial / unknown)
 *   - Behavioral ROI scoring (0–10, usage frequency vs cost)
 *   - Debt snowball payoff planner
 *   - Savings goal projection with ±10% confidence band
 *   - Financial friction NSV emit via GlobalProjectionService
 *
 * All cross-module effects flow exclusively through GlobalProjectionService so
 * this file stays cleanly inside src/modules/ledger/.
 */

import { BudgetLineItem, LedgerIntakeProfile, TaxCategory } from './ledger-intake-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { computeFinancialFriction } from './resonance-roi-service';

// Re-export for consumers that want the type from the engine file.
export type { TaxCategory };

// ─── Detailed deduction taxonomy (Section 12 of design doc) ─────────────────

export type TaxDeductionCategory =
  | 'home_office'
  | 'equipment'
  | 'professional_development'
  | 'health_fsa_hsa'
  | 'charitable'
  | 'business_travel'
  | 'subscriptions_software'
  | 'retirement_contribution'
  | 'other_deductible';

// ─── Debt snowball types ─────────────────────────────────────────────────────

export interface DebtInput {
  name: string;
  balance: number;
  /** APR as a decimal (e.g. 0.22 for 22 %). */
  rate: number;
  minPayment: number;
}

export interface DebtPayoffPlan {
  name: string;
  originalBalance: number;
  /** 1 = first debt to be cleared. */
  payoffOrder: number;
  monthsToPayoff: number;
  totalInterestPaid: number;
  effectiveRate: number;
}

// ─── Savings projection types ────────────────────────────────────────────────

export interface SavingsGoalInput {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
}

export interface SavingsProjection {
  goalId: string;
  label: string;
  targetAmount: number;
  currentBalance: number;
  monthlyContribution: number;
  /** Months until goal reached at base contribution. Infinity when contribution ≤ 0. */
  monthsToGoal: number;
  /** ISO date string (YYYY-MM-DD) or 'Unknown'. */
  achieveByDate: string;
  confidenceBand: {
    /** Months at +10 % contribution. */
    optimistic: number;
    base: number;
    /** Months at −10 % contribution. */
    pessimistic: number;
  };
  percentComplete: number;
}

// ─── Keyword tables ──────────────────────────────────────────────────────────

const DEDUCTIBLE_KEYWORDS: string[] = [
  // Health
  'medical', 'dental', 'vision', 'pharmacy', 'doctor', 'health', 'fsa', 'hsa',
  // Equipment
  'laptop', 'equipment', 'hardware', 'monitor', 'computer', 'camera', 'keyboard',
  // Professional development
  'course', 'udemy', 'conference', 'book', 'training', 'certification', 'education',
  'coursera', 'pluralsight', 'linkedin learning',
  // Charitable
  'donation', 'charity', 'nonprofit', 'tithe',
  // Retirement
  'ira', '401k', 'retirement', 'pension',
  // Business
  'business', 'office supply', 'professional',
];

const NON_DEDUCTIBLE_KEYWORDS: string[] = [
  'grocery', 'groceries', 'supermarket', 'food', 'restaurant', 'coffee',
  'dining', 'takeout', 'takeaway',
  'clothing', 'clothes', 'shoes', 'fashion', 'apparel',
  'haircut', 'beauty', 'spa', 'salon',
  'pet', 'hobby', 'toy', 'game',
  'mortgage', // principal portion – deductible only as interest, flag partial instead
];

const PARTIAL_KEYWORDS: string[] = [
  'entertainment', 'netflix', 'spotify', 'hulu', 'streaming', 'amazon prime',
  'travel', 'flight', 'hotel', 'airbnb', 'uber', 'lyft',
  'phone', 'mobile', 'cell',
  'internet', 'wifi',
  'electricity', 'utilities', 'utility',
  'rent',
  'software', 'saas', 'subscription',
];

// ─── Tax categorisation ───────────────────────────────────────────────────────

/**
 * Derives a high-level tax-deductibility classification from the expense label.
 * Keyword matching is intentionally coarse — users (or AccountingFlow) can
 * override the stored `taxCategory` field on the expense item itself.
 */
export function categorizeTax(expense: BudgetLineItem): TaxCategory {
  const label = expense.label.toLowerCase();

  for (const kw of DEDUCTIBLE_KEYWORDS) {
    if (label.includes(kw)) return 'deductible';
  }
  for (const kw of NON_DEDUCTIBLE_KEYWORDS) {
    if (label.includes(kw)) return 'non-deductible';
  }
  for (const kw of PARTIAL_KEYWORDS) {
    if (label.includes(kw)) return 'partial';
  }

  return 'unknown';
}

// ─── Behavioral ROI ──────────────────────────────────────────────────────────

/**
 * Scores how much behavioral value (usage) an expense delivers per dollar.
 *
 * Formula: `10 × (1 − costPerUse / REFERENCE_COST)`
 * Reference cost = $100 / use → score of 0.
 * $1 / use → score of ~9.9.
 *
 * @param item            Expense item (cost = item.amount / month)
 * @param usageFrequency  How many times / month the user actually uses this
 * @returns               Score in [0, 10] (one decimal place)
 */
export function calculateBehavioralROI(
  item: BudgetLineItem,
  usageFrequency: number,
): number {
  if (usageFrequency <= 0 || item.amount <= 0) return 0;

  const costPerUse = item.amount / usageFrequency;
  // Linear: $0/use → 10, $100/use → 0
  const raw = Math.max(0, Math.min(10, 10 * (1 - costPerUse / 100)));
  return Math.round(raw * 10) / 10;
}

/**
 * Estimates usage frequency per month from the expense label when no
 * real usage data is available.  Used by the BehavioralInsightsPanel.
 */
export function estimateUsageFrequency(expense: BudgetLineItem): number {
  const label = expense.label.toLowerCase();

  const dailyKeywords = ['netflix', 'spotify', 'hulu', 'streaming', 'gym', 'fitness',
    'phone', 'mobile', 'internet', 'wifi'];
  const weeklyKeywords = ['restaurant', 'dining', 'coffee', 'grocery', 'groceries',
    'transport', 'transit'];
  const monthlyKeywords = ['rent', 'mortgage', 'insurance', 'utilities', 'electricity',
    'subscription', 'saas', 'software', 'course', 'membership'];

  for (const kw of dailyKeywords) {
    if (label.includes(kw)) return 30;
  }
  for (const kw of weeklyKeywords) {
    if (label.includes(kw)) return 4;
  }
  for (const kw of monthlyKeywords) {
    if (label.includes(kw)) return 1;
  }

  // Default: ~weekly
  return 4;
}

// ─── Debt snowball planner ────────────────────────────────────────────────────

/**
 * Plans a debt snowball payoff schedule.
 *
 * Snowball method: sort by balance ASC (lowest first for motivational wins).
 * When a debt is cleared its freed minimum payment cascades to the next debt.
 *
 * @param debts       Debts to plan (order does not matter – sorted internally)
 * @param extraBudget Extra monthly budget beyond all minimums
 */
export function planDebtSnowball(
  debts: DebtInput[],
  extraBudget: number,
): DebtPayoffPlan[] {
  if (debts.length === 0) return [];

  // Snowball: lowest balance first
  const sorted = [...debts].sort((a, b) => a.balance - b.balance);

  // Mutable working copies
  const balances = sorted.map((d) => d.balance);
  const interest = new Array<number>(sorted.length).fill(0);
  const monthsPaid = new Array<number>(sorted.length).fill(0);
  const cleared = new Array<boolean>(sorted.length).fill(false);

  let snowball = Math.max(0, extraBudget);
  let month = 0;
  let payoffOrder = 1;
  const MAX_MONTHS = 600; // 50-year safety cap

  while (month < MAX_MONTHS) {
    month++;

    // 1. Accrue interest and apply minimum payments for all active debts
    for (let i = 0; i < sorted.length; i++) {
      if (cleared[i]) continue;

      const monthlyInterest = balances[i] * (sorted[i].rate / 12);
      balances[i] += monthlyInterest;
      interest[i] += monthlyInterest;

      const pay = Math.min(sorted[i].minPayment, balances[i]);
      balances[i] -= pay;
    }

    // 2. Apply snowball extra to the first non-cleared debt
    for (let i = 0; i < sorted.length; i++) {
      if (cleared[i]) continue;

      const extra = Math.min(snowball, balances[i]);
      balances[i] -= extra;
      break; // Snowball applies to one target at a time
    }

    // 3. Mark newly cleared debts and roll their minimums into snowball
    for (let i = 0; i < sorted.length; i++) {
      if (cleared[i]) continue;
      if (balances[i] <= 0.01) {
        balances[i] = 0;
        cleared[i] = true;
        monthsPaid[i] = month;
        // Set payoffOrder at clear time (not pre-sorted)
        sorted[i] = { ...sorted[i] }; // ensure no mutation bleed
        interest[i] = Math.round(interest[i] * 100) / 100;
        snowball += sorted[i].minPayment; // freed minimum cascades
        payoffOrder++;
      }
    }

    if (cleared.every(Boolean)) break;
  }

  // Build results in snowball (payoff) order
  return sorted
    .map((d, i) => ({
      name: d.name,
      originalBalance: d.balance,
      payoffOrder: monthsPaid[i] > 0 ? sorted.indexOf(sorted[i]) + 1 : i + 1,
      monthsToPayoff: monthsPaid[i] > 0 ? monthsPaid[i] : MAX_MONTHS,
      totalInterestPaid: interest[i],
      effectiveRate: d.rate,
    }))
    .sort((a, b) => a.monthsToPayoff - b.monthsToPayoff)
    .map((r, idx) => ({ ...r, payoffOrder: idx + 1 }));
}

// ─── Savings goal projection ──────────────────────────────────────────────────

/**
 * Projects months-to-goal for a savings target with a ±10 % contribution
 * confidence band (optimistic / base / pessimistic).
 */
export function projectSavingsGoal(goal: SavingsGoalInput): SavingsProjection {
  const remaining = Math.max(0, goal.targetAmount - goal.currentBalance);
  const percentComplete =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.currentBalance / goal.targetAmount) * 100))
      : 0;

  const calcMonths = (contribution: number): number => {
    if (contribution <= 0) return Infinity;
    return Math.ceil(remaining / contribution);
  };

  const baseMonths = calcMonths(goal.monthlyContribution);
  const optimisticMonths = calcMonths(goal.monthlyContribution * 1.1);
  const pessimisticMonths = calcMonths(goal.monthlyContribution * 0.9);

  const achieveByDate =
    !isFinite(baseMonths)
      ? 'Unknown'
      : (() => {
          const d = new Date();
          d.setMonth(d.getMonth() + baseMonths);
          return d.toISOString().slice(0, 10);
        })();

  return {
    goalId: goal.id,
    label: goal.name,
    targetAmount: goal.targetAmount,
    currentBalance: goal.currentBalance,
    monthlyContribution: goal.monthlyContribution,
    monthsToGoal: baseMonths,
    achieveByDate,
    confidenceBand: {
      optimistic: optimisticMonths,
      base: baseMonths,
      pessimistic: pessimisticMonths,
    },
    percentComplete,
  };
}

// ─── Financial friction emit ──────────────────────────────────────────────────

/**
 * Computes `financialFriction` via the canonical formula in
 * `resonance-roi-service` and emits the result to
 * `nsv.resource.financialFriction` through GlobalProjectionService.
 *
 * This is the ONLY cross-module side-effect in this engine — everything else
 * is pure computation.
 *
 * @param profile  Current ledger profile
 * @param uid      Firebase user UID (pass empty string / undefined to skip)
 */
export async function checkAndEmitFinancialFriction(
  profile: LedgerIntakeProfile,
  uid: string | undefined | null,
): Promise<void> {
  if (!uid || !profile || profile.monthlyIncome <= 0) return;

  // Delegate to the single canonical friction formula (returns 0-1)
  const frictionScore = Math.round(computeFinancialFriction(profile) * 10);

  try {
    await GlobalProjectionService.updateCrossFunctionalState(
      uid,
      { resource: { financialFriction: frictionScore } },
    );
  } catch (err) {
    console.error('[LedgerCrossVerificationEngine] Failed to emit financialFriction:', err);
  }
}

/**
 * Estimates quarterly tax liability based on income and YTD deductibles.
 * Uses a simplified 25% marginal rate as a baseline.
 */
export function estimateQuarterlyTax(
  monthlyIncome: number,
  monthlyDeductibles: number
): { estimatedLiability: number; nextDeadline: string } {
  const annualIncome = monthlyIncome * 12;
  const annualDeductibles = monthlyDeductibles * 12;
  const taxableIncome = Math.max(0, annualIncome - annualDeductibles);
  const annualLiability = taxableIncome * 0.25;
  const quarterlyLiability = Math.round(annualLiability / 4);

  // Deterministic deadlines (simplified)
  const now = new Date();
  const year = now.getFullYear();
  const deadlines = [
    `${year}-04-15`,
    `${year}-06-15`,
    `${year}-09-15`,
    `${year + 1}-01-15`
  ];
  
  const nextDeadline = deadlines.find(d => new Date(d) > now) || deadlines[0];

  return { estimatedLiability: quarterlyLiability, nextDeadline };
}

/**
 * AI-Optimization: Scans expenses for potential tax-saving re-classifications.
 * Returns a list of suggested updates for the user to confirm.
 */
export function suggestTaxOptimizations(
  expenses: Array<BudgetLineItem & { taxCategory: TaxCategory }>
): Array<{ fieldId: string; current: string; suggested: string; reason: string }> {
  const suggestions: Array<{ fieldId: string; current: string; suggested: string; reason: string }> = [];

  for (const exp of expenses) {
    if (exp.taxCategory === 'non-deductible' || exp.taxCategory === 'unknown') {
      const label = exp.label.toLowerCase();
      
      // Look for missed professional/health/business keywords that might have been skipped
      if (['education', 'training', 'book', 'office', 'software', 'saas'].some(k => label.includes(k))) {
        suggestions.push({
          fieldId: exp.id,
          current: exp.taxCategory,
          suggested: 'deductible',
          reason: 'Label indicates professional development or business tool usage.'
        });
      } else if (['doctor', 'health', 'medical', 'pharmacy', 'therapy'].some(k => label.includes(k))) {
        suggestions.push({
          fieldId: exp.id,
          current: exp.taxCategory,
          suggested: 'deductible',
          reason: 'Label indicates potential medical or HSA-eligible expense.'
        });
      }
    }
  }

  return suggestions;
}

// ─── Convenience: run full analysis from a LedgerIntakeProfile ───────────────

export interface LedgerAnalysisSummary {
  /** All expenses enriched with auto-detected taxCategory */
  categorizedExpenses: Array<BudgetLineItem & { taxCategory: TaxCategory }>;
  /** Total of fully-deductible expense amounts (annual estimate) */
  ytdDeductibleTotal: number;
  /** Estimated tax saving at 25 % marginal rate */
  estimatedTaxSaving: number;
  /** ROI score for every expense (estimated usage) */
  roiScores: Array<{ item: BudgetLineItem; usageFrequency: number; roiScore: number }>;
  /** Debt snowball plan derived from profile.debtItems */
  debtSnowballPlan: DebtPayoffPlan[];
  /** Savings projections from profile.savingsGoals */
  savingsProjections: SavingsProjection[];
}

/**
 * Runs the full cross-verification analysis on a loaded LedgerIntakeProfile.
 * Pure computation — does NOT emit any NSV signals; call
 * `checkAndEmitFinancialFriction` separately when you have a UID.
 *
 * @param profile             Loaded ledger profile
 * @param savingsContributions Map from goalId → estimated monthly contribution.
 *                             Falls back to monthlyBuffer / goal count when absent.
 */
export function analyzeProfile(
  profile: LedgerIntakeProfile,
  savingsContributions: Record<string, number> = {},
): LedgerAnalysisSummary {
  const allExpenses = [...profile.fixedExpenses, ...profile.variableExpenses];

  // --- Tax categorisation --------------------------------------------------
  const categorizedExpenses = allExpenses.map((expense) => ({
    ...expense,
    taxCategory: expense.taxCategory ?? categorizeTax(expense),
  }));

  // YTD estimate = monthly deductible × 12
  const monthlyDeductible = categorizedExpenses
    .filter((e) => e.taxCategory === 'deductible')
    .reduce((s, e) => s + e.amount, 0);
  const ytdDeductibleTotal = monthlyDeductible * 12;
  const estimatedTaxSaving = ytdDeductibleTotal * 0.25;

  // --- Behavioral ROI -------------------------------------------------------
  const roiScores = allExpenses.map((item) => {
    const usageFrequency = estimateUsageFrequency(item);
    return { item, usageFrequency, roiScore: calculateBehavioralROI(item, usageFrequency) };
  });

  // --- Debt snowball --------------------------------------------------------
  const totalFixed = profile.fixedExpenses.reduce((s, e) => s + e.amount, 0);
  const totalVariable = profile.variableExpenses.reduce((s, e) => s + e.amount, 0);
  const totalMinPayments = profile.debtItems.reduce((s, d) => s + d.minPayment, 0);
  const extraBudget = Math.max(
    0,
    profile.monthlyIncome - totalFixed - totalVariable - totalMinPayments,
  );

  const debtInputs: DebtInput[] = profile.debtItems.map((d) => ({
    name: d.name,
    balance: d.balance,
    rate: d.apr != null ? d.apr / 100 : 0.18, // default 18 % if APR not set
    minPayment: d.minPayment,
  }));

  const debtSnowballPlan = planDebtSnowball(debtInputs, extraBudget);

  // --- Savings projections --------------------------------------------------
  const monthlyBuffer = Math.max(0, profile.monthlyIncome - totalFixed - totalVariable);
  const goalCount = profile.savingsGoals.length || 1;
  const defaultContribution = monthlyBuffer / goalCount;

  const savingsProjections = profile.savingsGoals.map((goal) => {
    const contribution = savingsContributions[goal.id] ?? defaultContribution;
    return projectSavingsGoal({
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentBalance: goal.currentAmount ?? 0, // Use currentAmount from profile goal
      monthlyContribution: contribution,
    });
  });

  return {
    categorizedExpenses,
    ytdDeductibleTotal,
    estimatedTaxSaving,
    roiScores,
    debtSnowballPlan,
    savingsProjections,
  };
}
