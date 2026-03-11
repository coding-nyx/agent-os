import { ActionHub } from '@/lib/actions/action-hub';
import {
  FinancialPlan,
  DocumentAnalysis,
  LedgerIntakeProfile,
  Transaction,
  BudgetCategory,
  FinancialGoal,
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

      const mergeItems = (existing: any[], incoming: any[]) => {
        if (!Array.isArray(incoming)) return existing;
        const merged = [...existing];
        incoming.forEach(item => {
          const idx = merged.findIndex(e => e.label === item.label);
          if (idx !== -1) merged[idx] = { ...merged[idx], ...item };
          else merged.push({ id: crypto.randomUUID(), ...item });
        });
        return merged;
      };

      const next: LedgerIntakeProfile = {
        ...profile,
        monthlyIncome: parseNumber(payload?.monthlyIncome, profile.monthlyIncome),
        currency: typeof payload?.currency === 'string' && payload.currency.trim() ? payload.currency : profile.currency,
        fixedExpenses: mergeItems(profile.fixedExpenses, payload?.fixedExpenses as any[]),
        variableExpenses: mergeItems(profile.variableExpenses, payload?.variableExpenses as any[]),
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

    // ── Handler 1: add_transaction ────────────────────────────────────────────
    add_transaction: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const now = new Date().toISOString();
      const amount = parseNumber(payload?.amount);

      // Derive transaction type: explicit payload wins; otherwise infer from sign.
      const rawType = payload?.type;
      const txType: Transaction['type'] =
        rawType === 'income'
          ? 'income'
          : rawType === 'expense'
          ? 'expense'
          : amount >= 0
          ? 'income'
          : 'expense';

      const merchant =
        typeof payload?.merchant === 'string' ? payload.merchant.trim() : '';
      const categoryName =
        typeof payload?.category === 'string' ? payload.category.trim() : '';
      const note =
        typeof payload?.note === 'string' && payload.note.trim()
          ? payload.note.trim()
          : undefined;
      const date =
        typeof payload?.date === 'string' && payload.date.trim()
          ? payload.date.trim()
          : now.split('T')[0];

      // Match to an existing BudgetCategory by name (case-insensitive).
      const existingCategories: BudgetCategory[] = profile.budgetCategories ?? [];
      const matchedCategory = categoryName
        ? existingCategories.find(
            (c) => c.name.toLowerCase() === categoryName.toLowerCase()
          )
        : undefined;

      const budgetCategoryId: string | undefined =
        typeof payload?.budgetCategoryId === 'string'
          ? payload.budgetCategoryId
          : matchedCategory?.id;

      const transaction: Transaction = {
        id: crypto.randomUUID(),
        date,
        description: merchant || categoryName || 'Transaction',
        amount,
        type: txType,
        category: categoryName || matchedCategory?.name || 'Other',
        budgetCategoryId,
        notes: note,
      };

      // Increment the matched category's `spent` for expense transactions.
      const updatedCategories: BudgetCategory[] = existingCategories.map((c) => {
        if (c.id === budgetCategoryId && txType === 'expense') {
          return { ...c, spent: c.spent + Math.abs(amount) };
        }
        return c;
      });

      const next: LedgerIntakeProfile = {
        ...profile,
        transactions: [...(profile.transactions ?? []), transaction],
        budgetCategories: updatedCategories,
        updatedAt: now,
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      emitSpineEvent('TRANSACTION_CREATED', {
        domain: 'R',
        source: 'ledger',
        priority: 'info',
        transactionId: transaction.id,
        amount,
        type: txType,
        category: transaction.category,
        date,
      });

      markProfileDirty?.();
    },

    // ── Handler 2: update_goal_progress ───────────────────────────────────────
    update_goal_progress: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const goalId = typeof payload?.goalId === 'string' ? payload.goalId : '';
      if (!goalId) return;

      const goals: FinancialGoal[] = profile.financialGoals ?? [];
      const goalIndex = goals.findIndex((g) => g.id === goalId);
      if (goalIndex === -1) return;

      const goal = goals[goalIndex];

      // Resolve new currentAmount: explicit `newAmount` takes precedence over `delta`.
      const newAmount =
        typeof payload?.newAmount === 'number' && Number.isFinite(payload.newAmount)
          ? payload.newAmount
          : typeof payload?.delta === 'number' && Number.isFinite(payload.delta)
          ? goal.currentAmount + payload.delta
          : goal.currentAmount;

      const clampedAmount = Math.max(0, newAmount);
      const targetAmount = goal.targetAmount;
      const isComplete = clampedAmount >= targetAmount;

      const updatedGoal: FinancialGoal = {
        ...goal,
        currentAmount: clampedAmount,
      };

      const updatedGoals = [
        ...goals.slice(0, goalIndex),
        updatedGoal,
        ...goals.slice(goalIndex + 1),
      ];

      const next: LedgerIntakeProfile = {
        ...profile,
        financialGoals: updatedGoals,
        updatedAt: new Date().toISOString(),
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      if (isComplete) {
        emitSpineEvent('GOAL_COMPLETED', {
          domain: 'R',
          source: 'ledger',
          goalId,
          currentAmount: clampedAmount,
          targetAmount,
          note: typeof payload?.note === 'string' ? payload.note : undefined,
        });
      } else {
        const percentComplete =
          targetAmount > 0
            ? Math.round((clampedAmount / targetAmount) * 100)
            : 0;
        emitSpineEvent('GOAL_PROGRESS', {
          domain: 'R',
          source: 'ledger',
          goalId,
          currentAmount: clampedAmount,
          targetAmount,
          percentComplete,
          note: typeof payload?.note === 'string' ? payload.note : undefined,
        });
      }

      markProfileDirty?.();
    },

    // ── Handler 3: set_financial_goal ─────────────────────────────────────────
    set_financial_goal: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const name =
        typeof payload?.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : 'New Goal';

      const validTypes = ['savings', 'debt_payoff', 'investment', 'purchase', 'other'] as const;
      type GoalType = typeof validTypes[number];
      const goalType: GoalType =
        validTypes.includes(payload?.type as GoalType)
          ? (payload.type as GoalType)
          : 'other';

      const validPriorities = ['low', 'medium', 'high'] as const;
      type GoalPriority = typeof validPriorities[number];
      const priority: GoalPriority =
        validPriorities.includes(payload?.priority as GoalPriority)
          ? (payload.priority as GoalPriority)
          : 'medium';

      const now = new Date().toISOString();

      const goal: FinancialGoal = {
        id: crypto.randomUUID(),
        name,
        type: goalType,
        targetAmount: parseNumber(payload?.targetAmount),
        currentAmount: parseNumber(payload?.currentAmount, 0),
        targetDate:
          typeof payload?.targetDate === 'string' && payload.targetDate.trim()
            ? payload.targetDate.trim()
            : undefined,
        monthlyContribution: parseNumber(payload?.monthlyContribution, 0),
        priority,
        notes:
          typeof payload?.notes === 'string' && payload.notes.trim()
            ? payload.notes.trim()
            : undefined,
        createdAt: now,
      };

      const next: LedgerIntakeProfile = {
        ...profile,
        financialGoals: [...(profile.financialGoals ?? []), goal],
        updatedAt: now,
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      emitSpineEvent('GOAL_CREATED', {
        domain: 'R',
        source: 'ledger',
        goalId: goal.id,
        name: goal.name,
        type: goal.type,
        targetAmount: goal.targetAmount,
        priority: goal.priority,
      });

      markProfileDirty?.();
    },
  });
}
