import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, AlertTriangle, Clock, Zap, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import type { AtlasProfile, AtlasHabit } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// EnergyBudgetBar — visual depletion gauge
// ---------------------------------------------------------------------------

interface EnergyBudgetBarProps {
  budget: number | null | undefined;
  max?: number;
}

function EnergyBudgetBar({ budget, max = 10 }: EnergyBudgetBarProps) {
  const value = typeof budget === 'number' ? budget : 0;
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));

  const barColor =
    value >= 6 ? 'bg-emerald-400' :
    value >= 3 ? 'bg-amber-400' :
    'bg-rose-400';

  const labelColor =
    value >= 6 ? 'text-emerald-300' :
    value >= 3 ? 'text-amber-300' :
    'text-rose-300';

  return (
    <div
      role="meter"
      aria-label="Energy remaining"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
          Energy remaining
        </span>
        <span className={cn('text-sm font-bold tabular-nums font-display', labelColor)}>
          {typeof budget === 'number' ? `${budget.toFixed(1)}` : '—'}/{max}
        </span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', barColor)}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskItem — single task in the plan
// ---------------------------------------------------------------------------

interface TaskItemProps {
  title: string;
  energyCost: number;
  status: string;
  blockedReason?: string;
  blockedSource?: string;
  onAskModule?: () => void;
}

// ⚡ Bolt Optimization: Memoized TaskItem to prevent O(N) re-renders
// when the parent TodaysPlanCard updates non-task related state (e.g. energy budget).
const TaskItem = React.memo(function TaskItem({ title, energyCost, status, blockedReason, blockedSource, onAskModule }: TaskItemProps) {
  const isBlocked = status === 'blocked';
  const isDone = status === 'done' || status === 'complete';

  const StatusIcon = isDone
    ? CheckCircle2
    : isBlocked
    ? AlertTriangle
    : Circle;

  const statusColor = isDone
    ? 'text-emerald-400'
    : isBlocked
    ? 'text-amber-400'
    : 'text-white/40';

  return (
    <div className={cn(
      'rounded-xl border p-3 space-y-2 transition-colors',
      isBlocked ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/5 bg-white/[0.02]'
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={cn('w-4 h-4 shrink-0', statusColor)} aria-hidden="true" />
          <span className={cn(
            'text-sm font-bold truncate',
            isDone ? 'text-white/50 line-through' : 'text-white/80'
          )}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Zap className="w-3 h-3 text-sky-400" aria-hidden="true" />
          <span className="text-[10px] font-black text-sky-300 tabular-nums">{energyCost}</span>
        </div>
      </div>

      {isBlocked && blockedReason && (
        <div className="ml-6 space-y-2">
          <p className="text-[11px] text-amber-200/70 leading-relaxed">
            {blockedSource && (
              <span className="font-bold text-amber-300">{blockedSource}: </span>
            )}
            {blockedReason}
          </p>
          {onAskModule && (
            <button
              onClick={onAskModule}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              Ask {blockedSource || 'Module'}
            </button>
          )}
        </div>
      )}

      {isDone && (
        <span className="ml-6 text-[9px] uppercase tracking-[0.2em] text-emerald-400/70 font-bold">
          Complete
        </span>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// HabitStreakRow — single habit streak
// ---------------------------------------------------------------------------

interface HabitStreakProps {
  name: string;
  emoji: string;
  days: number;
  atRisk?: boolean;
  lastLogHoursAgo?: number;
}

// ⚡ Bolt Optimization: Memoized HabitStreakRow to prevent unnecessary re-renders
// during parent state updates, ensuring smooth list performance.
const HabitStreakRow = React.memo(function HabitStreakRow({ name, emoji, days, atRisk, lastLogHoursAgo }: HabitStreakProps) {
  return (
    <div
      className="flex items-center gap-3"
      role="status"
      aria-label={`${name} streak: ${days} days${atRisk ? ', at risk' : ''}`}
    >
      <span className="text-sm" aria-hidden="true">{emoji}</span>
      <span className="text-xs font-bold text-white/70 flex-1 min-w-0 truncate">{name}</span>
      <span className={cn(
        'text-xs font-black tabular-nums',
        atRisk ? 'text-amber-400' : 'text-emerald-400'
      )}>
        {days}d
      </span>
      {atRisk && (
        <span className="text-[8px] text-amber-400/70 uppercase tracking-wider font-bold">
          at risk
        </span>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// TodaysPlanCard — Main Export
// ---------------------------------------------------------------------------

interface TodaysPlanCardProps {
  profile: AtlasProfile | null;
  isLocked?: boolean;
}

export function TodaysPlanCard({ profile, isLocked = false }: TodaysPlanCardProps) {
  const { globalSoul } = useGlobalSoul();
  const reducedMotion = useReducedMotion();

  const cognitive = globalSoul?.crossFunctionalState?.cognitive;
  const moduleNames = globalSoul?.displayNames ?? {};

  // Today's date header
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  // Task completion stats
  const tasks = profile?.tasks ?? [];
  const completedTasks = tasks.filter(t => t.status === 'done');
  const totalTasks = tasks.length;
  const completionPct = totalTasks > 0 ? Math.round((completedTasks.length / totalTasks) * 100) : 0;

  // Energy spent
  const totalEnergyCost = tasks
    .filter(t => t.status === 'done')
    .reduce((sum, t) => sum + (t.energyCost || 0), 0);

  const currentBudget = typeof cognitive?.energyBudget === 'number'
    ? cognitive.energyBudget
    : null;

  // ---------------------------------------------------------------------------
  // Habit streaks — derived from profile.habits
  // ---------------------------------------------------------------------------

  /** Returns the "at-risk" staleness threshold in milliseconds for a given frequency. */
  function atRiskThresholdMs(frequency: AtlasHabit['frequency']): number {
    switch (frequency) {
      case 'weekends': return 44 * 60 * 60 * 1000;
      case 'weekly':   return 144 * 60 * 60 * 1000;
      case 'daily':
      case 'weekdays':
      case 'custom':
      default:         return 20 * 60 * 60 * 1000;
    }
  }

  const FREQUENCY_EMOJI: Record<AtlasHabit['frequency'], string> = {
    daily:    '🔥',
    weekdays: '⚡',
    weekends: '🌿',
    weekly:   '📅',
    custom:   '⭐',
  };

  const streakHabits = useMemo(() => {
    const now = Date.now();
    return (profile?.habits ?? [])
      .filter((h): h is AtlasHabit => h.status === 'active')
      .sort((a, b) => b.currentStreak - a.currentStreak)
      .slice(0, 5)
      .map(h => {
        const threshold = atRiskThresholdMs(h.frequency);
        const atRisk = h.lastCompleted
          ? now - new Date(h.lastCompleted).getTime() > threshold
          : h.currentStreak > 0; // streak exists but never logged → at risk
        return { habit: h, atRisk };
      });
   
  }, [profile?.habits]);

  if (isLocked) return null;

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.5 }}
      className="space-y-5"
      aria-label="Today's plan"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400 font-display">
            Today's Plan
          </h3>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">
            {todayStr}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-white/30" aria-hidden="true" />
          <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
            {completedTasks.length}/{totalTasks} tasks
          </span>
        </div>
      </div>

      {/* Energy Budget */}
      <EnergyBudgetBar budget={currentBudget} />

      {/* Cognitive Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <SurfaceCard className="p-3 text-center">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 block mb-1">
            Energy
          </span>
          <span className="text-lg font-bold tabular-nums text-sky-300 font-display">
            {typeof cognitive?.energyBudget === 'number' ? cognitive.energyBudget.toFixed(1) : '—'}
          </span>
        </SurfaceCard>
        <SurfaceCard className="p-3 text-center">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 block mb-1">
            Focus
          </span>
          <span className="text-lg font-bold tabular-nums text-sky-300 font-display">
            {typeof cognitive?.focusScore === 'number' ? cognitive.focusScore.toFixed(1) : '—'}
          </span>
        </SurfaceCard>
        <SurfaceCard className="p-3 text-center">
          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 block mb-1">
            Load
          </span>
          <span className="text-lg font-bold tabular-nums text-sky-300 font-display">
            {typeof cognitive?.activeLoad === 'number' ? cognitive.activeLoad.toFixed(1) : '—'}
          </span>
        </SurfaceCard>
      </div>

      {/* Task List */}
      {tasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/40 font-display">
            Tasks
          </h4>
          {tasks.slice(0, 8).map(task => (
            <TaskItem
              key={task.id}
              title={task.title}
              energyCost={task.energyCost}
              status={task.status as any}
              blockedReason={
                (task.status as any) === 'blocked'
                  ? 'Recovery is below safe threshold'
                  : undefined
              }
              blockedSource={
                (task.status as any) === 'blocked'
                  ? moduleNames.soma || 'Soma'
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Completion Bar */}
      {totalTasks > 0 && (
        <SurfaceCard className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">
              Completion
            </span>
            <span className="text-xs font-black text-sky-300 tabular-nums">
              {completionPct}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-sky-400"
              initial={{ width: 0 }}
              animate={{ width: `${completionPct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </SurfaceCard>
      )}

      {/* Streaks — driven by profile.habits */}
      <div className="space-y-2">
        <h4 className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/40 font-display">
          Streaks
        </h4>
        <SurfaceCard className="p-3 space-y-2.5">
          {streakHabits.length === 0 || streakHabits.every(({ habit }) => habit.currentStreak === 0) ? (
            <p className="text-[10px] text-white/30 uppercase tracking-wider text-center py-2">
              Build habits to see your streaks here.
            </p>
          ) : (
            streakHabits
              .filter(({ habit }) => habit.currentStreak > 0)
              .map(({ habit, atRisk }) => (
                <HabitStreakRow
                  key={habit.id}
                  name={habit.title}
                  emoji={FREQUENCY_EMOJI[habit.frequency]}
                  days={habit.currentStreak}
                  atRisk={atRisk}
                />
              ))
          )}
        </SurfaceCard>
      </div>
    </motion.section>
  );
}
