/**
 * WeeklyReviewModal
 *
 * A four-section modal that surfaces the Atlas predictive state, weekly energy
 * summary, top-3 pressure sources, burnout risk gauge, a capacity slider, and
 * a "Schedule Recovery Day" CTA that emits ATLAS_RECOVERY_SCHEDULED on the Spine.
 *
 * Uses NeuralModal (Radix Dialog + Framer Motion) — the same pattern used
 * across the codebase.
 */

import React, { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { Spine } from '@/lib/spine/spine-event-bus';
import { cn } from '@/lib/utils';
import type { GlobalProjection, EnergyWavePoint, ScheduledTask } from '@/lib/types';
import type { AtlasStateDisplay } from '../services/atlas-predictive-service';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  soul: GlobalProjection | null;
  energyWave: EnergyWavePoint[];
  scheduledTasks: ScheduledTask[];
  predictiveDisplay: AtlasStateDisplay;
  /** Called when user completes the review — persists snapshot to profile.reviews */
  onCompleteReview?: () => void;
}

export interface WeeklyReviewCardProps {
  soul: GlobalProjection | null;
  energyWave: EnergyWavePoint[];
  scheduledTasks: ScheduledTask[];
  predictiveDisplay: AtlasStateDisplay;
  weeklyReviewPending: boolean;
  onOpenReview: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute burnout risk 0–100 from weighted domain signals. */
function computeBurnoutRisk(soul: GlobalProjection | null): number {
  if (!soul) return 0;

  const nsv = soul.crossFunctionalState;
  const resilience = nsv.emotional?.emotionalResilience ?? nsv.emotionalResilience;
  const cnsFatigue = nsv.biological?.cnsFatigue ?? nsv.cnsFatigue;
  const financialFriction = nsv.resource?.financialFriction;

  // Each signal maps to a 0–100 sub-score, then weighted average
  const resScore =
    typeof resilience === 'number'
      ? Math.max(0, ((4 - resilience) / 4) * 100) // worse when resilience is lower
      : 0;

  const cnsScore =
    typeof cnsFatigue === 'number'
      ? Math.max(0, ((cnsFatigue - 4) / 6) * 100) // worse when fatigue is higher
      : 0;

  const finScore =
    typeof financialFriction === 'number'
      ? Math.max(0, ((financialFriction - 4) / 6) * 100)
      : 0;

  const weighted = 0.45 * resScore + 0.4 * cnsScore + 0.15 * finScore;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

/** Compute weekly capacity: sum of all energy-wave point energies. */
function computeWeeklyEnergy(wave: EnergyWavePoint[]): { planned: number; max: number } {
  const planned = wave.reduce((s, p) => s + p.energy, 0);
  const max = wave.length * 10;
  return { planned: Math.round(planned * 10) / 10, max };
}

/** How many tasks were completed vs total scheduled this week. */
function computeWeeklyCompletion(tasks: ScheduledTask[]): { done: number; total: number } {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = tasks.filter((t) => new Date(t.scheduledAt).getTime() >= weekAgo);
  const done = thisWeek.filter((t) => t.status === 'done').length;
  return { done, total: thisWeek.length };
}

interface PressureSource {
  label: string;
  value: number | null;
  max: number;
  /** Higher value = more pressure */
  inverted: boolean;
  colorClass: string;
}

function computePressureSources(soul: GlobalProjection | null): PressureSource[] {
  if (!soul) return [];
  const nsv = soul.crossFunctionalState;
  return [
    {
      label: 'Planning Load',
      value: nsv.cognitive?.planningLoad ?? null,
      max: 10,
      inverted: false,
      colorClass: 'bg-amber-400',
    },
    {
      label: 'Deadline Pressure',
      value: nsv.planning?.deadlinePressure ?? null,
      max: 10,
      inverted: false,
      colorClass: 'bg-orange-500',
    },
    {
      label: 'Stress Load',
      value: nsv.emotional?.stressLoad ?? null,
      max: 10,
      inverted: false,
      colorClass: 'bg-rose-500',
    },
  ];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StateBadge({ display }: { display: AtlasStateDisplay }) {
  const bgMap: Record<string, string> = {
    Normal: 'bg-[var(--module-accent-glow)] border-[var(--module-accent-border)] text-[var(--module-color-400)]',
    Compressed: 'bg-amber-400/15 border-amber-400/40 text-amber-400',
    Overloaded: 'bg-orange-500/15 border-orange-500/40 text-orange-400',
    Recovery: 'bg-rose-600/15 border-rose-600/40 text-rose-400',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-black uppercase tracking-widest',
        bgMap[display.state] ?? 'bg-white/5 border-white/10 text-white/50'
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: display.hex }}
        aria-hidden="true"
      />
      {display.label}
    </span>
  );
}

function BurnoutGauge({ risk }: { risk: number }) {
  const color =
    risk >= 70 ? '#e11d48' : risk >= 40 ? '#f97316' : risk >= 20 ? '#fbbf24' : '#22d3ee';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-white/50 uppercase tracking-widest">
          Burnout Risk
        </span>
        <span className="text-sm font-black" style={{ color }}>
          {risk}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${risk}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] text-white/30 leading-relaxed">
        {risk >= 70
          ? 'High risk — consider scheduling a recovery day.'
          : risk >= 40
            ? 'Moderate risk — monitor closely.'
            : 'Low risk — maintaining a healthy baseline.'}
      </p>
    </div>
  );
}

