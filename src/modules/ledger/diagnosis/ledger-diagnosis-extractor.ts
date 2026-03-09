import type { ExtractedDataBag, ExtractedDataItem } from '@/core/diagnosis/types';

/**
 * Maps Ledger AI action payloads → ExtractedDataItems for the merge review dialog.
 */
export function extractLedgerData(
  actionType: string,
  payload: Record<string, unknown>,
  current: ExtractedDataBag,
): ExtractedDataBag {
  const now = new Date().toISOString();

  switch (actionType) {
    case 'parse_financial_document': {
      const docType = typeof payload.documentType === 'string' ? payload.documentType : 'document';
      const period = typeof payload.period === 'string' ? payload.period : '';
      const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];

      const items: ExtractedDataItem[] = transactions
        .filter((t: unknown) => t && typeof t === 'object')
        .map((t: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          type: 'transaction',
          label: `${typeof t.description === 'string' ? t.description : 'Transaction'}: ${typeof t.amount === 'number' ? t.amount.toFixed(2) : '?'}`,
          data: { ...t },
          source: `${docType}${period ? ` (${period})` : ''}`,
          extractedAt: now,
        }));

      // Also create a summary item
      if (payload.summary && typeof payload.summary === 'object') {
        const summary = payload.summary as Record<string, unknown>;
        items.push({
          id: crypto.randomUUID(),
          type: 'financial_summary',
          label: `${docType} summary — Income: ${summary.totalIncome ?? '?'}, Expenses: ${summary.totalExpenses ?? '?'}`,
          data: { ...summary, documentType: docType, period },
          source: docType,
          extractedAt: now,
        });
      }

      return { ...current, items: [...current.items, ...items] };
    }

    case 'commit_transaction': {
      const desc = typeof payload.description === 'string' ? payload.description : 'Transaction';
      const amount = typeof payload.amount === 'number' ? payload.amount.toFixed(2) : '?';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'transaction',
        label: `${desc}: ${amount}`,
        data: { ...payload },
        source: typeof payload.source === 'string' ? payload.source : 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    case 'flag_anomaly': {
      const desc = typeof payload.description === 'string' ? payload.description : 'Anomaly';
      const severity = typeof payload.severity === 'string' ? payload.severity : 'medium';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'anomaly',
        label: `⚠ ${desc} (${severity})`,
        data: { ...payload },
        source: 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    case 'categorize_expense': {
      const desc = typeof payload.description === 'string' ? payload.description : 'Expense';
      const category = typeof payload.category === 'string' ? payload.category : 'uncategorized';
      const item: ExtractedDataItem = {
        id: crypto.randomUUID(),
        type: 'expense_category',
        label: `${desc} → ${category}`,
        data: { ...payload },
        source: 'diagnosis',
        extractedAt: now,
      };
      return { ...current, items: [...current.items, item] };
    }

    default:
      return current;
  }
}
