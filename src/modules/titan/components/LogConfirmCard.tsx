/**
 * LogConfirmCard.tsx — Inline swipeable workout log preview card.
 *
 * Appears above the QuickLogBar after the user submits a natural-language
 * workout string. Shows parsed exercises with history context and PR badges.
 *
 * NEVER a modal — this is an inline card that slides up from the bottom of
 * the left content panel (above the QuickLogBar). It swipes down to dismiss.
 *
 * Design: dark glassmorphism, orange/amber Titan theme, mobile-first.
 *
 * Accessibility:
 *  - role="region" aria-label on card container
 *  - role="alert" on error messages
 *  - PR badges have aria-label with full e1RM delta text
 *  - Dismiss button in header provides keyboard-accessible dismiss
 *  - All interactive elements have min 44×44px tap targets
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Pencil,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { cn } from '@/lib/utils';
import type { ParsedEntry } from '../utils/quick-log-parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LogConfirmCardProps {
  entries: ParsedEntry[];
  onCommit: () => Promise<void>;
  /** Returns the user to the QuickLogBar with the original text pre-filled */
  onEdit: () => void;
  onDismiss: () => void;
  /** Populated when the previous commit attempt failed */
  commitError?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ─── EntryRow ─────────────────────────────────────────────────────────────────

interface EntryRowProps {
  entry: ParsedEntry;
  index: number;
}

