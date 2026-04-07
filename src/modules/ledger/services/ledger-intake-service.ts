import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { bootstrapAliveEntities, syncAliveEntities } from '@/lib/services/alive-entity-service';
import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';

export type TaxCategory = 'essential' | 'deductible' | 'discretionary' | 'investment' | 'non-deductible' | 'partial' | 'unknown';

export interface BudgetLineItem {
  id: string;
  label: string;
  amount: number;
  taxCategory?: TaxCategory;
}

export interface DebtItem {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number;
  interestPaid?: number;
  /** Debt category used for reporting and strategy hints. */
  type?: 'credit_card' | 'student_loan' | 'mortgage' | 'auto' | 'medical' | 'personal';
  /** Original principal at origination — used to calculate paydown progress. */
  originalBalance?: number;
  /** Day of the month the payment is due (1–31). */
  dueDay?: number;
  /** Whether the APR is variable (can change over time). */
  isVariableRate?: boolean;
  /** Stated minimum monthly payment (may differ from computed minPayment). */
  minimumPayment?: number;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  monthlyContribution?: number;
}

export interface FinancialPlan {
  id: string;
  title: string;
  summary: string;
  monthlyTarget: number;
  allocation: {
    essentials: number;
    growth: number;
    buffer: number;
  };
  tasks: string[];
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAnalysis {
  id: string;
  analyzedAt: string;
  periodLabel: string;
  transactionCount: number;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  resonance_score?: number;
  /** Whether this transaction aligns with the user's values (set by resonance feedback). */
  resonanceFeedback?: boolean;
  isRecurring?: boolean;
  /** Links to a RecurringRule that generated this transaction. */
  recurringRuleId?: string;
  /** Links to the Account this transaction belongs to. */
  accountId?: string;
  goalId?: string;
  budgetCategoryId?: string;
  taxCategory?: TaxCategory;
  notes?: string;
}

// ─── Multi-Account ────────────────────────────────────────────────────────────

export type AccountType = 'checking' | 'savings' | 'investment' | 'credit_card' | 'cash' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Current balance. Positive for asset accounts, negative for liabilities. */
  balance: number;
  currency?: string;
  institutionName?: string;
  /** Last 4 digits of card/account number for display. */
  lastFour?: string;
  isDefault?: boolean;
  color?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // ─── Credit card–specific fields ─────────────────────────────────────────
  /** Maximum credit limit (credit_card accounts only). Used to compute utilization. */
  creditLimit?: number;
  /** Day of month (1–31) the payment is due (credit_card accounts only). */
  paymentDueDay?: number;
  /** Day of month (1–31) the billing statement closes (credit_card accounts only). */
  statementDay?: number;
}

export interface AccountTransfer {
  id: string;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  notes?: string;
}

// ─── Net Worth ────────────────────────────────────────────────────────────────

export interface NetWorthSnapshot {
  id: string;
  /** ISO8601 date when snapshot was taken. */
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  note?: string;
}

// ─── Recurring Rules ──────────────────────────────────────────────────────────

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringRule {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  frequency: RecurrenceFrequency;
  /** ISO8601 — date of first occurrence. */
  startDate: string;
  /** ISO8601 — next date this rule should post a transaction. */
  nextDueDate: string;
  lastPostedDate?: string;
  accountId?: string;
  budgetCategoryId?: string;
  taxCategory?: TaxCategory;
  isActive: boolean;
  /** If true, post the transaction automatically without user confirmation. */
  autoPost: boolean;
  notes?: string;
  createdAt: string;
}

// ─── Cash Flow Forecast ───────────────────────────────────────────────────────

export interface CashFlowEvent {
  date: string;
  label: string;
  amount: number;
  type: 'income' | 'expense';
  source: 'recurring' | 'projection';
}

export interface CashFlowForecastDay {
  date: string;
  netFlow: number;
  runningBalance: number;
  events: CashFlowEvent[];
}

