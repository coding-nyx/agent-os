import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { TaxDeduction, TaxCategory } from '@/modules/ledger/services/ledger-intake-service';
import { buildTaxYearSummary } from '@/modules/ledger/services/aggregation/tax-aggregation';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import type { LedgerSpineEventType } from './ledger-field-actions';
import type { SpineEventType } from '@/lib/types';

let registered = false;

const TAX_CATEGORIES: TaxCategory[] = ['essential','deductible','discretionary','investment','non-deductible','partial','unknown'];

// ─── set_tax_category ─────────────────────────────────────────────────────────
// Sets taxCategory on one or multiple transactions.

async function handleSetTaxCategory(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const category: TaxCategory = TAX_CATEGORIES.includes(payload.category as TaxCategory)
    ? payload.category as TaxCategory : 'unknown';

  const ids: string[] = Array.isArray(payload.transactionIds)
    ? payload.transactionIds.filter((id: unknown) => typeof id === 'string')
    : typeof payload.transactionId === 'string' ? [payload.transactionId] : [];

  const now = new Date().toISOString();
  const transactions = (profile.transactions ?? []).map(tx =>
    ids.includes(tx.id) ? { ...tx, taxCategory: category } : tx
  );
  await saveLedgerProfile({ ...profile, transactions, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

// ─── add_tax_deduction ────────────────────────────────────────────────────────

async function handleAddTaxDeduction(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const deduction: TaxDeduction = {
    id: crypto.randomUUID(),
    label: typeof payload.label === 'string' ? payload.label.trim() : 'Deduction',
    amount: typeof payload.amount === 'number' ? payload.amount : 0,
    category: TAX_CATEGORIES.includes(payload.category as TaxCategory) ? payload.category as TaxCategory : 'deductible',
    taxYear: typeof payload.taxYear === 'number' ? payload.taxYear : new Date().getFullYear(),
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    receiptRef: typeof payload.receiptRef === 'string' ? payload.receiptRef : undefined,
    createdAt: now,
  };

  await saveLedgerProfile(
    { ...profile, taxDeductions: [...(profile.taxDeductions ?? []), deduction], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: `tax_deduction:${deduction.id}`,
    data: { deductionId: deduction.id, label: deduction.label, amount: deduction.amount },
  });
}

// ─── delete_tax_deduction ─────────────────────────────────────────────────────

async function handleDeleteTaxDeduction(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  await saveLedgerProfile(
    { ...profile, taxDeductions: (profile.taxDeductions ?? []).filter(d => d.id !== payload.deductionId), updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

// ─── generate_tax_summary ─────────────────────────────────────────────────────

async function handleGenerateTaxSummary(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const taxYear = typeof payload.taxYear === 'number' ? payload.taxYear : new Date().getFullYear();
  const summary = buildTaxYearSummary(profile, taxYear);
  const now = new Date().toISOString();

  await saveLedgerProfile(
    { ...profile, lastTaxSummary: summary, updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('TAX_SUMMARY_GENERATED' as SpineEventType, { taxYear, estimatedTaxableIncome: summary.estimatedTaxableIncome });
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerTaxActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    set_tax_category:      handleSetTaxCategory,
    add_tax_deduction:     handleAddTaxDeduction,
    delete_tax_deduction:  handleDeleteTaxDeduction,
    generate_tax_summary:  handleGenerateTaxSummary,
  });
}
