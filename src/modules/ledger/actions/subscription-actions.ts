import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { Subscription, SubscriptionBillingCycle, SubscriptionStatus } from '@/modules/ledger/services/ledger-intake-service';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import type { LedgerSpineEventType } from './ledger-field-actions';
import { toMonthlyEquivalent } from '@/modules/ledger/services/aggregation/subscription-aggregation';
import type { SpineEventType } from '@/lib/types';

let registered = false;

const parseNum = (v: unknown, fb = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;

function nextRenewalDate(billingCycle: SubscriptionBillingCycle): string {
  const d = new Date();
  switch (billingCycle) {
    case 'weekly':    d.setDate(d.getDate() + 7); break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
    case 'lifetime':  d.setFullYear(d.getFullYear() + 100); break;
  }
  return d.toISOString().split('T')[0];
}

// ─── create_subscription ─────────────────────────────────────────────────────

async function handleCreateSubscription(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const billingCycle: SubscriptionBillingCycle = (['monthly','quarterly','yearly','weekly','lifetime'] as const)
    .includes(payload.billingCycle as SubscriptionBillingCycle)
    ? payload.billingCycle as SubscriptionBillingCycle : 'monthly';

  const amount = parseNum(payload.amount);
  const status: SubscriptionStatus = (['active','cancelled','paused','trial'] as const)
    .includes(payload.status as SubscriptionStatus) ? payload.status as SubscriptionStatus : 'active';

  const sub: Subscription = {
    id: crypto.randomUUID(),
    name: typeof payload.name === 'string' ? payload.name.trim() : 'Subscription',
    category: typeof payload.category === 'string' ? payload.category : 'Other',
    amount,
    billingCycle,
    monthlyEquivalent: toMonthlyEquivalent(amount, billingCycle),
    status,
    nextRenewalDate: typeof payload.nextRenewalDate === 'string' ? payload.nextRenewalDate : nextRenewalDate(billingCycle),
    trialEndsAt: typeof payload.trialEndsAt === 'string' ? payload.trialEndsAt : undefined,
    reminderDays: typeof payload.reminderDays === 'number' ? payload.reminderDays : 7,
    website: typeof payload.website === 'string' ? payload.website : undefined,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    color: typeof payload.color === 'string' ? payload.color : undefined,
    accountId: typeof payload.accountId === 'string' ? payload.accountId : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await saveLedgerProfile(
    { ...profile, subscriptions: [...(profile.subscriptions ?? []), sub], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('SUBSCRIPTION_CREATED' as SpineEventType, { subscriptionId: sub.id, name: sub.name });
  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `subscription:${sub.id}`,
    data: { subscriptionId: sub.id, name: sub.name },
  });
}

// ─── update_subscription ─────────────────────────────────────────────────────

async function handleUpdateSubscription(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const subs = profile.subscriptions ?? [];
  const idx = subs.findIndex(s => s.id === payload.subscriptionId);
  if (idx === -1) return;

  const existing = subs[idx];
  const amount = typeof payload.amount === 'number' ? payload.amount : existing.amount;
  const billingCycle = (['monthly','quarterly','yearly','weekly','lifetime'] as const).includes(payload.billingCycle as SubscriptionBillingCycle)
    ? payload.billingCycle as SubscriptionBillingCycle : existing.billingCycle;

  const updated: Subscription = {
    ...existing,
    ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
    ...(typeof payload.category === 'string' ? { category: payload.category } : {}),
    amount,
    billingCycle,
    monthlyEquivalent: toMonthlyEquivalent(amount, billingCycle),
    ...((['active','cancelled','paused','trial'] as const).includes(payload.status as SubscriptionStatus) ? { status: payload.status as SubscriptionStatus } : {}),
    ...(typeof payload.nextRenewalDate === 'string' ? { nextRenewalDate: payload.nextRenewalDate } : {}),
    ...(typeof payload.trialEndsAt === 'string' ? { trialEndsAt: payload.trialEndsAt } : {}),
    ...(typeof payload.notes === 'string' ? { notes: payload.notes } : {}),
    ...(typeof payload.website === 'string' ? { website: payload.website } : {}),
    updatedAt: now,
  };

  const updatedSubs = [...subs];
  updatedSubs[idx] = updated;
  await saveLedgerProfile({ ...profile, subscriptions: updatedSubs, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── delete_subscription ─────────────────────────────────────────────────────

async function handleDeleteSubscription(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  await saveLedgerProfile(
    { ...profile, subscriptions: (profile.subscriptions ?? []).filter(s => s.id !== payload.subscriptionId), updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

// ─── cancel_subscription ─────────────────────────────────────────────────────

async function handleCancelSubscription(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const subs = (profile.subscriptions ?? []).map(s =>
    s.id === payload.subscriptionId ? { ...s, status: 'cancelled' as SubscriptionStatus, updatedAt: now } : s
  );
  await saveLedgerProfile({ ...profile, subscriptions: subs, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
  emitSpineEvent('SUBSCRIPTION_CANCELLED' as SpineEventType, { subscriptionId: payload.subscriptionId });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerSubscriptionActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    create_subscription:  handleCreateSubscription,
    update_subscription:  handleUpdateSubscription,
    delete_subscription:  handleDeleteSubscription,
    cancel_subscription:  handleCancelSubscription,
  });
}
