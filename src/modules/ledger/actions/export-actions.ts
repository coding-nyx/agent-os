import { ActionHub } from '@/lib/actions/action-hub';
import type { ActionContext } from '@/lib/actions/action-hub';
import { loadLedgerProfile } from '@/modules/ledger/services/ledger-intake-service';
import { runExport } from '@/modules/ledger/services/export-service';
import type { ExportOptions } from '@/modules/ledger/services/export-service';
import { spineEventService } from '@/modules/ledger/services/spine-event-service';
import type { LedgerSpineEventType } from './ledger-field-actions';

let registered = false;

// ─── export_transactions_csv ──────────────────────────────────────────────────

async function handleExportTransactionsCsv(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const opts: ExportOptions = {
    type: 'transactions_csv',
    fromDate: typeof payload.fromDate === 'string' ? payload.fromDate : undefined,
    toDate: typeof payload.toDate === 'string' ? payload.toDate : undefined,
  };
  runExport(profile, opts);
  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: 'export:transactions_csv',
    data: { fromDate: opts.fromDate, toDate: opts.toDate },
  }, userId);
}

// ─── export_tax_summary ───────────────────────────────────────────────────────

async function handleExportTaxSummary(context: ActionContext): Promise<void> {
  const { payload, userId, encryptionKey } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  const taxYear = typeof payload.taxYear === 'number' ? payload.taxYear : new Date().getFullYear();
  runExport(profile, { type: 'tax_summary_json', taxYear });
  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: 'export:tax_summary',
    data: { taxYear },
  }, userId);
}

// ─── export_net_worth_report ──────────────────────────────────────────────────

async function handleExportNetWorthReport(context: ActionContext): Promise<void> {
  const { userId, encryptionKey } = context;
  const profile = await loadLedgerProfile({ userId: userId ?? null, encryptionKey: encryptionKey ?? null });
  if (!profile) return;

  runExport(profile, { type: 'net_worth_json' });
  await spineEventService.logLedgerEvent({
    type: 'TRANSACTION_CREATED' as LedgerSpineEventType,
    domain: 'R' as const,
    source: 'export:net_worth',
    data: {},
  }, userId);
}

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerLedgerExportActions(): void {
  if (registered) return;
  registered = true;
  ActionHub.registerMultiple('ledger', {
    export_transactions_csv:  handleExportTransactionsCsv,
    export_tax_summary:       handleExportTaxSummary,
    export_net_worth_report:  handleExportNetWorthReport,
  });
}
