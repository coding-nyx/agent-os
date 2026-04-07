/**
 * useTitanProgram
 *
 * Manages training-program lifecycle: apply a program template (merges
 * routines, generates 4 weeks of planned workouts, sets activeProgram),
 * clear/reset, and in-place updates to program metadata.
 */

import { useState, useCallback } from 'react';
import type { AuthUser } from '@/lib/services/auth-service';
import type {
  TitanProfile,
  Routine,
  PlannedWorkout,
  Weekday,
} from '@/lib/types';
import { saveTitanProfile } from '../services/titan-profile-service';

interface UseTitanProgramParams {
  profile: TitanProfile | null;
  encryptionKey: CryptoKey | null;
  user: AuthUser | null;
}

export function useTitanProgram({
  profile,
  encryptionKey,
  user,
}: UseTitanProgramParams) {
  const [isClearProgramModalOpen, setIsClearProgramModalOpen] = useState(false);
  const [planResetVersion, setPlanResetVersion] = useState(0);

  const handleApplyProgram = useCallback(async (
    routines: Routine[],
    programName: string,
    programId?: string,
    durationWeeks: number = 12,
    phases?: { name: string; weeks: [number, number] }[],
  ) => {
    if (!profile || !encryptionKey || !user) return;

    // Always apply program templates as direct writes — they're static trusted data.
    const existingNames = new Set((profile.routines ?? []).map((r) => r.name));
    const incoming = routines.filter((r) => !existingNames.has(r.name));
    const merged = [...incoming, ...(profile.routines ?? [])];

    // Generate planned workouts for the next 4 weeks based on the applied routines
    const today = new Date();
    const plannedWorkouts: PlannedWorkout[] = [...(profile.plannedWorkouts ?? [])];
    const generatedIds = new Set(plannedWorkouts.map((pw) => `${pw.date}:${pw.routineName}`));

    const routinesToSchedule = routines;

    for (let i = 0; i < 28; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as Weekday;

      const dayRoutines = routinesToSchedule.filter((r) => r.weekday === dayName);

      for (const routine of dayRoutines) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const isoDate = `${y}-${m}-${dayStr}`;

        const uniqueKey = `${isoDate}:${routine.name}`;
        if (generatedIds.has(uniqueKey)) continue;

        plannedWorkouts.push({
          id: crypto.randomUUID(),
          date: isoDate,
          routineName: routine.name,
          exerciseNames: routine.exercises.map((e) => e.name),
          status: 'planned',
          createdAt: new Date().toISOString(),
        });
        generatedIds.add(uniqueKey);
      }
    }

    const activeProgram = {
      id: programId ?? programName.toLowerCase().replace(/\s+/g, '-'),
      name: programName,
      startDate: new Date().toISOString(),
      durationWeeks,
      phases,
    };

    await saveTitanProfile(
      {
        ...profile,
        routines: merged,
        plannedWorkouts: plannedWorkouts.slice(0, 200),
        activeProgram,
        updatedAt: new Date().toISOString(),
      },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  const handleClearProgram = useCallback(() => {
    setIsClearProgramModalOpen(true);
  }, []);

  const handleConfirmClearProgram = useCallback(async () => {
    if (!profile || !encryptionKey || !user) {
      setIsClearProgramModalOpen(false);
      return;
    }

    await saveTitanProfile(
      {
        ...profile,
        routines: [],
        activeProgram: undefined,
        plannedWorkouts: [],
        updatedAt: new Date().toISOString(),
      },
      { userId: user.uid, encryptionKey },
    );
    setPlanResetVersion((prev) => prev + 1);
    setIsClearProgramModalOpen(false);
  }, [profile, encryptionKey, user]);

  const handleUpdateProgram = useCallback(async (updates: Partial<NonNullable<TitanProfile['activeProgram']>>) => {
    if (!profile || !encryptionKey || !user || !profile.activeProgram) return;

    await saveTitanProfile(
      {
        ...profile,
        activeProgram: { ...profile.activeProgram, ...updates },
        updatedAt: new Date().toISOString(),
      },
      { userId: user.uid, encryptionKey },
    );
  }, [profile, encryptionKey, user]);

  return {
    isClearProgramModalOpen,
    setIsClearProgramModalOpen,
    planResetVersion,
    handleApplyProgram,
    handleClearProgram,
    handleConfirmClearProgram,
    handleUpdateProgram,
  };
}
