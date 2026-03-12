import { ActionHub } from '@/lib/actions/action-hub';
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
import { matchCategoryToTransaction } from './ledger-aggregation-service';

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
    create_financial_plan: async ({ userId, encryptionKey, payload, markProfileDirty, emitSpineEvent }) => {
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

    update_budget_snapshot: async ({ userId, encryptionKey, payload, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
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
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
      markProfileDirty?.();
    },

    log_transaction_summary: async ({ userId, encryptionKey, payload, markProfileDirty }) => {
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
      markProfileDirty?.();
    },

    analyze_financial_document: async ({ userId, encryptionKey, payload, markProfileDirty }) => {
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
      markProfileDirty?.();
    },

    parse_financial_statement: parseFinancialStatement,

    // ── Handler 1: add_transaction ────────────────────────────────────────────
    add_transaction: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
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

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

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
    run_debt_simulation: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const { computeDebtPayoffSchedule } = await import('./ledger-aggregation-service');

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
    project_savings_timeline: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const { computeSavingsProjection } = await import('./ledger-aggregation-service');

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
    parse_financial_document: async ({ userId, encryptionKey, payload, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
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
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
      markProfileDirty?.();
    },

    // ── Handler: commit_transaction (FIX-P8) ────────────────────────────────
    commit_transaction: async ({ userId, encryptionKey, payload, emitSpineEvent, markProfileDirty }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      const now = new Date().toISOString();
      const rawAmt = parseNumber(payload?.amount);
      const absAmt = Math.abs(rawAmt);
      if (absAmt === 0) return;
      const txType: Transaction['type'] = payload?.type === 'income' ? 'income' : 'expense';
      const tx: Transaction = {
        id: crypto.randomUUID(),
        date: typeof payload?.date === 'string' && payload.date ? payload.date : now.split('T')[0],
        description: typeof payload?.description === 'string' ? payload.description : 'Committed Transaction',
        amount: absAmt,
        type: txType,
        category: typeof payload?.category === 'string' ? payload.category : 'Other',
      };
      const next: LedgerIntakeProfile = {
        ...profile,
        transactions: [...(profile.transactions ?? []), tx],
        updatedAt: now,
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
      emitSpineEvent('TRANSACTION_CREATED', {
        domain: 'R', source: 'ledger', priority: 'alert',
        transactionId: tx.id, amount: absAmt, type: txType,
        category: tx.category, date: tx.date,
      });
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
    categorize_expense: async ({ userId, encryptionKey, payload, markProfileDirty }) => {
      const transactionId = typeof payload?.transactionId === 'string' ? payload.transactionId : '';
      const category = typeof payload?.category === 'string' ? payload.category : '';
      if (!transactionId || !category) return;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      const next: LedgerIntakeProfile = {
        ...profile,
        transactions: (profile.transactions ?? []).map(tx =>
          tx.id === transactionId ? { ...tx, category } : tx,
        ),
        updatedAt: new Date().toISOString(),
      };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);
      markProfileDirty?.();
    },
  });
}
