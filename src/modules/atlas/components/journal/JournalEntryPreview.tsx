/**
 * JournalEntryPreview — Read-only slide-in panel for a historical journal entry.
 *
 * Renders every non-empty section of a JournalEntry in a glassmorphic card that
 * slides in from the right. The user can either close back to the history list
 * or click "Edit" to open the full JournalEntryEditor for the same entry.
 *
 * Accessibility contract:
 *  - Root is a <motion.article> with a descriptive aria-label
 *  - Every interactive control has a visible focus ring and aria-label
 *  - Section headings are <h4> elements (inside <section>) for correct heading hierarchy
 *  - Decorative icons carry aria-hidden="true"
 *  - Lists use <ul>/<li> with role/aria-label annotations where needed
 *  - Colour contrast: all text passes WCAG AA against the dark backdrop
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  PencilLine,
  X,
  Sunrise,
  Sparkles,
  BookOpen,
  Moon,
  Heart,
  AlertCircle,
  Dumbbell,
  Target,
} from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import type {
  JournalEntry,
  JournalHabitReflection,
  JournalGoalReflection,
} from '@/lib/types';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface JournalEntryPreviewProps {
  entry: JournalEntry;
  onClose: () => void;
  onEdit: () => void;
  onRemind?: (entry: JournalEntry) => void;
}

// ── Static maps ───────────────────────────────────────────────────────────────

const MOOD_MAP: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😔', label: 'Rough' },
  2: { emoji: '😕', label: 'Low' },
  3: { emoji: '😐', label: 'Okay' },
  4: { emoji: '🙂', label: 'Good' },
  5: { emoji: '😊', label: 'Great' },
};

const FELT_MAP: Record<JournalHabitReflection['felt'], string> = {
  great: '✅',
  okay: '🔄',
  struggled: '⚠️',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parses a YYYY-MM-DD date string as a *local* date (avoiding UTC midnight
 * offset) and formats it as a long weekday string.
 * e.g. "2026-03-11" → "Wednesday, March 11, 2026"
 */
function formatFullDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── Section scaffold ──────────────────────────────────────────────────────────

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

/**
 * A labelled section with a small icon + uppercase heading.
 * Uses <section> + <h4> for correct semantic hierarchy inside the <article>.
 */
