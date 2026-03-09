/**
 * WorkoutSessionLogger - Log actual workout performance against planned routine
 * AI-gated: collects set data locally, sends structured prompt to Titan for validation + commit
 */

import React, { useState, useCallback, useMemo } from 'react';
import { CheckCircle2, Circle, Plus, Minus, Flame, BarChart3 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { NeuralModal } from '@/core/components/NeuralModal';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { PanelLabel } from '@/core/components/PanelLabel';
import type { Routine, WorkoutSession } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getTodayWeekday, getTodayIso } from '../utils';

interface SessionSetState {
  weight: string;
  repsCompleted: string;
  completed: boolean;
}

interface SessionExerciseState {
  sets: SessionSetState[];
}

interface WorkoutSessionLoggerProps {
  routines: Routine[];
  recentSessions: WorkoutSession[];
  /** Routes structured session prompt to Titan AI for validation + commit */
  onSubmitSession: (prompt: string) => void;
}

function buildSessionPrompt(
  routine: Routine,
  exercises: SessionExerciseState[],
  rpe: number,
  notes: string,
  startedAt: string
): string {
  const completedAt = new Date().toISOString();
  const date = getTodayIso();

  const exerciseLines = routine.exercises.map((ex, i) => {
    const state = exercises[i] ?? { sets: [] };
    const setLines = state.sets.map((s, si) => {
      const weight = s.weight ? `${s.weight}kg` : 'BW';
      return `    Set ${si + 1}: ${weight} × ${s.repsCompleted || '0'} reps${s.completed ? ' ✓' : ' (skipped)'}`;
    }).join('\n');
    const completedSets = state.sets.filter(s => s.completed).length;
    return `  ${ex.name} (${completedSets}/${ex.sets} sets completed, planned ${ex.reps} reps):\n${setLines}`;
  }).filter(Boolean).join('\n\n');

  return [
    `I just completed my ${routine.weekday?.toUpperCase() || ''} workout: "${routine.name}".`,
    `Date: ${date} | Duration: ~${Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000)} min | RPE: ${rpe}/10`,
    `\nPerformance:\n${exerciseLines}`,
    notes ? `\nNotes: ${notes}` : '',
    '\nPlease log this session using log_workout_session. Compare actual vs planned volume.',
    'Adjust my recovery estimate and flag any form-cue reminders if needed.',
  ].filter(Boolean).join('\n');
}

function SessionModal({
  isOpen,
  routine,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  routine: Routine | null;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [exercises, setExercises] = useState<SessionExerciseState[]>([]);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const [startedAt] = useState(() => new Date().toISOString());

  // Reset state when routine changes
  const initialExercises = useMemo(() => {
    if (!routine) return [];
    return routine.exercises.map(ex => ({
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        weight: '',
        repsCompleted: '',
        completed: false,
      })),
    }));
  }, [routine]);

  // Sync exercises when modal opens with a routine
  React.useEffect(() => {
    if (isOpen && routine) {
      setExercises(initialExercises);
      setRpe(7);
      setNotes('');
    }
  }, [isOpen, routine, initialExercises]);

  const toggleSet = useCallback((exIdx: number, setIdx: number) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, completed: !s.completed })
      }
    ));
  }, []);

  const updateSet = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'repsCompleted', value: string) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value })
      }
    ));
  }, []);

  const addSet = useCallback((exIdx: number) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: [...ex.sets, { weight: '', repsCompleted: '', completed: false }]
      }
    ));
  }, []);

  const removeSet = useCallback((exIdx: number) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx || ex.sets.length <= 1 ? ex : { ...ex, sets: ex.sets.slice(0, -1) }
    ));
  }, []);

  const completedSetsCount = exercises.reduce((total, ex) =>
    total + ex.sets.filter(s => s.completed).length, 0);
  const totalSetsCount = exercises.reduce((total, ex) => total + ex.sets.length, 0);
  const elapsedMinutes = Math.round((Date.now() - new Date(startedAt).getTime()) / 60000);
  const isStale = elapsedMinutes > 240;

  if (!routine) return null;

  return (
    <NeuralModal
      isOpen={isOpen}
      onClose={onClose}
      title={routine.name}
      subtitle={`${routine.weekday?.toUpperCase()} — Log Session`}
      icon={Flame}
      themeColor="orange"
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {/* Progress summary */}
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

        {/* Exercise list */}
        <div className="max-h-[50vh] overflow-y-auto space-y-4 pr-1">
          {routine.exercises.map((ex, exIdx) => {
            const exState = exercises[exIdx];
            if (!exState) return null;
            return (
              <div key={exIdx} className="space-y-2">
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
                <div className="space-y-1.5">
                  {exState.sets.map((s, setIdx) => (
                    <div key={setIdx} className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                      s.completed ? 'bg-orange-500/10 border-orange-500/20' : 'bg-white/[0.02] border-white/10'
                    )}>
                      <span className="text-[10px] text-white/40 w-8 shrink-0">Set {setIdx + 1}</span>
                      <input
                        type="number"
                        placeholder="kg"
                        value={s.weight}
                        onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                        className="w-16 bg-transparent text-xs text-white/80 border-b border-white/20 focus:border-orange-400 outline-none text-center pb-0.5"
                        min={0}
                      />
                      <span className="text-white/20 text-xs">×</span>
                      <input
                        type="number"
                        placeholder="reps"
                        value={s.repsCompleted}
                        onChange={e => updateSet(exIdx, setIdx, 'repsCompleted', e.target.value)}
                        className="w-14 bg-transparent text-xs text-white/80 border-b border-white/20 focus:border-orange-400 outline-none text-center pb-0.5"
                        min={0}
                      />
                      <button
                        type="button"
                        onClick={() => toggleSet(exIdx, setIdx)}
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

        {/* RPE slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
              Rate of Perceived Exertion
            </span>
            <span className={cn(
              'text-xs font-bold tabular-nums',
              rpe >= 9 ? 'text-rose-400' : rpe >= 7 ? 'text-orange-400' : 'text-green-400'
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

        {/* Notes */}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Session notes (PR, form issues, fatigue, etc.)..."
          rows={2}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-orange-500/40 resize-none"
        />

        {/* Stale session warning */}
        {isStale && (
          <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            Session started {elapsedMinutes} min ago — is this data still accurate?
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-white/5">
          <NeuralButton
            size="xl"
            className="flex-1"
            disabled={completedSetsCount === 0}
            onClick={() => {
              if (!routine) return;
              const prompt = buildSessionPrompt(routine, exercises, rpe, notes, startedAt);
              onSubmit(prompt);
              onClose();
            }}
          >
            <Flame className="w-4 h-4 mr-2" />
            Finish & Send to Titan
          </NeuralButton>
          <NeuralButton size="xl" variant="ghost" onClick={onClose}>
            Cancel
          </NeuralButton>
        </div>
      </div>
    </NeuralModal>
  );
}

export function WorkoutSessionLogger({ routines, recentSessions, onSubmitSession }: WorkoutSessionLoggerProps) {
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
      />
    </>
  );
}
