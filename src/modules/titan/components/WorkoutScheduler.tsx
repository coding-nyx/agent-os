/**
 * WorkoutScheduler — 4-week workout calendar with plan-session modal.
 *
 * Architecture:
 *   - WeekRow         → renders 7 day cells for one calendar week  O(7)
 *   - DayCell         → single day display with status dot          O(1)
 *   - PlanModal       → form to schedule a new planned workout       O(R) R = routines
 *   - DayDetail       → popover showing a planned workout's details  O(1)
 *   - UpcomingList    → next-14-day sorted list                      O(P log P)
 *   - WorkoutScheduler→ root component, derives calendar state       O(P × 28)
 *
 * Complexity overview:
 *   - Calendar grid build: O(28) — always 4 weeks × 7 days
 *   - Matching planned ↔ completed: O(P × S) where P = planned (≤200), S = sessions (≤365)
 *   - Upcoming list sort: O(P log P)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarPlus, ChevronLeft, ChevronRight, X, Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralSelectMenu } from '@/core/components/NeuralSelectMenu';
import type { PlannedWorkout, WorkoutSession, Routine } from '@/lib/types';
import { cn } from '@/lib/utils';

// ─── Constants ─────────────────────────────────────────────────────────────

const DAY_ABBREVS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const UPCOMING_DAYS = 14;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Return ISO YYYY-MM-DD for a given Date without timezone drift. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return the Monday of the week containing `d`. */
function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d);
  // getDay(): 0=Sun … 6=Sat  → shift so Mon=0
  const dayOfWeek = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - dayOfWeek);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Build an array of 28 Date objects starting from the given Monday. */
function buildCalendarDates(startMonday: Date): Date[] {
  return Array.from({ length: 28 }, (_, i) => {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);
    return d;
  });
}

/** Format ISO date to display like "Apr 3". */
function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Sub-component: Status dot ─────────────────────────────────────────────

const STATUS_COLORS: Record<PlannedWorkout['status'], string> = {
  planned:   'bg-blue-400',
  completed: 'bg-emerald-400',
  skipped:   'bg-white/30',
};

function StatusDot({ status }: { status: PlannedWorkout['status'] }) {
  return (
    <span
      className={cn('w-1.5 h-1.5 rounded-full inline-block shrink-0', STATUS_COLORS[status])}
      aria-label={status}
    />
  );
}

// ─── Sub-component: Day Cell ────────────────────────────────────────────────

interface DayCellProps {
  date: Date;
  isToday: boolean;
  planned: PlannedWorkout | undefined;
  onClick: (date: Date, planned: PlannedWorkout | undefined) => void;
}

function DayCell({ date, isToday, planned, onClick }: DayCellProps) {
  const dayNum = date.getDate();
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <button
      type="button"
      onClick={() => onClick(date, planned)}
      className={cn(
        'relative flex flex-col items-center justify-start gap-0.5 p-1 pt-1.5 rounded-xl transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--module-accent-ring)]',
        'min-h-[3.2rem] w-full',
        isToday
          ? 'border border-[var(--module-accent)] bg-[var(--module-accent-muted)]'
          : 'border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12]',
        isPast && !planned && 'opacity-40',
      )}
      aria-label={`${toIsoDate(date)}${planned ? ` — ${planned.routineName}` : ''}`}
    >
      <span
        className={cn(
          'text-[10px] font-bold leading-none',
          isToday ? 'text-[var(--module-color-300)]' : 'text-white/60',
        )}
      >
        {dayNum}
      </span>
      {planned ? (
        <StatusDot status={planned.status} />
      ) : (
        <span className="text-[8px] text-white/15 leading-none">+</span>
      )}
    </button>
  );
}

// ─── Sub-component: Day Detail Popover ─────────────────────────────────────

interface DayDetailProps {
  planned: PlannedWorkout;
  onClose: () => void;
  onMarkSkipped: (pw: PlannedWorkout) => void;
  anchorLabel: string;
}

