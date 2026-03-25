import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { AlertRule, AlertType, AlertSeverity } from '@/modules/ledger/services/ledger-intake-service';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import type { SpineEventType } from '@/lib/types';

let registered = false;

const ALERT_TYPES: AlertType[] = [
  'budget_breach','large_transaction','bill_overdue','goal_behind',
  'low_balance','trial_ending','subscription_renewal','net_worth_drop',
];

// ─── create_alert_rule ────────────────────────────────────────────────────────

async function handleCreateAlertRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const rule: AlertRule = {
    id: crypto.randomUUID(),
    type: ALERT_TYPES.includes(payload.type as AlertType) ? payload.type as AlertType : 'large_transaction',
    label: typeof payload.label === 'string' ? payload.label : 'Alert',
    severity: (['info','warning','critical'] as const).includes(payload.severity as AlertSeverity)
      ? payload.severity as AlertSeverity : 'info',
    isEnabled: payload.isEnabled !== false,
    threshold: typeof payload.threshold === 'number' ? payload.threshold : undefined,
    entityId: typeof payload.entityId === 'string' ? payload.entityId : undefined,
    createdAt: now,
  };

  await saveLedgerProfile(
    { ...profile, alertRules: [...(profile.alertRules ?? []), rule], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

// ─── delete_alert_rule ────────────────────────────────────────────────────────

async function handleDeleteAlertRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  await saveLedgerProfile(
    { ...profile, alertRules: (profile.alertRules ?? []).filter(r => r.id !== payload.ruleId), updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

// ─── dismiss_notification ─────────────────────────────────────────────────────
// Stores the notification type+id in dismissedAlertIds so it won't re-appear.

async function handleDismissNotification(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const notifId = typeof payload.notificationId === 'string' ? payload.notificationId : '';
  if (!notifId) return;

  const now = new Date().toISOString();
  const dismissed = [...(profile.dismissedAlertIds ?? [])];
  if (!dismissed.includes(notifId)) dismissed.push(notifId);
  await saveLedgerProfile({ ...profile, dismissedAlertIds: dismissed, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── enable_alert_rule / disable_alert_rule ───────────────────────────────────

async function handleToggleAlertRule(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const rules = (profile.alertRules ?? []).map(r =>
    r.id === payload.ruleId ? { ...r, isEnabled: payload.enabled !== false } : r
  );
  await saveLedgerProfile({ ...profile, alertRules: rules, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerAlertActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    create_alert_rule:    handleCreateAlertRule,
    delete_alert_rule:    handleDeleteAlertRule,
    dismiss_notification: handleDismissNotification,
    toggle_alert_rule:    handleToggleAlertRule,
  });
}
