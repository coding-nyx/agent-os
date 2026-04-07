/**
 * useTitanDirectWrite
 *
 * Owns all direct-write CRUD handlers that save data straight to the profile
 * (body weight, cardio, sleep, injuries, meals, plans, goals, macros, cycles)
 * plus the shared `commitWorkoutSession` function used by both QuickLogDrawer
 * and TrainTab.
 *
 * Also owns `loadLatestPersistedProfile` — the freshest-read helper that
 * prevents stale-profile overwrites on concurrent saves.
 */

import { useCallback } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import type {
  TitanProfile,
  WorkoutSession,
  PersonalRecord,
  BodyWeightEntry,
  CardioSession,
  SleepEntry,
  Injury,
  MealEntry,
  PlannedWorkout,
  WorkoutGoal,
  CustomField,
  CycleEntry,
} from '@/lib/types';
import { loadTitanProfile, saveTitanProfile } from '../services/titan-profile-service';
import { calculateE1RM } from '../utils/e1rm';

interface UseTitanDirectWriteParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: AuthUser | null;
}

export function useTitanDirectWrite({
  profile,
  encryptionKey,
  user,
}: UseTitanDirectWriteParams) {
  const directWrite = profile?.directWriteMode ?? false;

  // ── Freshest-read helper ─────────────────────────────────────────────────
  const loadLatestPersistedProfile = useCallback(async (): Promise<TitanProfile | null> => {
    if (!user?.uid || !encryptionKey) return profile;
    try {
      return await loadTitanProfile({ userId: user.uid, encryptionKey }) ?? profile;
    } catch (error) {
      console.error('[Titan] Failed to load latest profile before save:', error);
      return profile;
    }
  }, [user?.uid, encryptionKey, profile]);

  // ── Toggle direct-write mode ─────────────────────────────────────────────
  const handleToggleDirectWrite = useCallback(async () => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, directWriteMode: !directWrite, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, directWrite, encryptionKey, user]);

  // ── Body weight ──────────────────────────────────────────────────────────
  const handleDirectSaveBodyWeight = useCallback(async (entry: BodyWeightEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, bodyWeightLog: [entry, ...(profile.bodyWeightLog ?? [])].slice(0, 1000), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Cardio ───────────────────────────────────────────────────────────────
  const handleDirectSaveCardio = useCallback(async (session: CardioSession) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, cardioLog: [session, ...(profile.cardioLog ?? [])].slice(0, 500), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Sleep ────────────────────────────────────────────────────────────────
  const handleDirectSaveSleep = useCallback(async (entry: SleepEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, sleepLog: [entry, ...(profile.sleepLog ?? [])].slice(0, 365), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Injuries ─────────────────────────────────────────────────────────────
  const handleDirectSaveInjury = useCallback(async (injury: Injury) => {
    if (!profile || !encryptionKey || !user) return;
    const existingInjuries: Injury[] = (profile.history?.injuries ?? []).filter(
      (i): i is Injury => typeof i === 'object' && i !== null && 'id' in i,
    );
    const updatedHistory = { ...profile.history, injuries: [injury, ...existingInjuries].slice(0, 50) };
    await saveTitanProfile(
      { ...profile, history: updatedHistory, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectUpdateInjury = useCallback(async (updated: Injury) => {
    if (!profile || !encryptionKey || !user) return;
    const existingInjuries: Injury[] = (profile.history?.injuries ?? []).filter(
      (i): i is Injury => typeof i === 'object' && i !== null && 'id' in i,
    );
    const updatedInjuries = existingInjuries.map((i) => (i.id === updated.id ? updated : i));
    const updatedHistory = { ...profile.history, injuries: updatedInjuries };
    await saveTitanProfile(
      { ...profile, history: updatedHistory, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Meals ────────────────────────────────────────────────────────────────
  const handleDirectSaveMeal = useCallback(async (entry: MealEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, mealLog: [entry, ...(profile.mealLog ?? [])].slice(0, 2000), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Planned workouts ─────────────────────────────────────────────────────
  const handleDirectSavePlan = useCallback(async (plan: PlannedWorkout) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, plannedWorkouts: [plan, ...(profile.plannedWorkouts ?? [])].slice(0, 200), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectUpdatePlan = useCallback(async (updated: PlannedWorkout) => {
    if (!profile || !encryptionKey || !user) return;
    const existing = profile.plannedWorkouts ?? [];
    const idx = existing.findIndex((pw) => pw.id === updated.id);
    const updatedList = idx >= 0
      ? existing.map((pw, i) => (i === idx ? updated : pw))
      : existing;
    await saveTitanProfile(
      { ...profile, plannedWorkouts: updatedList, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Goals ────────────────────────────────────────────────────────────────
  const handleDirectSaveGoal = useCallback(async (goal: WorkoutGoal) => {
    if (!profile || !encryptionKey || !user) return;
    const existingGoals: WorkoutGoal[] = (profile.goals ?? []).filter(
      (g): g is WorkoutGoal => typeof g === 'object' && g !== null && 'id' in g,
    );
    await saveTitanProfile(
      { ...profile, goals: [goal, ...existingGoals].slice(0, 50), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectUpdateGoal = useCallback(async (updated: WorkoutGoal) => {
    if (!profile || !encryptionKey || !user) return;
    const existingGoals: WorkoutGoal[] = (profile.goals ?? []).filter(
      (g): g is WorkoutGoal => typeof g === 'object' && g !== null && 'id' in g,
    );
    const updatedGoals = existingGoals.map((g) => (g.id === updated.id ? updated : g));
    await saveTitanProfile(
      { ...profile, goals: updatedGoals, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Custom fields (macros) ───────────────────────────────────────────────
  const handleDirectCreateMacros = useCallback(async (fields: CustomField[]) => {
    if (!profile || !encryptionKey || !user) return;
    const existing = profile.customFields ?? [];
    const existingNames = new Set(existing.map((f) => f.name.toLowerCase()));
    const newFields = fields.filter((f) => !existingNames.has(f.name.toLowerCase()));
    if (newFields.length === 0) return;
    await saveTitanProfile(
      { ...profile, customFields: [...existing, ...newFields].slice(0, 20), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Cycles ───────────────────────────────────────────────────────────────
  const handleDirectCreateCycle = useCallback(async (cycle: CycleEntry) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, cycles: [...(profile.cycles ?? []), cycle], updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleDirectDeleteCycle = useCallback(async (cycleId: string) => {
    if (!profile || !encryptionKey || !user) return;
    await saveTitanProfile(
      { ...profile, cycles: (profile.cycles ?? []).filter((c) => c.id !== cycleId), updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  // ── Session commit (shared by QuickLogDrawer and TrainTab) ───────────────
  const commitWorkoutSession = useCallback(async (session: WorkoutSession, recoverySession?: boolean) => {
    if (!profile || !encryptionKey || !user) return;
    const latestProfile = await loadLatestPersistedProfile();
    if (!latestProfile) return;
    const sessionWithFlag = { ...session, recoverySession: recoverySession ?? session.recoverySession };
    const updatedSessions = [sessionWithFlag, ...(latestProfile.workoutSessions ?? [])].slice(0, 500);
    const updatedPRs: Record<string, PersonalRecord> = { ...(latestProfile.personalRecords ?? {}) };
    for (const exLog of sessionWithFlag.exercises) {
      const key = exLog.exerciseName.toLowerCase().trim();
      for (const s of exLog.sets) {
        if (!s.completed || !s.weight || !s.repsCompleted) continue;
        const e1RM = calculateE1RM(s.weight, s.repsCompleted);
        const existing = updatedPRs[key];
        if (!existing || e1RM > existing.e1RM) {
          updatedPRs[key] = { exerciseName: exLog.exerciseName, maxWeight: s.weight, repsAtMax: s.repsCompleted, e1RM, achievedDate: sessionWithFlag.date, sessionId: sessionWithFlag.id };
        }
      }
    }
    await saveTitanProfile(
      { ...latestProfile, workoutSessions: updatedSessions, personalRecords: updatedPRs, updatedAt: new Date().toISOString() },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user, loadLatestPersistedProfile]);

  return {
    directWrite,
    loadLatestPersistedProfile,
    handleToggleDirectWrite,
    handleDirectSaveBodyWeight,
    handleDirectSaveCardio,
    handleDirectSaveSleep,
    handleDirectSaveInjury,
    handleDirectUpdateInjury,
    handleDirectSaveMeal,
    handleDirectSavePlan,
    handleDirectUpdatePlan,
    handleDirectSaveGoal,
    handleDirectUpdateGoal,
    handleDirectCreateMacros,
    handleDirectCreateCycle,
    handleDirectDeleteCycle,
    commitWorkoutSession,
  };
}
