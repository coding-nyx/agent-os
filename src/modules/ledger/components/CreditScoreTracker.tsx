/**
 * CreditScoreTracker.tsx
 *
 * Tracks credit scores over time with a prominent hero card, a linear gauge,
 * a Recharts history chart, credit-factor breakdown, improvement tips, and a
 * paginated history table. An "Add Score" modal lets users log new entries.
 *
 * Architecture decisions:
 *  - All derived data (trend, rating, tips, chart series) computed via useMemo
 *    so renders stay O(1) w.r.t. UI interactions.
 *  - Chart series derivation: O(n log n) for the sort, O(n) for mapping.
 *  - History table shows only the last 5 entries — O(1) slice.
 *  - Modal state is local (no prop-drilling required).
 *  - Service calls are pure (no side-effects), keeping this component fully
 *    portable away from the ledger module.
 */

import React, { useState, useMemo, useCallback, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

import { NeuralButton }     from '@/core/components/NeuralButton';
import { NeuralModal }      from '@/core/components/NeuralModal';
import { NeuralInput }      from '@/core/components/NeuralInput';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import { EmptyState }       from '@/core/components/EmptyState';

import type { CreditScoreEntry, CreditFactor, CreditBureau } from '../services/ledger-intake-service';
import {
  computeCreditTrend,
  getCreditRating,
  getImprovementTips,
} from '../services/aggregation/credit-aggregation';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCORE_MIN = 300;
const SCORE_MAX = 850;
const SCORE_RANGE = SCORE_MAX - SCORE_MIN; // 550

/** Reference lines on the chart marking tier boundaries. */
const REF_FAIR_GOOD   = 670;
const REF_GOOD_VGOOD  = 740;

const BUREAU_OPTIONS: { value: CreditBureau; label: string }[] = [
  { value: 'equifax',    label: 'Equifax'    },
  { value: 'experian',   label: 'Experian'   },
  { value: 'transunion', label: 'TransUnion' },
  { value: 'vantage',    label: 'VantageScore' },
  { value: 'fico',       label: 'FICO'       },
  { value: 'other',      label: 'Other'      },
];

const BUREAU_LABEL: Record<CreditBureau, string> = {
  equifax:    'Equifax',
  experian:   'Experian',
  transunion: 'TransUnion',
  vantage:    'VantageScore',
  fico:       'FICO',
  other:      'Other',
};

// ─── Helper utilities ─────────────────────────────────────────────────────────

/** Maps a raw score to the colour used across the component. */
function scoreColor(score: number): string {
  if (score >= 800) return '#10b981'; // Exceptional — emerald
  if (score >= 740) return '#34d399'; // Very Good   — green
  if (score >= 670) return '#fbbf24'; // Good        — yellow
  if (score >= 580) return '#f97316'; // Fair        — orange
  return '#ef4444';                    // Poor        — red
}

/** Gauge position: percentage along the 300-850 range (clamped 0-100). */
function gaugePercent(score: number): number {
  return Math.min(100, Math.max(0, ((score - SCORE_MIN) / SCORE_RANGE) * 100));
}

/** Format an ISO date string to a compact readable label. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Custom Recharts tooltip ────────────────────────────────────────────────────

interface ChartDataPoint {
  date: string;      // formatted label
  rawDate: string;   // ISO for sorting
  score: number;
  bureau: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: ChartDataPoint }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const { score, bureau } = payload[0].payload;
  return (
    <div className="bg-black/80 border border-white/10 rounded-xl p-3 text-xs shadow-xl backdrop-blur-xl">
      <p className="text-white/50 mb-1">{label}</p>
      <p className="text-white font-bold text-sm">{score}</p>
      <p className="text-white/60 mt-0.5">{bureau}</p>
    </div>
  );
}

// Factor dot ─────────────────────────────────────────────────────────────────

function impactDot(impact: CreditFactor['impact']): string {
  if (impact === 'positive') return 'bg-green-400';
  if (impact === 'negative') return 'bg-red-400';
  return 'bg-white/30';
}

function ImpactIcon({ impact }: { impact: CreditFactor['impact'] }) {
  if (impact === 'positive') return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
  if (impact === 'negative') return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
  return <Info className="w-3.5 h-3.5 text-white/30" />;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface AddEntryForm {
  score: string;
  bureau: CreditBureau | '';
  recordedAt: string;
  notes: string;
}

const EMPTY_FORM: AddEntryForm = {
  score:      '',
  bureau:     '',
  recordedAt: '',
  notes:      '',
};

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  score?: string;
  bureau?: string;
}

function validateForm(form: AddEntryForm): FormErrors {
  const errors: FormErrors = {};
  const n = Number(form.score);
  if (!form.score || isNaN(n) || n < 300 || n > 850) {
    errors.score = 'Enter a score between 300 and 850.';
  }
  if (!form.bureau) {
    errors.bureau = 'Select a credit bureau.';
  }
  return errors;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreditScoreTrackerProps {
  creditScoreHistory: CreditScoreEntry[];
  creditFactors:      CreditFactor[];
  onAddEntry:   (data: { score: number; bureau: CreditBureau; recordedAt?: string; notes?: string }) => void;
  onDeleteEntry: (entryId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreditScoreTracker({
  creditScoreHistory,
  creditFactors,
  onAddEntry,
  onDeleteEntry,
}: CreditScoreTrackerProps) {
  // ── Modal state ──────────────────────────────────────────────────────────
  const [modalOpen,    setModalOpen]    = useState(false);
  const [form,         setForm]         = useState<AddEntryForm>(EMPTY_FORM);
  const [formErrors,   setFormErrors]   = useState<FormErrors>({});
  const [submitting,   setSubmitting]   = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(false);

  const scoreInputId = useId();

  // ── Derived data (memoised) ──────────────────────────────────────────────
  /** Chronologically sorted history (newest first). */
  const sortedHistory = useMemo<CreditScoreEntry[]>(
    () =>
      [...creditScoreHistory].sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
      ),
    [creditScoreHistory],
  );

  const trend  = useMemo(() => computeCreditTrend(creditScoreHistory), [creditScoreHistory]);
  const rating = useMemo(
    () => (sortedHistory.length ? getCreditRating(trend.latestScore) : null),
    [sortedHistory.length, trend.latestScore],
  );
  const tips = useMemo(
    () => (sortedHistory.length ? getImprovementTips(trend.latestScore) : []),
    [sortedHistory.length, trend.latestScore],
  );

  /** Chart data: chronological order (oldest → newest). */
  const chartData = useMemo<ChartDataPoint[]>(
    () =>
      [...sortedHistory]
        .reverse()
        .map((e) => ({
          date:    fmtDate(e.recordedAt),
          rawDate: e.recordedAt,
          score:   e.score,
          bureau:  BUREAU_LABEL[e.bureau] ?? e.bureau,
        })),
    [sortedHistory],
  );

  /** Last 5 entries for the history table (newest first, already sorted). */
  const recentHistory = useMemo(() => sortedHistory.slice(0, 5), [sortedHistory]);

  const latestScore   = sortedHistory.length ? sortedHistory[0].score : null;
  const latestColor   = latestScore !== null ? scoreColor(latestScore) : '#ffffff40';
  const gaugePosition = latestScore !== null ? gaugePercent(latestScore) : null;

  // ── Handlers ────────────────────────────────────────────────────────────

  const openModal = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleFieldChange = useCallback(
    <K extends keyof AddEntryForm>(key: K, value: AddEntryForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      // Clear the error for the field being edited
      if (key in formErrors) {
        setFormErrors((prev) => { const next = { ...prev }; delete next[key as keyof FormErrors]; return next; });
      }
    },
    [formErrors],
  );

  const handleSubmit = useCallback(async () => {
    const errors = validateForm(form);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSubmitting(true);
    try {
      onAddEntry({
        score:       Number(form.score),
        bureau:      form.bureau as CreditBureau,
        recordedAt:  form.recordedAt || undefined,
        notes:       form.notes      || undefined,
      });
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  }, [form, onAddEntry]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Credit Score</h2>
            <p className="text-[11px] text-white/40">Track your credit health over time</p>
          </div>
        </div>
        <NeuralButton
          variant="primary"
          size="sm"
          themeColor="cyan"
          onClick={openModal}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Score
        </NeuralButton>
      </div>

      {creditScoreHistory.length === 0 ? (
        /* ── Empty state ────────────────────────────────────────────────── */
        <EmptyState
          title="No credit scores logged"
          description="Add your first credit score entry to start tracking your credit health over time."
          action={
            <NeuralButton variant="primary" size="sm" themeColor="cyan" onClick={openModal}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Log First Score
            </NeuralButton>
          }
        />
      ) : (
        <div className="space-y-4">

          {/* ── Hero score card + gauge ──────────────────────────────────── */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

              {/* Score display */}
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-1">
                    Credit Score
                  </p>
                  <motion.span
                    key={latestScore}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-6xl font-black tabular-nums leading-none"
                    style={{ color: latestColor }}
                  >
                    {latestScore ?? '--'}
                  </motion.span>
                </div>

                {/* Rating badge */}
                {rating && (
                  <div className="mb-1">
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                      style={{
                        color:            rating.color,
                        borderColor:      `${rating.color}40`,
                        backgroundColor:  `${rating.color}14`,
                      }}
                    >
                      {rating.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Trend indicator */}
              <div className="flex items-center gap-2">
                {trend.direction === 'up' && (
                  <div className="flex items-center gap-1.5 text-green-400">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-bold">+{trend.absoluteChange} pts</span>
                  </div>
                )}
                {trend.direction === 'down' && (
                  <div className="flex items-center gap-1.5 text-red-400">
                    <TrendingDown className="w-5 h-5" />
                    <span className="text-sm font-bold">−{trend.absoluteChange} pts</span>
                  </div>
                )}
                {trend.direction === 'stable' && (
                  <div className="flex items-center gap-1.5 text-white/40">
                    <Minus className="w-5 h-5" />
                    <span className="text-sm font-bold">No change</span>
                  </div>
                )}
                {trend.previousScore !== null && (
                  <span className="text-[11px] text-white/30">
                    vs {trend.previousScore} prev
                  </span>
                )}
              </div>
            </div>

            {/* Score gauge ─────────────────────────────────────────────── */}
            <div className="mt-5">
              {/* Tier labels */}
              <div className="flex justify-between text-[10px] text-white/30 mb-1.5 px-0.5">
                <span>Poor</span>
                <span>Fair</span>
                <span>Good</span>
                <span>Very Good</span>
                <span>Exceptional</span>
              </div>

              {/* Gradient bar */}
              <div className="relative h-3 rounded-full overflow-visible"
                   style={{
                     background:
                       'linear-gradient(to right, #ef4444 0%, #f97316 21.8%, #fbbf24 38.2%, #34d399 58.2%, #10b981 100%)',
                   }}
              >
                {/* Score marker */}
                {gaugePosition !== null && (
                  <motion.div
                    initial={{ left: '50%' }}
                    animate={{ left: `${gaugePosition}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4
                               rounded-full bg-white shadow-[0_0_0_3px_rgba(0,0,0,0.6)]
                               ring-2 ring-white/60 z-10"
                  />
                )}
              </div>

              {/* Range labels */}
              <div className="flex justify-between text-[10px] text-white/20 mt-1.5 px-0.5">
                <span>300</span>
                <span>580</span>
                <span>670</span>
                <span>740</span>
                <span>800</span>
                <span>850</span>
              </div>
            </div>
          </div>

          {/* ── History chart ────────────────────────────────────────────── */}
          {chartData.length > 1 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-4">
                Score History
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[SCORE_MIN, SCORE_MAX]}
                    tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {/* Tier boundary reference lines */}
                  <ReferenceLine
                    y={REF_FAIR_GOOD}
                    stroke="rgba(251,191,36,0.4)"
                    strokeDasharray="4 3"
                    label={{ value: '670', position: 'right', fontSize: 9, fill: 'rgba(251,191,36,0.5)' }}
                  />
                  <ReferenceLine
                    y={REF_GOOD_VGOOD}
                    stroke="rgba(52,211,153,0.4)"
                    strokeDasharray="4 3"
                    label={{ value: '740', position: 'right', fontSize: 9, fill: 'rgba(52,211,153,0.5)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#22d3ee', strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: '#22d3ee', strokeWidth: 2, stroke: '#fff' }}
                    isAnimationActive
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Credit factors ───────────────────────────────────────────── */}
          {creditFactors.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <p className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-3">
                Credit Factors
              </p>
              <ul className="space-y-2.5">
                {creditFactors.map((factor) => (
                  <li key={factor.name} className="flex items-start gap-3">
                    {/* Colored dot */}
                    <span
                      className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${impactDot(factor.impact)}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ImpactIcon impact={factor.impact} />
                        <span className="text-xs font-semibold text-white/80">{factor.name}</span>
                      </div>
                      <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
                        {factor.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Improvement tips ─────────────────────────────────────────── */}
          {tips.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setTipsExpanded((p) => !p)}
                className="w-full flex items-center justify-between group"
                aria-expanded={tipsExpanded}
              >
                <p className="text-[11px] uppercase tracking-[0.12em] text-white/40 group-hover:text-white/60 transition-colors">
                  Improvement Tips
                </p>
                <span className="text-white/30 group-hover:text-white/50 transition-colors text-xs">
                  {tipsExpanded ? '▲ hide' : '▼ show'}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {tipsExpanded && (
                  <motion.ul
                    key="tips"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 space-y-2 overflow-hidden"
                  >
                    {tips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-white/60 leading-relaxed">{tip}</span>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── History table ────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-3">
              Recent Entries
            </p>
            <div className="space-y-2">
              {recentHistory.map((entry) => {
                const entryColor = scoreColor(entry.score);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03]
                               border border-white/[0.06] px-3.5 py-2.5 group"
                  >
                    {/* Date */}
                    <span className="text-xs text-white/40 tabular-nums w-20 flex-shrink-0">
                      {fmtDate(entry.recordedAt)}
                    </span>

                    {/* Bureau badge */}
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full
                                     bg-white/[0.06] border border-white/10 text-white/50
                                     tracking-wide flex-shrink-0">
                      {BUREAU_LABEL[entry.bureau] ?? entry.bureau}
                    </span>

                    {/* Score */}
                    <span
                      className="text-sm font-bold tabular-nums ml-auto"
                      style={{ color: entryColor }}
                    >
                      {entry.score}
                    </span>

                    {/* Delete */}
                    <button
                      type="button"
                      aria-label={`Delete score entry from ${fmtDate(entry.recordedAt)}`}
                      onClick={() => onDeleteEntry(entry.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity
                                 p-1 rounded-lg hover:bg-red-500/10 text-red-400/60
                                 hover:text-red-400 focus-visible:opacity-100
                                 focus-visible:ring-2 focus-visible:ring-red-500/50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ── Add Score Modal ──────────────────────────────────────────────── */}
      <NeuralModal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Log Credit Score"
        subtitle="Record a new credit score check."
        themeColor="cyan"
        maxWidth="sm"
      >
        <div className="space-y-4 pt-1">

          {/* Score input */}
          <div>
            <NeuralInput
              id={scoreInputId}
              label="Credit Score (300 – 850)"
              type="number"
              value={form.score}
              onChange={(e) => handleFieldChange('score', e.target.value)}
              placeholder="e.g. 720"
            />
            {formErrors.score && (
              <p className="mt-1 text-[11px] text-red-400">{formErrors.score}</p>
            )}
          </div>

          {/* Bureau select */}
          <div>
            <p className="text-[11px] text-white/50 mb-1.5 font-medium">Credit Bureau</p>
            <NeuralSelectMenu
              value={form.bureau}
              options={BUREAU_OPTIONS}
              onChange={(val) => handleFieldChange('bureau', val as CreditBureau | '')}
              placeholder="Select bureau"
              ariaLabel="Credit Bureau"
            />
            {formErrors.bureau && (
              <p className="mt-1 text-[11px] text-red-400">{formErrors.bureau}</p>
            )}
          </div>

          {/* Date input */}
          <NeuralInput
            label="Date Recorded (optional)"
            type="date"
            value={form.recordedAt}
            onChange={(e) => handleFieldChange('recordedAt', e.target.value)}
            placeholder="YYYY-MM-DD"
          />

          {/* Notes input */}
          <NeuralInput
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            placeholder="e.g. After paying off car loan"
          />

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <NeuralButton
              variant="ghost"
              size="md"
              onClick={closeModal}
              className="flex-1"
            >
              Cancel
            </NeuralButton>
            <NeuralButton
              variant="primary"
              size="md"
              themeColor="cyan"
              loading={submitting}
              onClick={handleSubmit}
              className="flex-1"
            >
              Save Entry
            </NeuralButton>
          </div>

        </div>
      </NeuralModal>
    </div>
  );
}
