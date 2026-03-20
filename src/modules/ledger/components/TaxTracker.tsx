/**
 * TaxTracker.tsx
 *
 * Tax Strategy & Deduction Tracker (S2-L-003)
 *
 * Sections:
 *  1. Tax Year Summary — income, deductions, estimated tax owed, effective rate,
 *     marginal bracket (2024 US federal single-filer brackets).
 *  2. Deductible Expense Categories — filtered transactions grouped by category.
 *  3. Quarterly Estimated Tax — IRS Q1–Q4 due dates with local "mark as paid" toggle.
 *  4. AI Insights Prompt — passive nudge to use the Ledger chat sidebar.
 *
 * Complexity: all derived values are O(n) in the number of transactions.
 */

import React, { useMemo, useState } from 'react';
import {
  Receipt,
  TrendingDown,
  DollarSign,
  Percent,
  Calendar,
  CheckCircle2,
  Circle,
  Sparkles,
  ChevronRight,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { GlassCard } from '@/core/components/GlassCard';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { LedgerIntakeProfile, Transaction } from '../services/ledger-intake-service';
import { estimateQuarterlyTax, suggestTaxOptimizations, categorizeTax } from '../services/ledger-cross-verification-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxTrackerProps {
  profile: LedgerIntakeProfile;
  encryptionKey?: CryptoKey;
  onUpdateProfile?: (updates: Partial<LedgerIntakeProfile>) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 2024 US federal single-filer tax brackets. */
interface TaxBracket {
  label: string;
  rate: number;
  min: number;
  max: number; // Infinity for top bracket
}

const TAX_BRACKETS_2024: TaxBracket[] = [
  { label: '10%', rate: 0.10, min: 0,       max: 11_600 },
  { label: '12%', rate: 0.12, min: 11_601,  max: 47_150 },
  { label: '22%', rate: 0.22, min: 47_151,  max: 100_525 },
  { label: '24%', rate: 0.24, min: 100_526, max: 191_950 },
  { label: '32%', rate: 0.32, min: 191_951, max: 243_725 },
  { label: '35%', rate: 0.35, min: 243_726, max: 609_350 },
  { label: '37%', rate: 0.37, min: 609_351, max: Infinity },
];

const STANDARD_DEDUCTION_2024 = 14_600; // single filer

const DEDUCTIBLE_CATEGORIES = [
  'Healthcare',
  'Medical',
  'Charity',
  'Donations',
  'Education',
  'Business',
  'Home Office',
  'Interest',
  'State Tax',
  'Property Tax',
  'Mortgage',
] as const;

interface QuarterDef {
  label: string;
  dueDate: string; // human-readable
  dueDateIso: string; // ISO date string (year inserted at runtime)
}

const QUARTERS: QuarterDef[] = [
  { label: 'Q1', dueDate: 'Apr 15',  dueDateIso: '-04-15' },
  { label: 'Q2', dueDate: 'Jun 17',  dueDateIso: '-06-17' },
  { label: 'Q3', dueDate: 'Sep 16',  dueDateIso: '-09-16' },
  { label: 'Q4', dueDate: 'Jan 15',  dueDateIso: '-01-15' }, // next year
];

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function computeFederalTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  for (const bracket of TAX_BRACKETS_2024) {
    if (taxableIncome <= 0) break;
    const taxableInBracket = Math.min(taxableIncome, bracket.max - bracket.min + 1);
    tax += taxableInBracket * bracket.rate;
    taxableIncome -= taxableInBracket;
  }
  return Math.max(0, tax);
}

function getMarginalBracket(taxableIncome: number): TaxBracket {
  if (taxableIncome <= 0) return TAX_BRACKETS_2024[0];
  for (const bracket of TAX_BRACKETS_2024) {
    if (taxableIncome <= bracket.max) return bracket;
  }
  return TAX_BRACKETS_2024[TAX_BRACKETS_2024.length - 1];
}

function isDeductibleCategory(category: string): boolean {
  const lower = category.toLowerCase();
  return DEDUCTIBLE_CATEGORIES.some((dc) => lower.includes(dc.toLowerCase()));
}

function currentTaxYear(): number {
  return new Date().getFullYear();
}

function filterToTaxYear(transactions: Transaction[], year: number): Transaction[] {
  const start = `${year}-01-01`;
  const end   = `${year}-12-31`;
  return transactions.filter((t) => t.date >= start && t.date <= end);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}

