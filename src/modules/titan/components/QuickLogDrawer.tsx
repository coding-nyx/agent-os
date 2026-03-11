/**
 * QuickLogDrawer — fast-log side drawer for the Titan training module.
 *
 * Slides in from the right, allowing users to log a single workout set
 * instantly without opening the full WorkoutSessionLogger modal.
 *
 * Design: dark glassmorphism, Framer Motion slide-from-right, orange accents.
 *
 * Write path: Builds a minimal WorkoutSession (status=completed, 1 set) when
 * the user types a free-form exercise name, OR passes a typed
 * `QuickLogRecord` (exerciseId + e1RM) when the user selects from the
 * exercise-library autocomplete. TitanPage owns the Firestore write so PR
 * bookkeeping stays centralised.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Zap, Dumbbell, Weight, Hash } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralInput } from '@/core/components/NeuralInput';
import type { WorkoutSession } from '@/lib/types';
import type { Exercise } from '../types';
import { searchExercises } from '../data/exercise-library';
import { calculateE1RM } from '../utils/e1rm';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Typed quick-log record emitted when the user selects an exercise from the
 * canonical exercise library.  Carries a resolved exerciseId and the Epley e1RM.
 */
export interface QuickLogRecord {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  e1RM: number;
  date: string;
}

/** Discriminated union — TitanPage narrows on `'exercises' in payload`. */
export type QuickLogPayload = WorkoutSession | QuickLogRecord;

export interface QuickLogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The calendar date the user tapped + on. Null = no date selected. */
  selectedDate: Date | null;
  /** Exercise names from history + routines for autocomplete. */
  existingExercises: string[];
  /**
   * Called with either a full WorkoutSession (free-text path) or a
   * QuickLogRecord (library-search path).
   * TitanPage owns the Firestore write so PR bookkeeping stays centralised.
   * The drawer closes immediately; errors surface via the parent.
   */
  onCommit: (payload: QuickLogPayload) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as "Month D" for the drawer header. */
function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

/** ISO YYYY-MM-DD from a Date without timezone conversion. */
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Lightweight ID — crypto.randomUUID with a Date fallback. */
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ql-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── QuickLogDrawer ───────────────────────────────────────────────────────────

