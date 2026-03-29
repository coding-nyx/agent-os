import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { Account, AccountTransfer } from '@/modules/ledger/services/ledger-intake-service';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import { buildNetWorthSnapshot } from '@/modules/ledger/services/aggregation/networth-aggregation';
import { computeCashFlowForecast } from '@/modules/ledger/services/aggregation/forecast-aggregation';
import { computeNetLiquidAssets } from '@/modules/ledger/services/aggregation/account-aggregation';
import { LedgerSpineEventType } from './ledger-field-actions';
import type { SpineEventType } from '@/lib/types';

let accountActionsRegistered = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseNum = (v: unknown, fb = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;

const ACCOUNT_COLORS = [
  '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#3b82f6', '#ec4899', '#f97316',
];

function pickAccountColor(accounts: Account[]): string {
  return ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];
}

// ─── create_account ───────────────────────────────────────────────────────────

async function handleCreateAccount(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const accounts = profile.accounts ?? [];
  const now = new Date().toISOString();

  const account: Account = {
    id: crypto.randomUUID(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'New Account',
    type: (['checking','savings','investment','credit_card','cash','other'] as const).includes(payload.type as Account['type'])
      ? payload.type as Account['type'] : 'checking',
    balance: parseNum(payload.balance),
    currency: typeof payload.currency === 'string' ? payload.currency : profile.currency ?? 'USD',
    institutionName: typeof payload.institutionName === 'string' ? payload.institutionName : undefined,
    lastFour: typeof payload.lastFour === 'string' ? payload.lastFour : undefined,
    isDefault: accounts.length === 0, // first account is default
    color: typeof payload.color === 'string' ? payload.color : pickAccountColor(accounts),
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    createdAt: now,
    updatedAt: now,
  };

  const updatedProfile = {
    ...profile,
    accounts: [...accounts, account],
    updatedAt: now,
  };

  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();

  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `account:${account.id}`,
    data: { accountId: account.id, accountName: account.name, accountType: account.type, balance: account.balance },
  }, userId);

  emitSpineEvent('ACCOUNT_CREATED' as SpineEventType, { accountId: account.id, name: account.name });
}

// ─── update_account ───────────────────────────────────────────────────────────

