import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { LedgerSpineEventType } from './ledger-field-actions';
import { computeFinancialFriction } from '../services/resonance-roi-service';
import { getFrictionTier } from '@/modules/ledger/field-templates';
import type { FrictionTier } from '@/modules/ledger/field-templates';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import { SpineEventType } from '@/lib/types';

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
 * Handle create_transaction action.
 */
async function handleCreateTransaction(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent, updateGlobalSoul } = context;

  const transaction: Transaction = {
    id: String(payload.id || crypto.randomUUID()),
    type: String(payload.type || 'expense') as 'income' | 'expense' | 'transfer',
    amount: Number(payload.amount),
    currency: String(payload.currency || 'USD'),
    description: String(payload.description || ''),
    category: payload.category ? String(payload.category) : undefined,
    date: String(payload.date || new Date().toISOString()),
    tags: Array.isArray(payload.tags) ? payload.tags.map(tag => String(tag)) : undefined
  };

  if (transaction.amount <= 0) {
    console.warn('[Ledger] create_transaction: amount must be positive');
    return;
  }

  // Load current profile to calculate financial impact
  const profile = await loadLedgerProfile({ userId: payload.userId as string | null, encryptionKey: payload.encryptionKey as CryptoKey | null });
  if (!profile) {
    console.warn('[Ledger] create_transaction: profile not found');
    return;
  }

  // Calculate net cashflow impact
  const netCashflow = transaction.type === 'income' 
    ? profile.monthlyIncome + transaction.amount 
    : profile.monthlyIncome - transaction.amount;

  // Delegate friction calculation to the canonical formula in resonance-roi-service
  const frictionValue = computeFinancialFriction(profile);
  const frictionScore = Math.round(frictionValue * 10);
  const frictionTier = getFrictionTier(frictionScore);
  await updateGlobalSoul({
    resource: {
      financialFriction: frictionScore,
    },
  });

  emitSpineEvent('TRANSACTION_CREATED' as SpineEventType, {
    moduleId: 'ledger' as const,
    transactionId: transaction.id,
    transactionType: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.description,
    netCashflow,
    frictionScore: frictionScore,
    frictionTier: frictionTier
  });

  await spineEventService.logLedgerEvent({
  type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `transaction:${transaction.id}`,
  data: {
    transactionId: transaction.id,
    transactionType: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.description,
    netCashflow,
    frictionScore: frictionScore,
    frictionTier: frictionTier
  },
  financialImpact: {
    amount: transaction.amount,
    currency: transaction.currency,
    netCashflow,
    frictionScore: frictionScore,
    frictionTier: frictionTier
  }
});


}

/**
 * Handle update_transaction action.
 */
async function handleUpdateTransaction(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const transaction: Transaction = {
    id: String(payload.id),
    type: String(payload.type || 'expense') as 'income' | 'expense' | 'transfer',
    amount: Number(payload.amount),
    currency: String(payload.currency || 'USD'),
    description: String(payload.description || ''),
    category: payload.category ? String(payload.category) : undefined,
    date: String(payload.date || new Date().toISOString()),
    tags: Array.isArray(payload.tags) ? payload.tags.map(tag => String(tag)) : undefined
  };

  emitSpineEvent('TRANSACTION_UPDATED' as SpineEventType, {
    moduleId: 'ledger' as const,
    transactionId: transaction.id,
    transactionType: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.description
  });

  await spineEventService.logLedgerEvent({
  type: 'TRANSACTION_UPDATED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `transaction:${transaction.id}`,
  data: {
    transactionId: transaction.id,
    transactionType: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    description: transaction.description
  },
  financialImpact: {
    amount: transaction.amount,
    currency: transaction.currency,
    netCashflow: 0,
    frictionScore: 0,
    frictionTier: 'low'
  }
});


}

/**
 * Handle delete_transaction action.
 */
async function handleDeleteTransaction(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const transactionId = String(payload.transactionId || payload.id || '');
  if (!transactionId) {
    console.warn('[Ledger] delete_transaction: missing transactionId');
    return;
  }

  emitSpineEvent('TRANSACTION_DELETED' as SpineEventType, {
    moduleId: 'ledger' as const,
    transactionId,
    description: String(payload.description || 'Transaction deleted')
  });

  await spineEventService.logLedgerEvent({
  type: 'TRANSACTION_DELETED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `transaction:${transactionId}`,
  data: {
    transactionId,
    description: String(payload.description || 'Transaction deleted')
  },
  financialImpact: {
    amount: -1 * Number(payload.amount || 0),
    currency: String(payload.currency || 'USD'),
    netCashflow: 0,
    frictionScore: 0,
    frictionTier: 'low'
  }
});


}

/**
 * Handle create_budget action.
 */
