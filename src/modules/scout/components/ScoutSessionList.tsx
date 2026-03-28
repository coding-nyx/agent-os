import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive,
  ArrowRight,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import type { ResearchSession, ResearchSessionStatus } from '../types';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralDropdown } from '@/core/components/NeuralDropdown';
import { NeuralModal } from '@/core/components/NeuralModal';
import { NeuralInput } from '@/core/components/NeuralInput';

interface ScoutSessionListProps {
  sessions: ResearchSession[];
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRename?: (sessionId: string, newTopic: string) => Promise<void>;
  onArchive?: (sessionId: string) => Promise<void>;
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
  archived: 'Archived',
};

const statusBadgeClasses: Record<ResearchSessionStatus, string> = {
  idle: 'border-white/[0.12] bg-white/[0.04] text-white/55',
  decomposing: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
  awaiting_review: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  searching: 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)] text-[var(--module-color-300)]',
  synthesizing: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-300',
  complete: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  error: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  cancelled: 'border-white/[0.12] bg-white/[0.045] text-white/40',
  archived: 'border-white/[0.09] bg-white/[0.03] text-white/30',
};

const statusDotClasses: Record<ResearchSessionStatus, string> = {
  idle:            'bg-white/25',
  decomposing:     'bg-sky-400',
  awaiting_review: 'bg-amber-400',
  searching:       'bg-[var(--module-color-400)]',
  synthesizing:    'bg-fuchsia-400',
  complete:        'bg-emerald-400',
  error:           'bg-rose-400',
  cancelled:       'bg-white/15',
  archived:        'bg-white/10',
};

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

interface RenameDialogState {
  sessionId: string;
  currentTopic: string;
}

export function ScoutSessionList({
  sessions,
  onSelect,
  onDelete,
  onRename,
  onArchive,
  activeSessionId,
}: ScoutSessionListProps) {
  const [renameDialog, setRenameDialog] = useState<RenameDialogState | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const activeSessions = sessions.filter((s) => !s.archived);

  const handleOpenRename = (session: ResearchSession) => {
    setRenameValue(session.topic);
    setRenameDialog({ sessionId: session.id, currentTopic: session.topic });
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameDialog || !renameValue.trim() || !onRename) return;
    setIsRenaming(true);
    try {
      await onRename(renameDialog.sessionId, renameValue.trim());
    } finally {
      setIsRenaming(false);
      setRenameDialog(null);
      setRenameValue('');
    }
  };

  const handleRenameClose = () => {
    setRenameDialog(null);
    setRenameValue('');
  };

  if (activeSessions.length === 0) {
    return (
      <>
        <div className="surface-foundation flex flex-col items-center justify-center gap-3 rounded-[var(--foundation-radius-card)] border-dashed px-6 py-8 text-center sm:px-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.045] text-white/20">
            <Search size={20} aria-hidden="true" />
          </div>
          <p className="text-item-title text-white/72">No research sessions yet</p>
          <p className="max-w-sm text-body-secondary text-white/45">
            Start a deep research session and your active investigations will appear here.
          </p>
        </div>
        <RenameModal
          dialog={renameDialog}
          value={renameValue}
          isRenaming={isRenaming}
          onChange={setRenameValue}
          onSubmit={handleRenameSubmit}
          onClose={handleRenameClose}
        />
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {activeSessions.map((session) => {
            const isActive = activeSessionId === session.id;
            const subQuestionCount = session.subQuestions.length;

            const menuItems = [
              ...(onRename
                ? [{
                    label: 'Rename',
                    icon: <Pencil size={13} />,
                    onClick: () => handleOpenRename(session),
                  }]
                : []),
              ...(onArchive
                ? [{
                    label: 'Archive',
                    icon: <Archive size={13} />,
                    onClick: () => onArchive(session.id),
                  }]
                : []),
              { type: 'separator' as const },
              {
                label: 'Delete',
                icon: <Trash2 size={13} />,
                variant: 'danger' as const,
                onClick: () => onDelete(session.id),
              },
            ];

            return (
              <motion.article
                key={session.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors',
                  isActive
                    ? 'border-[var(--module-accent-border)] bg-[var(--module-accent-muted)]'
                    : 'border-white/[0.09] bg-white/[0.045] hover:border-white/[0.12] hover:bg-white/[0.045]'
                )}
              >
                {/* Status dot */}
                <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClasses[session.status])} />

                {/* Clickable topic + meta */}
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-accent-ring)]"
                  aria-label={`Open research session ${session.topic}`}
                >
                  <p className={cn('truncate text-[13px] font-semibold',
                    isActive ? 'text-[var(--module-color-300)]' : 'text-white/85 group-hover:text-white')}>
                    {session.topic}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                      statusBadgeClasses[session.status])}>
                      {statusLabelMap[session.status]}
                    </span>
                    {isActive && (
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--module-color-300)]">
                        Current
                      </span>
                    )}
                    <span className="text-[11px] text-white/28">{formatUpdatedDate(session.updatedAt)}</span>
                    {subQuestionCount > 0 && (
                      <span className="text-[11px] text-white/35">{subQuestionCount} question{subQuestionCount === 1 ? '' : 's'}</span>
                    )}
                  </div>
                </button>

                {/* Open arrow */}
                <div className="shrink-0">
                  <ArrowRight size={14} className={cn('transition-colors',
                    isActive ? 'text-[var(--module-color-400)]' : 'text-white/20 group-hover:text-white/45')} />
                  <span className="sr-only">Open</span>
                </div>

                {/* Context menu — 3-dot kebab */}
                <NeuralDropdown
                  trigger={
                    <NeuralButton
                      type="button"
                      variant="ghost"
                      aria-label={`Session options for ${session.topic}`}
                      className="h-11 w-11 shrink-0 p-0 text-white/30 opacity-100 sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:bg-white/10 hover:text-white/70"
                    >
                      <MoreHorizontal size={14} />
                    </NeuralButton>
                  }
                  items={menuItems}
                  align="end"
                />
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>

      <RenameModal
        dialog={renameDialog}
        value={renameValue}
        isRenaming={isRenaming}
        onChange={setRenameValue}
        onSubmit={handleRenameSubmit}
        onClose={handleRenameClose}
      />
    </>
  );
}

interface RenameModalProps {
  dialog: RenameDialogState | null;
  value: string;
  isRenaming: boolean;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

function RenameModal({ dialog, value, isRenaming, onChange, onSubmit, onClose }: RenameModalProps) {
  return (
    <NeuralModal
      isOpen={dialog !== null}
      onClose={onClose}
      title="Rename Session"
      subtitle="Update the topic title for this research session."
      icon={Pencil}
      themeColor="module"
      maxWidth="sm"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <NeuralInput
          label="Session topic"
          autoFocus
          placeholder="Enter a new topic..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex justify-end gap-3 pt-2">
          <NeuralButton
            type="button"
            variant="ghost"
            onClick={onClose}
            className="min-h-10 px-4 text-white/50 hover:text-white"
          >
            Cancel
          </NeuralButton>
          <NeuralButton
            type="submit"
            themeColor="lime"
            disabled={!value.trim() || isRenaming}
            className="min-h-10 px-4"
          >
            {isRenaming ? 'Saving...' : 'Rename'}
          </NeuralButton>
        </div>
      </form>
    </NeuralModal>
  );
}