async function handleUpdateAccount(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const settingDefault = payload.isDefault === true;
  const accounts = (profile.accounts ?? []).map((a) => {
    if (a.id === payload.id) {
      return {
        ...a,
        name: typeof payload.name === 'string' ? payload.name.trim() || a.name : a.name,
        balance: typeof payload.balance === 'number' ? parseNum(payload.balance) : a.balance,
        institutionName: typeof payload.institutionName === 'string' ? payload.institutionName : a.institutionName,
        color: typeof payload.color === 'string' ? payload.color : a.color,
        notes: typeof payload.notes === 'string' ? payload.notes : a.notes,
        isDefault: typeof payload.isDefault === 'boolean' ? payload.isDefault : a.isDefault,
        ...(typeof payload.creditLimit === 'number' ? { creditLimit: parseNum(payload.creditLimit) } : {}),
        updatedAt: now,
      };
    }
    // Clear isDefault from all others when a new default is being set.
    if (settingDefault) return { ...a, isDefault: false, updatedAt: now };
    return a;
  });

  await saveLedgerProfile({ ...profile, accounts, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── delete_account ───────────────────────────────────────────────────────────

async function handleDeleteAccount(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const accounts = (profile.accounts ?? []).filter((a) => a.id !== payload.id);
  // Unlink transactions from deleted account
  const transactions = (profile.transactions ?? []).map((t) =>
    t.accountId === payload.id ? { ...t, accountId: undefined } : t,
  );

  await saveLedgerProfile({ ...profile, accounts, transactions, updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── transfer_funds ───────────────────────────────────────────────────────────

async function handleTransferFunds(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;

  const amount = parseNum(payload.amount);
  if (amount <= 0) return;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const date = typeof payload.date === 'string' ? payload.date : new Date().toISOString().split('T')[0];

  const fromAccountName = (profile.accounts ?? []).find(a => a.id === payload.fromAccountId)?.name ?? 'account';
  const toAccountName = (profile.accounts ?? []).find(a => a.id === payload.toAccountId)?.name ?? 'account';

  const accounts = (profile.accounts ?? []).map((a) => {
    if (a.id === payload.fromAccountId) return { ...a, balance: a.balance - amount, updatedAt: now };
    if (a.id === payload.toAccountId) return { ...a, balance: a.balance + amount, updatedAt: now };
    return a;
  });

  const transfer: AccountTransfer = {
    id: crypto.randomUUID(),
    date,
    fromAccountId: payload.fromAccountId as string,
    toAccountId: payload.toAccountId as string,
    amount,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
  };

  const fromTx = {
    id: crypto.randomUUID(),
    date,
    description: `Transfer to ${toAccountName}`,
    amount,
    type: 'expense' as const,
    category: 'Transfer',
    accountId: payload.fromAccountId as string,
    notes: transfer.notes,
  };
  const toTx = {
    id: crypto.randomUUID(),
    date,
    description: `Transfer from ${fromAccountName}`,
    amount,
    type: 'income' as const,
    category: 'Transfer',
    accountId: payload.toAccountId as string,
    notes: transfer.notes,
  };

  const updatedProfile = {
    ...profile,
    accounts,
    transferHistory: [...(profile.transferHistory ?? []), transfer],
    transactions: [...(profile.transactions ?? []), fromTx, toTx],
    updatedAt: now,
  };

  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
  emitSpineEvent('TRANSFER_COMPLETED' as SpineEventType, { transferId: transfer.id, amount, fromAccountId: transfer.fromAccountId, toAccountId: transfer.toAccountId });
}

// ─── reconcile_account ────────────────────────────────────────────────────────

async function handleReconcileAccount(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const actualBalance = parseNum(payload.actualBalance);

  const accounts = (profile.accounts ?? []).map((a) =>
    a.id === payload.id ? { ...a, balance: actualBalance, updatedAt: now } : a,
  );

  await saveLedgerProfile({ ...profile, accounts, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── record_net_worth_snapshot ────────────────────────────────────────────────

async function handleRecordNetWorthSnapshot(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const note = typeof payload.note === 'string' ? payload.note : undefined;
  const snapshot = buildNetWorthSnapshot(profile.accounts ?? [], profile.debtItems, note);

  const updatedProfile = {
    ...profile,
    netWorthHistory: [...(profile.netWorthHistory ?? []), snapshot],
    updatedAt: new Date().toISOString(),
  };

  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();

  emitSpineEvent('NET_WORTH_SNAPSHOT' as SpineEventType, {
    snapshotId: snapshot.id,
    netWorth: snapshot.netWorth,
    assets: snapshot.assets,
    liabilities: snapshot.liabilities,
  });
}

// ─── generate_cash_flow_forecast ──────────────────────────────────────────────

async function handleGenerateCashFlowForecast(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;

  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const rawHorizon = parseNum(payload.horizon, 30);
  const horizon: 30 | 60 | 90 = rawHorizon === 60 ? 60 : rawHorizon === 90 ? 90 : 30;

  const startingBalance = computeNetLiquidAssets(profile.accounts ?? []);
  const forecast = computeCashFlowForecast(profile.recurringRules ?? [], startingBalance, horizon);

  const updatedProfile = { ...profile, lastCashFlowForecast: forecast, updatedAt: new Date().toISOString() };
  await saveLedgerProfile(updatedProfile, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerAccountActions(): void {
  if (accountActionsRegistered) return;
  accountActionsRegistered = true;

  ActionHub.registerMultiple('ledger', {
    create_account: handleCreateAccount,
    update_account: handleUpdateAccount,
    delete_account: handleDeleteAccount,
    transfer_funds: handleTransferFunds,
    reconcile_account: handleReconcileAccount,
    record_net_worth_snapshot: handleRecordNetWorthSnapshot,
    generate_cash_flow_forecast: handleGenerateCashFlowForecast,
  });
}