async function handleCreateBudget(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const budget: Budget = {
    id: String(payload.id || crypto.randomUUID()),
    name: String(payload.name || 'New Budget'),
    period: String(payload.period || 'monthly') as 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    amount: Number(payload.amount),
    currency: String(payload.currency || 'USD'),
    categories: Array.isArray(payload.categories) ? payload.categories.map(cat => String(cat)) : [],
    startDate: String(payload.startDate || new Date().toISOString()),
    endDate: String(payload.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
  };

  emitSpineEvent('BUDGET_CREATED' as SpineEventType, {
    moduleId: 'ledger' as const,
    budgetId: budget.id,
    budgetName: budget.name,
    period: budget.period,
    amount: budget.amount,
    currency: budget.currency
  });

  await spineEventService.logLedgerEvent({
  type: 'BUDGET_CREATED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `budget:${budget.id}`,
  data: {
    budgetId: budget.id,
    budgetName: budget.name,
    period: budget.period,
    amount: budget.amount,
    currency: budget.currency
  },
  budgetImpact: {
    budgetId: budget.id,
    budgetName: budget.name,
    amountChange: budget.amount
  }
});


}

/**
 * Handle modify_budget action.
 */
async function handleModifyBudget(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const changeSummary = String(payload.changeSummary || 'Budget modified');
  const amount = Number(payload.amount);

  emitSpineEvent('BUDGET_MODIFIED' as SpineEventType, {
    moduleId: 'ledger' as const,
    budgetId: String(payload.budgetId || ''),
    budgetName: String(payload.budgetName || ''),
    changeSummary,
    amount
  });

  await spineEventService.logLedgerEvent({
  type: 'BUDGET_MODIFIED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `budget:${payload.budgetId || 'unknown'}`,
  data: {
    budgetId: String(payload.budgetId || ''),
    budgetName: String(payload.budgetName || ''),
    changeSummary,
    amount
  },
  budgetImpact: {
    budgetId: String(payload.budgetId || ''),
    budgetName: String(payload.budgetName || ''),
    amountChange: amount
  }
});


}

/**
 * Handle create_goal action.
 */
async function handleCreateGoal(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const goal: Goal = {
    id: String(payload.id || crypto.randomUUID()),
    name: String(payload.name || 'New Goal'),
    targetAmount: Number(payload.targetAmount),
    currentAmount: Number(payload.currentAmount || 0),
    targetDate: String(payload.targetDate || new Date().toISOString()),
    category: String(payload.category || 'savings'),
    status: String(payload.status || 'active') as 'active' | 'completed' | 'paused'
  };

  emitSpineEvent('GOAL_CREATED' as SpineEventType, {
    moduleId: 'ledger' as const,
    goalId: goal.id,
    goalName: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    targetDate: goal.targetDate,
    category: goal.category
  });

  await spineEventService.logLedgerEvent({
  type: 'GOAL_CREATED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `goal:${goal.id}`,
  data: {
    goalId: goal.id,
    goalName: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    targetDate: goal.targetDate,
    category: goal.category
  },
  goalImpact: {
    goalId: goal.id,
    goalName: goal.name,
    progressChange: 0,
    targetAmount: goal.targetAmount
  }
});


}

/**
 * Handle update_goal_progress action.
 */
async function handleUpdateGoalProgress(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const percentComplete = Number(payload.percentComplete);
  const currentAmount = Number(payload.currentAmount);

  emitSpineEvent('GOAL_PROGRESS' as SpineEventType, {
    moduleId: 'ledger' as const,
    goalId: String(payload.goalId || ''),
    goalName: String(payload.goalName || ''),
    percentComplete,
    currentAmount: currentAmount,
    targetAmount: Number(payload.targetAmount || 0)
  });

  await spineEventService.logLedgerEvent({
  type: 'GOAL_PROGRESS' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `goal:${payload.goalId || 'unknown'}`,
  data: {
    goalId: String(payload.goalId || ''),
    goalName: String(payload.goalName || ''),
    percentComplete,
    currentAmount: currentAmount,
    targetAmount: Number(payload.targetAmount || 0)
  },
  goalImpact: {
    goalId: String(payload.goalId || ''),
    goalName: String(payload.goalName || ''),
    progressChange: percentComplete - Number(payload.previousPercentComplete || 0),
    targetAmount: Number(payload.targetAmount || 0)
  }
});


}

/**
 * Handle complete_goal action.
 */
async function handleCompleteGoal(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  emitSpineEvent('GOAL_COMPLETED' as SpineEventType, {
    moduleId: 'ledger' as const,
    goalId: String(payload.goalId || ''),
    goalName: String(payload.goalName || ''),
    achievement: String(payload.achievement || 'Goal completed')
  });

  await spineEventService.logLedgerEvent({
  type: 'GOAL_COMPLETED' as LedgerSpineEventType,
  domain: 'R' as const,
  source: `goal:${payload.goalId || 'unknown'}`,
  data: {
    goalId: String(payload.goalId || ''),
    goalName: String(payload.goalName || ''),
    achievement: String(payload.achievement || 'Goal completed')
  },
  goalImpact: {
    goalId: String(payload.goalId || ''),
    goalName: String(payload.goalName || ''),
    progressChange: 100,
    targetAmount: Number(payload.targetAmount || 0)
  }
});


}

/**
 * Handle financial_health_check action.
 */
async function handleFinancialHealthCheck(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent, updateGlobalSoul } = context;

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

  await spineEventService.logLedgerEvent({
  type: 'FINANCIAL_HEALTH_CHECK' as LedgerSpineEventType,
  domain: 'R' as const,
  source: 'health-check',
  data: {
    healthScore,
    healthStatus
  }
});


}

/**
 * Handle detect_risk action.
 */
async function handleDetectRisk(context: ActionContext): Promise<void> {
  const { payload, emitSpineEvent } = context;

  const riskType = String(payload.riskType || 'Unknown risk');
  const riskDescription = String(payload.riskDescription || '');

  emitSpineEvent('RISK_DETECTED' as SpineEventType, {
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
});


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
    update_goal_progress: handleUpdateGoalProgress,
    complete_goal: handleCompleteGoal,
    financial_health_check: handleFinancialHealthCheck,
    detect_risk: handleDetectRisk
  });


}