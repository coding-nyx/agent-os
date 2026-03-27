import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ArrowRight, Shield, Sparkles, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { Spine } from '@/lib/spine/spine-event-bus';
import { cn } from '@/lib/utils';
import type {
  AtlasCapacityBlueprint,
  AtlasProfile,
  AtlasReviewAction,
  AtlasReviewBlueprint,
  GlobalProjection,
  AtlasTask,
} from '@/lib/types';
import {
  AtlasBlueprintService,
  projectAtlasCapacityBlueprint,
} from '../services/atlas-blueprint-service';
import type { AtlasStateDisplay } from '../services/atlas-predictive-service';

interface WeeklyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: AtlasProfile | null;
  soul: GlobalProjection | null;
  predictiveDisplay: AtlasStateDisplay;
  onCompleteReview?: (blueprint?: AtlasReviewBlueprint) => void;
  tasks?: AtlasTask[];
}

export interface WeeklyReviewCardProps {
  profile: AtlasProfile | null;
  soul: GlobalProjection | null;
  energyWave: AtlasProfile['energyWave'];
  scheduledTasks: AtlasProfile['scheduledTasks'];
  predictiveDisplay: AtlasStateDisplay;
  weeklyReviewPending: boolean;
  onOpenReview: () => void;
}

function computeBurnoutRisk(soul: GlobalProjection | null): number {
  if (!soul) return 0;

  const nsv = soul.crossFunctionalState;
  const resilience = nsv.emotional?.emotionalResilience ?? nsv.emotionalResilience;
  const cnsFatigue = nsv.biological?.cnsFatigue ?? nsv.cnsFatigue;
  const financialFriction = nsv.resource?.financialFriction;

  const resScore = typeof resilience === 'number' ? Math.max(0, ((4 - resilience) / 4) * 100) : 0;
  const cnsScore = typeof cnsFatigue === 'number' ? Math.max(0, ((cnsFatigue - 4) / 6) * 100) : 0;
  const finScore = typeof financialFriction === 'number' ? Math.max(0, ((financialFriction - 4) / 6) * 100) : 0;

  return Math.min(100, Math.max(0, Math.round(0.45 * resScore + 0.4 * cnsScore + 0.15 * finScore)));
}

function computeWeeklyCompletion(tasks: AtlasProfile['scheduledTasks']): { done: number; total: number } {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = tasks.filter((task) => new Date(task.scheduledAt).getTime() >= weekAgo);
  return {
    done: thisWeek.filter((task) => task.status === 'done').length,
    total: thisWeek.length,
  };
}

function stateTone(state: AtlasCapacityBlueprint['state']): string {
  switch (state) {
    case 'recover':
      return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    case 'compress':
      return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
    case 'expand':
      return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
    default:
      return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
  }
}

function ActionRow({ action }: { action: AtlasReviewAction }) {
  const accent =
    action.emphasis === 'protect'
      ? 'border-rose-500/20 bg-rose-500/5'
      : action.emphasis === 'focus'
        ? 'border-sky-500/20 bg-sky-500/5'
        : 'border-emerald-500/20 bg-emerald-500/5';

  return (
    <div className={cn('rounded-xl border p-3 space-y-1', accent)}>
      <div className="flex items-center gap-2">
        <ArrowRight className="w-3.5 h-3.5 text-white/50" />
        <p className="text-xs font-black text-white/85">{action.title}</p>
      </div>
      <p className="text-[11px] leading-relaxed text-white/45">{action.detail}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accentClass = 'text-white/90',
}: {
  label: string;
  value: string;
  hint: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] p-4 space-y-1">
      <p className="text-[11px] text-white/30 uppercase tracking-widest">{label}</p>
      <p className={cn('text-xl font-black', accentClass)}>{value}</p>
      <p className="text-[11px] text-white/25 leading-relaxed">{hint}</p>
    </div>
  );
}

