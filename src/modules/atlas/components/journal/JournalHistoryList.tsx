/**
 * JournalHistoryList — Past entries grouped by month.
 *
 * Shows skeleton cards while loading, an empty state if no entries exist,
 * and month-grouped JournalEntryCard list otherwise.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { Skeleton } from '@/core/components/Skeleton';
import { JournalEntryCard } from './JournalEntryCard';
import type { JournalEntry } from '@/lib/types';

interface JournalHistoryListProps {
  entries: JournalEntry[];
  onSelect: (entry: JournalEntry) => void;
  isLoading: boolean;
}

function getMonthLabel(dateStr: string): string {
  try {
    const [year, month] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch {
    return dateStr.slice(0, 7);
  }
}

function groupByMonth(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const map = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const key = getMonthLabel(entry.date);
    const group = map.get(key);
    if (group) {
      group.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return map;
}

export function JournalHistoryList({ entries, onSelect, isLoading }: JournalHistoryListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 space-y-2">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center gap-4 py-20 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
          <BookOpen className="w-6 h-6 text-violet-400/50" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white/50">No journal entries yet</p>
          <p className="text-xs text-white/30">Start writing today — it only takes a minute.</p>
        </div>
      </motion.div>
    );
  }

  const grouped = groupByMonth(entries);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      {Array.from(grouped.entries()).map(([month, monthEntries]) => (
        <section key={month}>
          <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest font-display mb-3">
            {month}
          </h3>
          <div className="space-y-2">
            {monthEntries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} onClick={() => onSelect(entry)} />
            ))}
          </div>
        </section>
      ))}
    </motion.div>
  );
}
