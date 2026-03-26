import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { LedgerIntakeProfile, RecurringRule, Transaction } from '../services/ledger-intake-service';
import { computeDueRules, postDueTransactions, postSingleRule } from '../services/recurring-engine';

export interface RecurringEngineState {
  /** Rules that are due but have autoPost=false — need user confirmation. */
  pendingRules: RecurringRule[];
  /** Transactions auto-posted on this session load. */
  autoPosted: Transaction[];
  /** Confirm a pending rule (posts transaction + advances nextDueDate). */
  confirmRule: (ruleId: string) => LedgerIntakeProfile;
  /** Dismiss a pending rule without posting (skips to next occurrence). */
  dismissRule: (ruleId: string) => LedgerIntakeProfile;
  /** Whether any auto-posting occurred this session. */
  didAutoPost: boolean;
}

/**
 * On profile load, processes due recurring rules:
 * - Rules with autoPost=true are posted immediately and profile is updated.
 * - Rules with autoPost=false are surfaced as pendingRules for the user to confirm.
 *
 * Returns an updated profile (if auto-posting occurred) and the engine state.
 */
export function useRecurringEngine(
  profile: LedgerIntakeProfile | null,
  onProfileUpdate: (updated: LedgerIntakeProfile) => void,
): RecurringEngineState {
  const [pendingRules, setPendingRules] = useState<RecurringRule[]>([]);
  const [autoPosted, setAutoPosted] = useState<Transaction[]>([]);
  const [didAutoPost, setDidAutoPost] = useState(false);

  // Keep the callback ref up-to-date without making it a reactive dependency.
  const onProfileUpdateRef = useRef(onProfileUpdate);
  useLayoutEffect(() => { onProfileUpdateRef.current = onProfileUpdate; });

  // Run at most once per mount — prevents the infinite loop caused by
  // persistUpdate always writing a new updatedAt timestamp.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!profile || hasRunRef.current) return;
    hasRunRef.current = true;

    const rules = profile.recurringRules ?? [];
    const dueRules = computeDueRules(rules);
    if (dueRules.length === 0) return;

    const { updatedProfile, autoPosted: posted, pendingRules: pending } = postDueTransactions(rules, profile);

    if (posted.length > 0) {
      setAutoPosted(posted);
      setDidAutoPost(true);
      onProfileUpdateRef.current(updatedProfile);
    }

    if (pending.length > 0) {
      setPendingRules(pending);
    }
  }, [profile]);

  const confirmRule = useCallback(
    (ruleId: string): LedgerIntakeProfile => {
      if (!profile) throw new Error('No profile loaded');
      const rule = (profile.recurringRules ?? []).find((r) => r.id === ruleId);
      if (!rule) throw new Error(`Rule ${ruleId} not found`);

      const { updatedProfile, transaction } = postSingleRule(rule, profile);
      setPendingRules((prev) => prev.filter((r) => r.id !== ruleId));
      setAutoPosted((prev) => [...prev, transaction]);
      return updatedProfile;
    },
    [profile],
  );

  const dismissRule = useCallback(
    (ruleId: string): LedgerIntakeProfile => {
      if (!profile) throw new Error('No profile loaded');
      const { skipNextOccurrence } = require('../services/recurring-engine');
      const rule = (profile.recurringRules ?? []).find((r) => r.id === ruleId);
      if (!rule) throw new Error(`Rule ${ruleId} not found`);

      const updatedProfile = skipNextOccurrence(rule, profile);
      setPendingRules((prev) => prev.filter((r) => r.id !== ruleId));
      return updatedProfile;
    },
    [profile],
  );

  return { pendingRules, autoPosted, confirmRule, dismissRule, didAutoPost };
}
