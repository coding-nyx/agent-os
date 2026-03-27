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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAtlasEntryParser, ParsedEntry } from '../hooks/use-atlas-entry-parser';
import { EntryConfirmChip } from './EntryConfirmChip';
import { NeuralButton } from '@/core/components/NeuralButton';
import {
  AtlasTask,
  AtlasHabit,
  AtlasGoal,
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
  monthly:  'monthly',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickCaptureBarProps {
  onAddTask:    (task: Partial<AtlasTask>)    => void;
  onAddHabit:   (habit: Partial<AtlasHabit>) => void;
  onAddGoal?:   (goal: Partial<AtlasGoal>) => void;
  preferenceMode?: 'conversational' | 'structured';
  disabled?:    boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickCaptureBar({
  onAddTask,
  onAddHabit,
  onAddGoal,
  preferenceMode = 'conversational',
  disabled = false,
}: QuickCaptureBarProps) {
  const { parse } = useAtlasEntryParser();
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputValue,   setInputValue]   = useState('');
  const [parsed,       setParsed]       = useState<ParsedEntry | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  const PLACEHOLDERS = [
    'Add a task, habit, or goal…',
    'buy groceries priority:high due:tomorrow',
    'habit: meditate 10 min daily',
    'goal: read 12 books this year',
  ];

  useEffect(() => {
    if (isFocused || inputValue) return;
    const id = setInterval(() => setPlaceholderIdx(i => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, [isFocused, inputValue]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 400);
      return;
    }
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
    } else if (parsed.type === 'goal') {
      onAddGoal?.({
        title: parsed.title,
        deadline: parsed.dueDate,
        status: 'active'
      });
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
  }, [parsed, onAddTask, onAddHabit, onAddGoal]);

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
          // Container: dark glass surface with module-accent left accent
          'flex items-center gap-2 rounded-xl',
          'bg-slate-900/60 border border-white/[0.10]',
          'border-l-[3px] border-l-[var(--module-color-500)]',
          'px-3 py-1.5',
          'backdrop-blur-sm',
          'transition-colors',
          !disabled && 'focus-within:border-white/25 focus-within:bg-slate-900/80',
          disabled && 'opacity-50 cursor-not-allowed',
          isShaking && 'animate-[quicklog-shake_0.4s_ease-in-out]'
        )}
      >
        {/* Text input */}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          placeholder={PLACEHOLDERS[placeholderIdx]}
          aria-label="Quick capture input"
          className="flex-1 bg-transparent border-none outline-none ring-0 text-sm text-white placeholder:text-white/30 h-9 px-1"
        />

        {/* Clear button — only shown when there is text */}
        {inputValue.length > 0 && !disabled && (
          <NeuralButton
            variant="ghost"
            size="sm"
            onClick={handleClear}
            aria-label="Clear input"
            tabIndex={-1}
            className="shrink-0 p-0 w-8 h-8"
          >
            <X className="w-4 h-4" />
          </NeuralButton>
        )}

        {/* Submit button */}
        <NeuralButton
          size="sm"
          themeColor="module"
          onClick={handleSubmit}
          disabled={disabled || inputValue.trim().length === 0}
          aria-label="Add entry"
          className="shrink-0 w-9 h-9 p-0 rounded-lg shadow-[0_2px_8px_rgba(14,165,233,0.35)]"
        >
          <Plus className="w-4 h-4" />
        </NeuralButton>
      </div>

      {/* ── Confirm chip ──────────────────────────────────────────────────────── */}
      <EntryConfirmChip
        parsed={parsed}
        preferenceMode={preferenceMode}
        onConfirm={handleConfirm}
        onEdit={handleEdit}
        onDismiss={handleDismiss}
      />

      <p className="px-1 text-[11px] leading-relaxed text-white/30">
        {preferenceMode === 'structured'
          ? 'Structured mode: use labels like type:, due:, priority:, energy:, or repeat: for deterministic Atlas capture.'
          : 'Conversational mode: Atlas can infer tasks and habits from freeform text, then lets you confirm the structure.'}
      </p>

    </div>
  );
}
