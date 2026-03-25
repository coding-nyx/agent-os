import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile, saveLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import type { CreditScoreEntry, CreditFactor, CreditBureau } from '@/modules/ledger/services/ledger-intake-service';
import { inferCreditFactors } from '@/modules/ledger/services/aggregation/credit-aggregation';
import type { SpineEventType } from '@/lib/types';

let registered = false;

async function handleAddCreditScoreEntry(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty, emitSpineEvent } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const score = typeof payload.score === 'number' ? Math.max(300, Math.min(850, payload.score)) : 0;
  const entry: CreditScoreEntry = {
    id: crypto.randomUUID(),
    score,
    bureau: (['equifax','experian','transunion','vantage','fico','other'] as const).includes(payload.bureau as CreditBureau)
      ? payload.bureau as CreditBureau : 'other',
    recordedAt: typeof payload.recordedAt === 'string' ? payload.recordedAt : now,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
  };

  const creditFactors: CreditFactor[] = inferCreditFactors(score);
  await saveLedgerProfile(
    { ...profile, creditScoreHistory: [...(profile.creditScoreHistory ?? []), entry], creditFactors, updatedAt: now },
    { userId: userId ?? null, encryptionKey: encryptionKey ?? null }
  );
  markProfileDirty?.();
  emitSpineEvent('CREDIT_SCORE_ADDED' as SpineEventType, { score, bureau: entry.bureau });
}

async function handleDeleteCreditScoreEntry(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const now = new Date().toISOString();
  const history = (profile.creditScoreHistory ?? []).filter(e => e.id !== payload.entryId);
  const latestScore = history.length > 0 ? Math.max(...history.map(e => e.score)) : 0;
  const creditFactors = history.length > 0 ? inferCreditFactors(latestScore) : [];
  await saveLedgerProfile({ ...profile, creditScoreHistory: history, creditFactors, updatedAt: now }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

async function handleSetCreditFactors(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey, markProfileDirty } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const factors: CreditFactor[] = Array.isArray(payload.factors)
    ? payload.factors.filter((f: unknown) => f && typeof (f as Record<string,unknown>).name === 'string') as CreditFactor[]
    : [];
  await saveLedgerProfile({ ...profile, creditFactors: factors, updatedAt: new Date().toISOString() }, { userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  markProfileDirty?.();
}

export function registerLedgerCreditActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    add_credit_score_entry:    handleAddCreditScoreEntry,
    delete_credit_score_entry: handleDeleteCreditScoreEntry,
    set_credit_factors:        handleSetCreditFactors,
  });
}
