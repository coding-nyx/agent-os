/**
 * WorkoutSessionLogger - Log actual workout performance against planned routine
 * AI-gated: collects set data locally, sends structured prompt to Titan for validation + commit
 *
 * Features:
 *  - Previous session display per exercise (best set + set count)
 *  - Live rest timer with configurable duration (per-exercise restSeconds)
 *  - localStorage staging buffer to prevent data loss on AI errors
 *  - e1RM calculation (Epley) and PR detection injected into AI prompt
 *  - Per-set RPE capture (optional, 1–10 scale, 0.5 step)
 *  - Plate calculator for barbell exercises
 *  - Superset pairing visual indicator
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Circle, Plus, Minus, Flame, BarChart3, Zap, Calculator, Share2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import { NeuralInput } from '@/core/components/NeuralInput';
import { NeuralTextarea } from '@/core/components/NeuralTextarea';
import type { Routine, WorkoutSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTodayWeekday, getTodayIso } from '../utils';
import { PlateCalculator } from './PlateCalculator';
import { ShareCard } from './ShareCard';

// ─── localStorage Staging Buffer ─────────────────────────────────────────────
// Prevents data loss if the AI call errors after the user taps "Finish".
// The staged payload is cleared after a successful submission or on modal close.

const STAGING_KEY = 'titan_pending_session';

function stagePendingSession(session: Partial<WorkoutSession>): void {
  try { localStorage.setItem(STAGING_KEY, JSON.stringify(session)); } catch { /* quota or SSR */ }
}

function clearStagedSession(): void {
  try { localStorage.removeItem(STAGING_KEY); } catch { /* SSR */ }
}

// ─── e1RM Calculation (Epley Formula) ────────────────────────────────────────
// Complexity: O(1) per set. Used for PR detection and AI prompt annotation.

function calcE1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// ─── Local Form-State Interfaces ─────────────────────────────────────────────

interface SessionSetState {
  weight: string;
  repsCompleted: string;
  completed: boolean;
  /** Per-set RPE (1–10, optional). Captured inline; injected into AI prompt. */
  rpe?: number;
  /** Warm-up sets are excluded from volume/PR calculations. */
  isWarmup?: boolean;
}

interface SessionExerciseState {
  sets: SessionSetState[];
}

// ─── Rest Timer State ─────────────────────────────────────────────────────────

interface RestTimerState {
  exerciseIdx: number;
  setIdx: number;
  seconds: number;
}

// ─── Component Props ──────────────────────────────────────────────────────────

interface WorkoutSessionLoggerProps {
  routines: Routine[];
  recentSessions: WorkoutSession[];
  /** Routes structured session prompt to Titan AI for validation + commit */
  onSubmitSession: (prompt: string) => void;
  /** When true, bypasses AI and commits the session directly via onDirectCommit */
  directWriteMode?: boolean;
  /** Called instead of onSubmitSession when directWriteMode is true */
  onDirectCommit?: (session: WorkoutSession) => void;
}

// ─── PR Detection Type ────────────────────────────────────────────────────────

