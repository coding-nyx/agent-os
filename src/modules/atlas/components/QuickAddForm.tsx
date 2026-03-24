import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Calendar as CalendarIcon, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useUIStore } from '@/lib/stores/ui-store';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';

// ---------------------------------------------------------------------------
// QuickAddForm — FAB + modal for rapid task / habit / goal creation
// ---------------------------------------------------------------------------

type ItemType = 'task' | 'habit' | 'goal';

export interface TaskInput {
  title: string;
  priority: 1 | 2 | 3 | 4 | 5;
  energyCost: number;
  deadline?: string;
}

export interface HabitInput {
  title: string;
  energyCost: number;
  frequency: 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
  minimumViableVersion?: string;
}

export interface GoalInput {
  title: string;
  deadline?: string;
}

import type { AtlasTask, AtlasHabit, AtlasGoal } from '../services/atlas-profile-service';

interface QuickAddFormProps {
  onCreateTask: (task: Partial<AtlasTask>) => void;
  onCreateHabit: (habit: Partial<AtlasHabit>) => void;
  onCreateGoal: (goal: Partial<AtlasGoal>) => void;
  /** Optional controlled open state */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Whether to show the internal FAB trigger. Defaults to true. */
  showFAB?: boolean;
  /** Whether the FAB should be fluid (not fixed/absolute). Use for unified bars. */
  isFluid?: boolean;
}

const TYPE_OPTIONS: { key: ItemType; label: string }[] = [
  { key: 'task', label: 'Task' },
  { key: 'habit', label: 'Habit' },
  { key: 'goal', label: 'Goal' },
];

const PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const;

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-rose-500 border-rose-500 text-white',
  2: 'bg-orange-400 border-orange-400 text-white',
  3: 'bg-amber-400 border-amber-400 text-zinc-900',
  4: 'bg-sky-400 border-sky-400 text-white',
  5: 'bg-zinc-400 border-zinc-400 text-white',
};

