import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, Clock, ListTodo, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { AtlasGoal } from '../services/atlas-profile-service';

// ---------------------------------------------------------------------------
// GoalProgress — Goal cards with milestone visualization & progress bars
// ---------------------------------------------------------------------------

interface GoalProgressProps {
  goals: AtlasGoal[];
  onUpdateProgress: (goalId: string, milestoneId: string) => void;
  onExpandGoal: (goalId: string) => void;
}

const STATUS_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  paused: {
    label: 'Paused',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  completed: {
    label: 'Completed',
    className: 'bg-[var(--module-accent-muted)] text-[var(--module-color-400)] border-[var(--module-accent-border)]',
  },
  abandoned: {
    label: 'Abandoned',
    className: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  },
};

function isDeadlineSoon(deadline: string): boolean {
  const diff = new Date(deadline).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000; // < 7 days
}

function isDeadlineOverdue(deadline: string): boolean {
  return new Date(deadline).getTime() < Date.now();
}

export function GoalProgress({
  goals,
  onUpdateProgress,
  onExpandGoal,
}: GoalProgressProps) {
  const reducedMotion = useReducedMotion();
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  const toggleExpand = (goalId: string) => {
    setExpandedGoalId((prev) => (prev === goalId ? null : goalId));
    onExpandGoal(goalId);
  };

  // ---- Empty state ----
  if (goals.length === 0) {
    return (
      <EmptyState
        title="No goals yet"
        description="Create a goal to track your progress"
        icon={Target}
        size="sm"
      />
    );
  }

  return (
    <section className="space-y-3" aria-label="Goal progress">
      {goals.map((goal, index) => {
        const isExpanded = expandedGoalId === goal.id;
        const statusConfig =
          STATUS_BADGES[goal.status] || STATUS_BADGES.active;
        const completedMilestones = goal.milestones.filter(
          (m) => m.completed
        ).length;
        const totalMilestones = goal.milestones.length;
        const deadlineSoon = goal.deadline
          ? isDeadlineSoon(goal.deadline)
          : false;
        const deadlineOverdue = goal.deadline
          ? isDeadlineOverdue(goal.deadline)
          : false;

        return (
          <motion.div
            key={goal.id}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.3, delay: index * 0.05 }
            }
            className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm overflow-hidden"
          >
            {/* ── Goal header (click to expand) ── */}
            <NeuralButton
              onClick={() => toggleExpand(goal.id)}
              aria-expanded={isExpanded}
              aria-label={`${goal.title}, ${goal.progressPercent}% progress, ${statusConfig.label}`}
              variant="ghost"
              className={cn(
                'w-full p-4 text-left transition-colors !rounded-none !h-auto',
                'hover:bg-white/[0.02]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--module-accent-ring)]'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title + status badge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white/90 truncate">
                      {goal.title}
                    </h3>
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider',
                        statusConfig.className
                      )}
                    >
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Deadline indicator */}
                  {goal.deadline && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-[10px] font-medium',
                        deadlineOverdue
                          ? 'text-rose-400'
                          : deadlineSoon
                            ? 'text-amber-400'
                            : 'text-white/30'
                      )}
                    >
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {deadlineOverdue ? 'Overdue: ' : ''}
                      {new Date(goal.deadline).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      {totalMilestones > 0 && (
                        <span className="text-[10px] text-white/30 tabular-nums">
                          {completedMilestones}/{totalMilestones} milestones
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-emerald-400 tabular-nums ml-auto">
                        {goal.progressPercent}%
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={goal.progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Goal progress: ${goal.progressPercent}%`}
                    >
                      <motion.div
                        className="h-full rounded-full bg-emerald-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${goal.progressPercent}%` }}
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : {
                                duration: 0.6,
                                ease: [0.22, 1, 0.36, 1],
                              }
                        }
                      />
                    </div>
                  </div>

                  {/* Associated task count badge */}
                  {goal.associatedTaskIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-white/25">
                      <ListTodo className="w-3 h-3" aria-hidden="true" />
                      {goal.associatedTaskIds.length} task
                      {goal.associatedTaskIds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Expand/collapse chevron */}
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-white/20 shrink-0 transition-transform mt-1',
                    isExpanded && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
            </NeuralButton>

            {/* ── Expanded content: milestones, description, notes ── */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={
                    reducedMotion ? false : { height: 0, opacity: 0 }
                  }
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                  }
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {/* Description */}
                    {goal.description && (
                      <p className="text-xs text-white/40 leading-relaxed">
                        {goal.description}
                      </p>
                    )}

                    {/* Success criteria */}
                    {goal.successCriteria && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25">
                          Success Criteria
                        </span>
                        <p className="text-xs text-white/40">
                          {goal.successCriteria}
                        </p>
                      </div>
                    )}

                    {/* Milestone list */}
                    {goal.milestones.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25">
                          Milestones
                        </span>
                        {goal.milestones.map((milestone) => (
                          <div
                            key={milestone.id}
                            className="flex items-center gap-3 py-1.5"
                          >
                            {/* Milestone checkbox */}
                            <NeuralButton
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                onUpdateProgress(goal.id, milestone.id);
                              }}
                              aria-label={
                                milestone.completed
                                  ? `${milestone.title} completed`
                                  : `Mark ${milestone.title} as complete`
                              }
                              className={cn(
                                'flex-shrink-0 w-5 h-5 min-w-0 p-0 rounded-md border-2 flex items-center justify-center transition-all',
                                milestone.completed
                                  ? 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600'
                                  : 'border-white/15 hover:border-emerald-400/50'
                              )}
                            >
                              {milestone.completed && (
                                <Check
                                  className="w-3 h-3 text-white"
                                  aria-hidden="true"
                                />
                              )}
                            </NeuralButton>

                            {/* Milestone title */}
                            <span
                              className={cn(
                                'text-xs flex-1',
                                milestone.completed
                                  ? 'text-white/30 line-through'
                                  : 'text-white/70'
                              )}
                            >
                              {milestone.title}
                            </span>

                            {/* Due date */}
                            {milestone.dueDate && (
                              <span className="text-[10px] text-white/20 tabular-nums shrink-0">
                                {new Date(
                                  milestone.dueDate
                                ).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {goal.notes && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/25">
                          Notes
                        </span>
                        <p className="text-xs text-white/30 leading-relaxed">
                          {goal.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </section>
  );
}
