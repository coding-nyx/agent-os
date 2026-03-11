/**
 * TrainingCalendar — 7-day week view for the Titan module.
 *
 * Renders Mon → Sun columns driven by TitanWorkoutLog (preferred) and
 * WorkoutSession (legacy fallback) data. Supports week navigation and a
 * "Today" pill to snap back to the current week.
 *
 * Complexity: O(n) per render where n = total logs + sessions (single-pass
 * Map build, then O(1) day lookups during render).
 */

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TitanWorkoutLog, WorkoutSession } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Tailwind bg+text classes keyed by lowercase muscle group name. */
const MUSCLE_COLORS: Record<string, string> = {
  chest: 'bg-rose-500/30 text-rose-300',
  back: 'bg-blue-500/30 text-blue-300',
  legs: 'bg-purple-500/30 text-purple-300',
  quads: 'bg-purple-500/30 text-purple-300',
  hamstrings: 'bg-purple-500/30 text-purple-300',
  shoulders: 'bg-amber-500/30 text-amber-300',
  arms: 'bg-green-500/30 text-green-300',
  biceps: 'bg-green-500/30 text-green-300',
  triceps: 'bg-green-500/30 text-green-300',
  core: 'bg-cyan-500/30 text-cyan-300',
  cardio: 'bg-orange-500/30 text-orange-300',
  default: 'bg-white/10 text-white/50',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainingCalendarProps {
  /** Structured workout logs keyed to canonical exercise IDs (preferred). */
  workoutLogs: TitanWorkoutLog[];
  /** Legacy session-based logs — used when no workoutLog exists for a day. */
  sessions?: WorkoutSession[];
  /** Called when the user taps the + button on an empty day cell. */
  onQuickLog?: (date: string) => void;
}

/** Resolved display data for a single calendar day. */
interface DayData {
  workoutLog?: TitanWorkoutLog;
  session?: WorkoutSession;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Returns an ISO YYYY-MM-DD string from a Date without relying on
 * toISOString() (which converts to UTC and can shift the date by a day near
 * midnight in negative-offset timezones).
 */
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the 7 Date objects (Mon–Sun) for the given week offset from today. */
function getWeekDays(offset: number): [Date, Date, Date, Date, Date, Date, Date] {
  const today = new Date();
  // Monday = day 1; Sunday = day 0 — shift so Monday is the week start.
  const dayOfWeek = today.getDay(); // 0 = Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  }) as [Date, Date, Date, Date, Date, Date, Date];
}

/** Formats "Week of Mar 10 – Mar 16, 2026" (cross-month aware). */
function formatWeekRange(days: [Date, Date, Date, Date, Date, Date, Date]): string {
  const first = days[0];
  const last = days[6];
  const year = last.getFullYear();
  const lastMonth = MONTHS[last.getMonth()];

  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${year}`;
  }
  return `${MONTHS[first.getMonth()]} ${first.getDate()} – ${lastMonth} ${last.getDate()}, ${year}`;
}

/**
 * Heuristic muscle-group inference from a combined string of exercise names
 * or IDs (snake_case or space-separated). Returns at most `limit` groups.
 *
 * Intentionally lightweight — no lookup table, O(n) string scan.
 */
function inferMuscleGroups(text: string, limit = 2): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];

  const push = (g: string) => {
    if (!found.includes(g)) found.push(g);
  };

  if (/bench|chest|pec|fly|push.?up/.test(t)) push('chest');
  if (/\brow\b|pull.?up|lat\b|pulldown|deadlift|\bback\b/.test(t)) push('back');
  if (/squat|leg.press|lunge|quad|hamstring|\bleg\b/.test(t)) push('legs');
  if (/shoulder|delt|ohp|overhead.press|lateral.raise/.test(t)) push('shoulders');
  if (/bicep|curl/.test(t)) push('biceps');
  if (/tricep|extension|\btri\b|dip/.test(t)) push('triceps');
  if (/\bcore\b|ab\b|abs\b|plank|crunch|sit.?up/.test(t)) push('core');
  if (/cardio|run|cycle|\bbike\b|treadmill|elliptical/.test(t)) push('cardio');

  return found.slice(0, limit);
}

/** Converts a snake_case exercise ID to Title Case for display. */
function formatExerciseId(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 24);
}

/** Returns total completed sets for a WorkoutSession. */
function countSessionSets(session: WorkoutSession): number {
  return session.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );
}

// ─── DayCell ──────────────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date;
  dayLabel: string;
  data: DayData;
  onQuickLog?: (isoDate: string) => void;
}

function DayCell({ date, dayLabel, data, onQuickLog }: DayCellProps) {
  const isoDate = toIsoDate(date);
  const todayISO = toIsoDate(new Date());
  const isToday = isoDate === todayISO;

  // Prefer TitanWorkoutLog over legacy WorkoutSession
  const log = data.workoutLog;
  const session = data.session;
  const hasActivity = Boolean(log ?? session);

  // ── Derive display values ──
  let displayName = 'Rest';
  let totalSets = 0;
  let muscleGroups: string[] = [];

  if (log) {
    displayName = log.sets[0]
      ? formatExerciseId(log.sets[0].exerciseId)
      : 'Workout';
    totalSets = log.sets.length;
    muscleGroups = inferMuscleGroups(log.sets.map((s) => s.exerciseId).join(' '));
  } else if (session) {
    displayName = session.exercises[0]?.exerciseName ?? session.routineName ?? 'Workout';
    totalSets = countSessionSets(session);
    muscleGroups = inferMuscleGroups(
      session.exercises.map((ex) => ex.exerciseName).join(' '),
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {/* ── Column header ── */}
      <div className="flex flex-col items-center gap-0.5 pb-1">
        <span
          className={cn(
            'text-[9px] font-bold uppercase tracking-widest',
            isToday ? 'text-emerald-400' : 'text-white/40',
          )}
        >
          {dayLabel}
        </span>
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            isToday ? 'bg-emerald-500 text-white' : 'text-white/50',
          )}
        >
          {date.getDate()}
        </div>
      </div>

      {/* ── Day card ── */}
      <div
        className={cn(
          'min-h-[100px] rounded-xl p-2 transition-colors relative',
          'bg-white/[0.02] hover:bg-white/[0.05]',
          hasActivity
            ? 'border border-white/10'
            : 'border border-dashed border-white/[0.07]',
        )}
      >
        {/* Green dot indicator for logged days */}
        {hasActivity && (
          <span
            className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400"
            aria-hidden="true"
          />
        )}

        {hasActivity ? (
          <div className="flex flex-col gap-1 pr-3">
            {/* Workout name */}
            <span className="text-[10px] font-semibold text-white/80 leading-tight break-words">
              {displayName}
            </span>

            {/* Sets badge */}
            {totalSets > 0 && (
              <span className="text-[9px] text-white/40 font-medium">
                {totalSets} set{totalSets !== 1 ? 's' : ''}
              </span>
            )}

            {/* Muscle group chips (max 2) */}
            {muscleGroups.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {muscleGroups.map((mg) => (
                  <span
                    key={mg}
                    className={cn(
                      'text-[8px] font-medium px-1.5 py-0.5 rounded-full',
                      MUSCLE_COLORS[mg] ?? MUSCLE_COLORS['default'],
                    )}
                  >
                    {mg}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Empty day ── */
          <div className="flex flex-col items-center justify-center h-full gap-2 pt-3">
            <span className="text-[9px] text-white/20 font-medium select-none">Rest</span>
            {onQuickLog && (
              <button
                type="button"
                aria-label={`Log workout for ${dayLabel} ${date.getDate()}`}
                onClick={() => onQuickLog(isoDate)}
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center transition-colors',
                  'bg-white/5 hover:bg-white/10 border border-white/10',
                  'text-white/30 hover:text-white/60',
                )}
              >
                <Plus className="w-3 h-3" />
              </button>
            )}
          </div>
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

  // Logs that fall within this week
  const weekLogs = workoutLogs.filter((l) => weekIsoDates.has(l.date));
  // Legacy sessions that fall within this week AND have no corresponding log
  const logDates = new Set(weekLogs.map((l) => l.date));
  const weekSessions = sessions.filter(
    (s) => weekIsoDates.has(s.date) && !logDates.has(s.date),
  );

  const workoutCount = weekLogs.length + weekSessions.length;
  if (workoutCount === 0) return null;

  const totalSets =
    weekLogs.reduce((sum, l) => sum + l.sets.length, 0) +
    weekSessions.reduce((sum, s) => sum + countSessionSets(s), 0);

  // Top muscle groups for the week (deduplicated, up to 3)
  const allMuscleText = [
    ...weekLogs.map((l) => l.sets.map((s) => s.exerciseId).join(' ')),
    ...weekSessions.map((s) => s.exercises.map((ex) => ex.exerciseName).join(' ')),
  ].join(' ');
  const primaryMuscles = inferMuscleGroups(allMuscleText, 3);

  return (
    <div className="mt-4 pt-3 border-t border-white/[0.06]">
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-white/40">
        <span>This week:</span>
        <span className="text-white/70 font-semibold">
          {workoutCount} workout{workoutCount !== 1 ? 's' : ''}
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-white/70 font-semibold">
          {totalSets} total sets
        </span>
        {primaryMuscles.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>Primary:</span>
            {primaryMuscles.map((mg) => (
              <span
                key={mg}
                className={cn(
                  'text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                  MUSCLE_COLORS[mg] ?? MUSCLE_COLORS['default'],
                )}
              >
                {mg}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TrainingCalendar ─────────────────────────────────────────────────────────

export function TrainingCalendar({
  workoutLogs,
  sessions = [],
  onQuickLog,
}: TrainingCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekLabel = `Week of ${formatWeekRange(weekDays)}`;

  /**
   * Build an O(n) lookup map: isoDate → DayData.
   * TitanWorkoutLog entries take precedence over WorkoutSession entries for the
   * same date (both are stored so WeeklySummary can deduplicate correctly).
   */
  const dayMap = useMemo<Map<string, DayData>>(() => {
    const map = new Map<string, DayData>();

    for (const log of workoutLogs) {
      map.set(log.date, { workoutLog: log });
    }
    for (const session of sessions) {
      const existing = map.get(session.date);
      if (existing) {
        // Attach session alongside the log (for deduplication in summary)
        map.set(session.date, { ...existing, session });
      } else {
        map.set(session.date, { session });
      }
    }

    return map;
  }, [workoutLogs, sessions]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      {/* ── Week navigation header ── */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4 text-white/50" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white/60">{weekLabel}</span>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors',
                'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
                'hover:bg-emerald-500/25',
              )}
            >
              Today
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4 text-white/50" />
        </button>
      </div>

      {/* ── 7-day grid ── */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 w-full">
        {weekDays.map((date, i) => {
          const isoDate = toIsoDate(date);
          return (
            <DayCell
              key={isoDate}
              date={date}
              dayLabel={DAY_LABELS[i]}
              data={dayMap.get(isoDate) ?? {}}
              onQuickLog={onQuickLog}
            />
          );
        })}
      </div>

      {/* ── Weekly summary footer ── */}
      <WeeklySummary
        weekDays={weekDays}
        workoutLogs={workoutLogs}
        sessions={sessions}
      />
    </div>
  );
}
