/**
 * automation-storage-adapter.ts
 *
 * Implements the six JS storage callbacks expected by `AutomationServiceJs`
 * (cortex-logic 1.6.0+), translating between:
 *
 *   - cortex's v2 AutomationRule / AutomationState JSON
 *     (what the KMP service reads/writes internally)
 *   - the existing profile fields `automationRules` (v1 flat format) and
 *     `dismissedSuggestionIds` (string array)
 *     (the on-disk Firestore format — no schema migration required in Phase 2)
 *
 * The AutomationRuleSerializer in cortex handles v1→v2 on read, so sending
 * v1 JSON for `loadRules` is intentional and correct.
 *
 * Schedules are not persisted in Phase 2; `loadSchedules` returns `[]`.
 */

import {
  loadLedgerProfile,
  saveLedgerProfile,
} from '@/modules/ledger/services/ledger-intake-service';
import type { AutomationRule } from '@/modules/ledger/services/ledger-intake-service';

// ─── LoadContext mirrors @/lib/types/encrypted-document ───────────────────────

interface LoadContext {
  userId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  encryptionKey: any | null;
}

// ─── V2 type stubs ─────────────────────────────────────────────────────────────
// Only the fields the adapter needs to read from cortex's outgoing v2 JSON.

interface V2TriggerType {
  type: string;
  threshold?: number;      // SpendingExceeds, BalanceBelow
  thresholdPct?: number;   // GoalProgressBelow, NetWorthDrops
  category?: string;       // SpendingExceeds
  goalId?: string;         // GoalProgressBelow
}

interface V2AutomationRule {
  id: string;
  name: string;
  isEnabled?: boolean;
  trigger: V2TriggerType;
  suggestion: { type: string };
  suggestionMessage: string;
  createdAt: string;
  updatedAt?: string;
  schemaVersion: number;
}

interface V2AutomationState {
  type: string;
  at?: string;
  scope?: { type: string; date?: string };
}

// ─── V2 → V1 conversion ────────────────────────────────────────────────────────

/**
 * Converts a cortex v2 AutomationRule back to the profile's v1 flat format.
 * Required so the existing `ledger-intake-service.ts` parse block continues to
 * read `triggerType`, `triggerThreshold`, etc. without a schema migration.
 */
function v2RuleToV1(rule: V2AutomationRule): AutomationRule {
  const t = rule.trigger ?? ({} as V2TriggerType);
  return {
    id: rule.id ?? crypto.randomUUID(),
    name: rule.name ?? 'Automation Rule',
    isEnabled: rule.isEnabled !== false,
    triggerType: (t.type ?? 'spending_exceeds') as AutomationRule['triggerType'],
    triggerThreshold: t.threshold ?? t.thresholdPct,
    triggerCategory: t.category,
    triggerEntityId: t.goalId,
    suggestionType: ((rule.suggestion?.type) ?? 'review_budget') as AutomationRule['suggestionType'],
    suggestionMessage: rule.suggestionMessage ?? '',
    createdAt: rule.createdAt ?? new Date().toISOString(),
  };
}

// ─── DismissedSuggestionIds ↔ AutomationState map ────────────────────────────

/**
 * Converts `profile.dismissedSuggestionIds` to a cortex AutomationState map.
 *
 * Format of dismissedSuggestionIds:
 *   - `"ruleId"` → dismissed forever (DismissScope.Forever)
 *   - `"ruleId_YYYY-MM-DD"` → dismissed for that date (DismissScope.ForToday)
 */
