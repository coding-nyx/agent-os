import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { AutomationRule, AutomationTriggerType, AutomationSuggestionType } from '@/modules/ledger/services/ledger-intake-service';

let registered = false;

const TRIGGER_TYPES: AutomationTriggerType[] = ['spending_exceeds','balance_below','goal_progress_below','subscription_unused','net_worth_drops','bill_overdue','month_end'];
const SUGGESTION_TYPES: AutomationSuggestionType[] = ['cancel_subscription','increase_savings','pay_extra_debt','review_budget','record_snapshot','transfer_to_savings','custom_message'];

async function handleCreateAutomationRule(context: ActionContext): Promise<void> {
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
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

async function handleUpdateAutomationRule(context: ActionContext): Promise<void> {
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

async function handleDeleteAutomationRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  await saveLedgerProfile(
    { ...profile, automationRules: (profile.automationRules ?? []).filter(r => r.id !== payload.ruleId), updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

async function handleToggleAutomationRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const rules = (profile.automationRules ?? []).map(r =>
    r.id === payload.ruleId ? { ...r, isEnabled: payload.enabled !== false } : r
  );
  await saveLedgerProfile({ ...profile, automationRules: rules, updatedAt: new Date().toISOString() }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function handleDismissSuggestion(context: ActionContext): Promise<void> {
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

export function registerLedgerAutomationActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    create_automation_rule:      handleCreateAutomationRule,
    update_automation_rule:      handleUpdateAutomationRule,
    delete_automation_rule:      handleDeleteAutomationRule,
    toggle_automation_rule:      handleToggleAutomationRule,
    dismiss_suggestion:          handleDismissSuggestion,
    add_default_automation_rules: async ({ pushAssistantMessage }) => {
      pushAssistantMessage?.('This analysis is coming soon.');
    },
  });
}
