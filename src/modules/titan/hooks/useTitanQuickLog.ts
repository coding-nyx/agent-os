/**
 * useTitanQuickLog
 *
 * Manages the in-line natural-language quick-log bar: parses raw text into
 * structured exercise entries, annotates potential PRs, and commits the
 * resulting workout session to the Titan profile.
 *
 * The hook is deliberately unopinionated about UI; it exposes only state and
 * stable callbacks that the parent can wire to any presentation layer.
 *
 * Responsibility: quick-log parsing and commit logic — no layout or recovery
 * lifecycle concerns.
 */

import { useState, useCallback, useRef } from 'react';
import type { TitanProfile, ExerciseLog, WorkoutSession, PersonalRecord } from '@/lib/types';
import { parseQuickLogInput, type ParsedEntry } from '../utils/quick-log-parser';
import { calculateE1RM } from '../utils/e1rm';
import { saveTitanProfile } from '../services/titan-profile-service';
import type { TitanTrainingGateState } from '../services/titan-clearance-debt-service';
import type { TrainingGateRequest } from './types';

interface UseTitanQuickLogParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: { uid: string } | null;
  isRecoveryActive: boolean;
  trainingGateState: TitanTrainingGateState;
  loadLatestPersistedProfile: () => Promise<TitanProfile | null>;
  setRecoveryGate: (gate: TrainingGateRequest | null) => void;
}