function buildStatesJson(dismissedIds: string[]): string {
  const now = new Date().toISOString();
  const states: Record<string, V2AutomationState> = {};

  for (const raw of dismissedIds) {
    const dateMatch = raw.match(/^(.+)_(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) {
      const [, ruleId, date] = dateMatch;
      states[ruleId] = { type: 'dismissed', at: now, scope: { type: 'for_today', date } };
    } else {
      states[raw] = { type: 'dismissed', at: now, scope: { type: 'forever' } };
    }
  }

  return JSON.stringify(states);
}

/**
 * Converts a cortex AutomationState map back to `dismissedSuggestionIds`.
 * Only dismissed states are preserved; other states (Idle, Suggested, etc.) are dropped.
 */
function parseStatesToDismissedIds(statesJson: string): string[] {
  try {
    const states: Record<string, V2AutomationState> = JSON.parse(statesJson);
    const dismissed: string[] = [];
    for (const [ruleId, state] of Object.entries(states)) {
      if (state.type !== 'dismissed') continue;
      const scope = state.scope;
      if (scope?.type === 'for_today' && scope.date) {
        dismissed.push(`${ruleId}_${scope.date}`);
      } else {
        dismissed.push(ruleId);
      }
    }
    return dismissed;
  } catch {
    return [];
  }
}

// ─── Callback factories ────────────────────────────────────────────────────────

/**
 * Creates the six JS storage callbacks that `AutomationServiceJs` expects.
 * Pass the result directly to the `AutomationServiceJs` constructor.
 *
 * @param ctx  Current user credentials — the same context passed to
 *             `loadLedgerProfile` / `saveLedgerProfile`.
 */
export function createAutomationStorageCallbacks(ctx: LoadContext) {
  function jsLoadRules(onComplete: (json: string) => void, onError: (msg: string) => void): void {
    loadLedgerProfile(ctx).then(
      (profile) => onComplete(JSON.stringify(profile?.automationRules ?? [])),
      (err) => onError(String(err)),
    );
  }

  function jsSaveRules(rulesJson: string, onComplete: () => void, onError: (msg: string) => void): void {
    loadLedgerProfile(ctx).then(
      async (profile) => {
        if (!profile) { onComplete(); return; }
        try {
          const v2Rules: V2AutomationRule[] = JSON.parse(rulesJson);
          const v1Rules = v2Rules.map(v2RuleToV1);
          await saveLedgerProfile(
            { ...profile, automationRules: v1Rules, updatedAt: new Date().toISOString() },
            ctx,
          );
          onComplete();
        } catch (e) { onError(String(e)); }
      },
      (err) => onError(String(err)),
    );
  }

  function jsLoadStates(onComplete: (json: string) => void, onError: (msg: string) => void): void {
    loadLedgerProfile(ctx).then(
      (profile) => onComplete(buildStatesJson(profile?.dismissedSuggestionIds ?? [])),
      (err) => onError(String(err)),
    );
  }

  function jsSaveStates(statesJson: string, onComplete: () => void, onError: (msg: string) => void): void {
    loadLedgerProfile(ctx).then(
      async (profile) => {
        if (!profile) { onComplete(); return; }
        try {
          const dismissed = parseStatesToDismissedIds(statesJson);
          const existing = profile.dismissedSuggestionIds ?? [];
          // Skip write when dismissed IDs are identical — prevents the Firestore
          // onSnapshot → profile reload → evaluate() → saveSuggestionStates infinite loop.
          const same =
            dismissed.length === existing.length &&
            dismissed.every((id, i) => existing[i] === id);
          if (same) { onComplete(); return; }
          await saveLedgerProfile(
            { ...profile, dismissedSuggestionIds: dismissed, updatedAt: new Date().toISOString() },
            ctx,
          );
          onComplete();
        } catch (e) { onError(String(e)); }
      },
      (err) => onError(String(err)),
    );
  }

  function jsLoadSchedules(onComplete: (json: string) => void, _onError: (msg: string) => void): void {
    // Schedules are not persisted in Phase 2.
    onComplete('[]');
  }

  function jsSaveSchedules(_schedulesJson: string, onComplete: () => void, _onError: (msg: string) => void): void {
    // No-op in Phase 2.
    onComplete();
  }

  return { jsLoadRules, jsSaveRules, jsLoadStates, jsSaveStates, jsLoadSchedules, jsSaveSchedules };
}