function StatCard({ icon, label, value, accent = 'text-[var(--module-color-400)]', sub }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-4">
      <div className={cn('flex items-center gap-2 text-xs font-semibold uppercase tracking-wider', accent)}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-white/50">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Tax Year Summary
// ---------------------------------------------------------------------------

interface TaxYearSummaryProps {
  transactions: Transaction[];
  currency: string;
}

function TaxYearSummary({ transactions, currency }: TaxYearSummaryProps) {
  const year = currentTaxYear();
  const yearTxns = filterToTaxYear(transactions, year);

  const { totalIncome, totalDeductible, taxableIncome, estimatedTax, effectiveRate, marginalBracket } =
    useMemo(() => {
      const totalIncome = yearTxns
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalDeductible = yearTxns
        .filter((t) => t.type === 'expense' && isDeductibleCategory(t.category))
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Use whichever is larger: standard deduction or itemized deductions
      const deduction = Math.max(STANDARD_DEDUCTION_2024, totalDeductible);
      const taxableIncome = Math.max(0, totalIncome - deduction);
      const estimatedTax = computeFederalTax(taxableIncome);
      const effectiveRate = totalIncome > 0 ? (estimatedTax / totalIncome) * 100 : 0;
      const marginalBracket = getMarginalBracket(taxableIncome);

      return { totalIncome, totalDeductible, taxableIncome, estimatedTax, effectiveRate, marginalBracket };
    }, [yearTxns]);

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-3">
        {year} Tax Year Summary
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          icon={<DollarSign size={13} />}
          label="Total Income"
          value={formatCurrency(totalIncome, currency)}
          accent="text-emerald-400"
        />
        <StatCard
          icon={<TrendingDown size={13} />}
          label="Deductible Expenses"
          value={formatCurrency(totalDeductible, currency)}
          accent="text-violet-400"
          sub={totalDeductible < STANDARD_DEDUCTION_2024 ? `Standard deduction applies ($${STANDARD_DEDUCTION_2024.toLocaleString()})` : 'Itemized deduction used'}
        />
        <StatCard
          icon={<Receipt size={13} />}
          label="Taxable Income"
          value={formatCurrency(taxableIncome, currency)}
          accent="text-[var(--module-color-400)]"
        />
        <StatCard
          icon={<DollarSign size={13} />}
          label="Est. Tax Owed"
          value={formatCurrency(estimatedTax, currency)}
          accent="text-amber-400"
          sub="Federal only · 2024 brackets"
        />
        <StatCard
          icon={<Percent size={13} />}
          label="Effective Rate"
          value={`${effectiveRate.toFixed(1)}%`}
          accent="text-rose-400"
        />
        <StatCard
          icon={<FileText size={13} />}
          label="Marginal Bracket"
          value={marginalBracket.label}
          accent="text-orange-400"
          sub={`On income above $${marginalBracket.min.toLocaleString()}`}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Deductible Expense Categories
// ---------------------------------------------------------------------------

interface CategoryRow {
  category: string;
  total: number;
  count: number;
}

interface DeductibleExpensesProps {
  transactions: Transaction[];
  currency: string;
}

function DeductibleExpenses({ transactions, currency }: DeductibleExpensesProps) {
  const year = currentTaxYear();
  const yearTxns = filterToTaxYear(transactions, year);

  const rows = useMemo<CategoryRow[]>(() => {
    const map = new Map<string, CategoryRow>();
    for (const t of yearTxns) {
      if (t.type !== 'expense') continue;
      if (!isDeductibleCategory(t.category)) continue;
      const key = t.category;
      const existing = map.get(key);
      if (existing) {
        existing.total += Math.abs(t.amount);
        existing.count += 1;
      } else {
        map.set(key, { category: key, total: Math.abs(t.amount), count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [yearTxns]);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-3">
          Deductible Expense Categories
        </h2>
        <div className="rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm p-6 flex items-center gap-3 text-white/40">
          <AlertCircle size={16} />
          <p className="text-sm">No deductible expenses found for {year}. Add transactions with categories like Healthcare, Charity, or Education.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-3">
        Deductible Expense Categories
      </h2>
      <GlassCard className="overflow-hidden">
        <div className="divide-y divide-white/5">
          {rows.map((row) => (
            <div key={row.category} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <ChevronRight size={13} className="text-violet-400" />
                <span className="text-sm text-white/80">{row.category}</span>
                <span className="text-xs text-white/40">({row.count} txn{row.count !== 1 ? 's' : ''})</span>
              </div>
              <span className="text-sm font-semibold text-violet-300">{formatCurrency(row.total, currency)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-white/5">
            <span className="text-sm font-bold text-white">Total Deductions</span>
            <span className="text-sm font-bold text-violet-300">{formatCurrency(grandTotal, currency)}</span>
          </div>
        </div>
      </GlassCard>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Quarterly Estimated Tax
// ---------------------------------------------------------------------------

interface QuarterlyEstimatesProps {
  annualTaxEstimate: number;
  currency: string;
  paidQuarters?: Set<number>;
  onTogglePaid?: (index: number) => void;
}

function QuarterlyEstimates({ annualTaxEstimate, currency, paidQuarters: externalPaidQuarters, onTogglePaid }: QuarterlyEstimatesProps) {
  const [localPaidQuarters, setLocalPaidQuarters] = useState<Set<number>>(new Set());
  const paidQuarters = externalPaidQuarters ?? localPaidQuarters;
  const quarterlyPayment = annualTaxEstimate / 4;
  const taxYear = currentTaxYear();
  const today = new Date();

  function togglePaid(index: number) {
    if (onTogglePaid) {
      onTogglePaid(index);
    } else {
      setLocalPaidQuarters((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    }
  }

  function getDueDateObj(q: QuarterDef, idx: number): Date {
    // Q4 payment is due Jan 15 of the *following* year
    const year = idx === 3 ? taxYear + 1 : taxYear;
    return new Date(`${year}${q.dueDateIso}`);
  }

  function getQuarterStatus(q: QuarterDef, idx: number): 'paid' | 'upcoming' | 'overdue' | 'future' {
    if (paidQuarters.has(idx)) return 'paid';
    const due = getDueDateObj(q, idx);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 30) return 'upcoming';
    return 'future';
  }

  const statusStyles: Record<string, string> = {
    paid:     'border-emerald-500/30 bg-emerald-500/5',
    upcoming: 'border-amber-500/30 bg-amber-500/5',
    overdue:  'border-rose-500/30 bg-rose-500/10',
    future:   'border-white/10 bg-white/5',
  };

  const statusLabel: Record<string, string> = {
    paid:     'Paid',
    upcoming: 'Due Soon',
    overdue:  'Overdue',
    future:   'Upcoming',
  };

  const statusColor: Record<string, string> = {
    paid:     'text-emerald-400',
    upcoming: 'text-amber-400',
    overdue:  'text-rose-400',
    future:   'text-white/40',
  };

  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-3">
        Quarterly Estimated Tax Payments
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUARTERS.map((q, idx) => {
          const status = getQuarterStatus(q, idx);
          const dueObj = getDueDateObj(q, idx);
          const dueYear = idx === 3 ? taxYear + 1 : taxYear;
          return (
            <button
              key={q.label}
              onClick={() => togglePaid(idx)}
              className={cn(
                'flex flex-col gap-2 rounded-xl border backdrop-blur-sm p-4 text-left transition-all',
                'hover:bg-white/10 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]',
                statusStyles[status],
              )}
              aria-pressed={paidQuarters.has(idx)}
              aria-label={`${q.label} — ${paidQuarters.has(idx) ? 'Mark unpaid' : 'Mark paid'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{q.label}</span>
                {paidQuarters.has(idx)
                  ? <CheckCircle2 size={15} className="text-emerald-400" />
                  : <Circle size={15} className="text-white/30" />
                }
              </div>
              <p className="text-lg font-bold text-white">{formatCurrency(quarterlyPayment, currency)}</p>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-white/50">
                  Due {q.dueDate}, {dueYear}
                </span>
                <span className={cn('text-xs font-semibold', statusColor[status])}>
                  {statusLabel[status]}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-white/30">
        Tap a quarter card to toggle paid status · Local state only · IRS Form 1040-ES
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 4 — AI Insights Prompt Card
// ---------------------------------------------------------------------------

function AIInsightsPrompt() {
  return (
    <section>
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm p-5 flex items-start gap-4">
        <div className="relative mt-0.5 flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-60" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">AI Tax Insights</span>
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            Ask your <span className="text-white font-semibold">Ledger AI</span> about deduction strategies,
            tax optimization, or estimated payments. Your financial data is already in context.
          </p>
          <p className="mt-2 text-xs text-white/40">
            Try: "What deductions am I missing?" · "Am I on track with quarterly estimates?" · "How can I reduce my taxable income?"
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function TaxTracker({ profile, onUpdateProfile }: TaxTrackerProps) {
  const transactions = profile.transactions ?? [];
  const currency = profile.currency ?? 'USD';

  // Compute annual estimate once and share with quarterly section
  const annualTaxEstimate = useMemo(() => {
    const year = currentTaxYear();
    const yearTxns = filterToTaxYear(transactions, year);

    const totalIncome = yearTxns
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDeductible = yearTxns
      .filter((t) => t.type === 'expense' && isDeductibleCategory(t.category))
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const deduction = Math.max(STANDARD_DEDUCTION_2024, totalDeductible);
    const taxableIncome = Math.max(0, totalIncome - deduction);
    return computeFederalTax(taxableIncome);
  }, [transactions]);

  // FIX-P6: wire estimateQuarterlyTax
  const quarterlyEstimate = useMemo(() => {
    const monthlyIncome = profile.monthlyIncome ?? 0;
    const monthlyDeductibles = [...(profile.fixedExpenses ?? []), ...(profile.variableExpenses ?? [])]
      .reduce((sum, e) => sum + e.amount, 0);
    return estimateQuarterlyTax(monthlyIncome, monthlyDeductibles);
  }, [profile.monthlyIncome, profile.fixedExpenses, profile.variableExpenses]);

  // FIX-P6: wire suggestTaxOptimizations
  const taxOptimizations = useMemo(() => {
    const allExpenses = [...(profile.fixedExpenses ?? []), ...(profile.variableExpenses ?? [])];
    const enriched = allExpenses.map(e => ({ ...e, taxCategory: categorizeTax(e) }));
    return suggestTaxOptimizations(enriched);
  }, [profile.fixedExpenses, profile.variableExpenses]);

  // FIX-P7: Use profile paidQuarters instead of local state
  const paidQuartersSet = useMemo(
    () => new Set<number>(profile.paidQuarters ?? []),
    [profile.paidQuarters],
  );

  const handleTogglePaidQuarter = (idx: number) => {
    if (!onUpdateProfile) return;
    const current = new Set<number>(profile.paidQuarters ?? []);
    if (current.has(idx)) { current.delete(idx); } else { current.add(idx); }
    onUpdateProfile({ paidQuarters: Array.from(current) });
  };

  return (
    <div className="px-4 md:px-8 space-y-8 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <Receipt size={18} className="text-amber-400" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white">Tax Strategy &amp; Deduction Tracker</h1>
          <p className="text-xs text-white/50">2024 US federal estimates · Single filer · For planning purposes only</p>
        </div>
      </div>

      {/* FIX-P6: Show quarterly estimate from engine */}
      {quarterlyEstimate.estimatedLiability > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
          <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-1">Quarterly Liability Estimate</p>
          <p className="text-xl font-bold text-white">{formatCurrency(quarterlyEstimate.estimatedLiability, currency)}</p>
          <p className="text-xs text-white/50 mt-1">Next deadline: {quarterlyEstimate.nextDeadline}</p>
        </div>
      )}

      {/* FIX-P6: Show tax optimization suggestions */}
      {taxOptimizations.length > 0 && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-2">
          <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Tax Optimization Suggestions</p>
          {taxOptimizations.slice(0, 3).map(s => (
            <div key={s.fieldId} className="text-xs text-white/70">
              <span className="font-medium text-white">{s.reason}</span>
              <span className="text-white/40 ml-2">{s.current} → {s.suggested}</span>
            </div>
          ))}
        </div>
      )}

      <TaxYearSummary transactions={transactions} currency={currency} />
      <DeductibleExpenses transactions={transactions} currency={currency} />
      <QuarterlyEstimates
        annualTaxEstimate={annualTaxEstimate}
        currency={currency}
        paidQuarters={paidQuartersSet}
        onTogglePaid={handleTogglePaidQuarter}
      />
      <AIInsightsPrompt />
    </div>
  );
}