export interface CashFlowForecast {
  generatedAt: string;
  horizon: 30 | 60 | 90;
  startingBalance: number;
  days: CashFlowForecastDay[];
  lowestPoint: { date: string; balance: number };
  highestPoint: { date: string; balance: number };
  endBalance: number;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'cancelled' | 'paused' | 'trial';
export type SubscriptionBillingCycle = 'monthly' | 'quarterly' | 'yearly' | 'weekly' | 'lifetime';

export interface Subscription {
  id: string;
  name: string;
  category: string;
  amount: number;
  billingCycle: SubscriptionBillingCycle;
  /** Normalized monthly cost for comparison (computed from amount + billingCycle). */
  monthlyEquivalent: number;
  status: SubscriptionStatus;
  /** ISO8601 — date this subscription renews or expired. */
  nextRenewalDate: string;
  /** ISO8601 — date trial ends (only when status='trial'). */
  trialEndsAt?: string;
  /** Number of days before renewal to remind the user. */
  reminderDays?: number;
  website?: string;
  notes?: string;
  color?: string;
  accountId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Investments / Portfolio ──────────────────────────────────────────────────

export type InvestmentType = 'stock' | 'etf' | 'mutual_fund' | 'bond' | 'crypto' | 'real_estate' | 'cash' | 'other';

export interface Investment {
  id: string;
  name: string;
  ticker?: string;
  type: InvestmentType;
  /** Number of shares / units held. */
  quantity: number;
  /** Average cost per share/unit at time of purchase. */
  costBasis: number;
  /** Current price per share/unit (manually entered or synced). */
  currentPrice: number;
  /** Total current value = quantity × currentPrice. */
  currentValue: number;
  /** Total cost = quantity × costBasis. */
  totalCost: number;
  /** Unrealized P&L = currentValue - totalCost. */
  unrealizedGain: number;
  /** Dividends or distributions received (cumulative). */
  dividendsReceived?: number;
  accountId?: string;
  notes?: string;
  purchasedAt?: string;
  lastUpdatedAt: string;
  createdAt: string;
}

export interface PortfolioSnapshot {
  id: string;
  date: string;
  totalValue: number;
  totalCost: number;
  unrealizedGain: number;
  dividendsReceived: number;
  allocationByType: Record<string, number>;
  note?: string;
}

// ─── Alerts & Notifications ───────────────────────────────────────────────────

export type AlertType =
  | 'budget_breach'
  | 'large_transaction'
  | 'bill_overdue'
  | 'payment_upcoming'
  | 'goal_behind'
  | 'low_balance'
  | 'trial_ending'
  | 'subscription_renewal'
  | 'net_worth_drop';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertRule {
  id: string;
  type: AlertType;
  label: string;
  severity: AlertSeverity;
  isEnabled: boolean;
  /** Threshold value that triggers this alert (e.g. balance below $100, transaction over $500). */
  threshold?: number;
  /** For goal/budget alerts — the entity ID being monitored. */
  entityId?: string;
  createdAt: string;
}

export interface AlertNotification {
  id: string;
  ruleId?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** ISO8601 — when this notification was generated. */
  createdAt: string;
  /** ISO8601 — when user dismissed this. Undefined = still active. */
  dismissedAt?: string;
  /** ISO8601 — snooze until this date. */
  snoozedUntil?: string;
  /** Contextual link (e.g. 'transactions', 'goals'). */
  actionTab?: string;
}

// ─── Financial Calendar ───────────────────────────────────────────────────────

export type CalendarEventType = 'bill' | 'income' | 'subscription' | 'goal_deadline' | 'tax' | 'custom';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string;
  amount?: number;
  isIncome?: boolean;
  color?: string;
  /** Source entity ID (recurringRuleId, subscriptionId, goalId…). */
  entityId?: string;
  notes?: string;
}

// ─── Tax Depth ────────────────────────────────────────────────────────────────

export interface TaxDeduction {
  id: string;
  label: string;
  amount: number;
  category: TaxCategory;
  taxYear: number;
  notes?: string;
  /** ISO8601 — optional supporting document or receipt reference. */
  receiptRef?: string;
  createdAt: string;
}

export interface TaxYearSummary {
  taxYear: number;
  generatedAt: string;
  totalIncome: number;
  totalExpenses: number;
  deductibleExpenses: number;
  totalDeductions: number;
  estimatedTaxableIncome: number;
  /** Breakdown by TaxCategory. */
  categoryBreakdown: Record<string, number>;
  /** Transactions flagged as deductible. */
  deductibleTransactionIds: string[];
}

// ─── Credit Score ─────────────────────────────────────────────────────────────

export type CreditBureau = 'equifax' | 'experian' | 'transunion' | 'vantage' | 'fico' | 'other';

export interface CreditScoreEntry {
  id: string;
  score: number;
  bureau: CreditBureau;
  recordedAt: string;
  notes?: string;
}

export interface CreditFactor {
  name: string;
  /** 'positive' | 'negative' | 'neutral' */
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

// ─── Insurance ────────────────────────────────────────────────────────────────

export type InsurancePolicyType = 'health' | 'dental' | 'vision' | 'auto' | 'home' | 'renters' | 'life' | 'disability' | 'umbrella' | 'pet' | 'other';
export type InsuranceBillingCycle = 'monthly' | 'quarterly' | 'biannual' | 'yearly';

export interface InsurancePolicy {
  id: string;
  name: string;
  type: InsurancePolicyType;
  provider: string;
  premium: number;
  billingCycle: InsuranceBillingCycle;
  /** Normalized monthly cost. */
  monthlyPremium: number;
  coverageAmount?: number;
  deductible?: number;
  policyNumber?: string;
  nextRenewalDate: string;
  /** ISO8601 start date. */
  startDate: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Retirement Planning ──────────────────────────────────────────────────────

export interface RetirementPlan {
  id: string;
  name: string;
  currentAge: number;
  targetRetirementAge: number;
  currentSavings: number;
  monthlyContribution: number;
  expectedAnnualReturnPct: number;
  inflationRatePct: number;
  targetMonthlyIncome: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RetirementProjection {
  planId: string;
  generatedAt: string;
  yearsToRetirement: number;
  projectedNestEgg: number;
  requiredNestEgg: number;
  monthlyIncomeSupported: number;
  onTrack: boolean;
  shortfallOrSurplus: number;
  fourPercentRuleMonthly: number;
  milestones: Array<{ year: number; age: number; projectedBalance: number }>;
}

// ─── Automation Rules (Suggestion Engine) ────────────────────────────────────

export type AutomationTriggerType =
  | 'spending_exceeds'
  | 'balance_below'
  | 'goal_progress_below'
  | 'subscription_unused'
  | 'net_worth_drops'
  | 'bill_overdue'
  | 'month_end';

export type AutomationSuggestionType =
  | 'cancel_subscription'
  | 'increase_savings'
  | 'pay_extra_debt'
  | 'review_budget'
  | 'record_snapshot'
  | 'transfer_to_savings'
  | 'custom_message';

export interface AutomationRule {
  id: string;
  name: string;
  isEnabled: boolean;
  triggerType: AutomationTriggerType;
  triggerThreshold?: number;
  triggerEntityId?: string;
  triggerCategory?: string;
  suggestionType: AutomationSuggestionType;
  suggestionMessage: string;
  createdAt: string;
}

export interface AutomationSuggestion {
  id: string;
  ruleId: string;
  ruleName: string;
  suggestionType: AutomationSuggestionType;
  message: string;
  generatedAt: string;
  dismissedAt?: string;
}

// ─── Receipt Library ──────────────────────────────────────────────────────────

export interface Receipt {
  id: string;
  /** Display label (merchant name or description). */
  label: string;
  amount: number;
  date: string;
  /** Linked transaction ID (if matched). */
  transactionId?: string;
  category?: string;
  taxCategory?: TaxCategory;
  taxYear?: number;
  /** URL or data-URI of the receipt image (optional — may be left empty). */
  imageRef?: string;
  notes?: string;
  createdAt: string;
}

// ─── Currency Rates ───────────────────────────────────────────────────────────

export interface CurrencyRate {
  /** ISO 4217 code (e.g. 'EUR'). */
  from: string;
  to: string;
  rate: number;
  recordedAt: string;
}

export interface BudgetCategory {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  color: string;
}

export interface GoalMilestone {
  id: string;
  amount: number;
  label: string;
  achieved: boolean;
  achievedAt?: string;
}

export interface FinancialGoal {
  id: string;
  name: string;
  type: 'savings' | 'debt_payoff' | 'investment' | 'purchase' | 'other';
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  monthlyContribution: number;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
  milestones?: GoalMilestone[];
  createdAt: string;
}

export interface LedgerIntakeProfile {
  onboardingComplete: boolean;
  currency: string;
  monthlyIncome: number;
  fixedExpenses: BudgetLineItem[];
  variableExpenses: BudgetLineItem[];
  debtItems: DebtItem[];
  savingsGoals: SavingsGoal[];
  planningHorizon: 'monthly' | 'quarterly' | 'yearly';
  summary: string;
  plans: FinancialPlan[];
  activePlanId: string | null;
  plannerBotState: 'idle' | 'creating' | 'active';
  lastPlanGeneratedAt?: string;
  documentAnalysisEnabled: boolean;
  lastDocumentAnalysis?: DocumentAnalysis;
  transactions?: Transaction[];
  budgetCategories?: BudgetCategory[];
  financialGoals?: FinancialGoal[];
  /** Quarter indices (0-based) the user has marked as paid for the current tax year. */
  paidQuarters?: number[];
  // ─── Multi-Account ──────────────────────────────────────────────────────────
  accounts?: Account[];
  transferHistory?: AccountTransfer[];
  // ─── Net Worth ──────────────────────────────────────────────────────────────
  netWorthHistory?: NetWorthSnapshot[];
  // ─── Recurring Rules ────────────────────────────────────────────────────────
  recurringRules?: RecurringRule[];
  // ─── Cash Flow Forecast ─────────────────────────────────────────────────────
  lastCashFlowForecast?: CashFlowForecast;
  // ─── Subscriptions ──────────────────────────────────────────────────────────
  subscriptions?: Subscription[];
  // ─── Investments / Portfolio ─────────────────────────────────────────────────
  investments?: Investment[];
  portfolioHistory?: PortfolioSnapshot[];
  // ─── Alerts ─────────────────────────────────────────────────────────────────
  alertRules?: AlertRule[];
  dismissedAlertIds?: string[];
  // ─── Tax Depth ───────────────────────────────────────────────────────────────
  taxDeductions?: TaxDeduction[];
  lastTaxSummary?: TaxYearSummary;
  // ─── Credit Score ────────────────────────────────────────────────────────────
  creditScoreHistory?: CreditScoreEntry[];
  creditFactors?: CreditFactor[];
  // ─── Insurance ───────────────────────────────────────────────────────────────
  insurancePolicies?: InsurancePolicy[];
  // ─── Retirement ──────────────────────────────────────────────────────────────
  retirementPlans?: RetirementPlan[];
  lastRetirementProjection?: RetirementProjection;
  // ─── Automation Rules ─────────────────────────────────────────────────────────
  automationRules?: AutomationRule[];
  dismissedSuggestionIds?: string[];
  // ─── Receipt Library ─────────────────────────────────────────────────────────
  receipts?: Receipt[];
  // ─── Currency Rates ──────────────────────────────────────────────────────────
  currencyRates?: CurrencyRate[];
  extensionValues?: Record<string, unknown>;
  /** Per-category ROI coefficients computed from resonance feedback (category → aligned ratio). */
  resonanceCoefficients?: Record<string, number>;
  // ─── Financial Streak (cross-verification) ─────────────────────────────────
  /** Consecutive verification cycles with positive net cashflow. */
  financialStreakCount?: number;
  /** Last milestone value emitted (prevents duplicate milestone events). */
  financialStreakLastMilestone?: number;
  createdAt: string;
  updatedAt: string;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseArray<T>(value: unknown, mapper: (entry: Record<string, unknown>, index: number) => T): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(mapper);
}

function normalizeLedgerProfile(raw: unknown): LedgerIntakeProfile {
  const now = new Date().toISOString();
  const base = createEmptyLedgerProfile();
  if (!raw || typeof raw !== 'object') return base;

  const candidate = raw as Record<string, unknown>;

  const plans = parseArray(candidate.plans, (plan, index) => ({
    id: typeof plan?.id === 'string' ? plan.id : `plan_${index}_${Date.now()}`,
    title: typeof plan?.title === 'string' ? plan.title : 'Financial Plan',
    summary: typeof plan?.summary === 'string' ? plan.summary : '',
    monthlyTarget: parseNumber(plan?.monthlyTarget),
    allocation: {
      essentials: parseNumber((plan?.allocation as Record<string, unknown>)?.essentials),
      growth: parseNumber((plan?.allocation as Record<string, unknown>)?.growth),
      buffer: parseNumber((plan?.allocation as Record<string, unknown>)?.buffer)
    },
    tasks: Array.isArray(plan?.tasks) ? plan.tasks.filter((t: Record<string, unknown>) => typeof t === 'string') : [],
    status: plan?.status === 'active' || plan?.status === 'archived' ? plan.status as 'active' | 'archived' : 'draft' as const,
    createdAt: typeof plan?.createdAt === 'string' ? plan.createdAt : now,
    updatedAt: typeof plan?.updatedAt === 'string' ? plan.updatedAt : now
  }));

  const normalized: LedgerIntakeProfile = {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    currency: typeof candidate.currency === 'string' && candidate.currency.trim() ? candidate.currency : 'USD',
    monthlyIncome: parseNumber(candidate.monthlyIncome),
    fixedExpenses: parseArray(candidate.fixedExpenses, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `fixed_${index}`,
      label: typeof entry?.label === 'string' ? entry.label : 'Fixed Expense',
      amount: parseNumber(entry?.amount)
    })),
    variableExpenses: parseArray(candidate.variableExpenses, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `variable_${index}`,
      label: typeof entry?.label === 'string' ? entry.label : 'Variable Expense',
      amount: parseNumber(entry?.amount)
    })),
    debtItems: parseArray(candidate.debtItems, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `debt_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Debt Item',
      balance: parseNumber(entry?.balance),
      minPayment: parseNumber(entry?.minPayment),
      apr: parseNumber(entry?.apr),
      interestPaid: typeof entry?.interestPaid === 'number' ? entry.interestPaid : undefined
    })),
    savingsGoals: parseArray(candidate.savingsGoals, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `goal_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Savings Goal',
      targetAmount: parseNumber(entry?.targetAmount),
      currentAmount: parseNumber(entry?.currentAmount),
      targetDate: typeof entry?.targetDate === 'string' ? entry.targetDate : undefined,
      monthlyContribution: typeof entry?.monthlyContribution === 'number' ? entry.monthlyContribution : undefined,
    })),
    transactions: parseArray(candidate.transactions, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `tx_${index}_${Date.now()}`,
      date: typeof entry?.date === 'string' ? entry.date : new Date().toISOString().split('T')[0],
      description: typeof entry?.description === 'string' ? entry.description : 'Transaction',
      amount: parseNumber(entry?.amount),
      type: entry?.type === 'income' ? 'income' : 'expense',
      category: typeof entry?.category === 'string' ? entry.category : 'Other',
      isRecurring: entry?.isRecurring === true,
      recurringRuleId: typeof entry?.recurringRuleId === 'string' ? entry.recurringRuleId : undefined,
      accountId: typeof entry?.accountId === 'string' ? entry.accountId : undefined,
      goalId: typeof entry?.goalId === 'string' ? entry.goalId : undefined,
      budgetCategoryId: typeof entry?.budgetCategoryId === 'string' ? entry.budgetCategoryId : undefined,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
    })),
    budgetCategories: parseArray(candidate.budgetCategories, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `cat_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Category',
      allocated: parseNumber(entry?.allocated),
      spent: parseNumber(entry?.spent),
      color: typeof entry?.color === 'string' ? entry.color : '#6b7280',
    })),
    financialGoals: parseArray(candidate.financialGoals, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `fgoal_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Goal',
      type: (['savings','debt_payoff','investment','purchase','other'] as const).includes(entry?.type as FinancialGoal['type'])
        ? entry.type as FinancialGoal['type']
        : 'other',
      targetAmount: parseNumber(entry?.targetAmount),
      currentAmount: parseNumber(entry?.currentAmount),
      targetDate: typeof entry?.targetDate === 'string' ? entry.targetDate : undefined,
      monthlyContribution: typeof entry?.monthlyContribution === 'number' ? entry.monthlyContribution : 0,
      priority: (['low','medium','high'] as const).includes(entry?.priority as FinancialGoal['priority'])
        ? entry.priority as FinancialGoal['priority']
        : 'medium',
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      milestones: Array.isArray(entry?.milestones) ? entry.milestones : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    })),
    planningHorizon:
      candidate.planningHorizon === 'quarterly' || candidate.planningHorizon === 'yearly'
        ? candidate.planningHorizon
        : 'monthly',
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    plans,
    activePlanId: typeof candidate.activePlanId === 'string' ? candidate.activePlanId : null,
    plannerBotState:
      candidate.plannerBotState === 'creating' || candidate.plannerBotState === 'active'
        ? candidate.plannerBotState
        : 'idle',
    lastPlanGeneratedAt:
      typeof candidate.lastPlanGeneratedAt === 'string' ? candidate.lastPlanGeneratedAt : undefined,
    documentAnalysisEnabled: candidate.documentAnalysisEnabled === true,
    lastDocumentAnalysis:
      candidate.lastDocumentAnalysis && typeof candidate.lastDocumentAnalysis === 'object'
        ? {
            id: typeof (candidate.lastDocumentAnalysis as Record<string, unknown>)?.id === 'string'
              ? (candidate.lastDocumentAnalysis as Record<string, unknown>).id as string
              : crypto.randomUUID(),
            analyzedAt: typeof (candidate.lastDocumentAnalysis as Record<string, unknown>)?.analyzedAt === 'string'
              ? (candidate.lastDocumentAnalysis as Record<string, unknown>).analyzedAt as string
              : now,
            periodLabel: typeof (candidate.lastDocumentAnalysis as Record<string, unknown>)?.periodLabel === 'string'
              ? (candidate.lastDocumentAnalysis as Record<string, unknown>).periodLabel as string
              : 'Unknown',
            transactionCount: parseNumber((candidate.lastDocumentAnalysis as Record<string, unknown>)?.transactionCount, 0)
          }
        : undefined,
    paidQuarters: Array.isArray(candidate.paidQuarters)
      ? candidate.paidQuarters.filter((q) => typeof q === 'number' && Number.isFinite(q))
      : [],
    accounts: parseArray(candidate.accounts, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `acct_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Account',
      type: (['checking','savings','investment','credit_card','cash','other'] as const).includes(entry?.type as AccountType)
        ? entry.type as AccountType : 'checking',
      balance: parseNumber(entry?.balance),
      currency: typeof entry?.currency === 'string' ? entry.currency : undefined,
      institutionName: typeof entry?.institutionName === 'string' ? entry.institutionName : undefined,
      lastFour: typeof entry?.lastFour === 'string' ? entry.lastFour : undefined,
      isDefault: entry?.isDefault === true,
      color: typeof entry?.color === 'string' ? entry.color : undefined,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
      creditLimit: typeof entry?.creditLimit === 'number' && entry.creditLimit > 0 ? entry.creditLimit : undefined,
      paymentDueDay: typeof entry?.paymentDueDay === 'number' && entry.paymentDueDay >= 1 && entry.paymentDueDay <= 31 ? entry.paymentDueDay : undefined,
      statementDay: typeof entry?.statementDay === 'number' && entry.statementDay >= 1 && entry.statementDay <= 31 ? entry.statementDay : undefined,
    })),
    transferHistory: parseArray(candidate.transferHistory, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `transfer_${index}`,
      date: typeof entry?.date === 'string' ? entry.date : now,
      fromAccountId: typeof entry?.fromAccountId === 'string' ? entry.fromAccountId : '',
      toAccountId: typeof entry?.toAccountId === 'string' ? entry.toAccountId : '',
      amount: parseNumber(entry?.amount),
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
    })),
    netWorthHistory: parseArray(candidate.netWorthHistory, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `nw_${index}`,
      date: typeof entry?.date === 'string' ? entry.date : now,
      assets: parseNumber(entry?.assets),
      liabilities: parseNumber(entry?.liabilities),
      netWorth: parseNumber(entry?.netWorth),
      note: typeof entry?.note === 'string' ? entry.note : undefined,
    })),
    recurringRules: parseArray(candidate.recurringRules, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `rule_${index}`,
      description: typeof entry?.description === 'string' ? entry.description : 'Recurring',
      amount: parseNumber(entry?.amount),
      type: entry?.type === 'income' ? 'income' : 'expense',
      category: typeof entry?.category === 'string' ? entry.category : 'Other',
      frequency: (['daily','weekly','biweekly','monthly','quarterly','yearly'] as const).includes(entry?.frequency as RecurrenceFrequency)
        ? entry.frequency as RecurrenceFrequency : 'monthly',
      startDate: typeof entry?.startDate === 'string' ? entry.startDate : now,
      nextDueDate: typeof entry?.nextDueDate === 'string' ? entry.nextDueDate : now,
      lastPostedDate: typeof entry?.lastPostedDate === 'string' ? entry.lastPostedDate : undefined,
      accountId: typeof entry?.accountId === 'string' ? entry.accountId : undefined,
      budgetCategoryId: typeof entry?.budgetCategoryId === 'string' ? entry.budgetCategoryId : undefined,
      taxCategory: typeof entry?.taxCategory === 'string' ? entry.taxCategory as TaxCategory : undefined,
      isActive: entry?.isActive !== false,
      autoPost: entry?.autoPost === true,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
    })),
    lastCashFlowForecast: undefined, // recomputed on demand, not persisted
    subscriptions: parseArray(candidate.subscriptions, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `sub_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Subscription',
      category: typeof entry?.category === 'string' ? entry.category : 'Other',
      amount: parseNumber(entry?.amount),
      billingCycle: (['monthly','quarterly','yearly','weekly','lifetime'] as const).includes(entry?.billingCycle as SubscriptionBillingCycle)
        ? entry.billingCycle as SubscriptionBillingCycle : 'monthly',
      monthlyEquivalent: parseNumber(entry?.monthlyEquivalent),
      status: (['active','cancelled','paused','trial'] as const).includes(entry?.status as SubscriptionStatus)
        ? entry.status as SubscriptionStatus : 'active',
      nextRenewalDate: typeof entry?.nextRenewalDate === 'string' ? entry.nextRenewalDate : now,
      trialEndsAt: typeof entry?.trialEndsAt === 'string' ? entry.trialEndsAt : undefined,
      reminderDays: typeof entry?.reminderDays === 'number' ? entry.reminderDays : 7,
      website: typeof entry?.website === 'string' ? entry.website : undefined,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      color: typeof entry?.color === 'string' ? entry.color : undefined,
      accountId: typeof entry?.accountId === 'string' ? entry.accountId : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
    })),
    investments: parseArray(candidate.investments, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `inv_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Investment',
      ticker: typeof entry?.ticker === 'string' ? entry.ticker : undefined,
      type: (['stock','etf','mutual_fund','bond','crypto','real_estate','cash','other'] as const).includes(entry?.type as InvestmentType)
        ? entry.type as InvestmentType : 'other',
      quantity: parseNumber(entry?.quantity, 1),
      costBasis: parseNumber(entry?.costBasis),
      currentPrice: parseNumber(entry?.currentPrice),
      currentValue: parseNumber(entry?.currentValue),
      totalCost: parseNumber(entry?.totalCost),
      unrealizedGain: parseNumber(entry?.unrealizedGain),
      dividendsReceived: typeof entry?.dividendsReceived === 'number' ? entry.dividendsReceived : undefined,
      accountId: typeof entry?.accountId === 'string' ? entry.accountId : undefined,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      purchasedAt: typeof entry?.purchasedAt === 'string' ? entry.purchasedAt : undefined,
      lastUpdatedAt: typeof entry?.lastUpdatedAt === 'string' ? entry.lastUpdatedAt : now,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
    })),
    portfolioHistory: parseArray(candidate.portfolioHistory, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `psnap_${index}`,
      date: typeof entry?.date === 'string' ? entry.date : now,
      totalValue: parseNumber(entry?.totalValue),
      totalCost: parseNumber(entry?.totalCost),
      unrealizedGain: parseNumber(entry?.unrealizedGain),
      dividendsReceived: parseNumber(entry?.dividendsReceived),
      allocationByType: entry?.allocationByType && typeof entry.allocationByType === 'object' && !Array.isArray(entry.allocationByType)
        ? entry.allocationByType as Record<string, number> : {},
      note: typeof entry?.note === 'string' ? entry.note : undefined,
    })),
    alertRules: parseArray(candidate.alertRules, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `alert_${index}`,
      type: typeof entry?.type === 'string' ? entry.type as AlertType : 'large_transaction',
      label: typeof entry?.label === 'string' ? entry.label : 'Alert',
      severity: (['info','warning','critical'] as const).includes(entry?.severity as AlertSeverity)
        ? entry.severity as AlertSeverity : 'info',
      isEnabled: entry?.isEnabled !== false,
      threshold: typeof entry?.threshold === 'number' ? entry.threshold : undefined,
      entityId: typeof entry?.entityId === 'string' ? entry.entityId : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
    })),
    dismissedAlertIds: Array.isArray(candidate.dismissedAlertIds)
      ? candidate.dismissedAlertIds.filter((id: unknown) => typeof id === 'string')
      : [],
    taxDeductions: parseArray(candidate.taxDeductions, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `ded_${index}`,
      label: typeof entry?.label === 'string' ? entry.label : 'Deduction',
      amount: parseNumber(entry?.amount),
      category: typeof entry?.category === 'string' ? entry.category as TaxCategory : 'deductible',
      taxYear: typeof entry?.taxYear === 'number' ? entry.taxYear : new Date().getFullYear(),
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      receiptRef: typeof entry?.receiptRef === 'string' ? entry.receiptRef : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
    })),
    lastTaxSummary: candidate.lastTaxSummary && typeof candidate.lastTaxSummary === 'object'
      ? candidate.lastTaxSummary as TaxYearSummary
      : undefined,
    creditScoreHistory: parseArray(candidate.creditScoreHistory, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `credit_${index}`,
      score: typeof entry?.score === 'number' ? entry.score : 0,
      bureau: (['equifax','experian','transunion','vantage','fico','other'] as const).includes(entry?.bureau as CreditBureau)
        ? entry.bureau as CreditBureau : 'other',
      recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt : now,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
    })),
    creditFactors: Array.isArray(candidate.creditFactors)
      ? candidate.creditFactors.filter((f: unknown) => f && typeof (f as Record<string,unknown>).name === 'string') as CreditFactor[]
      : [],
    insurancePolicies: parseArray(candidate.insurancePolicies, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `ins_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Policy',
      type: (['health','dental','vision','auto','home','renters','life','disability','umbrella','pet','other'] as const).includes(entry?.type as InsurancePolicyType)
        ? entry.type as InsurancePolicyType : 'other',
      provider: typeof entry?.provider === 'string' ? entry.provider : '',
      premium: typeof entry?.premium === 'number' ? entry.premium : 0,
      billingCycle: (['monthly','quarterly','biannual','yearly'] as const).includes(entry?.billingCycle as InsuranceBillingCycle)
        ? entry.billingCycle as InsuranceBillingCycle : 'monthly',
      monthlyPremium: typeof entry?.monthlyPremium === 'number' ? entry.monthlyPremium : 0,
      coverageAmount: typeof entry?.coverageAmount === 'number' ? entry.coverageAmount : undefined,
      deductible: typeof entry?.deductible === 'number' ? entry.deductible : undefined,
      policyNumber: typeof entry?.policyNumber === 'string' ? entry.policyNumber : undefined,
      nextRenewalDate: typeof entry?.nextRenewalDate === 'string' ? entry.nextRenewalDate : now,
      startDate: typeof entry?.startDate === 'string' ? entry.startDate : now,
      isActive: entry?.isActive !== false,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
    })),
    retirementPlans: parseArray(candidate.retirementPlans, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `ret_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Retirement Plan',
      currentAge: typeof entry?.currentAge === 'number' ? entry.currentAge : 30,
      targetRetirementAge: typeof entry?.targetRetirementAge === 'number' ? entry.targetRetirementAge : 65,
      currentSavings: typeof entry?.currentSavings === 'number' ? entry.currentSavings : 0,
      monthlyContribution: typeof entry?.monthlyContribution === 'number' ? entry.monthlyContribution : 0,
      expectedAnnualReturnPct: typeof entry?.expectedAnnualReturnPct === 'number' ? entry.expectedAnnualReturnPct : 7,
      inflationRatePct: typeof entry?.inflationRatePct === 'number' ? entry.inflationRatePct : 3,
      targetMonthlyIncome: typeof entry?.targetMonthlyIncome === 'number' ? entry.targetMonthlyIncome : 5000,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
      updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now,
    })),
    lastRetirementProjection: candidate.lastRetirementProjection && typeof candidate.lastRetirementProjection === 'object'
      ? candidate.lastRetirementProjection as RetirementProjection
      : undefined,
    automationRules: parseArray(candidate.automationRules, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `auto_${index}`,
      name: typeof entry?.name === 'string' ? entry.name : 'Automation Rule',
      isEnabled: entry?.isEnabled !== false,
      triggerType: typeof entry?.triggerType === 'string' ? entry.triggerType as AutomationTriggerType : 'spending_exceeds',
      triggerThreshold: typeof entry?.triggerThreshold === 'number' ? entry.triggerThreshold : undefined,
      triggerEntityId: typeof entry?.triggerEntityId === 'string' ? entry.triggerEntityId : undefined,
      triggerCategory: typeof entry?.triggerCategory === 'string' ? entry.triggerCategory : undefined,
      suggestionType: typeof entry?.suggestionType === 'string' ? entry.suggestionType as AutomationSuggestionType : 'review_budget',
      suggestionMessage: typeof entry?.suggestionMessage === 'string' ? entry.suggestionMessage : 'Review your budget.',
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
    })),
    dismissedSuggestionIds: Array.isArray(candidate.dismissedSuggestionIds)
      ? candidate.dismissedSuggestionIds.filter((id: unknown) => typeof id === 'string')
      : [],
    receipts: parseArray(candidate.receipts, (entry, index) => ({
      id: typeof entry?.id === 'string' ? entry.id : `rcpt_${index}`,
      label: typeof entry?.label === 'string' ? entry.label : 'Receipt',
      amount: typeof entry?.amount === 'number' ? entry.amount : 0,
      date: typeof entry?.date === 'string' ? entry.date : now,
      transactionId: typeof entry?.transactionId === 'string' ? entry.transactionId : undefined,
      category: typeof entry?.category === 'string' ? entry.category : undefined,
      taxCategory: typeof entry?.taxCategory === 'string' ? entry.taxCategory as TaxCategory : undefined,
      taxYear: typeof entry?.taxYear === 'number' ? entry.taxYear : undefined,
      imageRef: typeof entry?.imageRef === 'string' ? entry.imageRef : undefined,
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
      createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
    })),
    currencyRates: parseArray(candidate.currencyRates, (entry, index) => ({
      from: typeof entry?.from === 'string' ? entry.from : 'USD',
      to: typeof entry?.to === 'string' ? entry.to : 'EUR',
      rate: typeof entry?.rate === 'number' ? entry.rate : 1,
      recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt : now,
    })),
    extensionValues: candidate.extensionValues && typeof candidate.extensionValues === 'object' && !Array.isArray(candidate.extensionValues)
      ? candidate.extensionValues as Record<string, unknown>
      : {},
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };

  return normalized;
}

export function createEmptyLedgerProfile(): LedgerIntakeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    currency: 'USD',
    monthlyIncome: 0,
    fixedExpenses: [],
    variableExpenses: [],
    debtItems: [],
    savingsGoals: [],
    planningHorizon: 'monthly',
    summary: '',
    plans: [],
    activePlanId: null,
    plannerBotState: 'idle',
    documentAnalysisEnabled: false,
    transactions: [],
    budgetCategories: [],
    financialGoals: [],
    paidQuarters: [],
    accounts: [],
    transferHistory: [],
    netWorthHistory: [],
    recurringRules: [],
    subscriptions: [],
    investments: [],
    portfolioHistory: [],
    alertRules: [],
    dismissedAlertIds: [],
    taxDeductions: [],
    creditScoreHistory: [],
    creditFactors: [],
    insurancePolicies: [],
    retirementPlans: [],
    automationRules: [],
    dismissedSuggestionIds: [],
    receipts: [],
    currencyRates: [],
    extensionValues: {},
    createdAt: now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Factory instance — all encryption / decryption / guest logic lives here.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<LedgerIntakeProfile>({
  collection: 'ledger_profiles',
  guestStorageKey: 'nexus_ledger_profile_guest',
  createEmpty: createEmptyLedgerProfile,
  normalize: normalizeLedgerProfile,
  metadataProjection: (p) => ({
    onboardingComplete: p.onboardingComplete,
    activePlanId: p.activePlanId,
    plannerBotState: p.plannerBotState,
  }),
});

// ---------------------------------------------------------------------------
// Public API — identical names to the original; zero callers need to change.
// ---------------------------------------------------------------------------

export const loadLedgerProfile: (ctx: LoadContext) => Promise<LedgerIntakeProfile | null> =
  _service.load.bind(_service);

export const subscribeLedgerProfile: (
  ctx: LoadContext,
  onUpdate: (profile: LedgerIntakeProfile | null) => void,
) => () => void = _service.subscribe.bind(_service);

export async function saveLedgerProfile(profile: LedgerIntakeProfile, ctx: LoadContext): Promise<void> {
  const normalized = normalizeLedgerProfile(profile);
  await _service.save(normalized, ctx);

  if (!ctx.userId) return;

  try {
    await syncAliveEntities(
      getNexusDataLayer(),
      bootstrapAliveEntities({
        ledgerFinancialGoals: normalized.financialGoals,
        ledgerTransactions: normalized.transactions,
      }),
      { uid: ctx.userId, pruneMissingWithinIncomingPrefixes: true },
    );
  } catch (error) {
    console.error('[LedgerIntakeService] Failed to sync alive entities:', error);
  }
}

export const syncGuestLedgerProfileToUser: (ctx: LoadContext) => Promise<boolean> =
  _service.syncGuestToUser.bind(_service);
