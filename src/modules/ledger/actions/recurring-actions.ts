import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { RecurringRule, RecurrenceFrequency, TaxCategory } from '@/modules/ledger/services/ledger-intake-service';
import { postSingleRule, skipNextOccurrence, computeNextDueDate } from '@/modules/ledger/services/recurring-engine';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import { LedgerSpineEventType } from './ledger-field-actions';
import type { SpineEventType } from '@/lib/types';

let recurringActionsRegistered = false;

const parseNum = (v: unknown, fb = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;

const VALID_FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

// ─── create_recurring_rule ────────────────────────────────────────────────────

async function handleCreateRecurringRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;

  const amount = parseNum(payload.amount);
  if (amount <= 0) return;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const frequency: RecurrenceFrequency = VALID_FREQUENCIES.includes(payload.frequency as RecurrenceFrequency)
    ? payload.frequency as RecurrenceFrequency : 'monthly';

  const startDate = typeof payload.startDate === 'string' && payload.startDate
    ? payload.startDate : new Date().toISOString().split('T')[0];

  const rule: RecurringRule = {
    id: crypto.randomUUID(),
    description: typeof payload.description === 'string' && payload.description.trim()
      ? payload.description.trim() : 'Recurring',
    amount,
    type: payload.type === 'income' ? 'income' : 'expense',
    category: typeof payload.category === 'string' ? payload.category.trim() : 'Other',
    frequency,
    startDate,
    nextDueDate: startDate,
    accountId: typeof payload.accountId === 'string' ? payload.accountId : undefined,
    budgetCategoryId: typeof payload.budgetCategoryId === 'string' ? payload.budgetCategoryId : undefined,
    taxCategory: typeof payload.taxCategory === 'string' ? payload.taxCategory as TaxCategory : undefined,
    isActive: true,
    autoPost: payload.autoPost === true,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    createdAt: new Date().toISOString(),
  };

  const updatedProfile = {
    ...profile,
    recurringRules: [...(profile.recurringRules ?? []), rule],
    updatedAt: new Date().toISOString(),
  };

  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();

  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `recurring:${rule.id}`,
    data: { ruleId: rule.id, description: rule.description, amount: rule.amount, frequency: rule.frequency },
  }, userId);

  emitSpineEvent('RECURRING_RULE_CREATED' as SpineEventType, { ruleId: rule.id, description: rule.description });
}

// ─── update_recurring_rule ────────────────────────────────────────────────────

async function handleUpdateRecurringRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const rules = (profile.recurringRules ?? []).map((r) => {
    if (r.id !== payload.id) return r;
    const updated = {
      ...r,
      description: typeof payload.description === 'string' ? payload.description.trim() || r.description : r.description,
      amount: typeof payload.amount === 'number' && payload.amount > 0 ? payload.amount : r.amount,
      frequency: VALID_FREQUENCIES.includes(payload.frequency as RecurrenceFrequency)
        ? payload.frequency as RecurrenceFrequency : r.frequency,
      isActive: typeof payload.isActive === 'boolean' ? payload.isActive : r.isActive,
      autoPost: typeof payload.autoPost === 'boolean' ? payload.autoPost : r.autoPost,
      notes: typeof payload.notes === 'string' ? payload.notes : r.notes,
    };
    // Recompute next due date if frequency changed
    if (payload.frequency && payload.frequency !== r.frequency) {
      updated.nextDueDate = computeNextDueDate(updated);
    }
    return updated;
  });

  await saveLedgerProfile({ ...profile, recurringRules: rules, updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── delete_recurring_rule ────────────────────────────────────────────────────

async function handleDeleteRecurringRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const rules = (profile.recurringRules ?? []).filter((r) => r.id !== payload.id);
  await saveLedgerProfile({ ...profile, recurringRules: rules, updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── post_recurring_now ───────────────────────────────────────────────────────

async function handlePostRecurringNow(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const rule = (profile.recurringRules ?? []).find((r) => r.id === payload.id);
  if (!rule || !rule.isActive) return;

  const { updatedProfile, transaction } = postSingleRule(rule, profile);
  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();

  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `transaction:${transaction.id}`,
    data: { transactionId: transaction.id, description: transaction.description, amount: transaction.amount },
    financialImpact: {
      amount: transaction.amount,
      currency: profile.currency ?? 'USD',
      netCashflow: transaction.type === 'income' ? transaction.amount : -transaction.amount,
      frictionScore: 0,
      frictionTier: 'low',
    },
  }, userId);

  emitSpineEvent('RECURRING_POSTED' as SpineEventType, { ruleId: rule.id, transactionId: transaction.id });
}

// ─── skip_next_occurrence ─────────────────────────────────────────────────────

async function handleSkipNextOccurrence(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const rule = (profile.recurringRules ?? []).find((r) => r.id === payload.id);
  if (!rule) return;

  const updatedProfile = skipNextOccurrence(rule, profile);
  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerRecurringActions(): void {
  if (recurringActionsRegistered) return;
  recurringActionsRegistered = true;

  ActionHub.registerMultiple('ledger', {
    create_recurring_rule: handleCreateRecurringRule,
    update_recurring_rule: handleUpdateRecurringRule,
    delete_recurring_rule: handleDeleteRecurringRule,
    post_recurring_now: handlePostRecurringNow,
    skip_next_occurrence: handleSkipNextOccurrence,
  });
}
