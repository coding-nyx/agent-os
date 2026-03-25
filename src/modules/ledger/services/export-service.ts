import type { LedgerIntakeProfile, Transaction } from './ledger-intake-service';
import { buildTaxYearSummary } from './aggregation/tax-aggregation';
import { computeCurrentNetWorth } from './aggregation/networth-aggregation';

// ─── CSV Export ───────────────────────────────────────────────────────────────

function escapeCsv(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cells: (string | number | undefined | null)[]): string {
  return cells.map(escapeCsv).join(',');
}

export function buildTransactionsCsv(transactions: Transaction[], currency = 'USD'): string {
  const header = buildCsvRow(['Date', 'Description', 'Amount', 'Type', 'Category', 'Tax Category', 'Notes', 'Currency']);
  const rows = transactions
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(tx =>
      buildCsvRow([tx.date, tx.description, tx.amount, tx.type, tx.category, tx.taxCategory ?? '', tx.notes ?? '', currency])
    );
  return [header, ...rows].join('\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTransactionsCsv(
  profile: LedgerIntakeProfile,
  options: { fromDate?: string; toDate?: string } = {}
): void {
  let txs = profile.transactions ?? [];
  if (options.fromDate) txs = txs.filter(tx => tx.date >= options.fromDate!);
  if (options.toDate) txs = txs.filter(tx => tx.date <= options.toDate!);

  const csv = buildTransactionsCsv(txs, profile.currency);
  const filename = `transactions_${options.fromDate ?? 'all'}_to_${options.toDate ?? 'today'}.csv`;
  downloadCsv(filename, csv);
}

// ─── JSON Export ─────────────────────────────────────────────────────────────

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTaxSummaryJson(profile: LedgerIntakeProfile, taxYear?: number): void {
  const year = taxYear ?? new Date().getFullYear();
  const summary = buildTaxYearSummary(profile, year);
  downloadJson(`tax_summary_${year}.json`, summary);
}

export function exportNetWorthReportJson(profile: LedgerIntakeProfile): void {
  const current = computeCurrentNetWorth(profile.accounts ?? [], profile.debtItems ?? []);
  const report = {
    generatedAt: new Date().toISOString(),
    current,
    history: profile.netWorthHistory ?? [],
    investments: profile.investments ?? [],
    accounts: (profile.accounts ?? []).map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })),
  };
  downloadJson('net_worth_report.json', report);
}

export interface ExportOptions {
  type: 'transactions_csv' | 'tax_summary_json' | 'net_worth_json';
  fromDate?: string;
  toDate?: string;
  taxYear?: number;
}

export function runExport(profile: LedgerIntakeProfile, options: ExportOptions): void {
  switch (options.type) {
    case 'transactions_csv':
      exportTransactionsCsv(profile, { fromDate: options.fromDate, toDate: options.toDate });
      break;
    case 'tax_summary_json':
      exportTaxSummaryJson(profile, options.taxYear);
      break;
    case 'net_worth_json':
      exportNetWorthReportJson(profile);
      break;
  }
}
