import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { LedgerSpineEventType } from './ledger-field-actions';
import { computeFinancialFriction } from '../services/resonance-roi-service';
import { getFrictionTier } from '@/modules/ledger/field-templates';
import type { FrictionTier } from '@/modules/ledger/field-templates';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { LedgerIntakeProfile, Transaction as ProfileTransaction, BudgetCategory as ProfileBudgetCategory, FinancialGoal as ProfileFinancialGoal, Account } from '@/modules/ledger/services/ledger-intake-service';
import { getDefaultAccount } from '@/modules/ledger/services/aggregation/account-aggregation';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import { SpineEventType } from '@/lib/types';

// ── Account balance cascade ───────────────────────────────────────────────────
// Signs: expense = debit (balance decreases for assets, increases for credit card owed),
//        income  = credit (balance increases for assets).
// Credit cards store balance as positive = amount owed, so expense increases it.

function applyTransactionToAccounts(
  accounts: Account[],
  accountId: string,
  amount: number,
  type: ProfileTransaction['type'],
  direction: 'apply' | 'reverse',
): Account[] {
  const sign = direction === 'reverse' ? -1 : 1;
  return accounts.map((a) => {
    if (a.id !== accountId) return a;
    let delta = 0;
    if (a.type === 'credit_card') {
      // Negative balance = owed (liability). Expense makes more negative, income reduces debt.
      delta = type === 'expense' ? sign * -amount : sign * amount;
    } else {
      // Asset accounts: income adds, expense subtracts.
      delta = type === 'income' ? sign * amount : sign * -amount;
    }
    return { ...a, balance: a.balance + delta, updatedAt: new Date().toISOString() };
  });
}

// ── Per-turn profile cache helpers ──────────────────────────────────────────
// Reads from and writes to the per-turn profileCache in ActionContext so that
// multiple sequential ledger actions in a single AI response share in-memory
// state rather than each independently re-fetching from Firestore.

async function loadProfileCached(context: ActionContext): Promise<LedgerIntakeProfile | null> {
  const { userId, encryptionKey, profileCache } = context;
  if (!userId || !encryptionKey) return null;
  if (profileCache?.has(userId)) return profileCache.get(userId) as LedgerIntakeProfile;
  return loadLedgerProfile({ userId, encryptionKey });
}

async function persistProfileCached(profile: LedgerIntakeProfile, context: ActionContext): Promise<void> {
  const { userId, encryptionKey, profileCache } = context;
  if (!userId || !encryptionKey) return;
  if (profileCache) profileCache.set(userId, profile);
  await saveLedgerProfile(profile, { userId, encryptionKey });
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  description: string;
  category?: string;
  date: string;
  tags?: string[];
}

export interface Budget {
  id: string;
  name: string;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  currency: string;
  categories: string[];
  startDate: string;
  endDate: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
  status: 'active' | 'completed' | 'paused';
}

/**
 * Handle create_transaction action — persists to profile and refreshes UI.
 */