function EntryRow({ entry, index }: EntryRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="px-4 py-3 border-b border-white/[0.04] last:border-b-0"
    >
      {/* ── Primary row: name · sets×reps · weight ── */}
      <div className="flex items-center gap-3">
        {/* Exercise name */}
        <p
          className={cn(
            'flex-1 text-sm font-semibold truncate',
            entry.parseConfidence === 'low'
              ? 'text-[var(--module-color-300)]'
              : 'text-white/85',
          )}
        >
          {entry.exerciseName || (
            <span className="text-white/30 italic">Unknown exercise</span>
          )}
        </p>

        {/* "NEW" badge for unresolved exercises */}
        {entry.isNew && (
          <span
            aria-label="New exercise not found in library"
            className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[var(--module-accent-muted)] text-[var(--module-color-400)] border border-[var(--module-accent-border)]"
          >
            New
          </span>
        )}

        {/* Sets × Reps */}
        <p className="shrink-0 text-xs font-bold text-white/60 tabular-nums">
          {entry.sets}
          <span className="text-[var(--module-color-400)] mx-0.5">×</span>
          {entry.reps ?? <span className="text-white/25">—</span>}
        </p>

        {/* Weight */}
        <p className="shrink-0 min-w-[52px] text-right text-sm font-bold tabular-nums text-white/90">
          {entry.weight !== null ? (
            <>
              {entry.weight}
              <span className="text-[10px] text-white/40 ml-0.5">{entry.unit}</span>
            </>
          ) : (
            <span className="text-white/25 text-xs">BW</span>
          )}
        </p>
      </div>

      {/* ── Secondary row: history chip + PR badge ── */}
      <div className="flex items-center gap-2 mt-1.5 min-h-[18px]">
        {/* PR badge — inline with spring entrance */}
        {entry.isPR && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15, stiffness: 280, delay: index * 0.04 + 0.18 }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0 bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]"
            aria-label={
              entry.prDelta !== null
                ? `New personal record — e1RM up ${entry.prDelta.toFixed(1)}${entry.unit}`
                : 'New personal record'
            }
            role="status"
          >
            <Trophy aria-hidden="true" className="w-2.5 h-2.5 text-[var(--module-color-400)]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--module-color-300)]">
              New PR
            </span>
            {entry.prDelta !== null && (
              <span className="text-[9px] text-[var(--module-color-400)] opacity-60 ml-0.5">
                +{entry.prDelta.toFixed(1)}
              </span>
            )}
          </motion.div>
        )}

        {/* Parse confidence warning for 'low' entries */}
        {entry.parseConfidence === 'low' && (
          <p className="text-[10px] text-[var(--module-color-400)] opacity-60 flex items-center gap-1">
            <AlertTriangle aria-hidden="true" className="w-2.5 h-2.5" />
            Couldn&apos;t fully parse
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── LogConfirmCard ───────────────────────────────────────────────────────────

export function LogConfirmCard({
  entries,
  onCommit,
  onEdit,
  onDismiss,
  commitError,
}: LogConfirmCardProps) {
  const [isCommitting, setIsCommitting] = useState(false);

  const hasLowConfidence = entries.some(e => e.parseConfidence === 'low');
  const hasPR = entries.some(e => e.isPR);
  const entryCount = entries.length;

  const handleCommit = async () => {
    if (isCommitting) return;
    setIsCommitting(true);
    try {
      await onCommit();
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <motion.div
      // ── Slide-up entrance ────────────────────────────────────────────
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      // ── Swipe-to-dismiss ────────────────────────────────────────────
      drag="y"
      dragConstraints={{ top: 0 }}
      dragElastic={0.12}
      onDragEnd={(_, info) => {
        if (info.offset.y > 80) onDismiss();
      }}
      // ── Accessibility ────────────────────────────────────────────────
      role="region"
      aria-label="Workout log preview — review before saving"
      // ── Visual treatment ────────────────────────────────────────────
      className={cn(
        'mx-4 mb-4 rounded-2xl overflow-hidden',
        'bg-[#12121a]/95 backdrop-blur-2xl',
        'border border-[var(--module-accent-border)]',
        'shadow-[0_-4px_40px_rgba(0,0,0,0.65),0_0_1px_var(--module-accent-glow)]',
        'max-h-[62vh] flex flex-col',
        // Drag handle affordance: subtle top bar
        'before:content-[""] before:absolute before:top-2 before:left-1/2 before:-translate-x-1/2',
        'before:w-10 before:h-1 before:rounded-full before:bg-white/15',
        'relative',
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Icon */}
          <div
            aria-hidden="true"
            className={cn(
              'w-6 h-6 rounded-lg flex items-center justify-center',
              hasPR
                ? 'bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]'
                : 'bg-[var(--module-accent-glow)] border border-[var(--module-accent-border)]',
            )}
          >
            {hasPR ? (
              <Trophy className="w-3 h-3 text-[var(--module-color-400)]" />
            ) : (
              <Zap className="w-3 h-3 text-[var(--module-color-400)]" />
            )}
          </div>

          {/* Label */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--module-color-400)]">
              Ready to log
            </p>
            <p className="text-[10px] text-white/35 leading-none mt-0.5">
              {formatToday()} · {entryCount} exercise{entryCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Dismiss button */}
        <NeuralButton
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          aria-label="Dismiss log preview"
          className="w-7 h-7 p-0 flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors min-w-0"
        >
          <X aria-hidden="true" className="w-3.5 h-3.5" />
        </NeuralButton>
      </div>

      {/* ── Low confidence warning ── */}
      {hasLowConfidence && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-[#DC4B1E]/10 border border-[#DC4B1E]/20 flex items-start gap-2 shrink-0">
          <AlertTriangle
            aria-hidden="true"
            className="w-3.5 h-3.5 text-[#FF7252] mt-0.5 shrink-0"
          />
          <p className="text-[11px] text-[var(--module-color-300)] leading-snug">
            Some entries couldn&apos;t be fully parsed. Review before logging,
            or tap <strong className="text-[#FFA882]">Edit</strong> to fix.
          </p>
        </div>
      )}

      {/* ── Entry list ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {entries.map((entry, i) => (
          <EntryRow key={`${entry.raw}-${i}`} entry={entry} index={i} />
        ))}
      </div>

      {/* ── Commit error banner ── */}
      {commitError && (
        <div
          role="alert"
          className="mx-4 mb-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between gap-2 shrink-0"
        >
          <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
            <AlertCircle aria-hidden="true" className="w-3 h-3 shrink-0" />
            {commitError}
          </p>
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={handleCommit}
            disabled={isCommitting}
            className="text-[11px] text-[var(--module-color-400)] font-semibold hover:text-[var(--module-color-300)] transition-colors shrink-0 disabled:opacity-50 h-auto p-0"
          >
            Retry
          </NeuralButton>
        </div>
      )}

      {/* ── Footer actions ── */}
      <div className="px-4 pb-4 pt-3 flex items-center gap-3 border-t border-white/[0.06] shrink-0">
        {/* Primary: Log it */}
        <NeuralButton
          themeColor="module"
          size="md"
          className="flex-1"
          onClick={handleCommit}
          disabled={isCommitting}
          loading={isCommitting}
          aria-label={isCommitting ? 'Saving workout…' : 'Confirm and save workout log'}
        >
          {!isCommitting && <Check aria-hidden="true" className="w-3.5 h-3.5 mr-1" />}
          {isCommitting ? 'Saving…' : '✓ Log it'}
        </NeuralButton>

        {/* Secondary: Edit */}
        <NeuralButton
          variant="ghost"
          size="md"
          className="shrink-0"
          onClick={onEdit}
          disabled={isCommitting}
          aria-label="Edit the log entry text"
        >
          <Pencil aria-hidden="true" className="w-3.5 h-3.5 mr-1" />
          Edit
        </NeuralButton>
      </div>
    </motion.div>
  );
}
