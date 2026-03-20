/**
 * DayTaskPanel — shows tasks and scheduled items for a selected date.
 * Rendered below WeekGrid and MonthPlanner when a day is selected.
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, Zap, X, Calendar } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { AtlasTask, ScheduledTask } from '@/lib/types';

interface DayTaskPanelProps {
  date: string; // YYYY-MM-DD
  tasks: AtlasTask[];
  scheduledTasks: ScheduledTask[];
  onClose: () => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-white/30',
  2: 'text-[var(--module-color-400)]/70',
  3: 'text-amber-400/70',
  4: 'text-orange-400/70',
  5: 'text-rose-400',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function DayTaskPanel({ date, tasks, scheduledTasks, onClose }: DayTaskPanelProps) {
  const dayTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        (t.deadline && t.deadline.slice(0, 10) === date) ||
        (t.scheduledSlot && t.scheduledSlot.slice(0, 10) === date)
    );
  }, [tasks, date]);

  const dayScheduled = useMemo(() => {
    return scheduledTasks.filter((st) => st.scheduledAt.slice(0, 10) === date);
  }, [scheduledTasks, date]);

  const hasSomething = dayTasks.length > 0 || dayScheduled.length > 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={date}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-white/8 bg-white/[0.02] backdrop-blur-sm overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" aria-hidden />
            <span className="text-xs font-bold text-white/80 uppercase tracking-wider">
              {formatDate(date)}
            </span>
            {hasSomething && (
              <span className="text-[10px] text-white/30 font-mono">
                {dayTasks.length + dayScheduled.length} item{dayTasks.length + dayScheduled.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <NeuralButton
            variant="emerald"
            onClick={onClose}
            aria-label="Close day view"
            className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </NeuralButton>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-2">
          {!hasSomething && (
            <p className="text-xs text-white/30 text-center py-4">No tasks scheduled for this day</p>
          )}

          {/* Atlas tasks with deadline or scheduledSlot on this day */}
          {dayTasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                'flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5',
                task.status === 'done' && 'opacity-50'
              )}
            >
              <CheckCircle2
                className={cn(
                  'w-3.5 h-3.5 mt-0.5 shrink-0',
                  task.status === 'done' ? 'text-emerald-400' : 'text-white/20'
                )}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium truncate', task.status === 'done' ? 'line-through text-white/40' : 'text-white/80')}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-[10px] font-bold', PRIORITY_COLORS[task.priority])}>
                    P{task.priority}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-white/30">
                    <Zap className="w-2.5 h-2.5" aria-hidden /> {task.energyCost}
                  </span>
                  {task.tags && task.tags.length > 0 && (
                    <span className="text-[10px] text-white/25 truncate">{task.tags.slice(0, 2).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Scheduled time-blocks */}
          {dayScheduled.map((st) => (
            <div
              key={st.id}
              className={cn(
                'flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/5',
                st.status === 'done' && 'opacity-50'
              )}
            >
              <Clock
                className={cn(
                  'w-3.5 h-3.5 mt-0.5 shrink-0',
                  st.status === 'done' ? 'text-emerald-400' : 'text-[var(--module-color-400)]/60'
                )}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className={cn('text-xs font-medium truncate', st.status === 'done' ? 'line-through text-white/40' : 'text-white/80')}>
                  {st.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-white/30 capitalize">{st.category.replace('_', ' ')}</span>
                  <span className="flex items-center gap-0.5 text-[10px] text-white/30">
                    <Zap className="w-2.5 h-2.5" aria-hidden /> {st.energyCost}
                  </span>
                  {st.duration > 0 && (
                    <span className="text-[10px] text-white/25">{st.duration}m</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
