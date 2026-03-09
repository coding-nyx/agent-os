import type { ExtractedDataItem } from '@/core/diagnosis/types';

/**
 * Merges user-approved diagnosis items into the Ledger profile.
 * Currently a lightweight stub — Ledger profile field additions
 * for structured financial data are a follow-up task.
 */
export async function mergeLedgerDiagnosisData(
  userId: string,
  items: ExtractedDataItem[],
  encryptionKey?: CryptoKey | null,
): Promise<void> {
  // TODO: Implement once LedgerProfile has structured financial data fields.
  // For now, log the merge intent so it's auditable.
  console.info(
    `[LedgerDiagnosisMerge] Would merge ${items.length} item(s) for user ${userId}:`,
    items.map((i) => `${i.type}: ${i.label}`),
  );
}