export function useTitanQuickLog(params: UseTitanQuickLogParams): {
  isQuickLogOpen: boolean;
  setIsQuickLogOpen: (v: boolean) => void;
  quickLogDate: Date | null;
  setQuickLogDate: (d: Date | null) => void;
  quickLogIsRecovery: boolean;
  setQuickLogIsRecovery: (v: boolean) => void;
  remindDate: string | null;
  setRemindDate: (d: string | null) => void;
  quickLogBarInput: string;
  setQuickLogBarInput: (v: string) => void;
  pendingLogEntries: ParsedEntry[];
  setPendingLogEntries: (e: ParsedEntry[]) => void;
  quickLogCommitError: string | null;
  handleQuickLogBarSubmit: (input: string) => void;
  handleQuickLogBarCommit: (mode?: 'recovery' | 'full') => Promise<void>;
} {
  const {
    profile,
    encryptionKey,
    user,
    isRecoveryActive,
    trainingGateState,
    loadLatestPersistedProfile,
    setRecoveryGate,
  } = params;

  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [quickLogDate, setQuickLogDate] = useState<Date | null>(null);
  const [quickLogIsRecovery, setQuickLogIsRecovery] = useState(false);
  const [remindDate, setRemindDate] = useState<string | null>(null);
  const [quickLogBarInput, setQuickLogBarInput] = useState('');
  const [pendingLogEntries, setPendingLogEntries] = useState<ParsedEntry[]>([]);
  const [quickLogCommitError, setQuickLogCommitError] = useState<string | null>(null);

  // Guards against double-commits that could arise from rapid re-renders or
  // button double-taps on mobile.
  const isCommittingQuickLogRef = useRef(false);

  /** Parse raw natural-language input into structured entries, annotating each
   *  set with whether it would set a new PR based on the Epley e1RM formula. */
  const handleQuickLogBarSubmit = useCallback(
    (input: string) => {
      const result = parseQuickLogInput(input);
      if (result.isEmpty) return;

      const prs = profile?.personalRecords ?? {};
      const annotated = result.entries.map((entry) => {
        if (!entry.weight || !entry.reps) return entry;
        const key = entry.exerciseName.toLowerCase().trim();
        const storedPR = prs[key];
        const candidateE1RM = calculateE1RM(entry.weight, entry.reps);
        const isPR = !storedPR || candidateE1RM > storedPR.e1RM;
        return {
          ...entry,
          isPR,
          prDelta:
            isPR && storedPR
              ? Math.round((candidateE1RM - storedPR.e1RM) * 10) / 10
              : null,
        };
      });
      setPendingLogEntries(annotated);
    },
    [profile?.personalRecords],
  );

  /** Commit pending entries to the Titan profile.  If the training-gate or
   *  recovery mode is active and no explicit `mode` has been chosen, surfaces
   *  the gate modal instead of proceeding. */
  const handleQuickLogBarCommit = useCallback(
    async (mode?: 'recovery' | 'full') => {
      if (!profile || !encryptionKey || !user || pendingLogEntries.length === 0) return;

      // Gate check — surface the modal and bail; the modal callbacks will
      // invoke this function again with an explicit mode.
      if ((trainingGateState.shouldBlockFullTraining || isRecoveryActive) && !mode) {
        setRecoveryGate({
          onLight: () => handleQuickLogBarCommit('recovery'),
          onFull: () => handleQuickLogBarCommit('full'),
          mode: trainingGateState.shouldBlockFullTraining ? 'clearance' : 'recovery',
          message:
            trainingGateState.enforcementReason ??
            "You're in recovery mode. Log this as a light recovery session or continue with full training.",
          allowOverride: trainingGateState.shouldRequireExplicitOverride,
        });
        return;
      }

      if (isCommittingQuickLogRef.current) return;
      isCommittingQuickLogRef.current = true;
      setQuickLogCommitError(null);

      try {
        const latestProfile = await loadLatestPersistedProfile();
        if (!latestProfile) return;

        const now = new Date().toISOString();
        const today = now.slice(0, 10);
        const sessionId = `ql-fast-${crypto.randomUUID()}`;

        const exercises: ExerciseLog[] = pendingLogEntries.map((entry) => ({
          exerciseName: entry.exerciseName,
          plannedSets: entry.sets,
          plannedReps: entry.reps ? String(entry.reps) : '—',
          sets: Array.from({ length: entry.sets }, (_, i) => ({
            setNumber: i + 1,
            weight: entry.weight ?? undefined,
            repsCompleted: entry.reps ?? 0,
            completed: true,
          })),
        }));

        const totalVolume = exercises.reduce(
          (total, ex) =>
            total +
            ex.sets.reduce(
              (st, s) => (s.completed && s.weight ? st + s.weight * s.repsCompleted : st),
              0,
            ),
          0,
        );

        const session: WorkoutSession = {
          id: sessionId,
          routineId: 'quick-log',
          routineName: 'Quick Log',
          date: today,
          startedAt: now,
          completedAt: now,
          exercises,
          totalVolume: totalVolume > 0 ? Math.round(totalVolume) : undefined,
          recoverySession: mode === 'recovery',
          status: 'completed',
        };

        const updatedSessions = [session, ...(latestProfile.workoutSessions ?? [])].slice(0, 500);
        const updatedPRs: Record<string, PersonalRecord> = {
          ...(latestProfile.personalRecords ?? {}),
        };

        for (const exLog of session.exercises) {
          const key = exLog.exerciseName.toLowerCase().trim();
          for (const s of exLog.sets) {
            if (!s.completed || !s.weight || !s.repsCompleted) continue;
            const e1RM = calculateE1RM(s.weight, s.repsCompleted);
            const existing = updatedPRs[key];
            if (!existing || e1RM > existing.e1RM) {
              updatedPRs[key] = {
                exerciseName: exLog.exerciseName,
                maxWeight: s.weight,
                repsAtMax: s.repsCompleted,
                e1RM,
                achievedDate: today,
                sessionId,
              };
            }
          }
        }

        const updated: TitanProfile = {
          ...latestProfile,
          workoutSessions: updatedSessions,
          personalRecords: updatedPRs,
          updatedAt: now,
        };

        await saveTitanProfile(updated, { userId: user.uid, encryptionKey });
        setPendingLogEntries([]);
        setQuickLogBarInput('');
      } catch (err) {
        console.error('[QuickLogBar] commit failed:', err);
        setQuickLogCommitError('Failed to save. Tap retry.');
      } finally {
        isCommittingQuickLogRef.current = false;
      }
    },
    [
      profile,
      encryptionKey,
      user,
      pendingLogEntries,
      isRecoveryActive,
      trainingGateState.shouldBlockFullTraining,
      trainingGateState.shouldRequireExplicitOverride,
      trainingGateState.enforcementReason,
      loadLatestPersistedProfile,
      setRecoveryGate,
    ],
  );

  return {
    isQuickLogOpen,
    setIsQuickLogOpen,
    quickLogDate,
    setQuickLogDate,
    quickLogIsRecovery,
    setQuickLogIsRecovery,
    remindDate,
    setRemindDate,
    quickLogBarInput,
    setQuickLogBarInput,
    pendingLogEntries,
    setPendingLogEntries,
    quickLogCommitError,
    handleQuickLogBarSubmit,
    handleQuickLogBarCommit,
  };
}