async function handleCreateTransaction(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const parseNum = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const rawAmount = parseNum(payload.amount);
  const absAmount = Math.abs(rawAmount);

  if (absAmount <= 0) {
    console.warn('[Ledger] create_transaction: amount must be positive');
    return;
  }

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const rawType = payload.type;
  const txType: ProfileTransaction['type'] =
    rawType === 'income' ? 'income' :
    rawType === 'expense' ? 'expense' :
    rawAmount >= 0 ? 'income' : 'expense';

  const categoryName = typeof payload.category === 'string' ? payload.category.trim() : '';
  const description = typeof payload.description === 'string' && payload.description.trim()
    ? payload.description.trim()
    : categoryName || 'Transaction';
  const date = typeof payload.date === 'string' && payload.date.trim()
    ? payload.date.trim()
    : new Date().toISOString().split('T')[0];

  const existingCategories: ProfileBudgetCategory[] = profile.budgetCategories ?? [];
  const matchedCategory = existingCategories.find(
    c => c.name.toLowerCase() === categoryName.toLowerCase()
  ) ?? null;
  const budgetCategoryId = matchedCategory?.id;

  // Resolve accountId: use explicit payload value, else fall back to default account.
  const resolvedAccountId: string | undefined =
    typeof payload.accountId === 'string' && payload.accountId.trim()
      ? payload.accountId.trim()
      : getDefaultAccount(profile.accounts ?? [])?.id;

  const transaction: ProfileTransaction = {
    id: crypto.randomUUID(),
    date,
    description,
    amount: absAmount,
    type: txType,
    category: categoryName || matchedCategory?.name || 'Other',
    budgetCategoryId,
    ...(resolvedAccountId ? { accountId: resolvedAccountId } : {}),
  };

  const updatedCategories: ProfileBudgetCategory[] = existingCategories.map(c => {
    if (c.id === budgetCategoryId && txType === 'expense') {
      return { ...c, spent: c.spent + absAmount };
    }
    return c;
  });

  const updatedAccounts = resolvedAccountId
    ? applyTransactionToAccounts(profile.accounts ?? [], resolvedAccountId, absAmount, txType, 'apply')
    : profile.accounts ?? [];

  const next: LedgerIntakeProfile = {
    ...profile,
    transactions: [...(profile.transactions ?? []), transaction],
    budgetCategories: updatedCategories,
    accounts: updatedAccounts,
    updatedAt: new Date().toISOString(),
  };

  await persistProfileCached(next, context);

  emitSpineEvent('TRANSACTION_CREATED' as SpineEventType, {
    priority: 'alert',
    moduleId: 'ledger' as const,
    transactionId: transaction.id,
    transactionType: transaction.type,
    amount: transaction.amount,
    description: transaction.description,
    netCashflow: txType === 'income' ? absAmount : -absAmount,
  });

  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `transaction:${transaction.id}`,
    data: {
      transactionId: transaction.id,
      transactionType: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      netCashflow: txType === 'income' ? absAmount : -absAmount,
    },
    financialImpact: {
      amount: transaction.amount,
      currency: profile.currency ?? 'USD',
      netCashflow: txType === 'income' ? absAmount : -absAmount,
      frictionScore: 0,
      frictionTier: 'low',
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle update_transaction action — finds by id, patches provided fields, persists.
 */
async function handleUpdateTransaction(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const transactionId = typeof payload.id === 'string' ? payload.id : '';
  if (!transactionId) {
    console.warn('[Ledger] update_transaction: missing id');
    return;
  }

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const parseNum = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const transactions = profile.transactions ?? [];
  const idx = transactions.findIndex(t => t.id === transactionId);
  if (idx === -1) {
    console.warn('[Ledger] update_transaction: transaction not found', transactionId);
    return;
  }

  const existing = transactions[idx];
  const updated: ProfileTransaction = {
    ...existing,
    ...(payload.amount !== undefined && { amount: Math.abs(parseNum(payload.amount, existing.amount)) }),
    ...(typeof payload.description === 'string' && { description: payload.description }),
    ...(typeof payload.category === 'string' && { category: payload.category }),
    ...(typeof payload.date === 'string' && { date: payload.date }),
    ...((payload.type === 'income' || payload.type === 'expense') && { type: payload.type as ProfileTransaction['type'] }),
    ...(typeof payload.notes === 'string' && { notes: payload.notes }),
    ...(typeof payload.accountId === 'string' && payload.accountId.trim() && { accountId: payload.accountId.trim() }),
  };

  // Reverse old account effect, then apply new effect (handles account reassignment + amount changes).
  let updatedAccounts = profile.accounts ?? [];
  if (existing.accountId) {
    updatedAccounts = applyTransactionToAccounts(updatedAccounts, existing.accountId, existing.amount, existing.type, 'reverse');
  }
  if (updated.accountId) {
    updatedAccounts = applyTransactionToAccounts(updatedAccounts, updated.accountId, updated.amount, updated.type, 'apply');
  }

  // Reverse old budget category spent, apply new
  let updatedBudgetCategories = profile.budgetCategories ?? [];
  if (existing.type === 'expense' && existing.budgetCategoryId) {
    updatedBudgetCategories = updatedBudgetCategories.map(c =>
      c.id === existing.budgetCategoryId
        ? { ...c, spent: Math.max(0, c.spent - existing.amount) }
        : c
    );
  }
  if (updated.type === 'expense') {
    // Resolve new budget category id
    const newCategoryId = updated.budgetCategoryId ??
      (typeof payload.category === 'string'
        ? updatedBudgetCategories.find(c => c.name.toLowerCase() === payload.category.toLowerCase())?.id
        : undefined);
    if (newCategoryId) {
      updated.budgetCategoryId = newCategoryId;
      updatedBudgetCategories = updatedBudgetCategories.map(c =>
        c.id === newCategoryId ? { ...c, spent: c.spent + updated.amount } : c
      );
    }
  }

  const next: LedgerIntakeProfile = {
    ...profile,
    transactions: [...transactions.slice(0, idx), updated, ...transactions.slice(idx + 1)],
    accounts: updatedAccounts,
    budgetCategories: updatedBudgetCategories,
    updatedAt: new Date().toISOString(),
  };

  await persistProfileCached(next, context);

  emitSpineEvent('TRANSACTION_UPDATED' as SpineEventType, {
    moduleId: 'ledger' as const,
    transactionId: updated.id,
    transactionType: updated.type,
    amount: updated.amount,
    description: updated.description,
  });

  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_UPDATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `transaction:${updated.id}`,
    data: {
      transactionId: updated.id,
      transactionType: updated.type,
      amount: updated.amount,
      description: updated.description,
    },
    financialImpact: {
      amount: updated.amount,
      currency: profile.currency ?? 'USD',
      netCashflow: 0,
      frictionScore: 0,
      frictionTier: 'low',
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle delete_transaction action — removes from profile and reverses budget spent.
 */
async function handleDeleteTransaction(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const transactionId = String(payload.transactionId || payload.id || '');
  if (!transactionId) {
    console.warn('[Ledger] delete_transaction: missing transactionId');
    return;
  }

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const transactions = profile.transactions ?? [];
  const txToDelete = transactions.find(t => t.id === transactionId);
  if (!txToDelete) {
    console.warn('[Ledger] delete_transaction: transaction not found', transactionId);
    return;
  }

  const existingCategories: ProfileBudgetCategory[] = profile.budgetCategories ?? [];
  const updatedCategories = existingCategories.map(c => {
    if (c.id === txToDelete.budgetCategoryId && txToDelete.type === 'expense') {
      return { ...c, spent: Math.max(0, c.spent - txToDelete.amount) };
    }
    return c;
  });

  const updatedAccounts = txToDelete.accountId
    ? applyTransactionToAccounts(profile.accounts ?? [], txToDelete.accountId, txToDelete.amount, txToDelete.type, 'reverse')
    : profile.accounts ?? [];

  const next: LedgerIntakeProfile = {
    ...profile,
    transactions: transactions.filter(t => t.id !== transactionId),
    budgetCategories: updatedCategories,
    accounts: updatedAccounts,
    updatedAt: new Date().toISOString(),
  };

  await persistProfileCached(next, context);

  emitSpineEvent('TRANSACTION_DELETED' as SpineEventType, {
    moduleId: 'ledger' as const,
    transactionId,
    description: String(payload.description || 'Transaction deleted'),
  });

  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_DELETED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `transaction:${transactionId}`,
    data: {
      transactionId,
      description: String(payload.description || 'Transaction deleted'),
    },
    financialImpact: {
      amount: txToDelete.amount,
      currency: profile.currency ?? 'USD',
      netCashflow: 0,
      frictionScore: 0,
      frictionTier: 'low',
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle create_budget action — creates a new BudgetCategory and persists.
 */
async function handleCreateBudget(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const parseNum = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const budgetCategory: ProfileBudgetCategory = {
    id: crypto.randomUUID(),
    name: String(payload.name || 'New Budget'),
    allocated: parseNum(payload.amount),
    spent: 0,
    color: typeof payload.color === 'string' && payload.color ? payload.color : '#6366f1',
  };

  const next: LedgerIntakeProfile = {
    ...profile,
    budgetCategories: [...(profile.budgetCategories ?? []), budgetCategory],
    updatedAt: new Date().toISOString(),
  };

  await persistProfileCached(next, context);

  emitSpineEvent('BUDGET_CREATED' as SpineEventType, {
    priority: 'alert',
    moduleId: 'ledger' as const,
    budgetId: budgetCategory.id,
    budgetName: budgetCategory.name,
    amount: budgetCategory.allocated,
  });

  await spineEventService.logLedgerEvent({
    type: 'BUDGET_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `budget:${budgetCategory.id}`,
    data: {
      budgetId: budgetCategory.id,
      budgetName: budgetCategory.name,
      amount: budgetCategory.allocated,
    },
    budgetImpact: {
      budgetId: budgetCategory.id,
      budgetName: budgetCategory.name,
      amountChange: budgetCategory.allocated,
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle modify_budget action — updates allocated/name of a BudgetCategory.
 */
async function handleModifyBudget(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const parseNum = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const categoryId = String(payload.budgetId || payload.id || '');
  if (!categoryId) {
    console.warn('[Ledger] modify_budget: missing budgetId/id');
    return;
  }

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const categories: ProfileBudgetCategory[] = profile.budgetCategories ?? [];
  const idx = categories.findIndex(c => c.id === categoryId);
  if (idx === -1) {
    console.warn('[Ledger] modify_budget: budget category not found', categoryId);
    return;
  }

  const existing = categories[idx];
  const updated: ProfileBudgetCategory = {
    ...existing,
    ...(payload.amount !== undefined && { allocated: parseNum(payload.amount, existing.allocated) }),
    ...(typeof payload.name === 'string' && payload.name.trim() && { name: payload.name.trim() }),
  };

  const next: LedgerIntakeProfile = {
    ...profile,
    budgetCategories: [...categories.slice(0, idx), updated, ...categories.slice(idx + 1)],
    updatedAt: new Date().toISOString(),
  };

  await persistProfileCached(next, context);

  const changeSummary = String(payload.changeSummary || 'Budget modified');

  emitSpineEvent('BUDGET_MODIFIED' as SpineEventType, {
    moduleId: 'ledger' as const,
    budgetId: categoryId,
    budgetName: updated.name,
    changeSummary,
    amount: updated.allocated,
  });

  await spineEventService.logLedgerEvent({
    type: 'BUDGET_MODIFIED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `budget:${categoryId}`,
    data: {
      budgetId: categoryId,
      budgetName: updated.name,
      changeSummary,
      amount: updated.allocated,
    },
    budgetImpact: {
      budgetId: categoryId,
      budgetName: updated.name,
      amountChange: updated.allocated,
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle create_goal action — creates a FinancialGoal and persists.
 */
async function handleCreateGoal(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const parseNum = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const now = new Date().toISOString();

  const validTypes = ['savings', 'debt_payoff', 'investment', 'purchase', 'other'] as const;
  type GoalType = typeof validTypes[number];
  const goalType: GoalType = validTypes.includes(payload.type as GoalType)
    ? (payload.type as GoalType)
    : 'other';

  const goal: ProfileFinancialGoal = {
    id: crypto.randomUUID(),
    name: String(payload.name || 'New Goal'),
    type: goalType,
    targetAmount: parseNum(payload.targetAmount),
    currentAmount: 0,
    targetDate: typeof payload.targetDate === 'string' && payload.targetDate.trim()
      ? payload.targetDate.trim()
      : undefined,
    monthlyContribution: parseNum(payload.monthlyContribution),
    priority: 'medium',
    createdAt: now,
  };

  const next: LedgerIntakeProfile = {
    ...profile,
    financialGoals: [...(profile.financialGoals ?? []), goal],
    updatedAt: now,
  };

  await persistProfileCached(next, context);

  emitSpineEvent('GOAL_CREATED' as SpineEventType, {
    priority: 'alert',
    moduleId: 'ledger' as const,
    goalId: goal.id,
    goalName: goal.name,
    targetAmount: goal.targetAmount,
  });

  await spineEventService.logLedgerEvent({
    type: 'GOAL_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `goal:${goal.id}`,
    data: {
      goalId: goal.id,
      goalName: goal.name,
      targetAmount: goal.targetAmount,
    },
    goalImpact: {
      goalId: goal.id,
      goalName: goal.name,
      progressChange: 0,
      targetAmount: goal.targetAmount,
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle complete_goal action — sets currentAmount = targetAmount and persists.
 */
async function handleCompleteGoal(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, emitSpineEvent, markProfileDirty } = context;

  const goalId = String(payload.goalId || payload.id || '');
  if (!goalId) {
    console.warn('[Ledger] complete_goal: missing goalId/id');
    return;
  }

  const profile = await loadProfileCached(context);
  if (!profile) return;

  const goals: ProfileFinancialGoal[] = profile.financialGoals ?? [];
  const idx = goals.findIndex(g => g.id === goalId);
  if (idx === -1) {
    console.warn('[Ledger] complete_goal: goal not found', goalId);
    return;
  }

  const goal = goals[idx];
  const completed: ProfileFinancialGoal = { ...goal, currentAmount: goal.targetAmount };

  const next: LedgerIntakeProfile = {
    ...profile,
    financialGoals: [...goals.slice(0, idx), completed, ...goals.slice(idx + 1)],
    updatedAt: new Date().toISOString(),
  };

  await persistProfileCached(next, context);

  emitSpineEvent('GOAL_COMPLETED' as SpineEventType, {
    priority: 'alert',
    moduleId: 'ledger' as const,
    goalId,
    goalName: String(payload.goalName || goal.name),
    achievement: String(payload.achievement || 'Goal completed'),
  });

  await spineEventService.logLedgerEvent({
    type: 'GOAL_COMPLETED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `goal:${goalId}`,
    data: {
      goalId,
      goalName: String(payload.goalName || goal.name),
      achievement: String(payload.achievement || 'Goal completed'),
    },
    goalImpact: {
      goalId,
      goalName: String(payload.goalName || goal.name),
      progressChange: 100,
      targetAmount: goal.targetAmount,
    },
  }, userId);

  markProfileDirty?.();
}

/**
 * Handle financial_health_check action.
 */
async function handleFinancialHealthCheck(context: ActionContext): Promise<void> {
  const { payload, userId, emitSpineEvent, updateGlobalSoul } = context;

  const healthScore = Number(payload.healthScore);
  const healthStatus = String(payload.healthStatus || 'Unknown');

  if (!Number.isFinite(healthScore) || healthScore < 0 || healthScore > 10) {
    console.warn('[Ledger] financial_health_check: invalid healthScore');
    return;
  }

  await updateGlobalSoul({
    resource: {
      financialFriction: healthScore
    }
  });

  emitSpineEvent('FINANCIAL_HEALTH_CHECK' as SpineEventType, {
    moduleId: 'ledger' as const,
    healthScore,
    healthStatus
  });

  if (healthScore <= 3) {
    emitSpineEvent('FINANCIAL_STRESS' as SpineEventType, {
      moduleId: 'ledger' as const,
      healthScore,
      healthStatus,
      severity: 'high'
    });
  }

  await spineEventService.logLedgerEvent({
    type: 'FINANCIAL_HEALTH_CHECK' as LedgerSpineEventType,
    domain: 'R' as const,
    source: 'health-check',
    data: {
      healthScore,
      healthStatus
    }
  }, userId);


}

/**
 * Handle detect_risk action.
 */
async function handleDetectRisk(context: ActionContext): Promise<void> {
  const { payload, userId, emitSpineEvent } = context;

  const riskType = String(payload.riskType || 'Unknown risk');
  const riskDescription = String(payload.riskDescription || '');

  emitSpineEvent('RISK_DETECTED' as SpineEventType, {
    priority: 'alert',
    moduleId: 'ledger' as const,
    riskType,
    riskDescription
  });

  await spineEventService.logLedgerEvent({
    type: 'RISK_DETECTED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: 'risk-detected',
    data: {
      riskType,
      riskDescription
    }
  }, userId);


}

// ============================================================================
// Registration
// ============================================================================

let transactionActionsRegistered = false;

/**
 * Register Ledger transaction + budget + goal actions with ActionHub.
 * Safe to call multiple times — idempotent.
 */
export function registerLedgerTransactionActions(): void {
  if (transactionActionsRegistered) return;
  transactionActionsRegistered = true;

  ActionHub.registerMultiple('ledger', {
    create_transaction: handleCreateTransaction,
    update_transaction: handleUpdateTransaction,
    delete_transaction: handleDeleteTransaction,
    create_budget: handleCreateBudget,
    modify_budget: handleModifyBudget,
    create_goal: handleCreateGoal,
    // update_goal_progress is correctly implemented in services/actions.ts and registered first
    complete_goal: handleCompleteGoal,
    financial_health_check: handleFinancialHealthCheck,
    detect_risk: handleDetectRisk
  });


}
