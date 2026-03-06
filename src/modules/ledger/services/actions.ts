import { ActionHub } from '@/lib/actions/action-hub';
import {
  FinancialPlan,
  LedgerIntakeProfile,
  loadLedgerProfile,
  saveLedgerProfile
} from './ledger-intake-service';

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
      const plan: FinancialPlan = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        title: typeof payload?.title === 'string' ? payload.title : 'Financial Plan',
        summary: typeof payload?.summary === 'string' ? payload.summary : '',
        monthlyTarget: parseNumber(payload?.monthlyTarget),
        allocation: {
          essentials: parseNumber(payload?.allocation?.essentials, 60),
          growth: parseNumber(payload?.allocation?.growth, 25),
          buffer: parseNumber(payload?.allocation?.buffer, 15)
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
    }
  });
}
