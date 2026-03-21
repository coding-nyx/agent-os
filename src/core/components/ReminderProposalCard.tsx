import React from 'react';
import { Clock, Check, X, Loader2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import type { ReminderProposal } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

function formatRecurrence(rec: ReminderProposal['recurrence']): string {
  if (rec.kind === 'once') return `Once at ${new Date(rec.dueAt).toLocaleString()}`;
  if (rec.kind === 'hourly') return rec.intervalHours === 1 ? 'Every hour' : `Every ${rec.intervalHours} hours`;
  if (rec.kind === 'every_n_days') return rec.intervalDays === 1 ? 'Every day' : `Every ${rec.intervalDays} days`;
  if (rec.kind === 'weekly_by_days') return `Weekly at ${rec.timeOfDay}`;
  if (rec.kind === 'daily_window') return `Daily ${rec.windowStart}–${rec.windowEnd}`;
  return 'Custom schedule';
}

export function ReminderProposalCard({
  proposal,
  onConfirm,
  onDismiss,
  isConfirming,
  isDismissing,
  className,
}: {
  proposal: ReminderProposal;
  onConfirm: () => void;
  onDismiss: () => void;
  isConfirming?: boolean;
  isDismissing?: boolean;
  className?: string;
}) {
  const isBusy = isConfirming || isDismissing;
  return (
    <div className={cn('rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 space-y-3', className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-300">
          <Clock className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200/70">
            Reminder Proposal
          </p>
          <p className="mt-1 text-sm font-semibold text-white/90 break-words">
            {proposal.title}
          </p>
          {proposal.note && (
            <p className="mt-1 text-[11px] text-white/50 break-words">
              {proposal.note}
            </p>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/40">
            {formatRecurrence(proposal.recurrence)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          disabled={isBusy}
          className="text-white/50 hover:text-white"
        >
          {isDismissing
            ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            : <X className="h-3.5 w-3.5 mr-2" />}
          Dismiss
        </NeuralButton>
        <NeuralButton
          size="sm"
          onClick={onConfirm}
          disabled={isBusy}
          className="bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20"
        >
          {isConfirming
            ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
            : <Check className="h-3.5 w-3.5 mr-2" />}
          {isConfirming ? 'Scheduling…' : 'Confirm'}
        </NeuralButton>
      </div>
    </div>
  );
}
