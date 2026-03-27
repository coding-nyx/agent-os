/**
 * DayScheduleModal
 * Opens when a user clicks a day in WeekGrid or MonthPlanner.
 * Displays tasks already scheduled on that day and lets the user
 * assign unscheduled tasks or remove existing assignments.
 */

import React, { useMemo, useState } from 'react';
import { X, Calendar, Plus, Trash2 } from 'lucide-react';
import { PortalledModal } from './shared/PortalledModal';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import { cn } from '@/lib/utils';
import type { AtlasTask, ScheduledTask } from '../services/atlas-profile-service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DayScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** ISO date string "YYYY-MM-DD" */
  selectedDate: string;
  tasks: AtlasTask[];
  scheduledTasks: ScheduledTask[];
  onScheduleTask: (taskId: string, date: string) => void;
  onUnscheduleTask: (taskId: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format "YYYY-MM-DD" → "Wednesday, March 25" */
function formatDateHeader(dateStr: string): string {
  if (!dateStr) return '';
  // Parse as local date to avoid UTC offset shifting the day
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** True when an AtlasTask is schedulable (unscheduled or assigned to a different date) */
function isSchedulable(task: AtlasTask, selectedDate: string): boolean {
  if (task.status === 'done' || task.status === 'deferred') return false;
  if (!task.scheduledSlot) return true;
  return task.scheduledSlot !== selectedDate;
}

/** Tasks currently assigned to the selected date */
function getTasksOnDate(tasks: AtlasTask[], scheduledTasks: ScheduledTask[], date: string) {
  const atlasOnDate = tasks.filter((t) => t.scheduledSlot === date);
  const scheduledOnDate = scheduledTasks.filter((s) => s.scheduledAt.startsWith(date));

  // Merge — atlas tasks take precedence; supplement with scheduledTasks that
  // don't already have a matching atlas task entry
  const atlasIds = new Set(atlasOnDate.map((t) => t.id));
  const supplemental = scheduledOnDate.filter((s) => !atlasIds.has(s.id));

  return { atlasOnDate, supplemental };
}

// ─── Energy cost badge ────────────────────────────────────────────────────────

function EnergyCostBadge({ cost }: { cost: number }) {
  const color =
    cost >= 7 ? 'bg-red-500/20 text-red-300 border-red-500/30' :
    cost >= 4 ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold border tabular-nums', color)}>
      ⚡ {cost}
    </span>
  );
}

// ─── Scheduled task row ───────────────────────────────────────────────────────

interface ScheduledRowProps {
  title: string;
  energyCost?: number;
  onRemove?: () => void;
}

function ScheduledRow({ title, energyCost, onRemove }: ScheduledRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--module-accent-border)] bg-[var(--module-accent-faint)]">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--module-color-400)] shrink-0" />
        <span className="text-sm font-medium text-white/85 truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {typeof energyCost === 'number' && <EnergyCostBadge cost={energyCost} />}
        {onRemove && (
          <NeuralButton
            onClick={onRemove}
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Remove from day"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </NeuralButton>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DayScheduleModal({
  isOpen,
  onClose,
  selectedDate,
  tasks,
  scheduledTasks,
  onScheduleTask,
  onUnscheduleTask,
}: DayScheduleModalProps) {
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const dateHeader = useMemo(() => formatDateHeader(selectedDate), [selectedDate]);

  const { atlasOnDate, supplemental } = useMemo(
    () => getTasksOnDate(tasks, scheduledTasks, selectedDate),
    [tasks, scheduledTasks, selectedDate],
  );

  const hasScheduledItems = atlasOnDate.length > 0 || supplemental.length > 0;

  // Unscheduled / assignable tasks filtered by search
  const assignableTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => isSchedulable(t, selectedDate))
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 20); // cap list for performance
  }, [tasks, selectedDate, search]);

  const handleSchedule = () => {
    if (!selectedTaskId) return;
    onScheduleTask(selectedTaskId, selectedDate);
    setSelectedTaskId(null);
    setSearch('');
  };

  const handleClose = () => {
    setSearch('');
    setSelectedTaskId(null);
    onClose();
  };

  return (
    <PortalledModal isOpen={isOpen} onClose={handleClose}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--module-accent-faint)] border border-[var(--module-accent-border)]">
            <Calendar className="w-4 h-4 text-[var(--module-color-400)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold font-display text-white/90 truncate">
              {dateHeader || selectedDate}
            </h2>
            <p className="text-[11px] text-white/40 font-medium">Schedule tasks for this day</p>
          </div>
        </div>
        <NeuralButton
          onClick={handleClose}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.045] shrink-0"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </NeuralButton>
      </div>

      {/* ── Tasks on this day ── */}
      <section className="mb-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 mb-3">
          Scheduled on this day
        </h3>

        {hasScheduledItems ? (
          <div className="space-y-2">
            {/* Atlas tasks with scheduledSlot */}
            {atlasOnDate.map((task) => (
              <ScheduledRow
                key={task.id}
                title={task.title}
                energyCost={task.energyCost}
                onRemove={() => onUnscheduleTask(task.id)}
              />
            ))}
            {/* ScheduledTask entries without a matching AtlasTask */}
            {supplemental.map((st) => (
              <ScheduledRow
                key={st.id}
                title={st.title}
                energyCost={st.energyCost}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/30 italic px-3 py-4 rounded-xl border border-white/[0.09] bg-white/[0.045] text-center">
            No tasks scheduled for this day.
          </p>
        )}
      </section>

      {/* ── Divider ── */}
      <div className="border-t border-white/[0.09] mb-6" />

      {/* ── Add task section ── */}
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40 mb-3">
          Add task to this day
        </h3>

        {/* Search */}
        <NeuralInput
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedTaskId(null);
          }}
          className="mb-3"
        />

        {/* Assignable task list */}
        {assignableTasks.length === 0 ? (
          <p className="text-sm text-white/30 italic text-center py-4">
            {search ? 'No matching tasks found.' : 'All tasks are already scheduled.'}
          </p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1 -mr-1 no-scrollbar">
            {assignableTasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-all duration-150',
                    isSelected
                      ? 'border-[var(--module-color-400)]/60 bg-[var(--module-accent-faint)]'
                      : 'border-white/[0.09] bg-white/[0.045] hover:bg-white/[0.045] hover:border-white/[0.12]',
                  )}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
                        isSelected
                          ? 'bg-[var(--module-color-400)] border-[var(--module-color-400)]'
                          : 'border-white/20',
                      )}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 10 8" fill="none" className="w-2 h-2">
                          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-black" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm font-medium text-white/80 truncate">{task.title}</span>
                    {task.scheduledSlot && (
                      <span className="text-[11px] text-white/30 shrink-0">
                        (from {task.scheduledSlot})
                      </span>
                    )}
                  </div>
                  <EnergyCostBadge cost={task.energyCost} />
                </button>
              );
            })}
          </div>
        )}

        {/* Schedule action */}
        <div className="mt-4 flex justify-end gap-2">
          <NeuralButton onClick={handleClose} variant="ghost" size="sm" className="text-[11px] font-bold">
            CANCEL
          </NeuralButton>
          <NeuralButton
            onClick={handleSchedule}
            disabled={!selectedTaskId}
            themeColor="module"
            size="sm"
            className="text-[11px] font-bold px-4 h-8 gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            SCHEDULE
          </NeuralButton>
        </div>
      </section>
    </PortalledModal>
  );
}