const FOCUSABLE_SELECTOR =
  'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function QuickAddForm({
  onCreateTask,
  onCreateHabit,
  onCreateGoal,
  isOpen: controlledIsOpen,
  onOpenChange,
  showFAB = true,
  isFluid = false,
}: QuickAddFormProps) {
  const reducedMotion = useReducedMotion();
  const isChatOverlayOpen = useUIStore((s) => s.isChatOverlayOpen);

  // ---- Open / close state ----
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    if (onOpenChange) onOpenChange(val);
    else setInternalIsOpen(val);
  };

  // ---- Form state ----
  const [itemType, setItemType] = useState<ItemType>('task');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [energyCost, setEnergyCost] = useState(5);
  const [deadline, setDeadline] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom'>('daily');
  const [minimumViableVersion, setMinimumViableVersion] = useState('');

  // ---- Refs ----
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Auto-focus title input when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to let AnimatePresence mount the element
      const raf = requestAnimationFrame(() => titleInputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  // ---- Close & reset ----
  const close = useCallback(() => {
    setIsOpen(false);
    setTitle('');
    setPriority(3);
    setEnergyCost(5);
    setDeadline('');
    setFrequency('daily');
    setMinimumViableVersion('');
    setItemType('task');
    // Return focus to the FAB if we have one
    if (showFAB) {
        setTimeout(() => fabRef.current?.focus(), 0);
    }
  }, [showFAB]);

  // ---- Focus trap & Escape ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key === 'Tab') {
        const modal = modalRef.current;
        if (!modal) return;

        const focusable =
          modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    [close]
  );

  // ---- Submit ----
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;

      switch (itemType) {
        case 'task':
          onCreateTask({
            title: trimmed,
            priority,
            energyCost,
            deadline: deadline || undefined,
          });
          break;
        case 'habit':
          onCreateHabit({
            title: trimmed,
            energyCost,
            frequency,
            minimumViableVersion: minimumViableVersion.trim() || undefined,
          });
          break;
        case 'goal':
          onCreateGoal({ title: trimmed, deadline: deadline || undefined });
          break;
      }

      close();
    },
    [
      itemType,
      title,
      priority,
      energyCost,
      deadline,
      frequency,
      minimumViableVersion,
      onCreateTask,
      onCreateHabit,
      onCreateGoal,
      close,
    ]
  );

  return (
    <>
      {/* ── Floating Action Button — hidden when chat overlay covers screen or showFAB is false ── */}
      {showFAB && !isChatOverlayOpen && (
        <NeuralButton
          ref={fabRef as any}
          onClick={() => setIsOpen(true)}
          aria-label="Add new item"
          themeColor="emerald"
          className={cn(
            'z-[var(--z-fab)] !rounded-full !p-0 shadow-lg shadow-emerald-500/25',
            isFluid 
              ? 'w-12 h-12' 
              : 'fixed w-14 h-14 bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 md:bottom-8'
          )}
        >
          <Plus className={isFluid ? "w-5 h-5" : "!w-8 !h-8"} strokeWidth={3} aria-hidden="true" />
        </NeuralButton>
      )}

      {/* ── Modal overlay + dialog ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
              className="fixed inset-0 z-[var(--z-overlay)] bg-black/60 backdrop-blur-sm"
              onClick={close}
              aria-hidden="true"
            />

            {/* Dialog */}
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-label="Create new item"
              initial={
                reducedMotion ? false : { opacity: 0, scale: 0.95, y: 20 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
              }
              onKeyDown={handleKeyDown}
              className={cn(
                'fixed z-[var(--z-modal)] w-[calc(100%-2rem)] max-w-md',
                'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                'rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl p-6',
                'shadow-2xl shadow-black/40'
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-emerald-400 font-display">
                  Quick Add
                </h2>
                <NeuralButton
                  onClick={close}
                  aria-label="Close dialog"
                  variant="ghost"
                  size="sm"
                  className="!w-8 !h-8 !p-0 !min-h-0 rounded-lg text-white/30 hover:text-white/60"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </NeuralButton>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* ── Type toggle ── */}
                <fieldset>
                  <legend className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">
                    Type
                  </legend>
                  <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5">
                    {TYPE_OPTIONS.map((opt) => (
                      <NeuralButton
                        key={opt.key}
                        type="button"
                        onClick={() => setItemType(opt.key)}
                        variant={itemType === opt.key ? 'primary' : 'ghost'}
                        themeColor="emerald"
                        size="sm"
                        className="flex-1 !h-8"
                      >
                        {opt.label}
                      </NeuralButton>
                    ))}
                  </div>
                </fieldset>

                {/* ── Title ── */}
                <NeuralInput
                  ref={titleInputRef}
                  id="quick-add-title"
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder={`New ${itemType}…`}
                />

                {/* ── Priority selector (tasks only) ── */}
                {itemType === 'task' && (
                  <fieldset>
                    <legend className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">
                      Priority
                    </legend>
                    <div className="flex gap-2">
                      {PRIORITY_OPTIONS.map((p) => (
                        <NeuralButton
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          themeColor={p === 1 ? 'rose' : p === 2 ? 'orange' : p === 3 ? 'amber' : p === 4 ? 'cyan' : 'white'}
                          variant={priority === p ? 'primary' : 'secondary'}
                          className="w-9 h-9 !px-0 flex items-center justify-center text-xs font-black"
                        >
                          {p}
                        </NeuralButton>
                      ))}
                    </div>
                  </fieldset>
                )}

                {/* ── Energy cost slider (tasks & habits) ── */}
                {(itemType === 'task' || itemType === 'habit') && (
                  <div>
                    <label
                      htmlFor="quick-add-energy"
                      className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 flex items-center gap-2 mb-2"
                    >
                      <Zap
                        className="w-3 h-3 text-emerald-400"
                        aria-hidden="true"
                      />
                      Energy Cost:{' '}
                      <span className="text-emerald-400 tabular-nums">
                        {energyCost}
                      </span>
                    </label>
                    <input
                      id="quick-add-energy"
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={energyCost}
                      onChange={(e) => setEnergyCost(Number(e.target.value))}
                      aria-valuenow={energyCost}
                      aria-valuemin={0}
                      aria-valuemax={10}
                      className={cn(
                        'w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500',
                        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
                        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400',
                        '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-600',
                        '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4',
                        '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-400',
                        '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-600'
                      )}
                    />
                    <div className="flex justify-between text-[9px] text-white/15 mt-1 tabular-nums">
                      <span>0</span>
                      <span>5</span>
                      <span>10</span>
                    </div>
                  </div>
                )}

                {/* ── Deadline (tasks & goals) ── */}
                {(itemType === 'task' || itemType === 'goal') && (
                  <NeuralInput
                    id="quick-add-deadline"
                    type="date"
                    label="Deadline (optional)"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="[color-scheme:dark]"
                  />
                )}

                {/* ── Frequency selector (habits only) ── */}
                {itemType === 'habit' && (
                  <fieldset>
                    <legend className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">
                      Frequency
                    </legend>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                      {(['daily', 'weekdays', 'weekends', 'weekly', 'custom'] as const).map((f) => (
                        <NeuralButton
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          variant={frequency === f ? 'primary' : 'secondary'}
                          themeColor="emerald"
                          size="sm"
                          className="!h-8 !px-0 text-[9px] capitalize"
                        >
                          {f}
                        </NeuralButton>
                      ))}
                    </div>
                  </fieldset>
                )}

                {/* ── Minimum viable version (habits only) ── */}
                {itemType === 'habit' && (
                  <NeuralInput
                    id="quick-add-mvv"
                    label="Minimum for a bad day (optional)"
                    value={minimumViableVersion}
                    onChange={(e) => setMinimumViableVersion(e.target.value)}
                    placeholder="e.g. 5 mins, 3 sentences…"
                  />
                )}

                {/* ── Submit ── */}
                <NeuralButton
                  type="submit"
                  disabled={!title.trim()}
                  themeColor="emerald"
                  size="lg"
                  className="w-full uppercase tracking-wider"
                >
                  Create {itemType}
                </NeuralButton>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
