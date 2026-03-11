/**
 * JournalEntryCard — Compact card for the history list.
 *
 * Shows: formatted date, mood emoji, preview of first 80 chars of content,
 * and tag chips. Hover scales up slightly with Framer Motion.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/core/components/GlassCard';
import type { JournalEntry } from '@/lib/types';

interface JournalEntryCardProps {
  entry: JournalEntry;
  onClick: () => void;
}

const MOOD_EMOJI: Record<number, string> = {
  1: '😔',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😊',
};

function formatDate(dateStr: string): string {
  try {
    // dateStr is YYYY-MM-DD — parse as local date to avoid UTC offset shift.
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getPreview(entry: JournalEntry): string {
  const text = entry.freeform || entry.eveningReflection || entry.morningIntent || '';
  return text.length > 80 ? text.slice(0, 80).trimEnd() + '…' : text || 'No content yet.';
}

export function JournalEntryCard({ entry, onClick }: JournalEntryCardProps) {
  const emoji = MOOD_EMOJI[entry.mood] ?? '😐';
  const preview = getPreview(entry);
  const dateLabel = formatDate(entry.date);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-2xl"
    >
      <GlassCard className="p-4 hover:border-violet-500/20 transition-colors cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-2">
          {/* Date */}
          <span className="text-xs font-bold text-white/60 font-display tracking-wide">
            {dateLabel}
          </span>
          {/* Mood */}
          <span className="text-base leading-none" title={`Mood: ${entry.mood}/5`}>
            {emoji}
          </span>
        </div>

        {/* Preview text */}
        <p className="text-sm text-white/70 leading-relaxed line-clamp-2">{preview}</p>

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entry.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-medium text-violet-300/80 uppercase tracking-wide"
              >
                {tag}
              </span>
            ))}
            {entry.tags.length > 4 && (
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/30">
                +{entry.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </GlassCard>
    </motion.button>
  );
}
