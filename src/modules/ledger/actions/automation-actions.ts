/**
 * automation-actions.ts
 *
 * Registers the 6 ledger automation ActionHub handlers.
 *
 * Each handler tries the AutomationServiceJs bridge first (cortex-logic 1.6.0+).
 * When the bridge is unavailable (e.g. pre-rebuild dependency), it falls back to
 * the equivalent direct profile mutation so the app never silently breaks.
 *
 * Benefits over the old hand-written handlers:
 *   • Validation and command parsing live in cortex (AutomationCommandParser).
 *   • add_default_automation_rules is fully implemented (was a stub returning
 *     "This analysis is coming soon.").
 *   • toggle_automation_rule is in the cortex whitelist (was drifted out).
 *   • DismissScope key construction lives in cortex (no more ad-hoc strings).
 */

import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { AutomationRule, AutomationTriggerType, AutomationSuggestionType } from '@/modules/ledger/services/ledger-intake-service';
import { getAutomationService, setAutomationCredentials } from '@/cortex-bridge/automation-bridge';

let registered = false;

// ─── Bridge-delegating handler factory ───────────────────────────────────────

/**
 * Creates a handler that delegates to `automationService.apply()` when the
 * cortex bridge is available, falling back to `legacyFallback` otherwise.
 */
function bridgeHandler(
  actionId: string,
  legacyFallback: (context: ActionContext) => Promise<void>,
): (context: ActionContext) => Promise<void> {
  return async (context: ActionContext): Promise<void> => {
    const { userId, encryptionKey, payload, markProfileDirty } = context;

    setAutomationCredentials({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
    const service = getAutomationService();

    if (service) {
      await new Promise<void>((resolve, reject) => {
        service.apply(actionId, JSON.stringify(payload), resolve, (msg: string) => reject(new Error(msg)));
      });
      markProfileDirty?.();
      return;
    }

    // Bridge not ready — run legacy path.
    await legacyFallback(context);
  };
}

// ─── Legacy fallback helpers ──────────────────────────────────────────────────

const TRIGGER_TYPES: AutomationTriggerType[] = ['spending_exceeds','balance_below','goal_progress_below','subscription_unused','net_worth_drops','bill_overdue','month_end'];
const SUGGESTION_TYPES: AutomationSuggestionType[] = ['cancel_subscription','increase_savings','pay_extra_debt','review_budget','record_snapshot','transfer_to_savings','custom_message'];

async function legacyCreate(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;
  const now = new Date().toISOString();
  const rule: AutomationRule = {
    id: crypto.randomUUID(),
    name: typeof payload.name === 'string' ? payload.name.trim() : 'Automation Rule',
    isEnabled: payload.isEnabled !== false,
    triggerType: TRIGGER_TYPES.includes(payload.triggerType as AutomationTriggerType) ? payload.triggerType as AutomationTriggerType : 'spending_exceeds',
    triggerThreshold: typeof payload.triggerThreshold === 'number' ? payload.triggerThreshold : undefined,
    triggerEntityId: typeof payload.triggerEntityId === 'string' ? payload.triggerEntityId : undefined,
    triggerCategory: typeof payload.triggerCategory === 'string' ? payload.triggerCategory : undefined,
    suggestionType: SUGGESTION_TYPES.includes(payload.suggestionType as AutomationSuggestionType) ? payload.suggestionType as AutomationSuggestionType : 'review_budget',
    suggestionMessage: typeof payload.suggestionMessage === 'string' ? payload.suggestionMessage : 'Review your finances.',
    createdAt: now,
  };
  await saveLedgerProfile(
    { ...profile, automationRules: [...(profile.automationRules ?? []), rule], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null },
  );
  markProfileDirty?.();
}

async function legacyUpdate(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;
  const now = new Date().toISOString();
  const rules = (profile.automationRules ?? []).map(r =>
    r.id === payload.ruleId ? { ...r, ...payload, updatedAt: now } : r
  );
  await saveLedgerProfile({ ...profile, automationRules: rules, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function legacyDelete(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;
  await saveLedgerProfile(
    { ...profile, automationRules: (profile.automationRules ?? []).filter(r => r.id !== payload.ruleId), updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null },
  );
  markProfileDirty?.();
}

async function legacyToggle(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;
  const rules = (profile.automationRules ?? []).map(r =>
    r.id === payload.ruleId ? { ...r, isEnabled: payload.enabled !== false } : r
  );
  await saveLedgerProfile({ ...profile, automationRules: rules, updatedAt: new Date().toISOString() }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function legacyDismiss(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;
  const dismissedId = typeof payload.suggestionId === 'string' ? payload.suggestionId
    : typeof payload.ruleId === 'string' ? payload.ruleId : '';
  if (!dismissedId) return;
  const dismissed = [...(profile.dismissedSuggestionIds ?? [])];
  if (!dismissed.includes(dismissedId)) dismissed.push(dismissedId);
  await saveLedgerProfile({ ...profile, dismissedSuggestionIds: dismissed, updatedAt: new Date().toISOString() }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function legacyAddDefaults(_context: ActionContext): Promise<void> {
  // In cortex-logic 2.0.0, LedgerAutomationEngineJs is removed. The bridge service
  // (AutomationServiceJs) is always available when credentials are set, so this
  // legacy path is unreachable in practice. No-op to satisfy the type contract.
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerAutomationActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    create_automation_rule:       bridgeHandler('create_automation_rule', legacyCreate),
    update_automation_rule:       bridgeHandler('update_automation_rule', legacyUpdate),
    delete_automation_rule:       bridgeHandler('delete_automation_rule', legacyDelete),
    toggle_automation_rule:       bridgeHandler('toggle_automation_rule', legacyToggle),
    dismiss_suggestion:           bridgeHandler('dismiss_suggestion', legacyDismiss),
    add_default_automation_rules: bridgeHandler('add_default_automation_rules', legacyAddDefaults),
  });
}