function PressureBar({ source }: { source: PressureSource }) {
  if (source.value === null) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-28 text-xs text-white/40 truncate">{source.label}</span>
        <span className="text-xs text-white/20 italic">—</span>
      </div>
    );
  }

  const pct = Math.min(100, (source.value / source.max) * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/60">{source.label}</span>
        <span className="text-xs font-bold text-white/70">
          {source.value}/{source.max}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', source.colorClass)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

// ─── Main Components ──────────────────────────────────────────────────────────

export function WeeklyReviewCard({
  soul,
  energyWave,
  scheduledTasks,
  predictiveDisplay,
  weeklyReviewPending,
  onOpenReview,
}: WeeklyReviewCardProps) {
  const burnoutRisk = useMemo(() => computeBurnoutRisk(soul), [soul]);
  const weekly = useMemo(() => computeWeeklyEnergy(energyWave), [energyWave]);
  const completion = useMemo(() => computeWeeklyCompletion(scheduledTasks), [scheduledTasks]);

  const completionPct =
    completion.total > 0
      ? Math.round((completion.done / completion.total) * 100)
      : null;

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-4 rounded-2xl border bg-white/[0.02] p-4 transition-all duration-300',
        weeklyReviewPending
          ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
          : 'border-white/10 hover:border-white/20'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[var(--module-color-400)]" />
          <h3 className="text-xs font-black text-white/90 uppercase tracking-widest">
            Weekly Review
          </h3>
        </div>
        {weeklyReviewPending && (
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        )}
      </div>

      <div className="space-y-4">
        {/* Burnout Risk */}
        <BurnoutGauge risk={burnoutRisk} />

        {/* Capacity Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Capacity</p>
            <p className="text-sm font-black text-white/80">
              {weekly.planned}<span className="text-[10px] text-white/30 ml-0.5">/{weekly.max}</span>
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Done</p>
            <p className="text-sm font-black text-emerald-400">
              {completion.done}<span className="text-[10px] text-white/30 ml-0.5">/{completion.total}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-2">
        <NeuralButton
          onClick={onOpenReview}
          themeColor="module"
          variant="outline"
          className={cn(
            "w-full text-[10px] font-black uppercase tracking-[0.2em] h-10",
            weeklyReviewPending && "border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
          )}
        >
          {weeklyReviewPending ? 'Run Review' : 'View Full Review'}
        </NeuralButton>
      </div>

      {weeklyReviewPending && (
        <p className="text-[9px] text-amber-400/70 text-center font-medium">
          New predictive data available. Run review now.
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WeeklyReviewModal({
  isOpen,
  onClose,
  soul,
  energyWave,
  scheduledTasks,
  predictiveDisplay,
  onCompleteReview,
}: WeeklyReviewModalProps) {
  const [capacityPct, setCapacityPct] = useState(100);
  const [recoveryScheduled, setRecoveryScheduled] = useState(false);

  const burnoutRisk = useMemo(() => computeBurnoutRisk(soul), [soul]);
  const weekly = useMemo(() => computeWeeklyEnergy(energyWave), [energyWave]);
  const completion = useMemo(() => computeWeeklyCompletion(scheduledTasks), [scheduledTasks]);
  const pressureSources = useMemo(() => computePressureSources(soul), [soul]);

  const weekLabel = useMemo(() => {
    const d = new Date();
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (x: Date) =>
      x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, []);

  const handleScheduleRecovery = () => {
    Spine.emit({
      type: 'ATLAS_RECOVERY_SCHEDULED',
      source: 'atlas-weekly-review-modal',
      domain: 'C',
      priority: 'info',
      target: 'atlas',
      data: {
        reason: 'user_requested_recovery_day',
        capacityPct,
        weekLabel,
        burnoutRisk,
      },
    });
    setRecoveryScheduled(true);
  };

  const completionPct =
    completion.total > 0
      ? Math.round((completion.done / completion.total) * 100)
      : null;

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={() => {
        setRecoveryScheduled(false);
        onClose();
      }}
      title="Weekly Review"
      subtitle={weekLabel}
      icon={CalendarDays}
      themeColor="module"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* ── Atlas State ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">
            Current State
          </h3>
          <div className="flex items-start gap-3">
            <StateBadge display={predictiveDisplay} />
            <p className="text-xs text-white/40 leading-relaxed flex-1">
              {predictiveDisplay.description}
            </p>
          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Energy Summary ──────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">
            Weekly Energy Summary
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-1">
              <p className="text-[10px] text-white/30 uppercase tracking-widest">
                Planned Capacity
              </p>
              <p className="text-xl font-black text-[var(--module-color-400)]">
                {weekly.planned}
                <span className="text-xs text-white/30 ml-1">/ {weekly.max}</span>
              </p>
              <p className="text-[10px] text-white/20">
                {weekly.max > 0
                  ? `${Math.round((weekly.planned / weekly.max) * 100)}% of max`
                  : '—'}
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-1">
              <p className="text-[10px] text-white/30 uppercase tracking-widest">
                Tasks Completed
              </p>
              <p className="text-xl font-black text-emerald-400">
                {completion.done}
                <span className="text-xs text-white/30 ml-1">/ {completion.total}</span>
              </p>
              <p className="text-[10px] text-white/20">
                {completionPct !== null ? `${completionPct}% completion` : 'No tasks scheduled'}
              </p>
            </div>
          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Top 3 Pressure Sources ──────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">
            Top Pressure Sources
          </h3>
          <div className="space-y-3">
            {pressureSources.map((src) => (
              <PressureBar key={src.label} source={src} />
            ))}
          </div>
        </section>

        <div className="border-t border-white/5" />

        {/* ── Burnout Risk ─────────────────────────────────────────────── */}
        <section>
          <BurnoutGauge risk={burnoutRisk} />
        </section>

        <div className="border-t border-white/5" />

        {/* ── Next Week Capacity Slider ────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">
              Next Week's Capacity
            </h3>
            <span className="text-sm font-black text-[var(--module-color-400)]">{capacityPct}%</span>
          </div>
          <input
            type="range"
            min={60}
            max={120}
            step={5}
            value={capacityPct}
            onChange={(e) => setCapacityPct(Number(e.target.value))}
            aria-label="Adjust next week's capacity percentage"
            aria-valuemin={60}
            aria-valuemax={120}
            aria-valuenow={capacityPct}
            className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-[var(--module-color-400)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
          />
          <div className="flex justify-between text-[10px] text-white/20">
            <span>60% (Recovery)</span>
            <span>100% (Baseline)</span>
            <span>120% (Surge)</span>
          </div>
          {capacityPct < 80 && (
            <p className="text-[10px] text-amber-400/70 leading-relaxed">
              ⚠ Reduced capacity selected. Atlas will soft-compress high-load tasks for
              next week.
            </p>
          )}
        </section>

        <div className="border-t border-white/5" />

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="space-y-3">
          {onCompleteReview && (
            <NeuralButton
              onClick={() => {
                onCompleteReview();
                onClose();
              }}
              themeColor="module"
              className="w-full text-sm font-black uppercase tracking-widest h-12"
            >
              Complete review & save
            </NeuralButton>
          )}
          {recoveryScheduled ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
              <p className="text-sm font-black text-emerald-400">
                ✓ Recovery day scheduled
              </p>
              <p className="text-[10px] text-white/30 mt-1">
                Atlas will protect this window from new commitments.
              </p>
            </div>
          ) : (
            <NeuralButton
              onClick={handleScheduleRecovery}
              variant="danger"
              className="w-full text-sm font-black uppercase tracking-widest h-12"
            >
              Schedule Recovery Day
            </NeuralButton>
          )}
        </section>
      </div>
    </NeuralModal>
  );
}