export function QuickLogDrawer({
  isOpen,
  onClose,
  selectedDate,
  existingExercises,
  onCommit,
}: QuickLogDrawerProps) {
  const datalistId = useId();
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Exercise-library autocomplete state
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');

  // Reset form whenever the drawer transitions from closed → open.
  useEffect(() => {
    if (isOpen) {
      setExercise('');
      setWeight('');
      setReps('');
      setValidationError(null);
      setSearchResults([]);
      setSelectedExerciseId('');
    }
  }, [isOpen]);

  // Close dropdown when user clicks outside the search container.
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ── Exercise input handlers ───────────────────────────────────────────────
  function handleExerciseChange(value: string) {
    setExercise(value);
    // Clear the previously confirmed library selection when user edits.
    setSelectedExerciseId('');
    setSearchResults(searchExercises(value));
  }

  function handleExerciseSelect(item: Exercise) {
    setExercise(item.name);
    setSelectedExerciseId(item.id);
    setSearchResults([]);          // close dropdown
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleLogSet = async () => {
    const trimmedExercise = exercise.trim();
    const parsedReps = parseInt(reps, 10);
    const parsedWeight = weight !== '' ? parseFloat(weight) : undefined;

    // Validation — single-responsibility: gate only on what matters
    if (!trimmedExercise) {
      setValidationError('Exercise name is required.');
      return;
    }
    if (!reps || isNaN(parsedReps) || parsedReps < 1) {
      setValidationError('Enter a valid rep count (≥ 1).');
      return;
    }
    if (parsedWeight !== undefined && (isNaN(parsedWeight) || parsedWeight < 0)) {
      setValidationError('Weight must be a positive number.');
      return;
    }

    setValidationError(null);
    setIsSaving(true);

    const now = new Date().toISOString();
    const dateStr = selectedDate ? toIsoDate(selectedDate) : toIsoDate(new Date());

    try {
      if (selectedExerciseId && parsedWeight !== undefined) {
        // ── Library path: pass typed QuickLogRecord with Epley e1RM ──────
        const e1RM = calculateE1RM(parsedWeight, parsedReps);
        const record: QuickLogRecord = {
          exerciseId: selectedExerciseId,
          exerciseName: trimmedExercise,
          weight: parsedWeight,
          reps: parsedReps,
          e1RM,
          date: dateStr,
        };
        await onCommit(record);
      } else {
        // ── Legacy path: build a WorkoutSession for free-text exercises ──
        const session: WorkoutSession = {
          id: generateId(),
          routineId: 'quick-log',
          routineName: 'Quick Log',
          date: dateStr,
          startedAt: now,
          completedAt: now,
          exercises: [
            {
              exerciseName: trimmedExercise,
              plannedSets: 1,
              plannedReps: String(parsedReps),
              sets: [
                {
                  setNumber: 1,
                  weight: parsedWeight,
                  repsCompleted: parsedReps,
                  completed: true,
                },
              ],
            },
          ],
          status: 'completed',
        };
        await onCommit(session);
      }
      onClose();
    } catch {
      setValidationError('Failed to save — please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogSet();
    if (e.key === 'Escape') onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ── */}
          <motion.div
            key="ql-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* ── Drawer ── */}
          <motion.aside
            key="ql-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Quick log a workout set"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            onKeyDown={handleKeyDown}
            className={[
              'fixed right-0 top-0 h-full z-50',
              'w-72 sm:w-80',
              'flex flex-col',
              'bg-[#0c0c10]/95 backdrop-blur-xl',
              'border-l border-orange-500/20',
              'shadow-[−8px_0_40px_rgba(0,0,0,0.6)]',
            ].join(' ')}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-400/80">
                    Quick Log
                  </p>
                  <p className="text-[11px] text-white/40 leading-tight">
                    {selectedDate ? formatDay(selectedDate) : 'Today'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close drawer"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {/* Exercise search + library autocomplete */}
              <div className="space-y-2" ref={searchRef}>
                <NeuralInput
                  label="Exercise"
                  placeholder="e.g. Bench Press"
                  value={exercise}
                  onChange={(e) => handleExerciseChange(e.target.value)}
                  list={datalistId}
                  icon={<Dumbbell className="w-4 h-4" />}
                  autoComplete="off"
                  autoFocus
                />
                {/* Native datalist for history-based suggestions */}
                <datalist id={datalistId}>
                  {existingExercises.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                {/* Library autocomplete dropdown */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      key="ex-dropdown"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="bg-black/60 border border-white/10 rounded-xl overflow-hidden"
                    >
                      {searchResults.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(e) => {
                            // Prevent blur from firing before click
                            e.preventDefault();
                            handleExerciseSelect(item);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.06] transition-colors"
                        >
                          <span className="text-[13px] text-white/80 truncate">
                            {item.name}
                          </span>
                          <span className="ml-2 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">
                            {item.category}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Weight */}
              <NeuralInput
                label="Weight (kg / lbs)"
                placeholder="e.g. 80  — leave blank for bodyweight"
                type="number"
                min="0"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                icon={<Weight className="w-4 h-4" />}
              />

              {/* Reps */}
              <NeuralInput
                label="Reps"
                placeholder="e.g. 8"
                type="number"
                min="1"
                step="1"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                icon={<Hash className="w-4 h-4" />}
              />

              {/* Sets note */}
              <p className="text-[10px] text-white/25 leading-snug pl-1">
                Sets default to <span className="text-white/40 font-semibold">1</span>.
                Open the full session logger for multi-set logging.
              </p>

              {/* Validation error */}
              <AnimatePresence>
                {validationError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2"
                  >
                    {validationError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Footer actions */}
            <div className="px-5 pb-6 pt-3 border-t border-white/[0.06] space-y-2.5">
              <NeuralButton
                themeColor="orange"
                size="md"
                className="w-full"
                onClick={handleLogSet}
                disabled={isSaving}
                loading={isSaving}
              >
                <Zap className="w-3.5 h-3.5 mr-1" />
                {isSaving ? 'Saving…' : 'Log Set'}
              </NeuralButton>

              <NeuralButton
                variant="ghost"
                size="md"
                className="w-full"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </NeuralButton>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