function VectorBar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const pct = Math.round((invert ? 10 - value : value) * 10);
  const barClass = invert ? 'bg-rose-400' : 'bg-[var(--module-color-400)]';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/55">{label}</span>
        <span className="font-bold text-white/75">{value.toFixed(1)}/10</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.045] overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', barClass)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export function WeeklyReviewCard({
  profile,
  soul,
  energyWave,
  scheduledTasks,
  predictiveDisplay,
  weeklyReviewPending,
  onOpenReview,
}: WeeklyReviewCardProps) {
  const blueprint = useMemo(
    () => AtlasBlueprintService.computeReviewBlueprint({ profile, soul }),
    [profile, soul],
  );
  const burnoutRisk = useMemo(() => computeBurnoutRisk(soul), [soul]);
  const completion = useMemo(() => computeWeeklyCompletion(scheduledTasks), [scheduledTasks]);
  const energyPlanned = useMemo(
    () => Math.round(energyWave.reduce((sum, point) => sum + point.energy, 0) * 10) / 10,
    [energyWave],
  );

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-4 rounded-2xl border bg-white/[0.045] p-4 transition-all duration-300',
        weeklyReviewPending
          ? 'border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]'
          : 'border-white/[0.12] hover:border-white/20',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[var(--module-color-400)]" />
          <h3 className="text-xs font-black text-white/90 uppercase tracking-widest">Weekly Review</h3>
        </div>
        <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.2em]', stateTone(blueprint.capacity.state))}>
          {blueprint.capacity.state}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Safe Capacity"
          value={`${blueprint.capacity.safeCapacity}`}
          hint={`${blueprint.capacity.recommendedCapacityPct}% of ${blueprint.capacity.baselineCapacity}`}
          accentClass="text-[var(--module-color-400)]"
        />
        <MetricCard
          label="Planned Demand"
          value={`${blueprint.capacity.plannedDemand}`}
          hint={blueprint.capacity.headroom >= 0 ? `${blueprint.capacity.headroom} headroom left` : `${Math.abs(blueprint.capacity.headroom)} overloaded`}
          accentClass={blueprint.capacity.headroom >= 0 ? 'text-emerald-400' : 'text-rose-400'}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2">
          <p className="text-[11px] uppercase tracking-widest text-white/25">State</p>
          <p className={cn('mt-1 text-xs font-black', predictiveDisplay.color)}>{predictiveDisplay.label}</p>
        </div>
        <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2">
          <p className="text-[11px] uppercase tracking-widest text-white/25">Risk</p>
          <p className="mt-1 text-xs font-black text-amber-300">{burnoutRisk}%</p>
        </div>
        <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2">
          <p className="text-[11px] uppercase tracking-widest text-white/25">Done</p>
          <p className="mt-1 text-xs font-black text-emerald-400">{completion.done}/{completion.total || 0}</p>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-white/40">
        {blueprint.projection.summary} Atlas currently sees {energyPlanned} planned energy points in the visible wave.
      </p>

      <NeuralButton
        onClick={onOpenReview}
        themeColor="module"
        variant="outline"
        className={cn(
          'w-full text-[11px] font-black uppercase tracking-[0.2em] h-10',
          weeklyReviewPending && 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10',
        )}
      >
        {weeklyReviewPending ? 'Run Review' : 'View Full Review'}
      </NeuralButton>
    </div>
  );
}

