import type { RecurringRule, RecurrenceFrequency, Transaction, LedgerIntakeProfile } from './ledger-intake-service';
import { round2 } from './aggregation/utils';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateOnly(isoOrDate: string | Date): Date {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayDate(): Date {
  return toDateOnly(new Date());
}

function formatDateOnly(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Advance a date by one recurrence period. */
export function advanceByFrequency(date: Date, frequency: RecurrenceFrequency): Date {
  const next = new Date(date);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/** Compute the next due date after a given base date (defaults to today). */
export function computeNextDueDate(rule: RecurringRule, from?: Date): string {
  const base = from ?? todayDate();
  const current = toDateOnly(rule.nextDueDate);
  if (current > base) return formatDateOnly(current);

  let next = new Date(current);
  while (next <= base) {
    next = advanceByFrequency(next, rule.frequency);
  }
  return formatDateOnly(next);
}

/** Return all active rules whose nextDueDate is today or in the past. */
export function computeDueRules(rules: RecurringRule[]): RecurringRule[] {
  const today = todayDate();
  return rules.filter((r) => r.isActive && toDateOnly(r.nextDueDate) <= today);
}

/** Return rules due within the next N days (including today). */
export function computeUpcomingBills(
  rules: RecurringRule[],
  days: number,
): Array<RecurringRule & { dueDateFormatted: string }> {
  const today = todayDate();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + days);

  return rules
    .filter((r) => r.isActive)
    .map((r) => {
      const due = toDateOnly(r.nextDueDate);
      return { ...r, _dueDate: due, dueDateFormatted: formatDateOnly(due) };
    })
    .filter(({ _dueDate }) => _dueDate >= today && _dueDate <= horizon)
    .sort((a, b) => a._dueDate.getTime() - b._dueDate.getTime())
    .map(({ _dueDate: _, ...rest }) => rest);
}

/** Create a Transaction from a RecurringRule. */
function ruleToTransaction(rule: RecurringRule): Transaction {
  return {
    id: crypto.randomUUID(),
    date: formatDateOnly(toDateOnly(rule.nextDueDate)),
    description: rule.description,
    amount: round2(rule.amount),
    type: rule.type,
    category: rule.category,
    isRecurring: true,
    recurringRuleId: rule.id,
    accountId: rule.accountId,
    budgetCategoryId: rule.budgetCategoryId,
    taxCategory: rule.taxCategory,
    notes: rule.notes,
  };
}

export interface PostResult {
  /** Updated profile with transactions added and rules advanced. */
  updatedProfile: LedgerIntakeProfile;
  /** Transactions that were auto-posted. */
  autoPosted: Transaction[];
  /** Rules that need user confirmation before posting. */
  pendingRules: RecurringRule[];
}

/**
 * Process all due recurring rules:
 * - Rules with autoPost=true → create transactions and advance nextDueDate
 * - Rules with autoPost=false → return as pendingRules for user confirmation
 * Handles multiple missed occurrences (advances until nextDueDate is in the future).
 */
export function postDueTransactions(rules: RecurringRule[], profile: LedgerIntakeProfile): PostResult {
  const today = todayDate();
  const autoPosted: Transaction[] = [];
  const pendingRules: RecurringRule[] = [];

  const updatedRules = rules.map((rule) => {
    if (!rule.isActive) return rule;

    const due = toDateOnly(rule.nextDueDate);
    if (due > today) return rule;

    if (!rule.autoPost) {
      pendingRules.push(rule);
      return rule;
    }

    // Post all missed occurrences
    let current = new Date(due);
    const posted: Transaction[] = [];
    while (current <= today) {
      const tx = ruleToTransaction({ ...rule, nextDueDate: formatDateOnly(current) });
      posted.push(tx);
      current = advanceByFrequency(current, rule.frequency);
    }
    autoPosted.push(...posted);

    return {
      ...rule,
      nextDueDate: formatDateOnly(current),
      lastPostedDate: formatDateOnly(today),
    };
  });

  const updatedProfile: LedgerIntakeProfile = {
    ...profile,
    recurringRules: updatedRules,
    transactions: [...(profile.transactions ?? []), ...autoPosted],
    updatedAt: new Date().toISOString(),
  };

  return { updatedProfile, autoPosted, pendingRules };
}

/** Post a specific pending rule once (user-confirmed). Advances its nextDueDate. */
export function postSingleRule(rule: RecurringRule, profile: LedgerIntakeProfile): {
  updatedProfile: LedgerIntakeProfile;
  transaction: Transaction;
} {
  const tx = ruleToTransaction(rule);
  const nextDue = computeNextDueDate(rule);

  const updatedRules = (profile.recurringRules ?? []).map((r) =>
    r.id === rule.id
      ? { ...r, nextDueDate: nextDue, lastPostedDate: formatDateOnly(todayDate()) }
      : r,
  );

  return {
    transaction: tx,
    updatedProfile: {
      ...profile,
      recurringRules: updatedRules,
      transactions: [...(profile.transactions ?? []), tx],
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Advance a rule's nextDueDate without posting a transaction (skip). */
export function skipNextOccurrence(rule: RecurringRule, profile: LedgerIntakeProfile): LedgerIntakeProfile {
  const nextDue = computeNextDueDate(rule);
  const updatedRules = (profile.recurringRules ?? []).map((r) =>
    r.id === rule.id ? { ...r, nextDueDate: nextDue } : r,
  );
  return { ...profile, recurringRules: updatedRules, updatedAt: new Date().toISOString() };
}
