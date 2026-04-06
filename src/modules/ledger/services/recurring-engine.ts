import { RecurringBillEngineJs } from '@cortex-logic';
import type { RecurringRule, RecurrenceFrequency, Transaction, LedgerIntakeProfile } from './ledger-intake-service';

const _engine = new RecurringBillEngineJs();

export interface PostResult {
  /** Updated profile with transactions added and rules advanced. */
  updatedProfile: LedgerIntakeProfile;
  /** Transactions that were auto-posted. */
  autoPosted: Transaction[];
  /** Rules that need user confirmation before posting. */
  pendingRules: RecurringRule[];
}

/** Advance a date by one recurrence period. */
export function advanceByFrequency(date: Date, frequency: RecurrenceFrequency): Date {
  const dateStr = date.toISOString().slice(0, 10);
  const result = _engine.advanceByFrequency(dateStr, frequency);
  return new Date(result + 'T00:00:00');
}

/** Compute the next due date after a given base date (defaults to today). */
export function computeNextDueDate(rule: RecurringRule, from?: Date): string {
  const fromIso = from ? from.toISOString().slice(0, 10) : undefined;
  return _engine.computeNextDueDate(JSON.stringify(rule), fromIso ?? null);
}

/** Return all active rules whose nextDueDate is today or in the past. */
export function computeDueRules(rules: RecurringRule[]): RecurringRule[] {
  const todayIso = new Date().toISOString().slice(0, 10);
  return JSON.parse(_engine.computeDueRules(JSON.stringify(rules), todayIso));
}

/** Return rules due within the next N days (including today). */
export function computeUpcomingBills(
  rules: RecurringRule[],
  days: number,
): Array<RecurringRule & { dueDateFormatted: string }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  return JSON.parse(_engine.computeUpcomingBills(JSON.stringify(rules), todayIso, days));
}

/**
 * Process all due recurring rules:
 * - Rules with autoPost=true → create transactions and advance nextDueDate
 * - Rules with autoPost=false → return as pendingRules for user confirmation
 * Handles multiple missed occurrences (advances until nextDueDate is in the future).
 */
export function postDueTransactions(rules: RecurringRule[], profile: LedgerIntakeProfile): PostResult {
  const todayIso = new Date().toISOString().slice(0, 10);
  return JSON.parse(_engine.postDueTransactions(JSON.stringify(rules), JSON.stringify(profile), todayIso));
}

/** Post a specific pending rule once (user-confirmed). Advances its nextDueDate. */
export function postSingleRule(rule: RecurringRule, profile: LedgerIntakeProfile): {
  updatedProfile: LedgerIntakeProfile;
  transaction: Transaction;
} {
  const todayIso = new Date().toISOString().slice(0, 10);
  return JSON.parse(_engine.postSingleRule(JSON.stringify(rule), JSON.stringify(profile), todayIso));
}

/** Advance a rule's nextDueDate without posting a transaction (skip). */
export function skipNextOccurrence(rule: RecurringRule, profile: LedgerIntakeProfile): LedgerIntakeProfile {
  return JSON.parse(_engine.skipNextOccurrence(JSON.stringify(rule), JSON.stringify(profile)));
}
