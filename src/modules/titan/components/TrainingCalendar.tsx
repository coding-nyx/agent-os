/**
 * TrainingCalendar — 7-day week view for the Titan module.
 *
 * Layout: compact day-strip (always fits any screen width) + selected-day
 * detail panel. Eliminates the 7-column overflow grid that rendered poorly
 * on narrow screens or with long exercise names.
 */

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton, NeuralIconButton } from '@/core/components/NeuralButton';
import type { TitanWorkoutLog, WorkoutSession } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_LABELS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MUSCLE_COLORS: Record<string, string> = {
  chest:      'bg-rose-500/20 text-rose-300',
  back:       'bg-blue-500/20 text-blue-300',
  legs:       'bg-purple-500/20 text-purple-300',
  quads:      'bg-purple-500/20 text-purple-300',
  hamstrings: 'bg-purple-500/20 text-purple-300',
  shoulders:  'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
  arms:       'bg-green-500/20 text-green-300',
  biceps:     'bg-green-500/20 text-green-300',
  triceps:    'bg-green-500/20 text-green-300',
  core:       'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
  cardio:     'bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
  default:    'bg-white/10 text-white/50',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainingCalendarProps {
  workoutLogs: TitanWorkoutLog[];
  sessions?: WorkoutSession[];
  onQuickLog?: (date: string) => void;
  onRemind?: (date: string) => void;
}

interface DayData {
  workoutLog?: TitanWorkoutLog;
  session?: WorkoutSession;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getWeekDays(offset: number): [Date, Date, Date, Date, Date, Date, Date] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  }) as [Date, Date, Date, Date, Date, Date, Date];
}

function formatWeekRange(days: [Date, Date, Date, Date, Date, Date, Date]): string {
  const first = days[0];
  const last  = days[6];
  const year  = last.getFullYear();
  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${year}`;
  }
  return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${MONTHS[last.getMonth()]} ${last.getDate()}, ${year}`;
}

function inferMuscleGroups(text: string, limit = 2): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  const push = (g: string) => { if (!found.includes(g)) found.push(g); };

  if (/bench|chest|pec|fly|push.?up/.test(t))                           push('chest');
  if (/\brow\b|pull.?up|lat\b|pulldown|deadlift|\bback\b/.test(t))      push('back');
  if (/squat|leg.press|lunge|quad|hamstring|\bleg\b/.test(t))           push('legs');
  if (/shoulder|delt|ohp|overhead.press|lateral.raise/.test(t))         push('shoulders');
  if (/bicep|curl/.test(t))                                              push('biceps');
  if (/tricep|extension|\btri\b|dip/.test(t))                           push('triceps');
  if (/\bcore\b|ab\b|abs\b|plank|crunch|sit.?up/.test(t))               push('core');
  if (/cardio|run|cycle|\bbike\b|treadmill|elliptical/.test(t))         push('cardio');

  return found.slice(0, limit);
}

function formatExerciseId(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function countSessionSets(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );
}

// ─── DayDetail — full-width panel for selected day ────────────────────────────

interface DayDetailProps {
  date: Date;
  dayLabel: string;
  data: DayData;
  onQuickLog?: (isoDate: string) => void;
  onRemind?: (isoDate: string) => void;
}