function PreviewSection({ icon, label, children }: SectionProps) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-1.5">
        {/* Icon — decorative, aria-hidden */}
        <span className="text-violet-400/60 shrink-0" aria-hidden="true">
          {icon}
        </span>
        <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
          {label}
        </h4>
      </div>
      {children}
    </section>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function JournalEntryPreview({
  entry,
  onClose,
  onEdit,
  onRemind,
}: JournalEntryPreviewProps) {
  // Resolved mood data — fall back to "Okay" if value is out of range
  const mood = MOOD_MAP[entry.mood] ?? MOOD_MAP[3];
  const dateLabel = formatFullDate(entry.date);

  return (
    <motion.article
      // ── Slide-in from the right ─────────────────────────────────────────
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      // ── Layout & glass surface ──────────────────────────────────────────
      className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-5"
      aria-label={`Journal entry preview for ${dateLabel}`}
    >
      {/* ── 1. Header row ─────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3">
        {/* Left: date only */}
        <div className="min-w-0">
          <p className="text-sm font-bold text-white/80 leading-snug">
            {dateLabel}
          </p>
        </div>

        {/* Right: Edit + Remind + Close controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onRemind && (
            <NeuralButton
              variant="ghost"
              size="sm"
              themeColor="indigo"
              onClick={() => onRemind(entry)}
              aria-label="Create a reminder for this journal entry"
              className="flex items-center gap-1.5"
            >
              Remind
            </NeuralButton>
          )}
          <NeuralButton
            variant="ghost"
            size="sm"
            themeColor="indigo"
            onClick={onEdit}
            aria-label="Edit this journal entry"
            className="flex items-center gap-1.5"
          >
            <PencilLine className="w-3.5 h-3.5" aria-hidden="true" />
            Edit
          </NeuralButton>

          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close preview and return to history list"
            className="w-8 h-8 flex items-center justify-center p-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </NeuralButton>
        </div>
      </header>

      {/* ── 2. Mood + Energy — single combined widget ─────────────────────── */}
      <div
        className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full
                   bg-white/5 border border-white/10 text-xs"
        role="group"
        aria-label="Mood and energy"
      >
        {/* Mood */}
        <span className="flex items-center gap-1.5 text-white/70">
          <span aria-hidden="true">{mood.emoji}</span>
          <span>{mood.label}</span>
        </span>

        {/* Divider */}
        <span className="w-px h-3 bg-white/15" aria-hidden="true" />

        {/* Energy segments */}
        <span className="flex items-center gap-1.5 text-white/50">
          <span aria-hidden="true">⚡</span>
          <span className="sr-only">Energy {entry.energyLevel} of 5</span>
          <span className="flex gap-0.5 items-center" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((v) => (
              <span
                key={v}
                className={`block w-1.5 h-2.5 rounded-sm ${v <= entry.energyLevel ? 'bg-emerald-400/60' : 'bg-white/12'}`}
              />
            ))}
          </span>
        </span>
      </div>

      {/* ── 3. Morning Intent ─────────────────────────────────────────────── */}
      {entry.morningIntent.trim() !== '' && (
        <PreviewSection
          icon={<Sunrise className="w-3.5 h-3.5" />}
          label="Morning intention"
        >
          <div
            className="rich-preview text-sm text-white/80 italic leading-relaxed"
            dangerouslySetInnerHTML={{ __html: entry.morningIntent }}
          />
        </PreviewSection>
      )}

      {/* ── 4. AI Prompt ──────────────────────────────────────────────────── */}
      {entry.aiPromptUsed !== null && entry.aiPromptUsed.trim() !== '' && (
        <PreviewSection
          icon={<Sparkles className="w-3.5 h-3.5" />}
          label="Today's prompt"
        >
          <p className="text-sm text-violet-300/70 italic leading-relaxed">
            {entry.aiPromptUsed}
          </p>
        </PreviewSection>
      )}

      {/* ── 5. Free Write ─────────────────────────────────────────────────── */}
      {entry.freeform.trim() !== '' && (
        <PreviewSection
          icon={<BookOpen className="w-3.5 h-3.5" />}
          label="Reflections"
        >
          <div
            className="rich-preview text-sm text-white/80 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: entry.freeform }}
          />
        </PreviewSection>
      )}

      {/* ── 6. Evening Reflection ────────────────────────────────────────── */}
      {entry.eveningReflection.trim() !== '' && (
        <PreviewSection
          icon={<Moon className="w-3.5 h-3.5" />}
          label="How it went"
        >
          <div
            className="rich-preview text-sm text-white/80 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: entry.eveningReflection }}
          />
        </PreviewSection>
      )}

      {/* ── 7. Gratitude ─────────────────────────────────────────────────── */}
      {entry.gratitude.length > 0 && (
        <PreviewSection
          icon={<Heart className="w-3.5 h-3.5" />}
          label="Grateful for"
        >
          <ul aria-label="Gratitude items" className="space-y-1">
            {entry.gratitude.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-white/80 leading-relaxed"
              >
                <span className="text-violet-400/50 mt-px select-none" aria-hidden="true">
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </PreviewSection>
      )}

      {/* ── 8. Blockers ──────────────────────────────────────────────────── */}
      {entry.blockers.trim() !== '' && (
        <PreviewSection
          icon={<AlertCircle className="w-3.5 h-3.5" />}
          label="What got in the way"
        >
          {/* Amber tint signals friction without being alarming */}
          <div
            className="rich-preview text-sm text-amber-300/80 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: entry.blockers }}
          />
        </PreviewSection>
      )}

      {/* ── 9. Habits reflection ─────────────────────────────────────────── */}
      {entry.habitsReflection.length > 0 && (
        <PreviewSection
          icon={<Dumbbell className="w-3.5 h-3.5" />}
          label="Habits"
        >
          <ul aria-label="Habit reflections" className="space-y-1.5">
            {entry.habitsReflection.map((h: JournalHabitReflection, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-white/80 leading-relaxed"
              >
                {/* Felt emoji conveys emotional valence at a glance */}
                <span aria-label={`Felt: ${h.felt}`} className="shrink-0">
                  {FELT_MAP[h.felt] ?? '•'}
                </span>
                <span>
                  <span className="font-medium text-white/60">{h.habitId}</span>
                  {h.note.trim() !== '' && (
                    <span className="text-white/50"> — {h.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </PreviewSection>
      )}

      {/* ── 10. Goals reflection ─────────────────────────────────────────── */}
      {entry.goalsReflection.length > 0 && (
        <PreviewSection
          icon={<Target className="w-3.5 h-3.5" />}
          label="Goals"
        >
          <ul aria-label="Goal reflections" className="space-y-1.5">
            {entry.goalsReflection.map((g: JournalGoalReflection, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-white/80 leading-relaxed"
              >
                <span className="text-violet-400/50 mt-px select-none" aria-hidden="true">
                  •
                </span>
                <span>
                  <span className="font-medium text-white/60">{g.goalId}</span>
                  {g.note.trim() !== '' && (
                    <span className="text-white/50"> — {g.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </PreviewSection>
      )}

      {/* ── 11. Tags ─────────────────────────────────────────────────────── */}
      {entry.tags.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 pt-1"
          role="list"
          aria-label="Tags"
        >
          {entry.tags.map((tag) => (
            <span
              key={tag}
              role="listitem"
              className="px-2.5 py-0.5 rounded-full
                         bg-violet-500/10 border border-violet-500/20
                         text-[10px] font-semibold text-violet-300/80
                         uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.article>
  );
}