export function WeeklyReviewModal({
  isOpen,
  onClose,
  profile,
  soul,
  predictiveDisplay,
  onCompleteReview,
  tasks = [],
}: WeeklyReviewModalProps) {
  const [capacityPct, setCapacityPct] = useState(100);
  const [recoveryScheduled, setRecoveryScheduled] = useState(false);

  const blueprint = useMemo(
    () => AtlasBlueprintService.computeReviewBlueprint({ profile, soul }),
    [profile, soul],
  );
  const burnoutRisk = useMemo(() => computeBurnoutRisk(soul), [soul]);
  const completion = useMemo(() => computeWeeklyCompletion(profile?.scheduledTasks ?? []), [profile?.scheduledTasks]);
  const projection = useMemo(
    () => projectAtlasCapacityBlueprint(blueprint.capacity, capacityPct),
    [blueprint.capacity, capacityPct],
  );

  useEffect(() => {
    setCapacityPct(blueprint.capacity.recommendedCapacityPct);
  }, [blueprint.capacity.recommendedCapacityPct, isOpen]);

  const weekLabel = useMemo(() => {
    const date = new Date();
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const format = (value: Date) => value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${format(start)} – ${format(end)}`;
  }, []);

  const adjustedBlueprint = useMemo<AtlasReviewBlueprint>(() => ({
    ...blueprint,
    capacity: {
      ...blueprint.capacity,
      recommendedCapacityPct: capacityPct,
      safeCapacity: projection.capacity,
      headroom: projection.headroom,
      state:
        capacityPct <= 72
          ? 'recover'
          : capacityPct < 92
            ? 'compress'
            : capacityPct >= 108
              ? 'expand'
              : 'hold',
    },
    projection: {
      ...blueprint.projection,
      projectedCapacity: projection.capacity,
      projectedHeadroom: projection.headroom,
      summary: projection.summary,
    },
  }), [blueprint, capacityPct, projection]);

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
        blueprint: adjustedBlueprint,
      },
    });
    setRecoveryScheduled(true);
  };

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
        <section className="grid gap-3 sm:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Projection</p>
                <h3 className="mt-1 text-lg font-black text-white/90">Next week blueprint</h3>
              </div>
              <span className={cn('rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em]', stateTone(adjustedBlueprint.capacity.state))}>
                {adjustedBlueprint.capacity.state}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/55">{adjustedBlueprint.projection.summary}</p>
            <div className="rounded-xl border border-white/[0.09] bg-white/[0.045] p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--module-color-400)]" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/35">Focus for next period</span>
              </div>
              <p className="mt-2 text-sm font-bold text-white/85">{adjustedBlueprint.projection.nextPeriodFocus}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30">Current state</p>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cn('text-sm font-black', predictiveDisplay.color)}>{predictiveDisplay.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/40">{predictiveDisplay.description}</p>
              </div>
              <Shield className="w-4 h-4 text-white/25 shrink-0" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Burnout risk" value={`${burnoutRisk}%`} hint="Derived from resilience, fatigue, and friction" accentClass="text-amber-300" />
              <MetricCard
                label="Completion"
                value={`${completion.done}/${completion.total || 0}`}
                hint={completion.total > 0 ? `${Math.round((completion.done / completion.total) * 100)}% completed` : 'No scheduled tasks this week'}
                accentClass="text-emerald-400"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Baseline capacity" value={`${blueprint.capacity.baselineCapacity}`} hint="Current visible energy wave total" accentClass="text-white/90" />
          <MetricCard label="Safe capacity" value={`${adjustedBlueprint.capacity.safeCapacity}`} hint={`${capacityPct}% operating budget`} accentClass="text-[var(--module-color-400)]" />
          <MetricCard label="Demand" value={`${blueprint.capacity.plannedDemand}`} hint={`Load ratio ${blueprint.capacity.loadRatio}x`} accentClass="text-white/90" />
          <MetricCard
            label="Headroom"
            value={`${adjustedBlueprint.capacity.headroom}`}
            hint={adjustedBlueprint.capacity.headroom >= 0 ? 'Available for interruptions or deep work' : 'Overbooked unless scope is reduced'}
            accentClass={adjustedBlueprint.capacity.headroom >= 0 ? 'text-emerald-400' : 'text-rose-400'}
          />
        </section>

        <section className="rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em]">Blueprint vectors</h3>
            <span className="text-[11px] text-white/25">Grounded in vitality, friction, resilience, and alignment</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <VectorBar label="Vitality" value={blueprint.capacity.vectors.vitality} />
            <VectorBar label="Friction" value={blueprint.capacity.vectors.friction} invert />
            <VectorBar label="Resilience" value={blueprint.capacity.vectors.resilience} />
            <VectorBar label="Spec alignment" value={blueprint.capacity.vectors.specAlignment} />
          </div>
          {blueprint.capacity.pressurePoints.length > 0 && (
            <div className="space-y-2 pt-1">
              {blueprint.capacity.pressurePoints.map((point) => (
                <p key={point} className="text-[11px] leading-relaxed text-white/45">• {point}</p>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/[0.12] bg-white/[0.045] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em]">Projection control</h3>
            <span className="text-sm font-black text-[var(--module-color-400)]">{capacityPct}%</span>
          </div>
          <input
            type="range"
            min={60}
            max={120}
            step={5}
            value={capacityPct}
            onChange={(event) => setCapacityPct(Number(event.target.value))}
            aria-label="Adjust next week's capacity percentage"
            className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-[var(--module-color-400)] cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-white/20">
            <span>60% recovery</span>
            <span>{blueprint.capacity.recommendedCapacityPct}% recommended</span>
            <span>120% surge</span>
          </div>
          <p className="text-[11px] leading-relaxed text-white/45">{projection.summary}</p>
          {projection.overflowTasks > 0 && (
            <p className="text-[11px] text-amber-300">
              Atlas expects you to defer roughly {projection.overflowTasks} high-energy task(s) at this setting.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em]">Recommended actions</h3>
          <div className="grid gap-3">
            {blueprint.projection.recommendedActions.map((action) => (
              <ActionRow key={action.id} action={action} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          {onCompleteReview && (<NeuralButton
              onClick={() => {
                onCompleteReview(adjustedBlueprint);
                onClose();
              }}
              themeColor="module"
              className="w-full text-sm font-black uppercase tracking-widest h-12"
            >
              Complete review & save blueprint
            </NeuralButton>
          )}

          {recoveryScheduled ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
              <p className="text-sm font-black text-emerald-400">✓ Recovery day scheduled</p>
              <p className="text-[11px] text-white/30 mt-1">Atlas will protect this window from new commitments.</p>
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

        {/* ── Plan Next Week ── */}
        {(() => {
          const overdueTasks = tasks.filter(t =>
            t.deadline &&
            t.status !== 'done' &&
            new Date(t.deadline).getTime() < Date.now()
          ).sort((a, b) => a.priority - b.priority);
          return (
            <div className="mt-6 rounded-xl border border-white/[0.12] bg-white/[0.045] p-4">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-[var(--module-color-400)]" />
                Plan Next Week
              </h3>
              <p className="text-xs text-white/50 mb-3 leading-relaxed">
                Based on this week's review, these items are recommended for next week:
              </p>
              {overdueTasks.length > 0 ? (
                <ul className="space-y-2 mb-3">
                  {overdueTasks.slice(0, 5).map(task => (
                    <li key={task.id} className="flex items-center gap-2 text-xs text-white/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="truncate">{task.title}</span>
                      <span className="ml-auto text-[11px] text-white/30 shrink-0">P{task.priority}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-white/30 italic mb-3">No overdue tasks — great week!</p>
              )}
              <p className="text-[11px] text-white/30">
                Use Atlas to schedule these when planning next week's energy blocks.
              </p>
            </div>
          );
        })()}
      </div>
    </NeuralModal>
  );
}
