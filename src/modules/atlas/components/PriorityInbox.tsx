import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Inbox, Zap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/core/components/EmptyState';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { AtlasTask } from '@/lib/types';

// ---------------------------------------------------------------------------
// selectTopTasks — deterministic ranking: priority → deadline → energy fit
// Time complexity: O(n log n) for sort, O(n) for filter — total O(n log n)
// Space complexity: O(n) for the filtered copy
// ---------------------------------------------------------------------------

function selectTopTasks(tasks: AtlasTask[], energyBudget: number): AtlasTask[] {
  const eligible = tasks.filter(
    (t) => t.status === 'queued' || t.status === 'active',
  );

  return eligible
    .sort((a, b) => {
      // Primary: priority (1=highest, 5=lowest)
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Secondary: deadline proximity (sooner = higher priority, no deadline = last)
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      // Tertiary: energy cost vs budget fit (tasks that fit in budget first)
      const aFits = a.energyCost <= energyBudget ? 0 : 1;
      const bFits = b.energyCost <= energyBudget ? 0 : 1;
      return aFits - bFits;
    })
    .slice(0, 3);
}

// ---------------------------------------------------------------------------
// Rank badge — ①②③ Unicode circled digits (falls back to plain number)
// ---------------------------------------------------------------------------

const RANK_BADGES: Record<number, string> = { 1: '①', 2: '②', 3: '③' };

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      aria-label={`Rank ${rank}`}
      className="text-[13px] leading-none text-sky-400 font-bold select-none shrink-0"
    >
      {RANK_BADGES[rank] ?? rank}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DeadlineBadge — amber if ≤ 48 h away, subtle otherwise
// ---------------------------------------------------------------------------

function DeadlineBadge({ deadline }: { deadline: string }) {
  const deadlineMs = new Date(deadline).getTime();
  const hoursUntil = (deadlineMs - Date.now()) / (1000 * 60 * 60);
  const isUrgent = hoursUntil <= 48;

  const formatted = new Date(deadline).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <span
      aria-label={`Due ${formatted}${isUrgent ? ' — urgent' : ''}`}
      className={cn(
        'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border',
        isUrgent
          ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
          : 'text-white/40 border-white/10 bg-white/[0.03]',
      )}
    >
      Due {formatted}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PriorityTaskRow — single ranked task card
// ---------------------------------------------------------------------------

interface PriorityTaskRowProps {
  task: AtlasTask;
  rank: number;
  energyBudget: number;
  onComplete: (taskId: string) => void;
  onDefer: (taskId: string) => void;
}

// ⚡ Bolt Optimization: Wrap row in React.memo to prevent O(N) evaluation and
// DOM reconciliation of all tasks when the parent's generic state (like chat input) updates.
const PriorityTaskRow = React.memo(function PriorityTaskRow({
  task,
  rank,
  energyBudget,
  onComplete,
  onDefer,
}: PriorityTaskRowProps) {
  const energyExceedsBudget = task.energyCost > energyBudget;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 group"
    >
      {/* Rank */}
      <RankBadge rank={rank} />

      {/* Title + badges */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-bold text-white/85 truncate leading-tight">
          {task.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Energy cost badge */}
          <span
            aria-label={`Energy cost: ${task.energyCost}${energyExceedsBudget ? ' — exceeds budget' : ''}`}
            className={cn(
              'inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider',
              energyExceedsBudget ? 'text-rose-400' : 'text-sky-300',
            )}
          >
            <Zap
              className={cn('w-3 h-3', energyExceedsBudget ? 'text-rose-400' : 'text-sky-400')}
              aria-hidden="true"
            />
            {task.energyCost}
          </span>

          {/* Deadline badge */}
          {task.deadline && <DeadlineBadge deadline={task.deadline} />}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={() => onComplete(task.id)}
          aria-label={`Complete "${task.title}"`}
          className="p-1.5 h-auto text-white/30 hover:text-emerald-400"
        >
          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        </NeuralButton>
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={() => onDefer(task.id)}
          aria-label={`Defer "${task.title}"`}
          className="p-1.5 h-auto text-white/20 hover:text-white/50"
        >
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </NeuralButton>
      </div>
    </motion.div>
  );
});

// ---------------------------------------------------------------------------
// PriorityInbox — Main Export
// ---------------------------------------------------------------------------

export interface PriorityInboxProps {
  tasks: AtlasTask[];
  /** Current energy budget (0–10) sourced from NSV */
  energyBudget: number;
  onCompleteTask: (taskId: string) => void;
  onDeferTask: (taskId: string) => void;
  /** Send a pre-composed message to the Atlas AI panel */
  onSendMessage: (message: string) => void;
}

export function PriorityInbox({
  tasks,
  energyBudget,
  onCompleteTask,
  onDeferTask,
  onSendMessage,
}: PriorityInboxProps) {
  // Derive eligible + top-3 once per render cycle — O(n log n)
  const { eligible, topTasks } = useMemo(() => {
    const eligible = tasks.filter(
      (t) => t.status === 'queued' || t.status === 'active',
    );
    const topTasks = selectTopTasks(tasks, energyBudget);
    return { eligible, topTasks };
  }, [tasks, energyBudget]);

  const eligibleCount = eligible.length;

  // Builds a natural-language defer request for all tasks outside the top 3
  const handleDeferOthers = () => {
    const otherTaskTitles = eligible
      .filter((t) => !topTasks.find((top) => top.id === t.id))
      .slice(0, 10)
      .map((t) => `"${t.title}"`)
      .join(', ');

    onSendMessage(
      `Please defer these lower-priority tasks to later this week: ${otherTaskTitles}. Keep my top 3 priorities active.`,
    );
  };

  // Empty state — no eligible tasks at all (positive state: use Inbox icon, not alert)
  if (eligibleCount === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Inbox clear"
        description="No queued tasks. Add something to work on."
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
      aria-label="Priority Inbox"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <span className="text-xs font-black uppercase tracking-[0.12em] text-sky-400 font-display">
            Priority Inbox
          </span>
        </div>
        <span className="text-[10px] text-white/30 uppercase tracking-wider" aria-live="polite">
          Top {topTasks.length} of {eligibleCount}
        </span>
      </div>

      {/* ── Task cards ──────────────────────────────────────────────────── */}
      {topTasks.map((task, index) => (
        <PriorityTaskRow
          key={task.id}
          task={task}
          rank={index + 1}
          energyBudget={energyBudget}
          onComplete={onCompleteTask}
          onDefer={onDeferTask}
        />
      ))}

      {/* ── Defer others button — only when there are tasks beyond top 3 ── */}
      {eligibleCount > 3 && (
        <NeuralButton
          variant="secondary"
          size="sm"
          onClick={handleDeferOthers}
          className="w-full h-auto py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 hover:text-white/50"
          aria-label={`Defer ${eligibleCount - 3} lower-priority tasks via Atlas`}
        >
          Defer {eligibleCount - 3} other tasks → Ask Atlas
        </NeuralButton>
      )}
    </motion.div>
  );
}
