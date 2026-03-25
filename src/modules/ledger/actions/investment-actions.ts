import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { Investment, InvestmentType } from '@/modules/ledger/services/ledger-intake-service';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import type { LedgerSpineEventType } from './ledger-field-actions';
import { recomputeInvestment, buildPortfolioSnapshot } from '@/modules/ledger/services/aggregation/portfolio-aggregation';
import type { SpineEventType } from '@/lib/types';

let registered = false;

const parseNum = (v: unknown, fb = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fb;

const INVESTMENT_TYPES: InvestmentType[] = ['stock','etf','mutual_fund','bond','crypto','real_estate','cash','other'];

// ─── add_investment ───────────────────────────────────────────────────────────

async function handleAddInvestment(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const quantity = parseNum(payload.quantity, 1);
  const costBasis = parseNum(payload.costBasis);
  const currentPrice = parseNum(payload.currentPrice, costBasis);
  const currentValue = quantity * currentPrice;
  const totalCost = quantity * costBasis;

  const inv: Investment = {
    id: crypto.randomUUID(),
    name: typeof payload.name === 'string' ? payload.name.trim() : 'Investment',
    ticker: typeof payload.ticker === 'string' ? payload.ticker.toUpperCase() : undefined,
    type: INVESTMENT_TYPES.includes(payload.type as InvestmentType) ? payload.type as InvestmentType : 'other',
    quantity,
    costBasis,
    currentPrice,
    currentValue,
    totalCost,
    unrealizedGain: currentValue - totalCost,
    dividendsReceived: typeof payload.dividendsReceived === 'number' ? payload.dividendsReceived : undefined,
    accountId: typeof payload.accountId === 'string' ? payload.accountId : undefined,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    purchasedAt: typeof payload.purchasedAt === 'string' ? payload.purchasedAt : undefined,
    lastUpdatedAt: now,
    createdAt: now,
  };

  await saveLedgerProfile(
    { ...profile, investments: [...(profile.investments ?? []), inv], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('INVESTMENT_ADDED' as SpineEventType, { investmentId: inv.id, name: inv.name });
  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `investment:${inv.id}`,
    data: { investmentId: inv.id, name: inv.name },
  });
}

// ─── update_investment ────────────────────────────────────────────────────────

async function handleUpdateInvestment(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const investments = profile.investments ?? [];
  const idx = investments.findIndex(inv => inv.id === payload.investmentId);
  if (idx === -1) return;

  const existing = investments[idx];
  const merged: Investment = {
    ...existing,
    ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
    ...(INVESTMENT_TYPES.includes(payload.type as InvestmentType) ? { type: payload.type as InvestmentType } : {}),
    ...(typeof payload.quantity === 'number' ? { quantity: payload.quantity } : {}),
    ...(typeof payload.costBasis === 'number' ? { costBasis: payload.costBasis } : {}),
    ...(typeof payload.currentPrice === 'number' ? { currentPrice: payload.currentPrice } : {}),
    ...(typeof payload.notes === 'string' ? { notes: payload.notes } : {}),
    ...(typeof payload.dividendsReceived === 'number' ? { dividendsReceived: payload.dividendsReceived } : {}),
  };
  const recomputed = recomputeInvestment({ ...merged, lastUpdatedAt: now });

  const updated = [...investments];
  updated[idx] = recomputed;
  await saveLedgerProfile({ ...profile, investments: updated, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── delete_investment ────────────────────────────────────────────────────────

async function handleDeleteInvestment(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  await saveLedgerProfile(
    { ...profile, investments: (profile.investments ?? []).filter(inv => inv.id !== payload.investmentId), updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

// ─── record_portfolio_snapshot ────────────────────────────────────────────────

async function handleRecordPortfolioSnapshot(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const snapshot = buildPortfolioSnapshot(
    profile.investments ?? [],
    typeof payload.note === 'string' ? payload.note : undefined
  );

  await saveLedgerProfile(
    { ...profile, portfolioHistory: [...(profile.portfolioHistory ?? []), snapshot], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('PORTFOLIO_SNAPSHOT' as SpineEventType, { totalValue: snapshot.totalValue });
}

// ─── add_dividend ─────────────────────────────────────────────────────────────

async function handleAddDividend(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const amount = typeof payload.amount === 'number' ? payload.amount : 0;
  const investments = (profile.investments ?? []).map(inv =>
    inv.id === payload.investmentId
      ? { ...inv, dividendsReceived: (inv.dividendsReceived ?? 0) + amount, lastUpdatedAt: now }
      : inv
  );
  await saveLedgerProfile({ ...profile, investments, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerInvestmentActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    add_investment:             handleAddInvestment,
    update_investment:          handleUpdateInvestment,
    delete_investment:          handleDeleteInvestment,
    record_portfolio_snapshot:  handleRecordPortfolioSnapshot,
    add_dividend:               handleAddDividend,
  });
}
