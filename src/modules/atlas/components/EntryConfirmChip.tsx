/**
 * EntryConfirmChip
 *
 * Compact animated pill that slides in below the QuickCaptureBar after the
 * user submits a free-text entry and it has been parsed.
 *
 * It shows:
 *   • Type icon (CheckSquare for task, Repeat for habit)
 *   • Cleaned title
 *   • Parsed-field badges (📅 date, 🔁 recurrence, ⚡ energy, 🎯 priority)
 *   • [+ Add] primary CTA and [Edit] ghost CTA
 *
 * Animation: y −8 → 0 via Framer Motion spring on mount; y 0 → −8 on dismiss.
 *
 * Props:
 *   parsed    — the structured ParsedEntry produced by useAtlasEntryParser
 *   onConfirm — user pressed "+ Add"; parent should persist the entry
 *   onEdit    — user pressed "Edit"; parent should dismiss chip & re-focus input
 *   onDismiss — user pressed "×"; parent should dismiss chip
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckSquare,
  Repeat,
  CalendarDays,
  Zap,
  Target,
  X,
  Wand2,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NeuralButton } from '@/core/components/NeuralButton';
import { ParsedEntry } from '../hooks/use-atlas-entry-parser';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntryConfirmChipProps {
  /** The parsed entry to display. Pass `null` / falsy to hide the chip. */
  parsed: ParsedEntry | null;
  preferenceMode?: 'conversational' | 'structured';
  onConfirm: () => void;
  /** Dismiss chip and re-focus input so the user can amend the text. */
  onEdit: () => void;
  onDismiss: () => void;
}

// ─── Badge component ──────────────────────────────────────────────────────────

interface BadgeProps {
  icon: React.ReactNode;
  label: string;
  className?: string;
}

function Badge({ icon, label, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[10px] font-semibold tracking-wide',
        'bg-white/[0.06] text-white/60 border border-white/10',
        className
      )}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Label helpers ────────────────────────────────────────────────────────────

const ENERGY_LABEL: Record<string, string> = {
  low:    'Light',
  medium: 'Medium',
  high:   'Intense'
};

const PRIORITY_LABEL: Record<string, string> = {
  low:    'Low',
  medium: 'Normal',
  high:   'Urgent'
};

const RECURRENCE_LABEL: Record<string, string> = {
  daily:    'Every day',
  weekdays: 'Weekdays',
  weekly:   'Weekly',
  monthly:  'Monthly'
};

// ─── Component ────────────────────────────────────────────────────────────────

export function EntryConfirmChip({
  parsed,
  preferenceMode,
  onConfirm,
  onEdit,
  onDismiss,
}: EntryConfirmChipProps) {
  return (
    <AnimatePresence>
      {parsed && (
        <motion.div
          key="entry-confirm-chip"
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className={cn(
            'relative rounded-xl border border-white/10 bg-white/[0.04]',
            'backdrop-blur-md px-4 py-3 flex flex-col gap-3',
            'shadow-[0_4px_24px_rgba(0,0,0,0.35)]'
          )}
          aria-label="Confirm captured entry"
          role="region"
        >
          {/* ── Header row ─────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {/* Type icon */}
              <span
                className={cn(
                  'shrink-0 flex items-center justify-center w-6 h-6 rounded-md',
                  parsed.type === 'habit'
                    ? 'bg-[var(--module-accent-glow)] text-[var(--module-color-400)]'
                    : 'bg-[var(--module-accent-glow)] text-[var(--module-color-400)]'
                )}
              >
                {parsed.type === 'habit'
                  ? <Repeat className="w-3.5 h-3.5" aria-hidden />
                  : <CheckSquare className="w-3.5 h-3.5" aria-hidden />
                }
              </span>

              {/* Title */}
              <span className="text-sm font-semibold text-white/90 truncate leading-snug">
                {parsed.title}
              </span>

              {/* Entry type label */}
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[var(--module-color-400)]/70">
                {parsed.type}
              </span>
            </div>

            {/* Dismiss button */}
            <NeuralButton
              onClick={onDismiss}
              aria-label="Dismiss"
              variant="ghost"
              size="sm"
              className="shrink-0 !w-6 !h-6 !p-0 !min-h-0 text-white/30 hover:text-white/70 -mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </NeuralButton>
          </div>

          {/* ── Parsed-field badges ─────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-1.5">
            <Badge
              icon={
                parsed.ingestion.mode === 'structured'
                  ? <SlidersHorizontal className="w-3 h-3" aria-hidden />
                  : <Wand2 className="w-3 h-3" aria-hidden />
              }
              label={parsed.ingestion.mode === 'structured' ? 'Structured entry' : 'Freeform inference'}
              className={parsed.ingestion.mode === 'structured'
                ? 'text-sky-300 border-sky-500/30 bg-sky-500/10'
                : 'text-violet-300 border-violet-500/30 bg-violet-500/10'}
            />
            {parsed.dueDate && (
              <Badge
                icon={<CalendarDays className="w-3 h-3" aria-hidden />}
                label={parsed.dueDate}
              />
            )}
            {parsed.recurrenceRule && (
              <Badge
                icon={<Repeat className="w-3 h-3" aria-hidden />}
                label={RECURRENCE_LABEL[parsed.recurrenceRule] ?? parsed.recurrenceRule}
              />
            )}
            {parsed.energyLevel && (
              <Badge
                icon={<Zap className="w-3 h-3" aria-hidden />}
                label={ENERGY_LABEL[parsed.energyLevel] ?? parsed.energyLevel}
              />
            )}
            {parsed.priority && (
              <Badge
                icon={<Target className="w-3 h-3" aria-hidden />}
                label={PRIORITY_LABEL[parsed.priority] ?? parsed.priority}
                className={parsed.priority === 'high' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : ''}
              />
            )}
          </div>

          <p className="text-[10px] leading-relaxed text-white/35">
            {parsed.ingestion.guidance}
            {preferenceMode === 'structured' && parsed.ingestion.mode === 'unstructured'
              ? ' Structured mode is on — use labels like due:, priority:, or energy: to make this deterministic.'
              : null}
          </p>

          {/* ── Action row ──────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <NeuralButton
              onClick={onConfirm}
              themeColor="module"
              size="sm"
              className="!h-8 !px-3 !rounded-lg text-xs font-bold shadow-[0_2px_8px_rgba(14,165,233,0.4)]"
            >
              + Add
            </NeuralButton>
            <NeuralButton
              onClick={onEdit}
              variant="ghost"
              size="sm"
              className="!h-8 !px-3 !rounded-lg text-xs font-semibold text-white/50 hover:text-white/80"
            >
              Edit
            </NeuralButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