function DayDetail({ planned, onClose, onMarkSkipped, anchorLabel }: DayDetailProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.15 }}
      className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 w-52 rounded-2xl border border-[var(--module-accent-border)] bg-[#0c0c12]/95 backdrop-blur-md shadow-2xl p-3"
      role="dialog"
      aria-label={`Workout on ${anchorLabel}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--module-color-300)]">
            {anchorLabel}
          </p>
          <p className="text-xs font-semibold text-white/90 mt-0.5">{planned.routineName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-white/30 hover:text-white/60 mt-0.5 shrink-0"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {planned.exerciseNames && planned.exerciseNames.length > 0 && (
        <p className="text-[10px] text-white/50 mb-2 leading-relaxed">
          {planned.exerciseNames.slice(0, 4).join(' · ')}
          {planned.exerciseNames.length > 4 && ` +${planned.exerciseNames.length - 4}`}
        </p>
      )}

      {planned.notes && (
        <p className="text-[10px] text-white/40 italic mb-2">{planned.notes}</p>
      )}

      <div className="flex items-center gap-1.5">
        <StatusDot status={planned.status} />
        <span className="text-[10px] text-white/50 capitalize">{planned.status}</span>
      </div>

      {planned.status === 'planned' && (
        <NeuralButton
          size="sm"
          variant="ghost"
          className="w-full mt-2 text-[10px]"
          onClick={() => { onMarkSkipped(planned); onClose(); }}
        >
          <XCircle className="w-3 h-3 mr-1" />
          Mark Skipped
        </NeuralButton>
      )}
    </motion.div>
  );
}

// ─── Sub-component: Plan Session Modal ─────────────────────────────────────

interface PlanModalProps {
  isOpen: boolean;
  initialDate: string;
  routines: Routine[];
  onClose: () => void;
  onSave: (plan: PlannedWorkout) => Promise<void>;
  onAnalyze?: (prompt: string) => void;
  directWriteMode: boolean;
}

function PlanModal({ isOpen, initialDate, routines, onClose, onSave, onAnalyze, directWriteMode }: PlanModalProps) {
  const [date, setDate] = useState(initialDate);
  const [routineName, setRoutineName] = useState('');
  const [exerciseNames, setExerciseNames] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDate(initialDate);
      setRoutineName('');
      setExerciseNames('');
      setNotes('');
    }
  }, [isOpen, initialDate]);

  const routineOptions = useMemo(() => [
    { label: '— Free text —', value: '' },
    ...routines.map(r => ({ label: r.name, value: r.name })),
  ], [routines]);

  const handleSave = async () => {
    const name = routineName.trim();
    if (!name || !date) return;

    const planned: PlannedWorkout = {
      id: crypto.randomUUID(),
      date,
      routineName: name,
      exerciseNames: exerciseNames.trim()
        ? exerciseNames.split(',').map(e => e.trim()).filter(Boolean)
        : undefined,
      notes: notes.trim() || undefined,
      status: 'planned',
      createdAt: new Date().toISOString(),
    };

    if (directWriteMode) {
      setIsSaving(true);
      try { await onSave(planned); onClose(); }
      finally { setIsSaving(false); }
    } else if (onAnalyze) {
      const exLine = planned.exerciseNames?.length
        ? `\nExercises: ${planned.exerciseNames.join(', ')}`
        : '';
      const noteLine = planned.notes ? `\nNotes: ${planned.notes}` : '';
      onAnalyze(
        `Please schedule a workout for me:\nDate: ${date}\nRoutine: ${name}${exLine}${noteLine}\n\n` +
        `Use action: <action type="schedule_workout">{"date":"${date}","routineName":"${name}"${planned.exerciseNames?.length ? `,"exerciseNames":${JSON.stringify(planned.exerciseNames)}` : ''}${planned.notes ? `,"notes":"${planned.notes}"` : ''}}</action>`
      );
      onClose();
    }
  };

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title="Plan Session"
      subtitle="Schedule a future workout"
      icon={CalendarPlus}
      themeColor="module"
      maxWidth="sm"
    >
      <div className="flex flex-col gap-4">
        {/* Date */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--module-color-400)] mb-1.5 block">
            Date
          </label>
          <NeuralInput
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* Routine name — select or free text */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--module-color-400)] mb-1.5 block">
            Routine
          </label>
          {routines.length > 0 ? (
            <>
              <NeuralSelectMenu
                value={routineName}
                options={routineOptions}
                onChange={v => setRoutineName(v)}
                placeholder="Select or type below"
                ariaLabel="Routine"
              />
              {!routines.find(r => r.name === routineName) && (
                <NeuralInput
                  placeholder="Or type routine name…"
                  value={routineName}
                  onChange={e => setRoutineName(e.target.value)}
                  className="mt-2"
                />
              )}
            </>
          ) : (
            <NeuralInput
              placeholder="e.g. Push Day, Leg Day…"
              value={routineName}
              onChange={e => setRoutineName(e.target.value)}
            />
          )}
        </div>

        {/* Exercise names */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--module-color-400)] mb-1.5 block">
            Exercises <span className="text-white/30 normal-case font-normal">(comma-separated, optional)</span>
          </label>
          <NeuralInput
            placeholder="Bench Press, OHP, Dips…"
            value={exerciseNames}
            onChange={e => setExerciseNames(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--module-color-400)] mb-1.5 block">
            Notes <span className="text-white/30 normal-case font-normal">(optional)</span>
          </label>
          <NeuralInput
            placeholder="Any focus or targets…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <NeuralButton
            size="xl"
            className="flex-1"
            disabled={!routineName.trim() || !date || isSaving}
            onClick={handleSave}
          >
            <CalendarPlus className="w-4 h-4 mr-2" />
            {directWriteMode ? 'Save Plan' : 'Send to Titan'}
          </NeuralButton>
          <NeuralButton size="xl" variant="ghost" onClick={onClose}>
            Cancel
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}

// ─── Sub-component: Upcoming Sessions List ─────────────────────────────────

interface UpcomingListProps {
  plannedWorkouts: PlannedWorkout[];
  completedDates: Set<string>;
  onMarkSkipped: (pw: PlannedWorkout) => void;
}

function UpcomingList({ plannedWorkouts, completedDates, onMarkSkipped }: UpcomingListProps) {
  const today = toIsoDate(new Date());
  const cutoff = toIsoDate(new Date(Date.now() + UPCOMING_DAYS * 24 * 60 * 60 * 1000));

  const upcoming = useMemo(() =>
    plannedWorkouts
      .filter(pw => pw.date >= today && pw.date <= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [plannedWorkouts, today, cutoff],
  );

  if (upcoming.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No sessions in the next 14 days"
        description="Click any day on the calendar to plan a workout"
        size="sm"
      />
    );
  }

  return (
    <div className="space-y-2">
      {upcoming.map(pw => {
        const isCompleted = completedDates.has(pw.date) || pw.status === 'completed';
        const effectiveStatus: PlannedWorkout['status'] = isCompleted ? 'completed' : pw.status;

        return (
          <div
            key={pw.id}
            className={cn(
              'flex items-start justify-between gap-3 p-3 rounded-xl border transition-colors',
              effectiveStatus === 'completed'
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : effectiveStatus === 'skipped'
                ? 'border-white/5 bg-white/[0.02] opacity-60'
                : 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)]',
            )}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {/* Status icon */}
              <div className="mt-0.5 shrink-0">
                {effectiveStatus === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : effectiveStatus === 'skipped' ? (
                  <XCircle className="w-4 h-4 text-white/30" />
                ) : (
                  <Calendar className="w-4 h-4 text-[var(--module-color-300)]" />
                )}
              </div>
              {/* Details */}
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-white/80 truncate">{pw.routineName}</p>
                <p className="text-[10px] text-[var(--module-color-400)] mt-0.5">
                  {formatDisplayDate(pw.date)}
                </p>
                {pw.exerciseNames && pw.exerciseNames.length > 0 && (
                  <p className="text-[9px] text-white/35 mt-0.5 leading-tight">
                    {pw.exerciseNames.slice(0, 3).join(' · ')}
                    {pw.exerciseNames.length > 3 && ` +${pw.exerciseNames.length - 3}`}
                  </p>
                )}
              </div>
            </div>

            {effectiveStatus === 'planned' && (
              <NeuralButton
                size="sm"
                variant="ghost"
                className="shrink-0 text-[9px] text-white/40 hover:text-white/70"
                onClick={() => onMarkSkipped(pw)}
              >
                Skip
              </NeuralButton>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface WorkoutSchedulerProps {
  plannedWorkouts: PlannedWorkout[];
  completedSessions: WorkoutSession[];
  routines: Routine[];
  onAnalyze?: (prompt: string) => void;
  directWriteMode?: boolean;
  onDirectSave?: (plan: PlannedWorkout) => Promise<void>;
  onDirectUpdate?: (plan: PlannedWorkout) => Promise<void>;
}

// ─── Root Component ─────────────────────────────────────────────────────────

export function WorkoutScheduler({
  plannedWorkouts,
  completedSessions,
  routines,
  onAnalyze,
  directWriteMode = false,
  onDirectSave,
  onDirectUpdate,
}: WorkoutSchedulerProps) {
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const todayIso = toIsoDate(todayDate);

  // Week offset: 0 = current 4-week block, ±1 = shift by 4 weeks
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayDate, setSelectedDayDate] = useState<Date | null>(null);
  const [selectedPlanned, setSelectedPlanned] = useState<PlannedWorkout | undefined>(undefined);
  const [planModalDate, setPlanModalDate] = useState<string>(todayIso);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  // Build calendar start date: Monday of current week + weekOffset * 28 days
  const calendarStart = useMemo(() => {
    const monday = getMondayOfWeek(todayDate);
    monday.setDate(monday.getDate() + weekOffset * 28);
    return monday;
  }, [weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const calendarDates = useMemo(() => buildCalendarDates(calendarStart), [calendarStart]);

  // Index planned workouts by date for O(1) lookup in grid
  const plannedByDate = useMemo(() => {
    const map = new Map<string, PlannedWorkout>();
    for (const pw of plannedWorkouts) map.set(pw.date, pw);
    return map;
  }, [plannedWorkouts]);

  // Set of completed session dates for cross-reference
  const completedDates = useMemo(
    () => new Set(completedSessions.map(s => s.date)),
    [completedSessions],
  );

  // Month label for the calendar header
  const monthLabel = useMemo(() => {
    const firstDate = calendarDates[0];
    const lastDate = calendarDates[calendarDates.length - 1];
    const firstMonth = firstDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const lastMonth = lastDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return firstMonth === lastMonth ? firstMonth : `${firstDate.toLocaleDateString('en-US', { month: 'short' })} – ${lastMonth}`;
  }, [calendarDates]);

  // Handle day cell click
  const handleDayClick = useCallback((date: Date, planned: PlannedWorkout | undefined) => {
    const dateIso = toIsoDate(date);
    if (planned) {
      // Toggle detail popover
      if (selectedDayDate && toIsoDate(selectedDayDate) === dateIso) {
        setSelectedDayDate(null);
        setSelectedPlanned(undefined);
      } else {
        setSelectedDayDate(date);
        setSelectedPlanned(planned);
      }
    } else {
      // Open plan modal for this date
      setSelectedDayDate(null);
      setSelectedPlanned(undefined);
      setPlanModalDate(dateIso);
      setIsPlanModalOpen(true);
    }
  }, [selectedDayDate]);

  // Mark a planned workout as skipped
  const handleMarkSkipped = useCallback(async (pw: PlannedWorkout) => {
    const updated: PlannedWorkout = { ...pw, status: 'skipped' };
    if (directWriteMode && onDirectUpdate) {
      await onDirectUpdate(updated);
    } else if (onAnalyze) {
      onAnalyze(
        `Please mark my planned workout on ${pw.date} as skipped.\n` +
        `<action type="update_planned_workout">{"id":"${pw.id}","status":"skipped"}</action>`
      );
    }
  }, [directWriteMode, onDirectUpdate, onAnalyze]);

  // Handle plan save (direct write path)
  const handleDirectSave = useCallback(async (plan: PlannedWorkout) => {
    if (onDirectSave) await onDirectSave(plan);
  }, [onDirectSave]);

  // Build the 4-week grid: 4 rows of 7 cells
  const weeks = useMemo<Date[][]>(() => {
    const result: Date[][] = [];
    for (let w = 0; w < 4; w++) {
      result.push(calendarDates.slice(w * 7, w * 7 + 7));
    }
    return result;
  }, [calendarDates]);

  return (
    <SurfaceCard className="p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <PanelLabel
          label="Workout Scheduler"
          metadata={`${plannedWorkouts.length} planned`}
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWeekOffset(o => o - 1)}
            aria-label="Previous 4 weeks"
            className="w-7 h-7 rounded-xl flex items-center justify-center border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors text-white/50 hover:text-white/80"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-white/40 min-w-[6rem] text-center">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setWeekOffset(o => o + 1)}
            aria-label="Next 4 weeks"
            className="w-7 h-7 rounded-xl flex items-center justify-center border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors text-white/50 hover:text-white/80"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Day abbreviation headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_ABBREVS.map(d => (
          <div key={d} className="text-center text-[9px] font-black uppercase tracking-widest text-white/25 py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* 4-week grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((date) => {
              const iso = toIsoDate(date);
              const isToday = iso === todayIso;
              const pw = plannedByDate.get(iso);
              // If a completed session exists for this date, reflect in the dot
              const effectivePw: PlannedWorkout | undefined = pw
                ? completedDates.has(iso) ? { ...pw, status: 'completed' } : pw
                : undefined;
              const isSelected = selectedDayDate !== null && toIsoDate(selectedDayDate) === iso;

              return (
                <div key={iso} className="relative">
                  <DayCell
                    date={date}
                    isToday={isToday}
                    planned={effectivePw}
                    onClick={handleDayClick}
                  />
                  <AnimatePresence>
                    {isSelected && selectedPlanned && (
                      <DayDetail
                        planned={selectedPlanned}
                        onClose={() => { setSelectedDayDate(null); setSelectedPlanned(undefined); }}
                        onMarkSkipped={handleMarkSkipped}
                        anchorLabel={formatDisplayDate(iso)}
                      />
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06]">
        {(['planned', 'completed', 'skipped'] as const).map(status => (
          <div key={status} className="flex items-center gap-1">
            <StatusDot status={status} />
            <span className="text-[9px] text-white/30 capitalize">{status}</span>
          </div>
        ))}
      </div>

      {/* Upcoming sessions list */}
      <div className="mt-4 pt-4 border-t border-white/[0.06]">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">
          Next {UPCOMING_DAYS} Days
        </p>
        <UpcomingList
          plannedWorkouts={plannedWorkouts}
          completedDates={completedDates}
          onMarkSkipped={handleMarkSkipped}
        />
      </div>

      {/* Plan Session Modal */}
      <PlanModal
        isOpen={isPlanModalOpen}
        initialDate={planModalDate}
        routines={routines}
        onClose={() => setIsPlanModalOpen(false)}
        onSave={handleDirectSave}
        onAnalyze={onAnalyze}
        directWriteMode={directWriteMode}
      />
    </SurfaceCard>
  );
}