interface PrDetection {
  exercise: string;
  newE1RM: number;
  weight: number;
  reps: number;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildSessionPrompt(
  routine: Routine,
  exercises: SessionExerciseState[],
  sessionRpe: number,
  notes: string,
  startedAt: string,
  prDetections: PrDetection[],
): string {
  const completedAt = new Date().toISOString();
  const date = getTodayIso();

  const exerciseLines = routine.exercises.map((ex, i) => {
    const state = exercises[i] ?? { sets: [] };
    const setLines = state.sets.map((s, si) => {
      const weight = s.weight ? `${s.weight}kg` : 'BW';
      const rpeTag = s.rpe != null ? ` RPE ${s.rpe}` : '';
      return `    Set ${si + 1}: ${weight} × ${s.repsCompleted || '0'} reps${s.completed ? ' ✓' : ' (skipped)'}${rpeTag}`;
    }).join('\n');
    const completedCount = state.sets.filter(s => s.completed).length;
    return `  ${ex.name} (${completedCount}/${ex.sets} sets completed, planned ${ex.reps} reps):\n${setLines}`;
  }).filter(Boolean).join('\n\n');

  return [
    `I just completed my ${routine.weekday?.toUpperCase() || ''} workout: "${routine.name}".`,
    `Date: ${date} | Duration: ~${Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000)} min | RPE: ${sessionRpe}/10`,
    `\nPerformance:\n${exerciseLines}`,
    notes ? `\nNotes: ${notes}` : '',
    prDetections.length > 0 ? `\nPR Detections: ${JSON.stringify(prDetections)}` : '',
    '\nPlease log this session using log_workout_session. Compare actual vs planned volume.',
    'Adjust my recovery estimate and flag any form-cue reminders if needed.',
  ].filter(Boolean).join('\n');
}

// ─── Direct Write Session Builder ────────────────────────────────────────────
// Converts local form state into a persisted WorkoutSession without going
// through the AI layer. Used exclusively when directWriteMode is true.
// Complexity: O(e·s) where e = exercise count, s = average sets per exercise.

function buildSessionFromState(
  routine: Routine,
  exercises: SessionExerciseState[],
  notes: string,
  sessionRpe: number,
  startedAt: string,
): WorkoutSession {
  return {
    id: crypto.randomUUID(),
    routineId: routine.id,
    routineName: routine.name,
    date: getTodayIso(),
    startedAt,
    completedAt: new Date().toISOString(),
    rpe: sessionRpe,
    exercises: exercises.map((ex, i) => ({
      exerciseName: routine.exercises[i]?.name ?? 'Exercise',
      plannedSets: routine.exercises[i]?.sets ?? ex.sets.length,
      plannedReps: String(routine.exercises[i]?.reps ?? '—'),
      sets: ex.sets.map((s, idx) => ({
        setNumber: idx + 1,
        weight: parseFloat(s.weight) || undefined,
        repsCompleted: parseInt(s.repsCompleted, 10) || 0,
        completed: s.completed,
        rpe: s.rpe,
      })),
    })),
    totalVolume: exercises.reduce(
      (total, ex) =>
        total +
        ex.sets.reduce(
          (t, s) =>
            s.completed
              ? t + (parseFloat(s.weight) || 0) * (parseInt(s.repsCompleted, 10) || 0)
              : t,
          0,
        ),
      0,
    ),
    status: 'completed',
    notes: notes || undefined,
  };
}

// ─── Session Modal ────────────────────────────────────────────────────────────

function SessionModal({
  isOpen,
  routine,
  onClose,
  onSubmit,
  recentSessions,
  directWriteMode,
  onDirectCommit,
}: {
  isOpen: boolean;
  routine: Routine | null;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  recentSessions: WorkoutSession[];
  directWriteMode?: boolean;
  onDirectCommit?: (session: WorkoutSession) => void;
}) {
  const [exercises, setExercises] = useState<SessionExerciseState[]>([]);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const [startedAt] = useState(() => new Date().toISOString());

  // ── Feature: Plate Calculator ──────────────────────────────────────────────
  // Tracks which exercise (by index) has the plate calc open
  const [plateCalcOpenIdx, setPlateCalcOpenIdx] = useState<number | null>(null);

  // ── Feature: Rest Timer ────────────────────────────────────────────────────
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Feature: Staging Buffer indicator ─────────────────────────────────────
  // Lazy-initialised so it reads localStorage once on mount.
  const [hasStagedSession, setHasStagedSession] = useState(
    () => !!localStorage.getItem(STAGING_KEY),
  );

  // ── Feature: Share Card ─────────────────────────────────────────────────────
  const [showShareCard, setShowShareCard] = useState(false);
  const [lastSession, setLastSession] = useState<WorkoutSession | null>(null);

  // ── Feature: Previous Session Data ────────────────────────────────────────
  // Most recent session for this exact routine — used to show "Last: N sets · best W×R"
  const previousSession = useMemo(() => {
    if (!recentSessions?.length || !routine) return null;
    return (
      [...recentSessions]
        .filter(s => s.routineId === routine.id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
    );
  }, [recentSessions, routine]);

  // ── Rest Timer: countdown ──────────────────────────────────────────────────
  const startRestTimer = useCallback((exIdx: number, setIdx: number, duration = 90) => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    setRestTimer({ exerciseIdx: exIdx, setIdx, seconds: duration });
    restTimerRef.current = setInterval(() => {
      setRestTimer(prev => {
        if (!prev || prev.seconds <= 1) {
          clearInterval(restTimerRef.current!);
          return null;
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
  }, []);

  // Cleanup interval on unmount to prevent memory leaks.
  useEffect(() => () => {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
  }, []);

  // ── Initial exercise state ─────────────────────────────────────────────────
  const initialExercises = useMemo(() => {
    if (!routine) return [];
    return routine.exercises.map(_ex => ({
      sets: Array.from({ length: _ex.sets }, () => ({
        weight: '',
        repsCompleted: '',
        completed: false,
      })),
    }));
  }, [routine]);

  // Sync form state when the modal opens with a (potentially new) routine.
  React.useEffect(() => {
    if (isOpen && routine) {
      setExercises(initialExercises);
      setRpe(7);
      setNotes('');
      // Re-check staged session each time the modal opens.
      setHasStagedSession(!!localStorage.getItem(STAGING_KEY));
    }
  }, [isOpen, routine, initialExercises]);

  // ── Set Handlers ───────────────────────────────────────────────────────────

  /**
   * Toggle a set's completed state. When marking complete, starts the rest
   * timer using `ex.restSeconds ?? 90` as the countdown duration.
   */
  const toggleSet = useCallback(
    (exIdx: number, setIdx: number, restSeconds = 90) => {
      setExercises(prev => {
        const updated = prev.map((ex, i) =>
          i !== exIdx
            ? ex
            : {
                ...ex,
                sets: ex.sets.map((s, j) =>
                  j !== setIdx ? s : { ...s, completed: !s.completed },
                ),
              },
        );
        // Start timer only when transitioning to completed (not when un-ticking).
        const nowCompleted = updated[exIdx]?.sets[setIdx]?.completed ?? false;
        if (nowCompleted) {
          // Defer outside the updater to avoid nested setState calls.
          setTimeout(() => startRestTimer(exIdx, setIdx, restSeconds), 0);
        }
        return updated;
      });
    },
    [startRestTimer],
  );

  /** Update weight or repsCompleted string fields. */
  const updateSet = useCallback(
    (exIdx: number, setIdx: number, field: 'weight' | 'repsCompleted', value: string) => {
      setExercises(prev =>
        prev.map((ex, i) =>
          i !== exIdx
            ? ex
            : {
                ...ex,
                sets: ex.sets.map((s, j) =>
                  j !== setIdx ? s : { ...s, [field]: value },
                ),
              },
        ),
      );
    },
    [],
  );

  /** Update the per-set RPE (numeric, optional). */
  const updateSetRpe = useCallback(
    (exIdx: number, setIdx: number, value: number | undefined) => {
      setExercises(prev =>
        prev.map((ex, i) =>
          i !== exIdx
            ? ex
            : {
                ...ex,
                sets: ex.sets.map((s, j) =>
                  j !== setIdx ? s : { ...s, rpe: value },
                ),
              },
        ),
      );
    },
    [],
  );

  const addSet = useCallback((exIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i !== exIdx
          ? ex
          : { ...ex, sets: [...ex.sets, { weight: '', repsCompleted: '', completed: false }] },
      ),
    );
  }, []);

  /** Prepend warm-up sets before working sets: 50%×5, 65%×3, 80%×2 of first working weight. */
  const generateWarmupSets = useCallback((exIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const firstWorkingWeight = ex.sets.find(s => !s.isWarmup && s.weight)?.weight ?? '';
        const workingKg = parseFloat(firstWorkingWeight) || 0;
        if (workingKg <= 0) return ex;
        const warmups: SessionSetState[] = [
          { weight: String(Math.round(workingKg * 0.5 * 2) / 2), repsCompleted: '5', completed: false, isWarmup: true },
          { weight: String(Math.round(workingKg * 0.65 * 2) / 2), repsCompleted: '3', completed: false, isWarmup: true },
          { weight: String(Math.round(workingKg * 0.8 * 2) / 2), repsCompleted: '2', completed: false, isWarmup: true },
        ];
        // Insert warm-ups before any existing working sets
        const workingSets = ex.sets.filter(s => !s.isWarmup);
        return { ...ex, sets: [...warmups, ...workingSets] };
      }),
    );
  }, []);

  const removeSet = useCallback((exIdx: number) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i !== exIdx || ex.sets.length <= 1 ? ex : { ...ex, sets: ex.sets.slice(0, -1) },
      ),
    );
  }, []);

  // ── Summary Stats ──────────────────────────────────────────────────────────
  const completedSetsCount = exercises.reduce(
    (total, ex) => total + ex.sets.filter(s => s.completed).length,
    0,
  );
  const totalSetsCount = exercises.reduce((total, ex) => total + ex.sets.length, 0);
  const elapsedMinutes = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
  const isStale = elapsedMinutes > 240;

  if (!routine) return null;

  // ── Submit Handler ─────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!routine) return;

    // PR Detection — compute e1RM per completed set, attach to prompt.
    const prDetections: PrDetection[] = [];
    routine.exercises.forEach((ex, i) => {
      const state = exercises[i];
      if (!state) return;
      for (const s of state.sets) {
        if (!s.completed) continue;
        const w = parseFloat(s.weight);
        const r = parseInt(s.repsCompleted, 10);
        if (!w || !r) continue;
        prDetections.push({ exercise: ex.name, newE1RM: calcE1RM(w, r), weight: w, reps: r });
      }
    });

    // ── Direct Write (Logbook Mode) path ────────────────────────────────────
    // Bypasses AI entirely — builds a WorkoutSession and commits immediately.
    if (directWriteMode && onDirectCommit) {
      const session = buildSessionFromState(routine, exercises, notes, rpe, startedAt);
      onDirectCommit(session);
      clearStagedSession();
      setHasStagedSession(false);
      setLastSession(session);
      setShowShareCard(true);
      onClose();
      return;
    }

    // ── Coach Mode path (default) ────────────────────────────────────────────
    // Stage before AI call — if onSubmit throws/rejects, data is preserved.
    stagePendingSession({
      routineId: routine.id,
      routineName: routine.name,
      date: getTodayIso(),
      startedAt,
      status: 'completed',
    });

    const prompt = buildSessionPrompt(routine, exercises, rpe, notes, startedAt, prDetections);
    onSubmit(prompt);

    // Clear staging buffer after successful hand-off to AI layer.
    clearStagedSession();
    setHasStagedSession(false);
  };

  const handleClose = () => {
    // On intentional close (cancel), clear any staged data to avoid phantom warnings.
    clearStagedSession();
    setHasStagedSession(false);
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={handleClose}
      title={routine.name}
      subtitle={`${routine.weekday?.toUpperCase()} — Log Session`}
      icon={Flame}
      themeColor="module"
      maxWidth="2xl"
    >
      <div className="flex flex-col gap-5 max-h-[70dvh]">

        {/* ── Progress summary ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]">
          <span className="text-xs text-[var(--module-color-300)] font-bold">
            {completedSetsCount} / {totalSetsCount} sets done
          </span>
          <div className="w-full max-w-[8rem] h-1.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--module-accent)] transition-all"
              style={{ width: totalSetsCount > 0 ? `${(completedSetsCount / totalSetsCount) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* ── Pending sync warning ───────────────────────────────────────── */}
        {hasStagedSession && (
          <p className="text-[10px] text-[var(--module-color-400)]">⚠ Previous session pending sync</p>
        )}

        {/* ── Exercise list (scrollable) ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {routine.exercises.map((ex, exIdx) => {
            const exState = exercises[exIdx];
            if (!exState) return null;

            // Previous session data for this exercise (feature #1)
            const prevExLog = previousSession?.exercises.find(
              e => e.exerciseName === ex.name,
            );
            const prevCompletedSets = prevExLog?.sets.filter(s => s.completed) ?? [];

            return (
              <div key={exIdx} className="space-y-2">
                {/* Superset indicator — shown between paired exercises */}
                {exIdx > 0 &&
                  routine.exercises[exIdx - 1].supersetWith === ex.name && (
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 h-px bg-[var(--module-accent-border)]" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-[var(--module-color-300)] px-2 py-0.5 rounded-full border border-[var(--module-accent-border)] bg-[var(--module-accent-muted)]">
                        Superset
                      </span>
                      <div className="flex-1 h-px bg-[var(--module-accent-border)]" />
                    </div>
                  )}

                {/* Exercise header */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/90">{ex.name}</span>
                    <span className="text-[10px] text-white/40 ml-2">planned {ex.sets}×{ex.reps}</span>
                    {ex.supersetWith && (
                      <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--module-accent-muted)] text-[var(--module-color-300)] border border-[var(--module-accent-border)]">
                        SS w/ {ex.supersetWith}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Warm-up generator — for weighted exercises */}
                    {ex.equipment !== 'bodyweight' && (
                      <NeuralButton
                        variant="ghost"
                        size="sm"
                        onClick={() => generateWarmupSets(exIdx)}
                        className="p-1 h-7 w-7 min-w-0 text-amber-400/60 hover:text-amber-400"
                        title="Generate warm-up sets (50%×5, 65%×3, 80%×2)"
                      >
                        <Flame className="w-3 h-3" />
                      </NeuralButton>
                    )}
                    {/* Plate calculator toggle — only for barbell exercises */}
                    {ex.equipment === 'barbell' && (
                      <NeuralButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setPlateCalcOpenIdx(plateCalcOpenIdx === exIdx ? null : exIdx)}
                        className={cn(
                          'p-1 h-7 w-7 min-w-0',
                          plateCalcOpenIdx === exIdx && 'text-[var(--module-color-300)]',
                        )}
                        title="Plate calculator"
                      >
                        <Calculator className="w-3 h-3" />
                      </NeuralButton>
                    )}
                    <NeuralButton
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSet(exIdx)}
                      className="p-1 h-7 w-7 min-w-0"
                    >
                      <Minus className="w-3 h-3" />
                    </NeuralButton>
                    <NeuralButton
                      variant="ghost"
                      size="sm"
                      onClick={() => addSet(exIdx)}
                      className="p-1 h-7 w-7 min-w-0 hover:text-[var(--module-color-400)]"
                    >
                      <Plus className="w-3 h-3" />
                    </NeuralButton>
                  </div>
                </div>

                {/* Previous session hint (feature #1) */}
                {prevCompletedSets.length > 0 && (() => {
                  const bestSet = prevCompletedSets.reduce((best, s) =>
                    (s.weight ?? 0) > (best.weight ?? 0) ? s : best,
                    prevCompletedSets[0],
                  );
                  return (
                    <p className="text-[10px] text-white/30 mb-1">
                      Last: {prevCompletedSets.length} sets · best {bestSet.weight ?? 'BW'}×{bestSet.repsCompleted}
                    </p>
                  );
                })()}

                {/* Plate Calculator (shown when toggled for barbell exercises) */}
                <AnimatePresence>
                  {plateCalcOpenIdx === exIdx && (() => {
                    const lastCompletedWeight = exState.sets
                      .map(s => parseFloat(s.weight))
                      .filter(w => !isNaN(w) && w > 0)
                      .at(-1) ?? 60;
                    return (
                      <motion.div
                        key="plate-calc"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <PlateCalculator targetWeight={lastCompletedWeight} unit="kg" />
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>

                {/* Set rows */}
                <div className="space-y-1.5">
                  {exState.sets.map((s, setIdx) => (
                    <div
                      key={setIdx}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                        s.completed
                          ? 'bg-[var(--module-accent-muted)] border-[var(--module-accent-border)]'
                          : 'bg-white/[0.02] border-white/10',
                      )}
                    >
                      <span className="text-[10px] text-white/40 w-8 shrink-0">
                        {s.isWarmup ? <span className="text-amber-400/70 font-bold">W{setIdx + 1}</span> : `Set ${setIdx + 1}`}
                      </span>

                      {/* Weight */}
                      <div className="w-14 sm:w-20">
                        <NeuralInput
                          type="number"
                          placeholder="kg"
                          value={s.weight}
                          onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                          className="h-9 min-h-0 px-2 text-center focus:border-[var(--module-color-400)] text-xs sm:text-sm"
                          min={0}
                        />
                      </div>
                      <span className="text-white/20 text-xs">×</span>

                      {/* Reps */}
                      <div className="w-12 sm:w-16">
                        <NeuralInput
                          type="number"
                          placeholder="reps"
                          value={s.repsCompleted}
                          onChange={e => updateSet(exIdx, setIdx, 'repsCompleted', e.target.value)}
                          className="h-9 min-h-0 px-2 text-center focus:border-[var(--module-color-400)] text-xs sm:text-sm"
                          min={0}
                        />
                      </div>

                      {/* Per-set RPE (feature #5) */}
                      <div className="w-14 sm:w-20">
                        <NeuralInput
                          type="number"
                          min={1}
                          max={10}
                          step={0.5}
                          placeholder="RPE"
                          value={s.rpe ?? ''}
                          onChange={e =>
                            updateSetRpe(exIdx, setIdx, parseFloat(e.target.value) || undefined)
                          }
                          className="h-9 min-h-0 px-2 text-center focus:border-[var(--module-accent)]"
                        />
                      </div>

                      {/* Complete toggle — triggers rest timer on check (feature #2) */}
                      <NeuralButton
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSet(exIdx, setIdx, ex.restSeconds ?? 90)}
                        className="ml-auto p-0 h-8 w-8"
                      >
                        {s.completed
                          ? <CheckCircle2 className="w-5 h-5 text-[var(--module-color-400)]" />
                          : <Circle className="w-5 h-5 text-white/20 hover:text-white/50 transition-colors" />
                        }
                      </NeuralButton>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Session-level RPE slider ───────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
              Rate of Perceived Exertion
            </span>
            <span className={cn(
              'text-xs font-bold tabular-nums',
              rpe >= 9 ? 'text-rose-400' : rpe >= 7 ? 'text-[var(--module-color-400)]' : 'text-green-400',
            )}>
              {rpe}/10
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={rpe}
            onChange={e => setRpe(Number(e.target.value))}
            className="w-full accent-[var(--module-accent)]"
          />
          <div className="flex justify-between text-[9px] text-white/30">
            <span>Easy</span>
            <span>Moderate</span>
            <span>Max effort</span>
          </div>
        </div>

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <NeuralTextarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Session notes (PR, form issues, fatigue, etc.)..."
          rows={2}
          className="text-xs focus:border-[var(--module-accent)]"
        />

        {/* ── Stale session warning ──────────────────────────────────────── */}
        {isStale && (
          <p className="text-xs text-[var(--module-color-400)] bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)] rounded-xl px-3 py-2">
            Session started {elapsedMinutes} min ago — is this data still accurate?
          </p>
        )}

        {/* ── Live Rest Timer banner (feature #2) ───────────────────────── */}
        <AnimatePresence>
          {restTimer && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between p-3 rounded-xl bg-[var(--module-accent-muted)] border border-[var(--module-accent-border)]"
            >
              <span className="text-xs font-bold text-[var(--module-color-300)]">Rest Timer</span>
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-[var(--module-color-400)] tabular-nums">
                  {Math.floor(restTimer.seconds / 60)}:{String(restTimer.seconds % 60).padStart(2, '0')}
                </span>
                <NeuralButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { clearInterval(restTimerRef.current!); setRestTimer(null); }}
                  className="text-white/40 hover:text-white/70"
                >
                  Skip
                </NeuralButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Logbook Mode indicator ────────────────────────────────────── */}
        {directWriteMode && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--module-color-400)]">
            <Zap className="w-3 h-3" />
            <span>Logbook Mode — saves instantly</span>
          </div>
        )}

        {/* ── Actions (always visible — outside scrollable area) ─────────── */}
        <div className="flex gap-3 pt-2 border-t border-white/5">
          <NeuralButton
            size="xl"
            className="flex-1"
            disabled={completedSetsCount === 0}
            onClick={handleSubmit}
          >
            <Flame className="w-4 h-4 mr-2" />
            {directWriteMode ? 'Save to Logbook' : 'Finish & Send to Titan'}
          </NeuralButton>
          {lastSession && (
            <NeuralButton
              size="xl"
              variant="secondary"
              onClick={() => setShowShareCard(true)}
              aria-label="Share last session"
            >
              <Share2 className="w-4 h-4" />
            </NeuralButton>
          )}
          <NeuralButton size="xl" variant="ghost" onClick={handleClose}>
            Cancel
          </NeuralButton>
        </div>
      </div>

      {/* Share Card */}
      {lastSession && (
        <ShareCard
          type="workout_summary"
          sessionDate={lastSession.date}
          sessionExercises={lastSession.exercises?.map(e => e.exerciseName)}
          totalSets={lastSession.exercises?.reduce((t, e) => t + (e.sets?.filter(s => s.completed).length ?? 0), 0)}
          totalVolume={lastSession.totalVolume}
          durationMinutes={lastSession.startedAt && lastSession.completedAt
            ? Math.round((new Date(lastSession.completedAt).getTime() - new Date(lastSession.startedAt).getTime()) / 60000)
            : undefined}
          isOpen={showShareCard}
          onClose={() => setShowShareCard(false)}
        />
      )}
    </NeuralModal>
  );
}

