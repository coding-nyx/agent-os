import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Lock, Clock, Zap, ChevronDown, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasTask } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// TaskCard — Individual task with priority bar, energy badge, and expansion
// ---------------------------------------------------------------------------

interface TaskCardProps {
  task: AtlasTask;
  onComplete: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  allTasks?: AtlasTask[];
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

export function TaskCard({
  task,
  onComplete,
  isExpanded,
  onToggleExpand,
  allTasks = [],
  isEntitySelected = false,
  onEntitySelect,
}: TaskCardProps) {
  const reducedMotion = useReducedMotion();
  const isBlocked = task.status === 'blocked';
  const isDone = task.status === 'done';
  const isDeferred = task.status === 'deferred';

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
    if (!isBlocked && !isDone) {
      onComplete(task.id);
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
        'group relative rounded-xl border overflow-hidden transition-all cursor-pointer',
        'bg-white/[0.03] backdrop-blur-sm',
        isEntitySelected && 'ring-2 ring-sky-400/40 shadow-[0_0_30px_rgba(14,165,233,0.15)]',
        isBlocked && 'opacity-60 border-white/5',
        isDone && 'border-emerald-500/15 bg-emerald-500/[0.03]',
        isDeferred && 'border-amber-500/10 bg-amber-500/[0.02]',
        !isBlocked && !isDone && !isDeferred && !isEntitySelected && 'border-white/10 hover:border-white/15'
      )}
    >
      {/* Left priority bar */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1',
          PRIORITY_COLORS[task.priority] || 'bg-zinc-400'
        )}
        aria-hidden="true"
      />

      <div className="pl-4 pr-3 py-3">
        {/* Main row — clickable for expand */}
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleExpand}
          onKeyDown={handleExpandKeyDown}
          aria-expanded={isExpanded}
          aria-label={`${task.title}, priority ${PRIORITY_LABELS[task.priority]}, energy cost ${task.energyCost}${isBlocked ? ', blocked' : ''}${isDone ? ', completed' : ''}`}
          className="flex items-start gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 rounded-lg -m-1 p-1"
        >
          {/* Checkbox */}
          <button
            onClick={handleComplete}
            onKeyDown={handleCheckboxKeyDown}
            disabled={isBlocked}
            aria-label={
              isDone
                ? `${task.title} completed`
                : `Mark ${task.title} as complete`
            }
            className={cn(
              'mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50',
              isDone
                ? 'bg-emerald-500 border-emerald-500'
                : isBlocked
                  ? 'border-white/10 cursor-not-allowed'
                  : 'border-white/20 hover:border-emerald-400/50'
            )}
          >
            {isDone && (
              <Check className="w-3 h-3 text-white" aria-hidden="true" />
            )}
            {isBlocked && (
              <Lock className="w-3 h-3 text-white/30" aria-hidden="true" />
            )}
          </button>

          {/* Title, badges, description preview */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'text-sm font-semibold leading-snug',
                  isDone ? 'text-white/40 line-through' : 'text-white/90'
                )}
              >
                {task.title}
              </span>

              {/* Energy cost pill */}
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-bold tabular-nums">
                <Zap className="w-2.5 h-2.5" aria-hidden="true" />
                {task.energyCost}
              </span>

              {/* Deadline badge */}
              {task.deadline && !isDone && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold',
                    deadlineOverdue
                      ? 'bg-rose-500/15 text-rose-400'
                      : deadlineUrgent
                        ? 'bg-rose-500/10 text-rose-300'
                        : 'bg-white/5 text-white/40'
                  )}
                >
                  <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                  {new Date(task.deadline).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>

            {/* Description preview (collapsed) */}
            {task.description && !isExpanded && (
              <p className="mt-1 text-xs text-white/30 truncate">
                {task.description}
              </p>
            )}

            {/* Blocked indicator */}
            {isBlocked && blockedByNames.length > 0 && (
              <p className="mt-1.5 text-[11px] text-amber-300/70 flex items-center gap-1.5">
                <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                Blocked by: {blockedByNames.join(', ')}
              </p>
            )}
          </div>

          {/* Expand chevron */}
          <ChevronDown
            className={cn(
              'w-4 h-4 text-white/20 shrink-0 transition-transform mt-0.5',
              isExpanded && 'rotate-180'
            )}
            aria-hidden="true"
          />
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
                                ? 'bg-emerald-500/10 text-emerald-400'
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
