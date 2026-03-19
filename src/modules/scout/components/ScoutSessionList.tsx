import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import type { ResearchSession, ResearchSessionStatus } from '../types';
import { cn } from '@/lib/utils';

interface ScoutSessionListProps {
  sessions: ResearchSession[];
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  activeSessionId?: string;
}

const statusLabelMap: Record<ResearchSessionStatus, string> = {
  idle: 'Idle',
  decomposing: 'Decomposing',
  awaiting_review: 'Awaiting review',
  searching: 'Searching',
  synthesizing: 'Synthesizing',
  complete: 'Complete',
  error: 'Error',
  cancelled: 'Cancelled',
};

const statusBadgeClasses: Record<ResearchSessionStatus, string> = {
  idle: 'border-white/10 bg-white/[0.04] text-white/55',
  decomposing: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  awaiting_review: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  searching: 'border-lime-500/20 bg-lime-500/10 text-lime-300',
  synthesizing: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300',
  complete: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  error: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  cancelled: 'border-white/10 bg-white/[0.03] text-white/40',
};

const statusIconClasses: Record<ResearchSessionStatus, string> = {
  idle: 'bg-white/[0.04] text-white/45',
  decomposing: 'bg-sky-500/12 text-sky-300',
  awaiting_review: 'bg-amber-500/12 text-amber-300',
  searching: 'bg-lime-500/12 text-lime-300',
  synthesizing: 'bg-fuchsia-500/12 text-fuchsia-300',
  complete: 'bg-emerald-500/12 text-emerald-300',
  error: 'bg-rose-500/12 text-rose-300',
  cancelled: 'bg-white/[0.04] text-white/35',
};

const processingStatuses: ResearchSessionStatus[] = ['decomposing', 'searching', 'synthesizing'];

function getSessionStatusIcon(status: ResearchSessionStatus) {
  if (processingStatuses.includes(status)) {
    return <Loader2 size={18} className="animate-spin" aria-hidden="true" />;
  }

  if (status === 'complete') {
    return <CheckCircle2 size={18} aria-hidden="true" />;
  }

  if (status === 'error') {
    return <AlertCircle size={18} aria-hidden="true" />;
  }

  return <Clock size={18} aria-hidden="true" />;
}

function formatUpdatedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown update time';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function ScoutSessionList({ sessions, onSelect, onDelete, activeSessionId }: ScoutSessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="surface-foundation flex flex-col items-center justify-center gap-3 rounded-[var(--foundation-radius-card)] border-dashed px-6 py-8 text-center sm:px-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.03] text-white/20">
          <Search size={20} aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <p className="text-item-title text-white/72">No research sessions yet</p>
          <p className="max-w-md text-body-secondary text-white/50">
            Ask Scout to start a deep research session and your active investigations will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {sessions.map((session) => {
          const isActive = activeSessionId === session.id;
          const subQuestionCount = session.subQuestions.length;

          return (
            <motion.div
              key={session.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className={cn(
                'surface-foundation overflow-hidden rounded-[var(--foundation-radius-card)] transition-colors',
                isActive
                  ? 'border-lime-500/30 bg-lime-500/[0.08] shadow-[0_0_0_1px_rgba(132,204,22,0.10)]'
                  : 'border-white/8 bg-white/[0.02]'
              )}
            >
              <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start sm:justify-between sm:p-4">
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  aria-label={`Open research session ${session.topic}`}
                  className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-2xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lime-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040406]"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/8',
                      isActive ? 'bg-lime-500/16 text-lime-300' : statusIconClasses[session.status]
                    )}
                  >
                    {getSessionStatusIcon(session.status)}
                  </span>

                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-item-title break-words text-white/88',
                          isActive && 'text-lime-100'
                        )}
                      >
                        {session.topic}
                      </span>
                      {isActive && (
                        <span className="rounded-full border border-lime-500/25 bg-lime-500/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-lime-200">
                          Current
                        </span>
                      )}
                    </span>

                    <span className="flex flex-wrap items-center gap-2 text-meta text-white/48">
                      <span
                        className={cn(
                          'rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                          statusBadgeClasses[session.status]
                        )}
                      >
                        {statusLabelMap[session.status]}
                      </span>
                      <span className="text-white/28">Updated {formatUpdatedDate(session.updatedAt)}</span>
                      <span className="text-white/28">•</span>
                      <span className="text-white/40">
                        {subQuestionCount} question{subQuestionCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </span>
                </button>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                      isActive ? 'text-lime-200' : 'text-white/35'
                    )}
                  >
                    <span>Open</span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </span>

                  <button
                    type="button"
                    onClick={() => onDelete(session.id)}
                    aria-label={`Delete research session ${session.topic}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/55 transition-colors hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040406]"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
