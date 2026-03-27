/**
 * ExportPanel.tsx
 *
 * Settings / Export Panel for the Nexus Ledger finance module.
 *
 * Provides three export actions:
 *   1. Transactions CSV  — optional date-range filter
 *   2. Tax Summary JSON  — tax-year selector (current year + 2 prior)
 *   3. Net Worth Report JSON — no extra controls
 *
 * Each card shows a brief "✓ Exported" success state for 2 s after the user
 * triggers an export, then resets to the idle button label.
 *
 * All business-logic lives in the callbacks passed by the parent; this
 * component is purely presentational + local interaction state.
 *
 * Complexity: O(1) — all operations are constant-time UI state transitions.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart2, Download, FileText, Table2 } from 'lucide-react';

import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';

import type { LedgerIntakeProfile } from '../services/ledger-intake-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportPanelProps {
  profile: LedgerIntakeProfile;
  onExportTransactionsCsv: (fromDate?: string, toDate?: string) => void;
  onExportTaxSummary: (taxYear: number) => void;
  onExportNetWorthReport: () => void;
}

/** Internal identifier for each export card. */
type ExportCard = 'csv' | 'tax' | 'networth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns [currentYear, currentYear-1, currentYear-2] as select options. */
function buildYearOptions(): { label: string; value: string }[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2].map((y) => ({
    label: String(y),
    value: String(y),
  }));
}

const YEAR_OPTIONS = buildYearOptions();
const DEFAULT_TAX_YEAR = YEAR_OPTIONS[0].value;

/** Duration (ms) for which the success state is displayed. */
const SUCCESS_DURATION_MS = 2_000;

// ---------------------------------------------------------------------------
// Sub-component: ExportCard shell
// ---------------------------------------------------------------------------

interface ExportCardProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  controls?: React.ReactNode;
  action: React.ReactNode;
}

function ExportCard({
  icon,
  iconBg,
  title,
  description,
  controls,
  action,
}: ExportCardProps): React.ReactElement {
  return (
    <div className="bg-white/[0.045] border border-white/10 rounded-xl p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white leading-tight">{title}</h3>
          <p className="text-xs text-white/50 mt-0.5">{description}</p>
        </div>
      </div>

      {/* Optional controls */}
      {controls && <div className="flex flex-col gap-3">{controls}</div>}

      {/* Export action */}
      <div>{action}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: useExportSuccess
// ---------------------------------------------------------------------------

/**
 * Returns [isSuccess, triggerSuccess].
 *
 * Calling `triggerSuccess` flips `isSuccess` to `true` for exactly
 * SUCCESS_DURATION_MS milliseconds, then resets.  Stale timers are
 * cancelled on re-trigger or unmount to prevent state-on-unmounted-component
 * warnings.
 */
function useExportSuccess(): [boolean, () => void] {
  const [isSuccess, setIsSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSuccess = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    setIsSuccess(true);
    timerRef.current = setTimeout(() => {
      setIsSuccess(false);
      timerRef.current = null;
    }, SUCCESS_DURATION_MS);
  }, []);

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  return [isSuccess, triggerSuccess];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExportPanel({
  profile: _profile,
  onExportTransactionsCsv,
  onExportTaxSummary,
  onExportNetWorthReport,
}: ExportPanelProps): React.ReactElement {
  // --- Transactions CSV state ---
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [csvSuccess, triggerCsvSuccess] = useExportSuccess();

  // --- Tax Summary state ---
  const [taxYear, setTaxYear] = useState(DEFAULT_TAX_YEAR);
  const [taxSuccess, triggerTaxSuccess] = useExportSuccess();

  // --- Net Worth state ---
  const [nwSuccess, triggerNwSuccess] = useExportSuccess();

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleExportCsv = useCallback(() => {
    onExportTransactionsCsv(fromDate || undefined, toDate || undefined);
    triggerCsvSuccess();
  }, [fromDate, toDate, onExportTransactionsCsv, triggerCsvSuccess]);

  const handleExportTax = useCallback(() => {
    onExportTaxSummary(Number(taxYear));
    triggerTaxSuccess();
  }, [taxYear, onExportTaxSummary, triggerTaxSuccess]);

  const handleExportNetWorth = useCallback(() => {
    onExportNetWorthReport();
    triggerNwSuccess();
  }, [onExportNetWorthReport, triggerNwSuccess]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* ── 1. Transactions CSV ───────────────────────────────────────────── */}
      <ExportCard
        icon={<Table2 className="w-5 h-5 text-cyan-400" />}
        iconBg="bg-cyan-500/15"
        title="Transactions CSV"
        description="Export all transactions as a spreadsheet"
        controls={
          <div className="grid grid-cols-2 gap-3">
            <NeuralInput
              type="date"
              label="From date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From date"
            />
            <NeuralInput
              type="date"
              label="To date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To date"
            />
          </div>
        }
        action={
          <NeuralButton
            variant={csvSuccess ? 'ghost' : 'primary'}
            size="sm"
            themeColor="cyan"
            onClick={handleExportCsv}
            className="w-full"
          >
            {csvSuccess ? (
              '✓ Exported'
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </span>
            )}
          </NeuralButton>
        }
      />

      {/* ── 2. Tax Summary JSON ───────────────────────────────────────────── */}
      <ExportCard
        icon={<FileText className="w-5 h-5 text-violet-400" />}
        iconBg="bg-violet-500/15"
        title="Tax Summary JSON"
        description="Export tax year summary with deductions and category breakdown"
        controls={
          <NeuralSelectMenu
            value={taxYear}
            options={YEAR_OPTIONS}
            onChange={(val) => setTaxYear(val)}
            placeholder="Select tax year"
            ariaLabel="Tax year"
          />
        }
        action={
          <NeuralButton
            variant={taxSuccess ? 'ghost' : 'primary'}
            size="sm"
            themeColor="violet"
            onClick={handleExportTax}
            className="w-full"
          >
            {taxSuccess ? (
              '✓ Exported'
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export Tax Summary
              </span>
            )}
          </NeuralButton>
        }
      />

      {/* ── 3. Net Worth Report JSON ─────────────────────────────────────── */}
      <ExportCard
        icon={<BarChart2 className="w-5 h-5 text-emerald-400" />}
        iconBg="bg-emerald-500/15"
        title="Net Worth Report"
        description="Export net worth history, investments, and account balances"
        action={
          <NeuralButton
            variant={nwSuccess ? 'ghost' : 'primary'}
            size="sm"
            themeColor="emerald"
            onClick={handleExportNetWorth}
            className="w-full"
          >
            {nwSuccess ? (
              '✓ Exported'
            ) : (
              <span className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export Report
              </span>
            )}
          </NeuralButton>
        }
      />
    </div>
  );
}
