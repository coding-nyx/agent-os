import { ActionHub } from '@/lib/actions/action-hub';
import {
  FinancialPlan,
  DocumentAnalysis,
  LedgerIntakeProfile,
  loadLedgerProfile,
  saveLedgerProfile
} from './ledger-intake-service';
import { parseFinancialStatement } from '@/lib/actions/parsing-actions';

let registered = false;

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function createStarterPlan(profile: LedgerIntakeProfile): FinancialPlan {
  const totalFixed = profile.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totalVariable = profile.variableExpenses.reduce((sum, item) => sum + item.amount, 0);
  const baselineSpend = totalFixed + totalVariable;
  const monthlyTarget = Math.max(profile.monthlyIncome - baselineSpend, 0);
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: 'Starter Financial Plan',
    summary: 'Baseline cashflow stabilization with weekly execution checkpoints.',
    monthlyTarget,
    allocation: {
      essentials: 60,
      growth: 25,
      buffer: 15
    },
    tasks: [
      'Track every variable expense for the next 7 days.',
      'Cap discretionary spending at 80% of current baseline.',
      'Apply first buffer deposit to emergency reserve this month.'
    ],
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadLedgerProfile({ userId, encryptionKey });
}

async function persistProfile(profile: LedgerIntakeProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  await saveLedgerProfile(profile, { userId, encryptionKey });
}

function ensureActivePlan(next: LedgerIntakeProfile) {
  if (next.activePlanId) return;
  const starter = createStarterPlan(next);
  next.plans = [starter, ...next.plans.filter((plan) => plan.id !== starter.id)];
  next.activePlanId = starter.id;
  next.plannerBotState = 'active';
  next.lastPlanGeneratedAt = new Date().toISOString();
  if (!next.summary) {
    next.summary = 'Starter plan auto-generated from current baseline.';
  }
}

export function registerLedgerActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('ledger', {
    create_financial_plan: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const now = new Date().toISOString();
      const alloc = payload?.allocation as Record<string, unknown> | undefined;
      const plan: FinancialPlan = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        title: typeof payload?.title === 'string' ? payload.title : 'Financial Plan',
        summary: typeof payload?.summary === 'string' ? payload.summary : '',
        monthlyTarget: parseNumber(payload?.monthlyTarget),
        allocation: {
          essentials: parseNumber(alloc?.essentials, 60),
          growth: parseNumber(alloc?.growth, 25),
          buffer: parseNumber(alloc?.buffer, 15)
        },
        tasks: Array.isArray(payload?.tasks) ? payload.tasks.filter((item: unknown) => typeof item === 'string') : [],
        status: 'active',
        createdAt: now,
        updatedAt: now
      };

      const next: LedgerIntakeProfile = {
        ...profile,
        plans: [plan, ...profile.plans.filter((existing) => existing.id !== plan.id)],
        activePlanId: plan.id,
        plannerBotState: 'active',
        lastPlanGeneratedAt: now,
        updatedAt: now
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    update_budget_snapshot: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const next: LedgerIntakeProfile = {
        ...profile,
        monthlyIncome: parseNumber(payload?.monthlyIncome, profile.monthlyIncome),
        currency: typeof payload?.currency === 'string' && payload.currency.trim() ? payload.currency : profile.currency,
        fixedExpenses: Array.isArray(payload?.fixedExpenses) ? payload.fixedExpenses : profile.fixedExpenses,
        variableExpenses: Array.isArray(payload?.variableExpenses) ? payload.variableExpenses : profile.variableExpenses,
        debtItems: Array.isArray(payload?.debtItems) ? payload.debtItems : profile.debtItems,
        savingsGoals: Array.isArray(payload?.savingsGoals) ? payload.savingsGoals : profile.savingsGoals,
        updatedAt: new Date().toISOString()
      };

      ensureActivePlan(next);
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    log_transaction_summary: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      if (typeof payload?.summary !== 'string' || !payload.summary.trim()) return;

      const next: LedgerIntakeProfile = {
        ...profile,
        summary: payload.summary.trim(),
        updatedAt: new Date().toISOString()
      };

      ensureActivePlan(next);
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    analyze_financial_document: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      // Extract vision LLM results from payload
      const monthlyIncome = parseNumber(payload?.monthlyIncome, profile.monthlyIncome);
      const currency = typeof payload?.currency === 'string' && payload.currency.trim() ? payload.currency : profile.currency;
      const fixedExpenses = Array.isArray(payload?.fixedExpenses) ? payload.fixedExpenses : [];
      const variableExpenses = Array.isArray(payload?.variableExpenses) ? payload.variableExpenses : [];
      const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];

      // Record analysis metadata
      const analysis: DocumentAnalysis = {
        id: crypto.randomUUID(),
        analyzedAt: new Date().toISOString(),
        periodLabel: typeof payload?.periodLabel === 'string' ? payload.periodLabel : 'Uploaded Statement',
        transactionCount: transactions.length
      };

      // Build fixed and variable expense items from extracted data
      const newFixedExpenses = fixedExpenses
        .filter((e: unknown) => e && typeof e === 'object')
        .map((e: Record<string, unknown>, i: number) => ({
          id: crypto.randomUUID(),
          label: typeof e.description === 'string' ? e.description : `Fixed Expense ${i + 1}`,
          amount: parseNumber(e.amount, 0)
        }));

      const newVariableExpenses = variableExpenses
        .filter((e: unknown) => e && typeof e === 'object')
        .map((e: Record<string, unknown>, i: number) => ({
          id: crypto.randomUUID(),
          label: typeof e.description === 'string' ? e.description : `Variable Expense ${i + 1}`,
          amount: parseNumber(e.amount, 0)
        }));

      // Update profile
      const next: LedgerIntakeProfile = {
        ...profile,
        monthlyIncome: monthlyIncome > 0 ? monthlyIncome : profile.monthlyIncome,
        currency,
        fixedExpenses: [...newFixedExpenses, ...profile.fixedExpenses].slice(0, 100),
        variableExpenses: [...newVariableExpenses, ...profile.variableExpenses].slice(0, 100),
        lastDocumentAnalysis: analysis,
        updatedAt: new Date().toISOString()
      };

      ensureActivePlan(next);
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    parse_financial_statement: parseFinancialStatement,
  });
}