export function WorkoutSessionLogger({ routines, recentSessions, onSubmitSession, directWriteMode, onDirectCommit }: WorkoutSessionLoggerProps) {
  const today = getTodayWeekday();
  const [showModal, setShowModal] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<Routine | null>(null);

  const todayRoutine = routines.find(r => r.weekday === today);
  const lastSession = recentSessions[0];

  const handleStartSession = useCallback((routine: Routine) => {
    if (routine.exercises.length === 0) return;
    setSelectedRoutine(routine);
    setShowModal(true);
  }, []);

  if (routines.length === 0) return null;

  return (
    <>
      <SurfaceCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <PanelLabel
            label="Session Logger"
            metadata={lastSession ? `Last: ${lastSession.date}` : 'No sessions yet'}
          />
          {recentSessions.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
              <BarChart3 className="w-3 h-3" />
              <span>{recentSessions.length} sessions logged</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {/* Today's routine prominently */}
          {todayRoutine && (
            <NeuralButton
              as="div"
              variant="secondary"
              onClick={() => handleStartSession(todayRoutine)}
              disabled={todayRoutine.exercises.length === 0}
              className="w-full flex items-center justify-between px-4 py-3 h-auto min-h-[3.5rem] bg-[var(--module-accent-muted)] border-[var(--module-accent-border)] hover:bg-[var(--module-accent-glow)] transition-all text-left"
            >
              <div className="flex-1">
                <div className="text-xs font-bold text-[var(--module-color-300)]">Today — {todayRoutine.name}</div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  {todayRoutine.exercises.length === 0 ? 'No exercises — configure in Titan AI' : `${todayRoutine.exercises.length} exercises`}
                </div>
              </div>
              <NeuralButton as="div" size="sm" className="pointer-events-none ml-4" disabled={todayRoutine.exercises.length === 0}>
                <Flame className="w-3 h-3 mr-1.5" />
                Start
              </NeuralButton>
            </NeuralButton>
          )}

          {/* Other routines */}
          {routines.filter(r => r.weekday !== today).slice(0, 2).map(r => (
            <NeuralButton
              key={r.id}
              as="div"
              variant="secondary"
              onClick={() => handleStartSession(r)}
              className="w-full flex items-center justify-between px-3 py-2.5 h-auto bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-all text-left"
            >
              <div className="flex-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 mr-2">{r.weekday}</span>
                <span className="text-xs text-white/70">{r.name}</span>
              </div>
              <span className="text-[10px] text-white/30 ml-4">{r.exercises.length} ex</span>
            </NeuralButton>
          ))}
        </div>

        {/* Recent sessions micro-history */}
        {recentSessions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
            <div className="text-[9px] font-black uppercase tracking-wider text-white/30 mb-1.5">Recent</div>
            {recentSessions.slice(0, 3).map(s => (
              <div key={s.id} className="flex items-center justify-between text-[10px]">
                <span className="text-white/50">{s.date} — {s.routineName}</span>
                <div className="flex items-center gap-2 text-white/30">
                  {s.totalVolume && <span>{s.totalVolume}kg</span>}
                  {s.rpe && <span className={cn(s.rpe >= 8 ? 'text-rose-400/60' : 'text-white/30')}>RPE {s.rpe}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <SessionModal
        isOpen={showModal}
        routine={selectedRoutine}
        onClose={() => { setShowModal(false); setSelectedRoutine(null); }}
        onSubmit={onSubmitSession}
        recentSessions={recentSessions}
        directWriteMode={directWriteMode}
        onDirectCommit={onDirectCommit}
      />
    </>
  );
}
