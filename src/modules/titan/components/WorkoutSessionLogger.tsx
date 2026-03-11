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
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Circle, Plus, Minus, Flame, BarChart3, Zap } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import type { Routine, WorkoutSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTodayWeekday, getTodayIso } from '../utils';

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

  // ── Feature: Rest Timer ────────────────────────────────────────────────────
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Feature: Staging Buffer indicator ─────────────────────────────────────
  // Lazy-initialised so it reads localStorage once on mount.
  const [hasStagedSession, setHasStagedSession] = useState(
    () => !!localStorage.getItem(STAGING_KEY),
  );

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
      themeColor="orange"
      maxWidth="2xl"
    >
      <div className="flex flex-col gap-5 max-h-[70vh]">

        {/* ── Progress summary ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-orange-500/[0.06] border border-orange-500/20">
          <span className="text-xs text-orange-300/80 font-bold">
            {completedSetsCount} / {totalSetsCount} sets done
          </span>
          <div className="w-32 h-1.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-orange-500/70 transition-all"
              style={{ width: totalSetsCount > 0 ? `${(completedSetsCount / totalSetsCount) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* ── Pending sync warning ───────────────────────────────────────── */}
        {hasStagedSession && (
          <p className="text-[10px] text-amber-400">⚠ Previous session pending sync</p>
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
                {/* Exercise header */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/90">{ex.name}</span>
                    <span className="text-[10px] text-white/40 ml-2">planned {ex.sets}×{ex.reps}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => removeSet(exIdx)}
                      className="p-1 rounded text-white/30 hover:text-white/60 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => addSet(exIdx)}
                      className="p-1 rounded text-white/30 hover:text-orange-400 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
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

                {/* Set rows */}
                <div className="space-y-1.5">
                  {exState.sets.map((s, setIdx) => (
                    <div
                      key={setIdx}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                        s.completed
                          ? 'bg-orange-500/10 border-orange-500/20'
                          : 'bg-white/[0.02] border-white/10',
                      )}
                    >
                      <span className="text-[10px] text-white/40 w-8 shrink-0">Set {setIdx + 1}</span>

                      {/* Weight */}
                      <input
                        type="number"
                        placeholder="kg"
                        value={s.weight}
                        onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                        className="w-16 bg-transparent text-xs text-white/80 border-b border-white/20 focus:border-orange-400 outline-none text-center pb-0.5"
                        min={0}
                      />
                      <span className="text-white/20 text-xs">×</span>

                      {/* Reps */}
                      <input
                        type="number"
                        placeholder="reps"
                        value={s.repsCompleted}
                        onChange={e => updateSet(exIdx, setIdx, 'repsCompleted', e.target.value)}
                        className="w-14 bg-transparent text-xs text-white/80 border-b border-white/20 focus:border-orange-400 outline-none text-center pb-0.5"
                        min={0}
                      />

                      {/* Per-set RPE (feature #5) */}
                      <input
                        type="number"
                        min={1}
                        max={10}
                        step={0.5}
                        placeholder="RPE"
                        value={s.rpe ?? ''}
                        onChange={e =>
                          updateSetRpe(exIdx, setIdx, parseFloat(e.target.value) || undefined)
                        }
                        className="w-16 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-orange-500/30 text-center"
                      />

                      {/* Complete toggle — triggers rest timer on check (feature #2) */}
                      <button
                        type="button"
                        onClick={() => toggleSet(exIdx, setIdx, ex.restSeconds ?? 90)}
                        className="ml-auto"
                      >
                        {s.completed
                          ? <CheckCircle2 className="w-4 h-4 text-orange-400" />
                          : <Circle className="w-4 h-4 text-white/20 hover:text-white/50 transition-colors" />
                        }
                      </button>
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
              rpe >= 9 ? 'text-rose-400' : rpe >= 7 ? 'text-orange-400' : 'text-green-400',
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
            className="w-full accent-orange-500"
          />
          <div className="flex justify-between text-[9px] text-white/30">
            <span>Easy</span>
            <span>Moderate</span>
            <span>Max effort</span>
          </div>
        </div>

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Session notes (PR, form issues, fatigue, etc.)..."
          rows={2}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 resize-none"
        />

        {/* ── Stale session warning ──────────────────────────────────────── */}
        {isStale && (
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
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
              className="flex items-center justify-between p-3 rounded-xl bg-orange-500/10 border border-orange-500/20"
            >
              <span className="text-xs font-bold text-orange-300">Rest Timer</span>
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-orange-400 tabular-nums">
                  {Math.floor(restTimer.seconds / 60)}:{String(restTimer.seconds % 60).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => { clearInterval(restTimerRef.current!); setRestTimer(null); }}
                  className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
                >
                  Skip
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Logbook Mode indicator ────────────────────────────────────── */}
        {directWriteMode && (
          <div className="flex items-center gap-1.5 text-[10px] text-orange-400/70">
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
          <NeuralButton size="xl" variant="ghost" onClick={handleClose}>
            Cancel
          </NeuralButton>
        </div>
      </div>
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
            <button
              type="button"
              onClick={() => handleStartSession(todayRoutine)}
              disabled={todayRoutine.exercises.length === 0}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-left">
                <div className="text-xs font-bold text-orange-300">Today — {todayRoutine.name}</div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  {todayRoutine.exercises.length === 0 ? 'No exercises — configure in Titan AI' : `${todayRoutine.exercises.length} exercises`}
                </div>
              </div>
              <NeuralButton as="div" size="sm" className="pointer-events-none" disabled={todayRoutine.exercises.length === 0}>
                <Flame className="w-3 h-3 mr-1.5" />
                Start
              </NeuralButton>
            </button>
          )}

          {/* Other routines */}
          {routines.filter(r => r.weekday !== today).slice(0, 2).map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleStartSession(r)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 hover:bg-white/[0.05] transition-all text-left"
            >
              <div>
                <span className="text-[10px] uppercase tracking-wider text-white/40 mr-2">{r.weekday}</span>
                <span className="text-xs text-white/70">{r.name}</span>
              </div>
              <span className="text-[10px] text-white/30">{r.exercises.length} ex</span>
            </button>
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
