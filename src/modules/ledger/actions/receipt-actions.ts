import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { Receipt, TaxCategory } from '@/modules/ledger/services/ledger-intake-service';

let registered = false;

const TAX_CATEGORIES: TaxCategory[] = ['essential','deductible','discretionary','investment','non-deductible','partial','unknown'];

async function handleAddReceipt(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const receipt: Receipt = {
    id: crypto.randomUUID(),
    label: typeof payload.label === 'string' ? payload.label.trim() : 'Receipt',
    amount: typeof payload.amount === 'number' ? payload.amount : 0,
    date: typeof payload.date === 'string' ? payload.date : now.split('T')[0],
    transactionId: typeof payload.transactionId === 'string' ? payload.transactionId : undefined,
    category: typeof payload.category === 'string' ? payload.category : undefined,
    taxCategory: TAX_CATEGORIES.includes(payload.taxCategory as TaxCategory) ? payload.taxCategory as TaxCategory : undefined,
    taxYear: typeof payload.taxYear === 'number' ? payload.taxYear : new Date().getFullYear(),
    imageRef: typeof payload.imageRef === 'string' ? payload.imageRef : undefined,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    createdAt: now,
  };

  await saveLedgerProfile(
    { ...profile, receipts: [...(profile.receipts ?? []), receipt], updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

async function handleDeleteReceipt(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  await saveLedgerProfile(
    { ...profile, receipts: (profile.receipts ?? []).filter(r => r.id !== payload.receiptId), updatedAt: new Date().toISOString() },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
}

async function handleLinkReceiptToTransaction(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const receipts = (profile.receipts ?? []).map(r =>
    r.id === payload.receiptId ? { ...r, transactionId: payload.transactionId as string } : r
  );
  await saveLedgerProfile({ ...profile, receipts, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

export function registerLedgerReceiptActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    add_receipt:                  handleAddReceipt,
    delete_receipt:               handleDeleteReceipt,
    link_receipt_to_transaction:  handleLinkReceiptToTransaction,
  });
}
