/**
 * TrainingCalendar — 7-day horizontal training week view for the Titan module.
 *
 * Renders Mon → Sun columns with per-day status derived from assigned routines
 * and logged workout sessions. Supports week navigation (±N weeks from today).
 *
 * Status ladder (per day):
 *   rest          → no active routine assigned
 *   completed     → session logged (past day)
 *   today-done    → session logged (today)
 *   missed        → past day with routine but no session
 *   today-pending → today with routine but no session yet
 *   upcoming      → future day with routine
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Flame,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { TitanProfile, Routine, WorkoutSession, Weekday } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAY_KEYS: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainingCalendarProps {
  profile: TitanProfile | null;
  onStartSession: (routine: Routine) => void;
}

type DayStatus =
  | 'completed'
  | 'missed'
  | 'today-pending'
  | 'today-done'
  | 'upcoming'
  | 'rest';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDays(offset: number): Date[] {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDayStatus(
  date: Date,
  routine: Routine | undefined,
  session: WorkoutSession | undefined,
): DayStatus {
  const isoDate = toIsoDate(date);
  const todayISO = toIsoDate(new Date());
  const isToday = isoDate === todayISO;
  const isPast = isoDate < todayISO;

  if (!routine) return 'rest';
  if (session?.status === 'completed') return isToday ? 'today-done' : 'completed';
  if (isToday) return 'today-pending';
  if (isPast) return 'missed';
  return 'upcoming';
}

// ─── Card style map ───────────────────────────────────────────────────────────

const CARD_STYLES: Record<DayStatus, string> = {
  completed: 'bg-emerald-500/10 border-emerald-500/20',
  missed: 'bg-rose-500/10 border-rose-500/20',
  'today-pending': 'bg-orange-500/15 border-orange-500/40 ring-1 ring-orange-500/30',
  'today-done': 'bg-emerald-500/15 border-emerald-500/40',
  upcoming: 'bg-white/[0.03] border-white/10',
  rest: 'bg-white/[0.02] border-white/5',
};

// ─── StatusIcon ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: DayStatus }) {
  if (status === 'completed' || status === 'today-done') {
    return <Check className="w-3 h-3 text-emerald-400" />;
  }
  if (status === 'missed') {
    return <X className="w-3 h-3 text-rose-400" />;
  }
  if (status === 'today-pending') {
    return (
      <motion.div
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Flame className="w-3 h-3 text-orange-400" />
      </motion.div>
    );
  }
  if (status === 'upcoming') {
    return <Calendar className="w-3 h-3 text-white/30" />;
  }
  // rest → nothing
  return null;
}

// ─── DayColumn ────────────────────────────────────────────────────────────────

interface DayColumnProps {
  date: Date;
  dayIndex: number;
  routine: Routine | undefined;
  session: WorkoutSession | undefined;
  onStartSession: (routine: Routine) => void;
}

function DayColumn({ date, dayIndex, routine, session, onStartSession }: DayColumnProps) {
  const isoDate = toIsoDate(date);
  const todayISO = toIsoDate(new Date());
  const isToday = isoDate === todayISO;

  const status = getDayStatus(date, routine, session);
  const dateNumber = date.getDate();
  const dayLabel = DAY_LABELS[dayIndex];

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-1.5 min-w-0">
      {/* Day label */}
      <span
        className={cn(
          'text-[8px] sm:text-[9px] font-bold uppercase tracking-widest',
          isToday ? 'text-orange-400' : 'text-white/30',
        )}
      >
        {dayLabel}
      </span>

      {/* Date number */}
      <div
        className={cn(
          'w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-bold',
          isToday
            ? 'bg-orange-500 text-white'
            : 'text-white/40',
        )}
      >
        {dateNumber}
      </div>

      {/* Day card */}
      <div
        className={cn(
          'w-full rounded-lg sm:rounded-xl border p-1 sm:p-2 flex flex-col gap-1 relative min-h-[70px] sm:min-h-[80px]',
          CARD_STYLES[status],
        )}
      >
        {/* Status icon — top-right */}
        <div className="absolute top-1.5 right-1.5">
          <StatusIcon status={status} />
        </div>

        {status === 'rest' ? (
          <>
            <span className="text-[9px] font-semibold text-white/30 leading-tight">Rest</span>
            <span className="text-[8px] text-white/20 hidden sm:inline">—</span>
          </>
        ) : (
          <>
            {/* Routine name */}
            <span
              className={cn(
                'text-[9px] font-semibold leading-tight pr-3 break-words',
                (status === 'completed' || status === 'today-done') && 'text-emerald-400',
                status === 'missed' && 'text-rose-400',
                status === 'today-pending' && 'text-orange-300',
                status === 'upcoming' && 'text-white/60',
              )}
            >
              {(status === 'completed' || status === 'today-done') && '✓ '}
              {routine!.name}
            </span>

            {/* Sub-label */}
            {(status === 'completed' || status === 'today-done') && (
              <span className="text-[8px] text-emerald-500/70 hidden sm:inline">Completed</span>
            )}
            {status === 'missed' && (
              <span className="text-[8px] text-rose-500/70 hidden sm:inline">Missed</span>
            )}
            {status === 'upcoming' && (
              <span className="text-[8px] text-white/30 hidden sm:inline">
                {routine!.exercises.length} exercise{routine!.exercises.length !== 1 ? 's' : ''}
              </span>
            )}

            {/* Log Now CTA — only on today-pending */}
            {status === 'today-pending' && (
              <NeuralButton
                size="sm"
                themeColor="orange"
                onClick={() => onStartSession(routine!)}
                className="w-full mt-2 text-[10px]"
              >
                <Flame className="w-2.5 h-2.5 mr-1" />
                Log Now
              </NeuralButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Week navigation label ────────────────────────────────────────────────────

function weekOffsetLabel(offset: number): string {
  if (offset === 0) return 'This Week';
  if (offset === -1) return 'Last Week';
  if (offset === 1) return 'Next Week';
  return `${offset > 0 ? '+' : ''}${offset}w`;
}

// ─── TrainingCalendar ─────────────────────────────────────────────────────────

export function TrainingCalendar({ profile, onStartSession }: TrainingCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDays = getWeekDays(weekOffset);
  const sessions = profile?.workoutSessions ?? [];
  const routines = profile?.routines ?? [];

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-1 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4 text-white/50 hover:text-white/80" />
        </button>

        <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
          {weekOffsetLabel(weekOffset)}
        </span>

        <button
          type="button"
          onClick={() => setWeekOffset((o) => o + 1)}
          className="p-1 rounded-lg hover:bg-white/5 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4 text-white/50 hover:text-white/80" />
        </button>
      </div>

      {/* 7-day grid */}
      <div className="w-full">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 w-full">
          {weekDays.map((date, i) => {
            const isoDate = toIsoDate(date);
            const weekdayKey = WEEKDAY_KEYS[i];

            const routine = routines.find(
              (r) => r.weekday === weekdayKey && r.status === 'active',
            );

            const session = sessions.find((s) => s.date === isoDate);

            return (
              <DayColumn
                key={isoDate}
                date={date}
                dayIndex={i}
                routine={routine}
                session={session}
                onStartSession={onStartSession}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
