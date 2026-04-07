import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVector } from '@/lib/types';
import {
  FinancialPlan,
  DocumentAnalysis,
  LedgerIntakeProfile,
  Transaction,
  BudgetCategory,
  BudgetLineItem,
  FinancialGoal,
  loadLedgerProfile,
  saveLedgerProfile
} from './ledger-intake-service';
import { parseFinancialStatement } from '@/lib/actions/parsing-actions';
import { matchCategoryToTransaction } from './aggregation';

let registered = false;

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sumLineItems(items: BudgetLineItem[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
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

async function loadProfile(
  userId?: string | null,
  encryptionKey?: CryptoKey | null,
  profileCache?: Map<string, unknown>,
): Promise<LedgerIntakeProfile | null> {
  if (!userId || !encryptionKey) return null;
  if (profileCache?.has(userId)) {
    return profileCache.get(userId) as LedgerIntakeProfile;
  }
  const profile = await loadLedgerProfile({ userId, encryptionKey });
  if (profile && profileCache) profileCache.set(userId, profile);
  return profile;
}

async function persistProfile(
  profile: LedgerIntakeProfile,
  userId?: string | null,
  encryptionKey?: CryptoKey | null,
  profileCache?: Map<string, unknown>,
): Promise<void> {
  if (!userId || !encryptionKey) return;
  if (profileCache) profileCache.set(userId, profile);
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

  ActionHub.registerProvider('ledger', {
    capabilities: ['financial-planning'],
    latencyTier: 'balanced',
  });

  ActionHub.registerMultiple('ledger', {
    create_financial_plan_request: ({ moduleId, payload }) => {
      Spine.emit({
        type: 'DRAFT_PROPOSED',
        source: moduleId,
        target: typeof payload?.target === 'string' ? payload.target : moduleId,
        domain: 'system',
        data: payload,
        cascadeDepth: 0,
        priority: 'info',
      });
    },

    create_financial_plan: async ({ userId, encryptionKey, profileCache, payload, markProfileDirty, emitSpineEvent }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
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

      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      emitSpineEvent('FINANCIAL_PLAN_CREATED', {
        priority: 'alert',
        domain: 'R',
        source: 'ledger',
        planId: plan.id,
        planTitle: plan.title,
        monthlyTarget: plan.monthlyTarget,
      });
      markProfileDirty?.();
    },

    // Alias — LLM occasionally emits update_financial_plan instead of create_financial_plan
    update_financial_plan: async (ctx) => {
      const profile = await loadProfile(ctx.userId ?? null, ctx.encryptionKey ?? null, ctx.profileCache);
      if (!profile) return;

      const now = new Date().toISOString();
      const alloc = ctx.payload?.allocation as Record<string, unknown> | undefined;
      const plan: FinancialPlan = {
        id: typeof ctx.payload?.id === 'string' ? ctx.payload.id : crypto.randomUUID(),
        title: typeof ctx.payload?.title === 'string' ? ctx.payload.title : 'Financial Plan',
        summary: typeof ctx.payload?.summary === 'string' ? ctx.payload.summary : '',
        monthlyTarget: parseNumber(ctx.payload?.monthlyTarget),
        allocation: {
          essentials: parseNumber(alloc?.essentials, 60),
          growth: parseNumber(alloc?.growth, 25),
          buffer: parseNumber(alloc?.buffer, 15),
        },
        tasks: Array.isArray(ctx.payload?.tasks)
          ? ctx.payload.tasks.filter((item: unknown) => typeof item === 'string')
          : [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const next: LedgerIntakeProfile = {
        ...profile,
        plans: [plan, ...profile.plans.filter((existing) => existing.id !== plan.id)],
        activePlanId: plan.id,
        plannerBotState: 'active',
        lastPlanGeneratedAt: now,
        updatedAt: now,
      };
      await persistProfile(next, ctx.userId ?? null, ctx.encryptionKey ?? null, ctx.profileCache);
      ctx.emitSpineEvent('FINANCIAL_PLAN_CREATED', {
        priority: 'alert',
        domain: 'R',
        source: 'ledger',
        planId: plan.id,
        planTitle: plan.title,
        monthlyTarget: plan.monthlyTarget,
      });
      ctx.markProfileDirty?.();
    },

    update_budget_snapshot: async ({ userId, encryptionKey, profileCache, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const mergeItems = (existing: BudgetLineItem[], incoming: unknown[]): BudgetLineItem[] => {
        if (!Array.isArray(incoming)) return existing;
        const result = [...existing];
        for (const raw of incoming) {
          if (!raw || typeof raw !== 'object') continue;
          const obj = raw as Record<string, unknown>;
          const amount = typeof obj.amount === 'number' && Number.isFinite(obj.amount) && obj.amount > 0 ? obj.amount : null;
          if (amount === null) continue;
          const id = typeof obj.id === 'string' && obj.id ? obj.id : '';
          const idx = id ? result.findIndex(e => e.id === id) : -1;
          if (idx !== -1) result[idx] = { ...result[idx], amount };
          else result.push({ id: crypto.randomUUID(), label: String(obj.label ?? 'Expense'), amount });
        }
        return result;
      };

      const next: LedgerIntakeProfile = {
        ...profile,
        monthlyIncome: parseNumber(payload?.monthlyIncome, profile.monthlyIncome),
        currency: typeof payload?.currency === 'string' && payload.currency.trim() ? payload.currency : profile.currency,
        fixedExpenses: mergeItems(profile.fixedExpenses, Array.isArray(payload?.fixedExpenses) ? payload.fixedExpenses : []),
        variableExpenses: mergeItems(profile.variableExpenses, Array.isArray(payload?.variableExpenses) ? payload.variableExpenses : []),
        debtItems: Array.isArray(payload?.debtItems) ? payload.debtItems : profile.debtItems,
        savingsGoals: Array.isArray(payload?.savingsGoals) ? payload.savingsGoals : profile.savingsGoals,
        updatedAt: new Date().toISOString()
      };

      ensureActivePlan(next);
      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      const totalFixed = sumLineItems(next.fixedExpenses);
      const totalVariable = sumLineItems(next.variableExpenses);
      const totalExpenses = totalFixed + totalVariable;
      const netCashflow = next.monthlyIncome - totalExpenses;
      emitSpineEvent?.('BUDGET_UPDATED', {
        domain: 'R',
        source: 'ledger',
        priority: 'info',
        monthlyIncome: next.monthlyIncome,
        totalExpenses,
        netCashflow,
        currency: next.currency,
      });
      markProfileDirty?.();
    },

    log_transaction_summary: async ({ userId, encryptionKey, profileCache, payload, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;
      if (typeof payload?.summary !== 'string' || !payload.summary.trim()) return;

      const next: LedgerIntakeProfile = {
        ...profile,
        summary: payload.summary.trim(),
        updatedAt: new Date().toISOString()
      };

      ensureActivePlan(next);
      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      markProfileDirty?.();
    },

    analyze_financial_document: async ({ userId, encryptionKey, profileCache, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
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
      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      emitSpineEvent?.('DOCUMENT_ANALYZED', {
        domain: 'R',
        source: 'ledger',
        priority: 'info',
        periodLabel: analysis.periodLabel,
        transactionCount: analysis.transactionCount,
      });
      markProfileDirty?.();
    },

    parse_financial_statement: parseFinancialStatement,

    // ── Handler 1: add_transaction ────────────────────────────────────────────
    add_transaction: async ({ userId, encryptionKey, profileCache, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const now = new Date().toISOString();
      const rawAmount = parseNumber(payload?.amount);
      const absAmount = Math.abs(rawAmount);

      // Reject zero amounts
      if (absAmount === 0) {
        console.warn('[Ledger] add_transaction: amount must be non-zero');
        return;
      }

      // Derive transaction type: explicit payload wins; otherwise infer from sign.
      const rawType = payload?.type;
      const txType: Transaction['type'] =
        rawType === 'income'
          ? 'income'
          : rawType === 'expense'
          ? 'expense'
          : rawAmount >= 0
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

      // Match to an existing BudgetCategory using exact name or keyword map.
      const existingCategories: BudgetCategory[] = profile.budgetCategories ?? [];
      const descriptionForMatch =
        typeof payload?.description === 'string' && payload.description.trim()
          ? payload.description.trim()
          : merchant;
      const matchedCategoryId = matchCategoryToTransaction(
        descriptionForMatch,
        categoryName,
        existingCategories,
      );

      const budgetCategoryId: string | undefined =
        typeof payload?.budgetCategoryId === 'string'
          ? payload.budgetCategoryId
          : matchedCategoryId;

      const transaction: Transaction = {
        id: crypto.randomUUID(),
        date,
        description: merchant || categoryName || 'Transaction',
        amount: absAmount,
        type: txType,
        category: categoryName || existingCategories.find((c) => c.id === budgetCategoryId)?.name || 'Other',
        budgetCategoryId,
        notes: note,
      };

      // Increment the matched category's `spent` for expense transactions.
      const updatedCategories: BudgetCategory[] = existingCategories.map((c) => {
        if (c.id === budgetCategoryId && txType === 'expense') {
          return { ...c, spent: c.spent + absAmount };
        }
        return c;
      });

      const next: LedgerIntakeProfile = {
        ...profile,
        transactions: [...(profile.transactions ?? []), transaction],
        budgetCategories: updatedCategories,
        updatedAt: now,
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);

      emitSpineEvent('TRANSACTION_CREATED', {
        domain: 'R',
        source: 'ledger',
        priority: 'alert',
        transactionId: transaction.id,
        amount: absAmount,
        type: txType,
        category: transaction.category,
        date,
      });

      markProfileDirty?.();
    },

    // ── Handler 2: update_goal_progress ───────────────────────────────────────
    update_goal_progress: async ({ userId, encryptionKey, profileCache, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
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

      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);

      if (isComplete) {
        emitSpineEvent('GOAL_COMPLETED', {
          domain: 'R',
          source: 'ledger',
          priority: 'alert',
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
    set_financial_goal: async ({ userId, encryptionKey, profileCache, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
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

      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);

      emitSpineEvent('GOAL_CREATED', {
        domain: 'R',
        source: 'ledger',
        priority: 'alert',
        goalId: goal.id,
        name: goal.name,
        type: goal.type,
        targetAmount: goal.targetAmount,
        goalPriority: goal.priority,
      });

      markProfileDirty?.();
    },

    // ── Handler 4: run_debt_simulation ────────────────────────────────────────
    /**
     * Runs avalanche and snowball payoff simulations against the current debt
     * list and pushes a formatted comparison as an assistant message.
     *
     * Payload fields (all optional):
     *   - extraMonthlyPayment: number  — extra monthly budget beyond minimums
     */
    run_debt_simulation: async ({ userId, encryptionKey, profileCache, payload, pushAssistantMessage }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const { computeDebtPayoffSchedule } = await import('./aggregation');

      const debts = profile.debtItems ?? [];
      if (debts.length === 0) {
        pushAssistantMessage?.('No debt items found in your profile. Add debts via the Ledger to run a payoff simulation.');
        return;
      }

      const extra = parseNumber(payload?.extraMonthlyPayment, 0);
      const avalanche = computeDebtPayoffSchedule(debts, 'avalanche', extra);
      const snowball = computeDebtPayoffSchedule(debts, 'snowball', extra);

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency ?? 'USD' }).format(n);

      const fmtMonths = (m: number) =>
        m === 0 ? 'already paid off' : m < 12 ? `${m} month${m !== 1 ? 's' : ''}` : `${Math.floor(m / 12)}y ${m % 12}mo`;

      const debtFreeDate = (months: number) => {
        if (months <= 0) return 'now';
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      };

      const totalBalance = debts.reduce((s, d) => s + d.balance, 0);

      const lines = [
        `## 💳 Debt Payoff Simulation`,
        ``,
        `**Total balance:** ${fmt(totalBalance)} across ${debts.length} debt${debts.length !== 1 ? 's' : ''}`,
        extra > 0 ? `**Extra monthly payment applied:** ${fmt(extra)}` : '',
        ``,
        `### 🔵 Avalanche Strategy *(highest APR first)*`,
        `- Payoff time: **${fmtMonths(avalanche.monthsToPayoff)}** (debt-free by **${debtFreeDate(avalanche.monthsToPayoff)}**)`,
        `- Total interest paid: **${fmt(avalanche.totalInterestPaid)}**`,
        `- Interest saved vs minimums-only: **${fmt(avalanche.interestSavedVsMinimum)}**`,
        ``,
        `### 🟣 Snowball Strategy *(lowest balance first)*`,
        `- Payoff time: **${fmtMonths(snowball.monthsToPayoff)}** (debt-free by **${debtFreeDate(snowball.monthsToPayoff)}**)`,
        `- Total interest paid: **${fmt(snowball.totalInterestPaid)}**`,
        `- Interest saved vs minimums-only: **${fmt(snowball.interestSavedVsMinimum)}**`,
        ``,
        `### 📊 Recommendation`,
        avalanche.totalInterestPaid <= snowball.totalInterestPaid
          ? `**Avalanche** saves you **${fmt(snowball.totalInterestPaid - avalanche.totalInterestPaid)}** more in interest. Mathematically optimal if you can stay disciplined.`
          : `Both strategies are equivalent — choose whichever keeps you motivated.`,
      ].filter(Boolean).join('\n');

      pushAssistantMessage?.(lines);
    },

    // ── Handler 5: project_savings_timeline ───────────────────────────────────
    /**
     * Projects the completion timeline for all active financial goals and
     * pushes a formatted summary as an assistant message.
     *
     * Payload fields (all optional):
     *   - goalId: string — limit projection to a single goal
     */
    project_savings_timeline: async ({ userId, encryptionKey, profileCache, payload, pushAssistantMessage }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const { computeSavingsProjection } = await import('./aggregation');

      const goals = profile.financialGoals ?? [];
      const targetGoalId = typeof payload?.goalId === 'string' ? payload.goalId : null;

      const activeGoals = goals.filter((g) => {
        if (targetGoalId && g.id !== targetGoalId) return false;
        return g.currentAmount < g.targetAmount;
      });

      if (activeGoals.length === 0) {
        pushAssistantMessage?.(
          targetGoalId
            ? 'Goal not found or already completed.'
            : 'No active savings goals found. Add goals via the Ledger to see projections.',
        );
        return;
      }

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency ?? 'USD' }).format(n);

      // Use income - expenses as a monthly surplus estimate for goals without a contribution
      const totalExpenses =
        (profile.fixedExpenses ?? []).reduce((s, e) => s + e.amount, 0) +
        (profile.variableExpenses ?? []).reduce((s, e) => s + e.amount, 0);
      const monthlySurplus = Math.max(0, profile.monthlyIncome - totalExpenses);

      const goalLines = activeGoals.map((goal) => {
        const effectiveGoal = goal.monthlyContribution > 0
          ? goal
          : { ...goal, monthlyContribution: monthlySurplus };
        const proj = computeSavingsProjection(effectiveGoal);
        const progress = goal.targetAmount > 0
          ? Math.round((goal.currentAmount / goal.targetAmount) * 100)
          : 0;

        const completionNote =
          proj.monthsToTarget === 0
            ? '✅ Already completed!'
            : proj.monthsToTarget === null
            ? '⚠️ No monthly contribution set — cannot project'
            : proj.projectedCompletionDate
            ? `On track to complete in **${proj.monthsToTarget} month${proj.monthsToTarget !== 1 ? 's' : ''}** (${new Date(proj.projectedCompletionDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`
            : '';

        const statusEmoji = proj.onTrack ? '🟢' : '🟡';
        const usingSurplus = goal.monthlyContribution <= 0 && monthlySurplus > 0;

        return [
          `**${goal.name}** — ${progress}% complete`,
          `  ${fmt(goal.currentAmount)} / ${fmt(goal.targetAmount)}`,
          goal.monthlyContribution > 0
            ? `  Monthly contribution: ${fmt(goal.monthlyContribution)}`
            : usingSurplus
            ? `  Est. monthly surplus: ${fmt(monthlySurplus)} (income minus expenses)`
            : '',
          `  ${statusEmoji} ${completionNote}`,
        ].filter(Boolean).join('\n');
      });

      const header = [
        `## 🎯 Savings Goal Projections`,
        ``,
        `Monthly income: ${fmt(profile.monthlyIncome)} | Total expenses: ${fmt(totalExpenses)} | Surplus: ${fmt(Math.max(0, monthlySurplus))}`,
        ``,
      ].join('\n');

      pushAssistantMessage?.(header + goalLines.join('\n\n'));
    },

    // ── Handler: parse_financial_document (FIX-P8) ────────────────────────
    parse_financial_document: async ({ userId, encryptionKey, profileCache, payload, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;
      const now = new Date().toISOString();
      const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
      const monthlyIncome = parseNumber(payload?.monthlyIncome, profile.monthlyIncome);
      const newTxns: Transaction[] = transactions
        .filter((t: unknown) => t && typeof t === 'object')
        .map((t: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          date: typeof t.date === 'string' ? t.date : now.split('T')[0],
          description: typeof t.description === 'string' ? t.description : 'Parsed Transaction',
          amount: Math.abs(parseNumber(t.amount)),
          type: (t.type === 'income' || t.type === 'expense') ? t.type : 'expense',
          category: typeof t.category === 'string' ? t.category : 'Other',
        } satisfies Transaction))
        .filter((t: Transaction) => t.amount > 0);
      const next: LedgerIntakeProfile = {
        ...profile,
        monthlyIncome: monthlyIncome > 0 ? monthlyIncome : profile.monthlyIncome,
        transactions: [...(profile.transactions ?? []), ...newTxns],
        updatedAt: now,
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      markProfileDirty?.();
    },

    // ── Handler: flag_anomaly (FIX-P8) ────────────────────────────────────
    flag_anomaly: async ({ payload, emitSpineEvent }) => {
      const anomalyType = typeof payload?.anomalyType === 'string' ? payload.anomalyType : 'Unknown';
      const description = typeof payload?.description === 'string' ? payload.description : '';
      emitSpineEvent('RISK_DETECTED', {
        domain: 'R', source: 'ledger-anomaly-detector', priority: 'alert',
        riskType: anomalyType, riskDescription: description,
      });
    },

    // ── Handler: categorize_expense (FIX-P8) ──────────────────────────────
    categorize_expense: async ({ userId, encryptionKey, profileCache, payload, markProfileDirty }) => {
      const transactionId = typeof payload?.transactionId === 'string' ? payload.transactionId : '';
      const category = typeof payload?.category === 'string' ? payload.category : '';
      if (!transactionId || !category) return;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;
      const next: LedgerIntakeProfile = {
        ...profile,
        transactions: (profile.transactions ?? []).map(tx =>
          tx.id === transactionId ? { ...tx, category } : tx,
        ),
        updatedAt: new Date().toISOString(),
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      markProfileDirty?.();
    },

    // ── Handler: detect_spending_anomaly ──────────────────────────────────
    /**
     * Compares 7-day category spend against an 8-week weekly baseline.
     * Pushes an assistant message listing any categories where spend exceeds
     * 1.5x the baseline average and emits MODULE_STATE_UPDATED with the
     * anomaly list so other modules can react.
     */
    detect_spending_anomaly: async ({ userId, encryptionKey, profileCache, payload, pushAssistantMessage, emitSpineEvent }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const transactions: Transaction[] = profile.transactions ?? [];
      if (transactions.length === 0) return;

      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;

      // 7-day window
      const cutoff7d = new Date(now - 7 * MS_PER_DAY);
      const recent7d = transactions.filter(tx => new Date(tx.date) > cutoff7d && tx.type === 'expense');

      // 8-week (56-day) window for baseline
      const cutoff8w = new Date(now - 56 * MS_PER_DAY);
      const baseline8w = transactions.filter(tx => new Date(tx.date) > cutoff8w && tx.type === 'expense');

      // Sum recent 7-day spend per category
      const recent7dByCategory: Record<string, number> = {};
      for (const tx of recent7d) {
        const cat = tx.category ?? 'Other';
        recent7dByCategory[cat] = (recent7dByCategory[cat] ?? 0) + tx.amount;
      }

      // Compute weekly baseline per category: total 8-week spend / 8 weeks
      const baseline8wByCategory: Record<string, number> = {};
      for (const tx of baseline8w) {
        const cat = tx.category ?? 'Other';
        baseline8wByCategory[cat] = (baseline8wByCategory[cat] ?? 0) + tx.amount;
      }
      const categoryBaseline: Record<string, number> = {};
      for (const [cat, total] of Object.entries(baseline8wByCategory)) {
        categoryBaseline[cat] = total / 8; // weekly average
      }

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency ?? 'USD' }).format(n);

      // Detect anomalies: 7-day spend > 1.5x weekly baseline
      const anomalies: Array<{ category: string; spent: number; baseline: number; pctOver: number }> = [];
      for (const [cat, spent] of Object.entries(recent7dByCategory)) {
        const baseline = categoryBaseline[cat] ?? 0;
        if (baseline > 0 && spent > baseline * 1.5) {
          const pctOver = Math.round(((spent - baseline) / baseline) * 100);
          anomalies.push({ category: cat, spent, baseline, pctOver });
        }
      }

      if (anomalies.length === 0) return;

      const lines = anomalies
        .sort((a, b) => b.pctOver - a.pctOver)
        .map(a => `- **${a.category}**: ${fmt(a.spent)} spent this week vs. ${fmt(a.baseline)} avg weekly baseline (+${a.pctOver}%)`)
        .join('\n');

      pushAssistantMessage?.(
        `Spending anomalies detected in the last 7 days:\n\n${lines}\n\nThese categories are running significantly above your normal weekly pace.`
      );

      emitSpineEvent('MODULE_STATE_UPDATED', {
        spendingAnomalies: anomalies,
        source: 'ledger',
      });
    },

    // ── Handler: detect_financial_stress_cascade ──────────────────────────
    /**
     * Cross-module detector that reads NSV signals (financialFriction,
     * stressLoad, cashFlowRunwayDays) and pushes a cascade warning when
     * all three breach their thresholds simultaneously.
     */
    detect_financial_stress_cascade: async ({ payload, emitSpineEvent, pushAssistantMessage, getLatestNSV }) => {
      const nsv = getLatestNSV?.() as NeuralStateVector | undefined;

      const financialFriction: number = nsv?.resource?.financialFriction ?? 0;
      // stressLoad stored as 0-10, normalize to 0-1
      const stressLoadRaw: number = nsv?.emotional?.stressLoad ?? 0;
      const stressLoad: number = stressLoadRaw > 1 ? stressLoadRaw / 10 : stressLoadRaw;
      const cashFlowRunwayDays: number = nsv?.resource?.cashFlowRunwayDays ?? 999;

      const isCascade = financialFriction > 6 && stressLoad > 0.7 && cashFlowRunwayDays < 30;
      if (!isCascade) return;

      emitSpineEvent('MODULE_STATE_UPDATED', {
        cascadeDetected: true,
        financialFriction,
        stressLoad,
        cashFlowRunwayDays,
      });

      pushAssistantMessage?.(
        "I'm noticing compounding pressure — financial friction is high, emotional load is elevated, and runway is short. This pattern can cascade quickly. Would it help to review what's most urgent?"
      );
    },

    // ── Handler: record_resonance_feedback ────────────────────────────────
    /**
     * Records whether a given transaction aligned with the user's values,
     * accumulates per-category ROI coefficients once 10+ feedback entries
     * exist, and acknowledges the user.
     */
    record_resonance_feedback: async ({ userId, encryptionKey, profileCache, payload, pushAssistantMessage, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const transactionId = typeof payload?.transactionId === 'string' ? payload.transactionId : '';
      const aligned = typeof payload?.aligned === 'boolean' ? payload.aligned : false;

      if (!transactionId) {
        pushAssistantMessage?.('Transaction ID is required for resonance feedback.');
        return;
      }

      const transactions: Transaction[] = profile.transactions ?? [];
      const txIndex = transactions.findIndex((tx) => tx.id === transactionId);

      if (txIndex === -1) {
        pushAssistantMessage?.('Transaction not found.');
        return;
      }

      // Store feedback on the transaction
      const updatedTransaction: Transaction = {
        ...transactions[txIndex],
      };
      updatedTransaction.resonanceFeedback = aligned;

      const updatedTransactions: Transaction[] = [
        ...transactions.slice(0, txIndex),
        updatedTransaction,
        ...transactions.slice(txIndex + 1),
      ];

      const next: LedgerIntakeProfile = {
        ...profile,
        transactions: updatedTransactions,
        updatedAt: new Date().toISOString(),
      };

      // Compute per-category ROI coefficients when enough feedback exists
      const feedbackTxns = updatedTransactions.filter(
        (tx) => tx.resonanceFeedback !== undefined,
      );
      const totalFeedback = feedbackTxns.length;

      if (totalFeedback >= 10) {
        // Group by category and compute aligned ratio per category
        const categoryStats: Record<string, { aligned: number; total: number }> = {};
        for (const tx of feedbackTxns) {
          const cat = tx.category ?? 'Other';
          if (!categoryStats[cat]) categoryStats[cat] = { aligned: 0, total: 0 };
          categoryStats[cat].total += 1;
          if (tx.resonanceFeedback === true) categoryStats[cat].aligned += 1;
        }
        const coefficients: Record<string, number> = {};
        for (const [cat, stats] of Object.entries(categoryStats)) {
          coefficients[cat] = stats.total > 0 ? stats.aligned / stats.total : 0;
        }
        next.resonanceCoefficients = coefficients;
      }

      await persistProfile(next, userId ?? null, encryptionKey ?? null, profileCache);
      markProfileDirty?.();

      pushAssistantMessage?.(
        aligned
          ? 'Noted — that spending felt meaningful.'
          : "Understood — I'll factor that in for future suggestions.",
      );

      if (totalFeedback >= 10) {
        pushAssistantMessage?.(
          "I've updated your Resonance ROI model based on your feedback patterns.",
        );
      }
    },

    // ── Handler: compute_resonance_roi ────────────────────────────────────
    /**
     * Uses accumulated resonanceCoefficients to produce a resonance-weighted
     * value ranking across spending categories.
     */
    compute_resonance_roi: async ({ userId, encryptionKey, profileCache, pushAssistantMessage, emitSpineEvent }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const coefficients: Record<string, number> =
        profile.resonanceCoefficients ?? {};

      if (Object.keys(coefficients).length === 0) {
        pushAssistantMessage?.(
          'No Resonance ROI model yet. Log at least 10 pieces of spending feedback to build your personal model.',
        );
        return;
      }

      const transactions: Transaction[] = profile.transactions ?? [];
      const fmt = (n: number) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: profile.currency ?? 'USD',
        }).format(n);

      // Sum raw spend per category then apply coefficient for resonance-weighted value
      const rawSpend: Record<string, number> = {};
      for (const tx of transactions.filter((tx) => tx.type === 'expense')) {
        const cat = tx.category ?? 'Other';
        rawSpend[cat] = (rawSpend[cat] ?? 0) + tx.amount;
      }

      const resonanceValues: Array<{ category: string; raw: number; resonance: number; coefficient: number }> = [];
      for (const [cat, coeff] of Object.entries(coefficients)) {
        const raw = rawSpend[cat] ?? 0;
        resonanceValues.push({ category: cat, raw, resonance: raw * coeff, coefficient: coeff });
      }

      resonanceValues.sort((a, b) => b.resonance - a.resonance);

      if (resonanceValues.length === 0) {
        pushAssistantMessage?.('No categorized spending data found to compute Resonance ROI.');
        return;
      }

      const lines = resonanceValues
        .map(
          (rv) =>
            `- **${rv.category}**: ${fmt(rv.resonance)} resonance value ` +
            `(${fmt(rv.raw)} spent × ${Math.round(rv.coefficient * 100)}% alignment)`,
        )
        .join('\n');

      pushAssistantMessage?.(
        `## Resonance ROI — Spending Value Ranking\n\n` +
        `Categories ranked by how much value your spending generates relative to your stated values:\n\n` +
        lines +
        `\n\nHigher resonance = spending that feels meaningful. Lower resonance = areas to review or reduce.`,
      );

      // Emit Spine event so downstream listeners (e.g. Atlas) can react
      const topCategory = resonanceValues[0];
      emitSpineEvent('RESONANCE_ROI_UPDATED', {
        moduleId: 'ledger',
        newROI: topCategory?.coefficient ?? 0,
        newFriction: 0,
        categoryCount: resonanceValues.length,
      });
    },

    // ── Handler: suggest_budget_rebalance ─────────────────────────────────
    /**
     * Compares 12-week average actual spend per variable expense category
     * against the budgeted amount, surfaces over-budget and under-utilized
     * categories, and suggests a reallocation amount.
     */
    suggest_budget_rebalance: async ({ userId, encryptionKey, profileCache, payload, pushAssistantMessage }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null, profileCache);
      if (!profile) return;

      const transactions: Transaction[] = profile.transactions ?? [];
      const variableExpenses: BudgetLineItem[] = profile.variableExpenses ?? [];

      if (variableExpenses.length === 0) {
        pushAssistantMessage?.('No variable expense categories found in your profile to analyze.');
        return;
      }

      const now = Date.now();
      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const cutoff12w = new Date(now - 84 * MS_PER_DAY); // 12 weeks = 84 days

      const recent12w = transactions.filter(
        tx => new Date(tx.date) > cutoff12w && tx.type === 'expense'
      );

      // Sum 12-week spend per category label (case-insensitive match)
      const spendByCategory: Record<string, number> = {};
      for (const tx of recent12w) {
        const cat = (tx.category ?? 'Other').toLowerCase();
        spendByCategory[cat] = (spendByCategory[cat] ?? 0) + tx.amount;
      }

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: profile.currency ?? 'USD' }).format(n);

      const overBudget: string[] = [];
      const underBudget: string[] = [];
      let reallocationPool = 0;

      for (const item of variableExpenses) {
        const labelKey = item.label.toLowerCase();
        const totalSpend12w = spendByCategory[labelKey] ?? 0;
        const weeklyAvg = totalSpend12w / 12;
        const budgeted = item.amount; // stored as monthly or weekly amount

        if (budgeted <= 0) continue;

        if (weeklyAvg > budgeted * 1.1) {
          const pct = Math.round(((weeklyAvg - budgeted) / budgeted) * 100);
          overBudget.push(
            `- **${item.label}** — spending ${fmt(weeklyAvg)}, budgeted ${fmt(budgeted)} (+${pct}%)`
          );
        } else if (weeklyAvg < budgeted * 0.6) {
          const pct = Math.round(((budgeted - weeklyAvg) / budgeted) * 100);
          const slack = budgeted - weeklyAvg;
          reallocationPool += slack;
          underBudget.push(
            `- **${item.label}** — spending ${fmt(weeklyAvg)}, budgeted ${fmt(budgeted)} (-${pct}%)`
          );
        }
      }

      if (overBudget.length === 0 && underBudget.length === 0) {
        pushAssistantMessage?.('Your spending is well-aligned with your budget allocations.');
        return;
      }

      const sections: string[] = ['Budget review (12-week average):'];
      if (overBudget.length > 0) {
        sections.push(`\n**Over budget:**\n${overBudget.join('\n')}`);
      }
      if (underBudget.length > 0) {
        sections.push(`\n**Under-utilized:**\n${underBudget.join('\n')}`);
      }
      if (reallocationPool > 0) {
        sections.push(
          `\nYou could reallocate ~${fmt(reallocationPool)} from under-utilized categories toward savings or your most important goal.`
        );
      }

      pushAssistantMessage?.(sections.join('\n'));
    },

  });
}
