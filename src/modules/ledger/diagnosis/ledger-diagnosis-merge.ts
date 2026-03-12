import type { ExtractedDataItem } from '@/core/diagnosis/types';
import {
  loadLedgerProfile,
  saveLedgerProfile,
  type Transaction,
  type LedgerIntakeProfile,
} from '../services/ledger-intake-service';

/**
 * Merges user-approved diagnosis items into the Ledger profile.
 * Handles 'transaction' and 'financial_summary' item types.
 */
export async function mergeLedgerDiagnosisData(
  userId: string,
  items: ExtractedDataItem[],
  encryptionKey?: CryptoKey | null,
): Promise<void> {
  try {
    const profile = await loadLedgerProfile({ userId, encryptionKey: encryptionKey ?? null });
    if (!profile) return;

    let monthlyIncome = profile.monthlyIncome;
    const newFixed = [...(profile.fixedExpenses ?? [])];
    const newTransactions: Transaction[] = [...(profile.transactions ?? [])];

    for (const item of items) {
      if (item.type === 'transaction') {
        const rawAmount = typeof item.data?.amount === 'number' ? (item.data.amount as number) : 0;
        const tx: Transaction = {
          id: crypto.randomUUID(),
          date:
            typeof item.data?.date === 'string' && item.data.date
              ? (item.data.date as string)
              : new Date().toISOString().split('T')[0],
          description:
            typeof item.data?.description === 'string' && item.data.description
              ? (item.data.description as string)
              : (typeof item.data?.label === 'string' ? (item.data.label as string) : item.label),
          amount: Math.abs(rawAmount),
          type: rawAmount < 0 ? 'expense' : 'income',
          category:
            typeof item.data?.category === 'string' ? (item.data.category as string) : 'Other',
        };
        if (tx.amount > 0) {
          newTransactions.push(tx);
        }
      } else if (item.type === 'financial_summary') {
        const income = typeof item.data?.income === 'number' ? (item.data.income as number) : 0;
        const expense = typeof item.data?.expense === 'number' ? (item.data.expense as number) : 0;
        if (income > 0) {
          monthlyIncome = income;
        }
        if (expense > 0) {
          newFixed.push({
            id: crypto.randomUUID(),
            label: typeof item.data?.expenseLabel === 'string' ? (item.data.expenseLabel as string) : item.label,
            amount: expense,
          });
        }
      }
    }

    const next: LedgerIntakeProfile = {
      ...profile,
      monthlyIncome,
      fixedExpenses: newFixed,
      transactions: newTransactions,
      updatedAt: new Date().toISOString(),
    };

    await saveLedgerProfile(next, { userId, encryptionKey: encryptionKey ?? null });
  } catch (err) {
    console.error('[LedgerDiagnosisMerge] Failed to merge diagnosis data:', err);
  }
}
