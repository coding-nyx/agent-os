import { useState } from 'react';
import {
  Camera,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NeuralButton } from '@/core/components/NeuralButton';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import type { Account, DebtItem, NetWorthSnapshot } from '../services/ledger-intake-service';
import {
  computeCurrentNetWorth,
  computeNetWorthTrend,
} from '../services/aggregation/networth-aggregation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NetWorthDashboardProps {
  accounts: Account[];
  debtItems: DebtItem[];
  netWorthHistory: NetWorthSnapshot[];
  currency?: string;
  onRecordSnapshot: (note?: string) => void;
  disabled?: boolean;
}

interface ChartDatum {
  date: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  value: number;
  dataKey: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  currency?: string;
}

function CustomChartTooltip({ active, payload, label, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const value: number = entry?.value ?? 0;
  const isPositive = value >= 0;

  return (
    <div className="bg-slate-900/90 border border-white/[0.12] rounded-xl p-3 text-xs shadow-xl backdrop-blur-xl">
      <p className="text-white/40 mb-1.5 font-medium">{label}</p>
      <p
        className="font-bold text-sm"
        style={{ color: isPositive ? '#10b981' : '#f43f5e' }}
      >
        {formatCurrency(value, currency)}
      </p>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  amount: number;
  currency: string;
  accentColor: string;
  dotColor: string;
}

function StatCard({ label, amount, currency, accentColor, dotColor }: StatCardProps) {
  return (
    <SurfaceCard className="flex-1 min-w-0 p-4 bg-white/[0.045] border border-white/10 rounded-2xl">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <span
          className="text-[11px] font-bold uppercase tracking-[0.25em]"
          style={{ color: accentColor }}
        >
          {label}
        </span>
      </div>
      <p className="text-xl font-black text-white truncate">
        {formatCurrency(amount, currency)}
      </p>
    </SurfaceCard>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onRecordSnapshot: () => void;
  disabled?: boolean;
}

function EmptyState({ onRecordSnapshot, disabled }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center"
        style={{ backgroundColor: 'rgba(6,182,212,0.15)' }}
      >
        <TrendingUp size={26} style={{ color: '#06b6d4' }} />
      </div>
      <div>
        <p className="text-white font-semibold mb-1">No net worth history yet</p>
        <p className="text-white/40 text-sm max-w-xs leading-relaxed">
          Record your first snapshot to start tracking your progress over time.
        </p>
      </div>
      <NeuralButton
        size="sm"
        disabled={disabled}
        onClick={onRecordSnapshot}
        style={{ '--module-accent': '#06b6d4' } as React.CSSProperties}
      >
        <Camera size={14} className="mr-1.5" />
        Record Snapshot
      </NeuralButton>
    </div>
  );
}

// ─── Snapshot note modal (inline) ─────────────────────────────────────────────

interface SnapshotFormProps {
  onConfirm: (note?: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

function SnapshotForm({ onConfirm, onCancel, disabled }: SnapshotFormProps) {
  const [note, setNote] = useState('');

  function handleConfirm() {
    onConfirm(note.trim() || undefined);
  }

  return (
    <div className="mt-3 p-4 bg-white/[0.045] border border-white/10 rounded-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <p className="text-[11px] uppercase tracking-[0.25em] font-bold text-white/40">
        Add a note (optional)
      </p>
      <textarea
        className="w-full bg-white/[0.045] border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 p-3 resize-none focus:outline-none focus:border-[#06b6d4]/60 transition-colors"
        rows={2}
        placeholder="e.g. After year-end bonus…"
        value={note}
        onChange={e => setNote(e.target.value)}
        maxLength={200}
      />
      <div className="flex gap-2 justify-end">
        <NeuralButton
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancel
        </NeuralButton>
        <NeuralButton
          size="sm"
          disabled={disabled}
          onClick={handleConfirm}
          style={{ '--module-accent': '#06b6d4' } as React.CSSProperties}
        >
          Confirm
        </NeuralButton>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NetWorthDashboard({
  accounts,
  debtItems,
  netWorthHistory,
  currency = 'USD',
  onRecordSnapshot,
  disabled = false,
}: NetWorthDashboardProps) {
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────────

  const { netWorth, assets: totalAssets, liabilities: totalLiabilities } = computeCurrentNetWorth(accounts, debtItems);

  const { percentChange: percentageChange, direction } = computeNetWorthTrend(netWorthHistory);

  const isPositive = netWorth >= 0;

  // ── Chart data prep ─────────────────────────────────────────────────────────

  const chartData: ChartDatum[] = netWorthHistory
    .slice(-24)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(s => ({
      date: new Date(s.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      netWorth: s.netWorth,
      assets: s.assets,
      liabilities: s.liabilities,
    }));

  const hasHistory = netWorthHistory.length > 0;

  // ── Trend indicator ─────────────────────────────────────────────────────────

  const TrendIcon =
    direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

  const trendColor =
    direction === 'up' ? '#10b981' : direction === 'down' ? '#f43f5e' : '#6b7280';

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSnapshotConfirm(note?: string) {
    setShowSnapshotForm(false);
    onRecordSnapshot(note);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col gap-5"
      style={{ '--module-accent': '#06b6d4' } as React.CSSProperties}
    >
      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <SurfaceCard className="p-5 bg-white/[0.045] border border-white/10 rounded-2xl">
        <div className="flex items-start justify-between gap-4">
          {/* Left: label + value + trend */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/40">
              Net Worth
            </span>

            <p
              className="text-4xl font-black leading-none tracking-tight truncate"
              style={{ color: isPositive ? '#06b6d4' : '#f43f5e' }}
            >
              {formatCurrency(netWorth, currency)}
            </p>

            {/* Trend badge */}
            {percentageChange !== null && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <TrendIcon size={13} style={{ color: trendColor }} />
                <span className="text-xs font-semibold" style={{ color: trendColor }}>
                  {direction === 'up' ? '+' : direction === 'down' ? '' : ''}
                  {Math.abs(percentageChange).toFixed(1)}%
                </span>
                <span className="text-[11px] text-white/30">vs last snapshot</span>
              </div>
            )}
          </div>

          {/* Right: Record Snapshot button */}
          <NeuralButton
            size="sm"
            disabled={disabled}
            onClick={() => setShowSnapshotForm(prev => !prev)}
            style={{ '--module-accent': '#06b6d4' } as React.CSSProperties}
            className="flex-shrink-0"
          >
            <Camera size={14} className="mr-1.5" />
            Record Snapshot
          </NeuralButton>
        </div>

        {/* Inline snapshot form */}
        {showSnapshotForm && (
          <SnapshotForm
            onConfirm={handleSnapshotConfirm}
            onCancel={() => setShowSnapshotForm(false)}
            disabled={disabled}
          />
        )}
      </SurfaceCard>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <StatCard
          label="Total Assets"
          amount={totalAssets}
          currency={currency}
          accentColor="#10b981"
          dotColor="#10b981"
        />
        <StatCard
          label="Total Liabilities"
          amount={totalLiabilities}
          currency={currency}
          accentColor="#f43f5e"
          dotColor="#f43f5e"
        />
      </div>

      {/* ── Chart / Empty state ───────────────────────────────────────────── */}
      <SurfaceCard className="p-5 bg-white/[0.045] border border-white/10 rounded-2xl">
        {hasHistory ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/40 mb-4">
              Net Worth Over Time
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={chartData}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  dy={6}
                />
                <YAxis
                  tickFormatter={formatCompact}
                  tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  content={<CustomChartTooltip currency={currency} />}
                  cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                />
                <ReferenceLine
                  y={0}
                  stroke="rgba(255,255,255,0.2)"
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#06b6d4', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#06b6d4', stroke: 'rgba(6,182,212,0.3)', strokeWidth: 4 }}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        ) : (
          <EmptyState
            onRecordSnapshot={() => setShowSnapshotForm(true)}
            disabled={disabled}
          />
        )}
      </SurfaceCard>
    </div>
  );
}
