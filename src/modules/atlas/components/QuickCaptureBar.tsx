/**
 * QuickCaptureBar
 *
 * Persistent single-line NLP input bar pinned at the top of the Atlas
 * Dashboard tab.  The user types a free-text entry such as:
 *   "call dentist Friday"
 *   "run every weekday easy"
 *   "ship auth PR urgent deep focus"
 *
 * On submit (Enter or click +) the text is parsed via `useAtlasEntryParser`
 * and an `EntryConfirmChip` slides in below with the structured preview.
 * The user then confirms (writes directly to the profile via the callbacks)
 * or edits/dismisses.
 *
 * Design tokens
 *   • Atlas module theme: sky (Tailwind sky-500, #0EA5E9)
 *   • Left border accent:  sky-500
 *   • Dark glassmorphism background consistent with existing Atlas surfaces
 *
 * Props:
 *   onAddTask   — called with Partial<AtlasTask> on confirmation of a task entry
 *   onAddHabit  — called with Partial<AtlasHabit> on confirmation of a habit entry
 *   disabled    — disables input and buttons (e.g. when vault is locked)
 *
 * Complexity: O(k) parse per keystroke-initiated submission, where k = ~30 rules.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAtlasEntryParser, ParsedEntry } from '../hooks/use-atlas-entry-parser';
import { EntryConfirmChip } from './EntryConfirmChip';
import {
  AtlasTask,
  AtlasHabit,
} from '../services/atlas-profile-service';

// ─── Energy / Priority conversion helpers ─────────────────────────────────────
// Maps NLP-extracted labels to the numeric values expected by AtlasTask /
// AtlasHabit constructors.

const ENERGY_TO_COST: Record<string, number> = {
  low:    2,
  medium: 4,
  high:   8
};

const PRIORITY_TO_NUM: Record<string, AtlasTask['priority']> = {
  low:    1,
  medium: 3,
  high:   5
};

const RECURRENCE_TO_FREQUENCY: Record<string, AtlasHabit['frequency']> = {
  daily:    'daily',
  weekdays: 'weekdays',
  weekly:   'weekly',
  monthly:  'weekly'  // 'monthly' has no direct AtlasHabit.frequency — default to weekly
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickCaptureBarProps {
  onAddTask:  (task: Partial<AtlasTask>)  => void;
  onAddHabit: (habit: Partial<AtlasHabit>) => void;
  disabled?:  boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickCaptureBar({ onAddTask, onAddHabit, disabled = false }: QuickCaptureBarProps) {
  const { parse } = useAtlasEntryParser();
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [parsed,     setParsed]     = useState<ParsedEntry | null>(null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setParsed(parse(trimmed));
  }, [inputValue, parse]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      setParsed(null);
      setInputValue('');
    }
  }, [handleSubmit]);

  const handleClear = useCallback(() => {
    setInputValue('');
    setParsed(null);
    inputRef.current?.focus();
  }, []);

  // ── Confirm: convert ParsedEntry → AtlasTask or AtlasHabit partial ──────────

  const handleConfirm = useCallback(() => {
    if (!parsed) return;

    const energyCost = parsed.energyLevel
      ? ENERGY_TO_COST[parsed.energyLevel] ?? 4
      : 4;

    if (parsed.type === 'habit') {
      const frequency: AtlasHabit['frequency'] = parsed.recurrenceRule
        ? (RECURRENCE_TO_FREQUENCY[parsed.recurrenceRule] ?? 'daily')
        : 'daily';

      const habit: Partial<AtlasHabit> = {
        title: parsed.title,
        frequency,
        energyCost,
        status: 'active'
      };
      onAddHabit(habit);
    } else {
      const priority = parsed.priority
        ? PRIORITY_TO_NUM[parsed.priority] ?? 3
        : 3;

      const task: Partial<AtlasTask> = {
        title: parsed.title,
        priority: priority as AtlasTask['priority'],
        energyCost,
        status: 'queued',
        dependencies: [],
        ...(parsed.dueDate ? { deadline: parsed.dueDate } : {})
      };
      onAddTask(task);
    }

    // Reset state after confirmation
    setInputValue('');
    setParsed(null);
    inputRef.current?.focus();
  }, [parsed, onAddTask, onAddHabit]);

  const handleEdit = useCallback(() => {
    // Dismiss chip and return focus to input so the user can amend
    setParsed(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleDismiss = useCallback(() => {
    setParsed(null);
    setInputValue('');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2" role="search" aria-label="Quick capture bar">
      {/* ── Input row ─────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          // Container: dark glass surface with sky-500 left accent
          'flex items-center gap-2 rounded-xl',
          'bg-white/[0.04] border border-white/10',
          'border-l-[3px] border-l-sky-500',
          'px-3 py-2.5',
          'backdrop-blur-sm',
          'transition-colors',
          !disabled && 'focus-within:border-white/20 focus-within:bg-white/[0.06]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Capture a task or habit… (e.g. 'call dentist Friday' or 'run every weekday')"
          aria-label="Quick capture input"
          className={cn(
            'flex-1 min-w-0 bg-transparent outline-none',
            'text-sm text-white/90 placeholder:text-white/30',
            'disabled:cursor-not-allowed'
          )}
        />

        {/* Clear button — only shown when there is text */}
        {inputValue.length > 0 && !disabled && (
          <button
            onClick={handleClear}
            aria-label="Clear input"
            tabIndex={-1}
            className="shrink-0 text-white/30 hover:text-white/70 transition-colors p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={disabled || inputValue.trim().length === 0}
          aria-label="Add entry"
          className={cn(
            'shrink-0 flex items-center justify-center',
            'w-7 h-7 rounded-lg',
            'bg-sky-500 hover:bg-sky-400 active:bg-sky-600',
            'text-white transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'shadow-[0_2px_8px_rgba(14,165,233,0.35)]'
          )}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* ── Confirm chip ──────────────────────────────────────────────────────── */}
      <EntryConfirmChip
        parsed={parsed}
        onConfirm={handleConfirm}
        onEdit={handleEdit}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