function DayDetail({ date, dayLabel, data, onQuickLog, onRemind }: DayDetailProps) {
  const isoDate = toIsoDate(date);
  const log     = data.workoutLog;
  const session = data.session;
  const hasActivity = Boolean(log ?? session);

  let exercises: string[] = [];
  let totalSets = 0;
  let muscleGroups: string[] = [];

  if (log) {
    const uniqueIds = [...new Set(log.sets.map((s) => s.exerciseId))];
    exercises    = uniqueIds.map(formatExerciseId);
    totalSets    = log.sets.length;
    muscleGroups = inferMuscleGroups(log.sets.map((s) => s.exerciseId).join(' '));
  } else if (session) {
    exercises    = session.exercises.map((ex) => ex.exerciseName);
    totalSets    = countSessionSets(session);
    muscleGroups = inferMuscleGroups(session.exercises.map((ex) => ex.exerciseName).join(' '));
  }

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 min-h-[72px] flex items-start justify-between gap-3">
      {/* Left: day label + content */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30 mb-1.5">
          {dayLabel}
        </p>

        {hasActivity ? (
          <div className="space-y-1.5">
            <div className="space-y-0.5">
              {exercises.slice(0, 3).map((name, i) => (
                <p key={i} className="text-sm font-semibold text-white/85 leading-snug truncate">
                  {name}
                </p>
              ))}
              {exercises.length > 3 && (
                <p className="text-[10px] text-white/30">+{exercises.length - 3} more</p>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-2">
              {totalSets > 0 && (
                <span className="text-[10px] text-white/40 font-medium">
                  {totalSets} set{totalSets !== 1 ? 's' : ''}
                </span>
              )}
              {muscleGroups.map((mg) => (
                <span
                  key={mg}
                  className={cn(
                    'text-[9px] font-medium px-2 py-0.5 rounded-full',
                    MUSCLE_COLORS[mg] ?? MUSCLE_COLORS['default'],
                  )}
                >
                  {mg}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/20 font-medium">Rest day</p>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        {!hasActivity && onQuickLog && (
          <NeuralIconButton
            variant="ghost"
            size="sm"
            onClick={() => onQuickLog(isoDate)}
            aria-label={`Log workout for ${dayLabel}`}
            className="w-8 h-8 text-white/30 hover:text-white/70"
            icon={<Plus className="w-4 h-4" />}
          />
        )}
        {onRemind && (
          <NeuralIconButton
            variant="ghost"
            size="sm"
            onClick={() => onRemind(isoDate)}
            aria-label={`Remind me — ${dayLabel}`}
            className="w-8 h-8 text-white/20 hover:text-white/60"
            icon={<Bell className="w-3.5 h-3.5" />}
          />
        )}
      </div>
    </div>
  );
}

// ─── WeeklySummary ────────────────────────────────────────────────────────────

interface WeeklySummaryProps {
  weekDays: [Date, Date, Date, Date, Date, Date, Date];
  workoutLogs: TitanWorkoutLog[];
  sessions: WorkoutSession[];
}

function WeeklySummary({ weekDays, workoutLogs, sessions }: WeeklySummaryProps) {
  const weekIsoDates = new Set(weekDays.map(toIsoDate));
  const weekLogs     = workoutLogs.filter((l) => weekIsoDates.has(l.date));
  const logDates     = new Set(weekLogs.map((l) => l.date));
  const weekSessions = sessions.filter((s) => weekIsoDates.has(s.date) && !logDates.has(s.date));

  const workoutCount = weekLogs.length + weekSessions.length;
  if (workoutCount === 0) return null;

  const totalSets =
    weekLogs.reduce((sum, l) => sum + l.sets.length, 0) +
    weekSessions.reduce((sum, s) => sum + countSessionSets(s), 0);

  const allMuscleText = [
    ...weekLogs.map((l) => l.sets.map((s) => s.exerciseId).join(' ')),
    ...weekSessions.map((s) => s.exercises.map((ex) => ex.exerciseName).join(' ')),
  ].join(' ');
  const primaryMuscles = inferMuscleGroups(allMuscleText, 3);

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center flex-wrap gap-x-3 gap-y-1">
      <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">This week</span>
      <span className="text-[11px] font-bold text-white/70">
        {workoutCount} workout{workoutCount !== 1 ? 's' : ''}
      </span>
      <span className="text-white/20" aria-hidden="true">·</span>
      <span className="text-[11px] font-bold text-white/70">{totalSets} sets</span>
      {primaryMuscles.map((mg) => (
        <span
          key={mg}
          className={cn('text-[9px] font-medium px-2 py-0.5 rounded-full', MUSCLE_COLORS[mg] ?? MUSCLE_COLORS['default'])}
        >
          {mg}
        </span>
      ))}
    </div>
  );
}

// ─── TrainingCalendar ─────────────────────────────────────────────────────────

export function TrainingCalendar({
  workoutLogs,
  sessions = [],
  onQuickLog,
  onRemind,
}: TrainingCalendarProps) {
  const todayISO = toIsoDate(new Date());
  const [weekOffset, setWeekOffset]   = useState(0);
  const [selectedISO, setSelectedISO] = useState(todayISO);

  const weekDays  = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekLabel = formatWeekRange(weekDays);

  const handlePrev = () => {
    const next = weekOffset - 1;
    setWeekOffset(next);
    if (next === 0) setSelectedISO(todayISO);
  };
  const handleNext = () => {
    const next = weekOffset + 1;
    setWeekOffset(next);
    if (next === 0) setSelectedISO(todayISO);
  };
  const handleToday = () => {
    setWeekOffset(0);
    setSelectedISO(todayISO);
  };

  const dayMap = useMemo<Map<string, DayData>>(() => {
    const map = new Map<string, DayData>();
    for (const log of workoutLogs) map.set(log.date, { workoutLog: log });
    for (const session of sessions) {
      const existing = map.get(session.date);
      map.set(session.date, existing ? { ...existing, session } : { session });
    }
    return map;
  }, [workoutLogs, sessions]);

  const weekISOs     = weekDays.map(toIsoDate);
  const effectiveISO = weekISOs.includes(selectedISO) ? selectedISO : weekISOs[0];
  const selectedIdx  = weekISOs.indexOf(effectiveISO);
  const selectedDate = weekDays[selectedIdx];
  const selectedData = dayMap.get(effectiveISO) ?? {};

  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 space-y-3">

      {/* ── Week navigation ── */}
      <div className="flex items-center justify-between gap-2">
        <NeuralIconButton
          variant="ghost"
          size="sm"
          onClick={handlePrev}
          aria-label="Previous week"
          className="w-8 h-8 shrink-0 text-white/40 hover:text-white/80"
          icon={<ChevronLeft className="w-4 h-4" />}
        />

        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
          <span className="text-[11px] font-semibold text-white/50 truncate">{weekLabel}</span>
          {weekOffset !== 0 && (
            <NeuralButton
              size="sm"
              variant="ghost"
              onClick={handleToday}
              className="px-2 h-6 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/10 shrink-0"
            >
              Today
            </NeuralButton>
          )}
        </div>

        <NeuralIconButton
          variant="ghost"
          size="sm"
          onClick={handleNext}
          aria-label="Next week"
          className="w-8 h-8 shrink-0 text-white/40 hover:text-white/80"
          icon={<ChevronRight className="w-4 h-4" />}
        />
      </div>

      {/* ── Day strip — always fits in viewport, no overflow ── */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((date, i) => {
          const iso        = toIsoDate(date);
          const isToday    = iso === todayISO;
          const isSelected = iso === effectiveISO;
          const hasData    = dayMap.has(iso);

          return (
            <button
              key={iso}
              onClick={() => setSelectedISO(iso)}
              className={cn(
                'flex flex-col items-center gap-1 py-2 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
                isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
              )}
              aria-label={`${DAY_LABELS[i]} ${date.getDate()}`}
              aria-pressed={isSelected}
            >
              <span className={cn(
                'text-[9px] font-black uppercase tracking-widest',
                isToday ? 'text-emerald-400' : isSelected ? 'text-white/60' : 'text-white/25',
              )}>
                {DAY_INITIALS[i]}
              </span>

              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums transition-colors',
                isToday
                  ? 'bg-emerald-500 text-white'
                  : isSelected
                    ? 'bg-white/12 text-white/90'
                    : 'text-white/40',
              )}>
                {date.getDate()}
              </div>

              <div className={cn(
                'w-1.5 h-1.5 rounded-full transition-opacity',
                hasData ? 'bg-[var(--module-color-400)] opacity-80' : 'opacity-0',
              )} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {/* ── Selected day detail ── */}
      <DayDetail
        date={selectedDate}
        dayLabel={DAY_LABELS[selectedIdx]}
        data={selectedData}
        onQuickLog={onQuickLog}
        onRemind={onRemind}
      />

      {/* ── Weekly summary ── */}
      <WeeklySummary weekDays={weekDays} workoutLogs={workoutLogs} sessions={sessions} />
    </div>
  );
}

export default TrainingCalendar;
