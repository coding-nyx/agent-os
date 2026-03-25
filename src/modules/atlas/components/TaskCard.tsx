import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, AlertTriangle, Clock, Zap, ChevronDown, Link2, RotateCcw, RotateCw, CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasTask } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// TaskCard — Individual task with priority bar, energy badge, and expansion
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: AtlasTask;
  onComplete: (id: string) => void;
  onUncomplete?: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  allTasks?: AtlasTask[];
  onRemind?: (task: AtlasTask) => void;
  onSchedule?: (task: AtlasTask) => void;
  onEdit?: (task: AtlasTask) => void;
  onDelete?: (task: AtlasTask) => void;
  /** Whether this card is currently selected for scoped chat */
  isEntitySelected?: boolean;
  /** Called when the user taps to select/deselect this card */
  onEntitySelect?: (task: AtlasTask) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-rose-500',
  2: 'bg-orange-400',
  3: 'bg-amber-400',
  4: 'bg-sky-400',
  5: 'bg-zinc-400',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Minimal',
};

function isDeadlineUrgent(deadline: string): boolean {
  const diff = new Date(deadline).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000;
}

function isDeadlineOverdue(deadline: string): boolean {
  return new Date(deadline).getTime() < Date.now();
}

export const TaskCard = React.memo(function TaskCard({
  task,
  onComplete,
  onUncomplete,
  isExpanded,
  onToggleExpand,
  allTasks = [],
  onRemind,
  onSchedule,
  onEdit,
  onDelete,
  isEntitySelected = false,
  onEntitySelect,
}: TaskCardProps) {
  const reducedMotion = useReducedMotion();
  const isBlocked = task.status === 'blocked';
  const isDone = task.status === 'done';
  const isDeferred = task.status === 'deferred';
  const StatusIcon = isDone ? CheckCircle2 : isBlocked ? AlertTriangle : Circle;
  const statusColor = isDone
    ? 'text-emerald-400'
    : isBlocked
      ? 'text-amber-400'
      : 'text-white/40';

  // Resolve dependency names for "Blocked by" display
  const blockedByNames = useMemo(() => {
    if (!isBlocked || task.dependencies.length === 0) return [];
    return task.dependencies
      .map((depId) => allTasks.find((t) => t.id === depId)?.title ?? depId)
      .slice(0, 3);
  }, [isBlocked, task.dependencies, allTasks]);

  const deadlineUrgent = task.deadline ? isDeadlineUrgent(task.deadline) : false;
  const deadlineOverdue = task.deadline ? isDeadlineOverdue(task.deadline) : false;

  const handleComplete = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!isBlocked) {
      if (isDone) {
        onUncomplete?.(task.id);
      } else {
        onComplete(task.id);
      }
    }
  };

  const handleExpandKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggleExpand();
    }
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleComplete(e);
    }
  };

  return (
    <div
      onClick={() => onEntitySelect?.(task)}
      className={cn(
        'group relative rounded-xl border overflow-hidden transition-all cursor-pointer min-h-[44px]',
        'bg-white/[0.02] hover:bg-white/[0.035]',
        isEntitySelected && 'ring-2 ring-[var(--module-accent-ring)] shadow-[var(--module-accent-glow)]',
        isBlocked && 'opacity-60 border-white/5',
        isDone && 'border-white/[0.04] bg-white/[0.01]',
        isDeferred && 'border-white/[0.04] bg-white/[0.01]',
        !isBlocked && !isDone && !isDeferred && !isEntitySelected && 'border-white/[0.04] hover:border-white/[0.08]'
      )}
    >
      {/* Left priority bar */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 opacity-80',
          PRIORITY_COLORS[task.priority] || 'bg-zinc-400'
        )}
        aria-hidden="true"
      />

      <div className="pl-4 pr-4 py-3">
        {/* Main row — clickable for expand */}
        <div className="flex w-full items-start gap-3 rounded-lg bg-transparent p-0 text-left text-white/80">
          {/* Status button */}
          <button
            type="button"
            onClick={handleComplete}
            onKeyDown={handleCheckboxKeyDown}
            disabled={isBlocked}
            aria-label={
              isDone
                ? `Mark ${task.title} as undone`
                : `Mark ${task.title} as complete`
            }
            className={cn(
              'mt-0.5 flex h-5 w-5 min-h-[44px] min-w-0 flex-shrink-0 items-center justify-center rounded-md p-0 transition-all sm:min-h-0',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
              isDone
                ? 'text-emerald-400'
                : isBlocked
                  ? 'cursor-not-allowed text-amber-400/80'
                  : 'cursor-pointer text-white/40 hover:text-white/70'
            )}
          >
            <StatusIcon className={cn('h-4 w-4', statusColor)} aria-hidden="true" />
          </button>

          {/* Title, badges, description preview */}
          <div className="min-w-0 flex-1 pt-0.5 text-left">
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={onToggleExpand}
                onKeyDown={handleExpandKeyDown}
                aria-expanded={isExpanded}
                aria-label={`${task.title}, priority ${PRIORITY_LABELS[task.priority]}, energy cost ${task.energyCost}${isBlocked ? ', blocked' : ''}${isDone ? ', completed' : ''}`}
                className="min-w-0 flex-1 space-y-1.5 rounded-lg bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                <span
                  className={cn(
                    'block text-sm font-bold leading-tight break-words',
                    isDone ? 'text-white/50 line-through' : 'text-white/80'
                  )}
                >
                  {task.title}
                </span>

                <div className="flex flex-wrap items-center gap-2 text-[10px] text-white/45">
                  <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-[var(--module-color-300)]">
                    <Zap className="h-3 w-3 text-[var(--module-color-400)]" aria-hidden="true" />
                    {task.energyCost}
                  </span>

                  {task.recurrenceRule && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--module-color-400)] bg-[var(--module-accent-faint)] border border-[var(--module-accent-border)] px-1.5 py-0.5 rounded-full">
                      <RotateCw className="w-2.5 h-2.5" aria-hidden="true" />
                      {task.recurrenceRule === 'daily' ? 'Daily' :
                       task.recurrenceRule === 'weekdays' ? 'Weekdays' :
                       task.recurrenceRule === 'weekly' ? 'Weekly' :
                       task.recurrenceRule === 'monthly' ? 'Monthly' : task.recurrenceRule}
                    </span>
                  )}

                  {task.deadline && !isDone && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold',
                        deadlineOverdue
                          ? 'bg-rose-500/10 text-rose-300'
                          : deadlineUrgent
                            ? 'bg-amber-500/10 text-amber-300'
                            : 'bg-white/5 text-white/45'
                      )}
                    >
                      <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                      {new Date(task.deadline).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </button>

              <div className="mt-0.5 flex shrink-0 items-start gap-1.5 pl-2">
                {(onEdit || onDelete) && (
                  <div className="flex items-center gap-1">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(task);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
                        aria-label={`Edit ${task.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(task);
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-rose-300/70 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
                        aria-label={`Delete ${task.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}

                <ChevronDown
                  className={cn(
                    'mt-1 h-4 w-4 text-white/20 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Description preview (collapsed) */}
            {task.description && !isExpanded && (
              <p className="mt-1 text-xs text-white/30 truncate">
                {task.description}
              </p>
            )}

            {/* Blocked indicator */}
            {isBlocked && blockedByNames.length > 0 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-300/70">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                Blocked by: {blockedByNames.join(', ')}
              </p>
            )}
          </div>
        </div>

        {/* Expanded details panel */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={reducedMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
              }
              className="overflow-hidden"
            >
              <div className="pt-3 pl-8 space-y-3 border-t border-white/5 mt-3">
                {/* Full description */}
                {task.description && (
                  <p className="text-xs text-white/50 leading-relaxed">
                    {task.description}
                  </p>
                )}

                {/* Notes */}
                {task.notes && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                      Notes
                    </span>
                    <p className="text-xs text-white/40 leading-relaxed">
                      {task.notes}
                    </p>
                  </div>
                )}

                {/* Tags */}
                {task.tags && task.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {task.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-white/40 font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Dependencies */}
                {task.dependencies.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                      Dependencies
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {task.dependencies.map((depId) => {
                        const depTask = allTasks.find((t) => t.id === depId);
                        return (
                          <span
                            key={depId}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium',
                              depTask?.status === 'done'
                                ? 'bg-white/[0.08] text-white/60'
                                : 'bg-white/5 text-white/40'
                            )}
                          >
                            <Link2
                              className="w-2.5 h-2.5"
                              aria-hidden="true"
                            />
                            {depTask?.title ?? depId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Metadata footer */}
                <div className="flex items-center gap-3 text-[10px] text-white/20 pt-1">
                  <span>
                    P{task.priority} · {PRIORITY_LABELS[task.priority]}
                  </span>
                  {task.projectId && <span>Project: {task.projectId}</span>}
                  {task.goalId && <span>Goal: {task.goalId}</span>}
                </div>

                <div className="pt-2 flex items-center gap-2">
                  {onRemind && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemind(task);
                      }}
                      className="rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
                    >
                      Remind me
                    </button>
                  )}
                  {onSchedule && !isDone && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSchedule(task);
                      }}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--module-color-400)] transition-colors hover:bg-white/5 hover:text-[var(--module-color-300)]"
                    >
                      <CalendarPlus className="w-3 h-3" />
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  const isTaskEqual = prevProps.task === nextProps.task;
  const isExpandedEqual = prevProps.isExpanded === nextProps.isExpanded;
  const isSelectedEqual = prevProps.isEntitySelected === nextProps.isEntitySelected;

  // Only evaluate allTasks equality if the task actually has dependencies to display
  const hasDependencies = nextProps.task.dependencies && nextProps.task.dependencies.length > 0;
  const isAllTasksEqual = hasDependencies ? prevProps.allTasks === nextProps.allTasks : true;

  // SAFE CLOSURE EXCEPTION:
  // In this specific architecture (TaskManager parent), the inline functions
  // passed to onComplete, onToggleExpand, and onEntitySelect only invoke
  // stable setState setters with the task ID. They do not capture rapidly
  // changing local state variables. Therefore, it is safe to ignore their
  // reference equality to prevent O(N) re-renders without risking stale closures.
  return isTaskEqual && isExpandedEqual && isSelectedEqual && isAllTasksEqual;
});
