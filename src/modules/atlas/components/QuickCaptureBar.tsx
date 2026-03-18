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
import { Plus, X, Zap } from 'lucide-react';
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

// ─── Energy levels ────────────────────────────────────────────────────────────

const ENERGY_LEVELS: { value: number; label: string; color: string; bg: string }[] = [
  { value: 1, label: 'Depleted',  color: 'text-red-400',    bg: 'bg-red-500/15 border-red-500/30' },
  { value: 2, label: 'Low',       color: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30' },
  { value: 3, label: 'Moderate',  color: 'text-amber-400',  bg: 'bg-amber-500/15 border-amber-500/30' },
  { value: 4, label: 'Good',      color: 'text-lime-400',   bg: 'bg-lime-500/15 border-lime-500/30' },
  { value: 5, label: 'Peak',      color: 'text-emerald-400',bg: 'bg-emerald-500/15 border-emerald-500/30' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickCaptureBarProps {
  onAddTask:    (task: Partial<AtlasTask>)    => void;
  onAddHabit:   (habit: Partial<AtlasHabit>) => void;
  onLogEnergy?: (level: number, timeOfDay: string) => void;
  disabled?:    boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QuickCaptureBar({ onAddTask, onAddHabit, onLogEnergy, disabled = false }: QuickCaptureBarProps) {
  const { parse } = useAtlasEntryParser();
  const inputRef = useRef<HTMLInputElement>(null);

  const [inputValue,   setInputValue]   = useState('');
  const [parsed,       setParsed]       = useState<ParsedEntry | null>(null);
  const [loggedEnergy, setLoggedEnergy] = useState<number | null>(null);
  const [energyLogged, setEnergyLogged] = useState(false);

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

  const handleEnergyLog = useCallback((level: number) => {
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 12 ? 'morning' :
      hour < 17 ? 'afternoon' :
      'evening';

    setLoggedEnergy(level);
    setEnergyLogged(true);
    onLogEnergy?.(level, timeOfDay);

    // Auto-reset success indicator after 2 s
    setTimeout(() => setEnergyLogged(false), 2000);
  }, [onLogEnergy]);

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
            className="shrink-0 text-white/30 hover:text-white/70 transition-colors p-2.5"
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
            'w-10 h-10 rounded-lg flex-none',
            'bg-sky-500 hover:bg-sky-400 active:bg-sky-600',
            'text-white transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'shadow-[0_2px_8px_rgba(14,165,233,0.35)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50'
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

      {/* ── Inline energy log row ─────────────────────────────────────────────── */}
      {onLogEnergy && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl',
            'bg-white/[0.02] border border-white/[0.06]',
            disabled && 'opacity-50 pointer-events-none',
          )}
          role="group"
          aria-label="Log current energy level"
        >
          <Zap
            className={cn(
              'w-3.5 h-3.5 shrink-0 transition-colors',
              loggedEnergy !== null ? ENERGY_LEVELS[loggedEnergy - 1]?.color : 'text-white/25',
            )}
            aria-hidden="true"
          />
          <span className="text-[10px] text-white/30 font-medium shrink-0 w-[62px]">
            {energyLogged
              ? <span className="text-emerald-400 font-bold">Logged ✓</span>
              : 'Energy now:'}
          </span>
          <div className="flex items-center gap-1.5 flex-1 justify-between">
            {ENERGY_LEVELS.map(({ value, label, color, bg }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleEnergyLog(value)}
                aria-label={`Energy level ${value}: ${label}`}
                aria-pressed={loggedEnergy === value}
                className={cn(
                  'flex-1 h-6 rounded-lg border text-[10px] font-bold transition-all',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50',
                  loggedEnergy === value
                    ? cn(bg, color)
                    : 'bg-white/[0.03] border-white/[0.08] text-white/30 hover:bg-white/[0.06] hover:text-white/50',
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-white/20 shrink-0 w-[42px] text-right">
            {loggedEnergy !== null ? ENERGY_LEVELS[loggedEnergy - 1]?.label : ''}
          </span>
        </div>
      )}
    </div>
  );
}
