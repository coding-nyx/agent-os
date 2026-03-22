import {
  loadProfile,
  persistProfile,
  GlobalProjectionService,
  Spine,
} from './shared';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import type { ActionHandler, TitanProfile, WorkoutSession, ExerciseLog, ExerciseSet, PersonalRecord, TitanWorkoutSet, TitanWorkoutLog } from './shared';

export const workoutHandlers: Record<string, ActionHandler> = {

  log_workout_session: async ({ userId, encryptionKey, payload, getLatestNSV }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const rawExercises = Array.isArray(payload?.exercises) ? payload.exercises : [];
    const exercises: ExerciseLog[] = rawExercises
      .filter((e: unknown) => e && typeof e === 'object')
      .map((e: Record<string, unknown>) => {
        const rawSets = Array.isArray(e.sets) ? e.sets : [];
        const sets: ExerciseSet[] = rawSets
          .filter((s: unknown) => s && typeof s === 'object')
          .map((s: Record<string, unknown>, idx: number) => ({
            setNumber: typeof s.setNumber === 'number' ? s.setNumber : idx + 1,
            weight: typeof s.weight === 'number' ? s.weight : undefined,
            repsCompleted: typeof s.repsCompleted === 'number' ? Math.max(0, s.repsCompleted) : 0,
            completed: Boolean(s.completed),
            notes: typeof s.notes === 'string' ? s.notes : undefined,
          }));
        return {
          exerciseName: typeof e.exerciseName === 'string' ? e.exerciseName : 'Exercise',
          plannedSets: typeof e.plannedSets === 'number' ? e.plannedSets : sets.length,
          plannedReps: typeof e.plannedReps === 'string' ? e.plannedReps : '—',
          sets,
        };
      });

    // Compute total volume from completed sets with weight
    const totalVolume = exercises.reduce((total, ex) =>
      total + ex.sets.reduce((exTotal, s) =>
        s.completed && s.weight ? exTotal + s.weight * s.repsCompleted : exTotal, 0), 0);

    const session: WorkoutSession = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      routineId: typeof payload?.routineId === 'string' ? payload.routineId : '',
      routineName: typeof payload?.routineName === 'string' ? payload.routineName : 'Workout',
      date: typeof payload?.date === 'string' ? payload.date : new Date().toISOString().slice(0, 10),
      startedAt: typeof payload?.startedAt === 'string' ? payload.startedAt : new Date().toISOString(),
      completedAt: typeof payload?.completedAt === 'string' ? payload.completedAt : new Date().toISOString(),
      exercises,
      totalVolume: totalVolume > 0 ? Math.round(totalVolume) : undefined,
      rpe: typeof payload?.rpe === 'number' ? Math.max(1, Math.min(10, payload.rpe)) : undefined,
      notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
      status: exercises.length === 0
        ? 'abandoned'
        : (payload?.status === 'completed' || payload?.status === 'partial' || payload?.status === 'abandoned'
          ? payload.status
          : 'completed'),
    };

    // Compute updated personal records from this session
    const updatedPRs: Record<string, PersonalRecord> = { ...(profile.personalRecords ?? {}) };
    const sessionDate = session.date;
    for (const exLog of session.exercises) {
      const key = exLog.exerciseName.toLowerCase().trim();
      for (const s of exLog.sets) {
        if (!s.completed || !s.weight || !s.repsCompleted) continue;
        const e1RM = s.repsCompleted === 1
          ? s.weight
          : Math.round(s.weight * (1 + s.repsCompleted / 30));
        const existing = updatedPRs[key];
        if (!existing || e1RM > existing.e1RM) {
          updatedPRs[key] = {
            exerciseName: exLog.exerciseName,
            maxWeight: s.weight,
            repsAtMax: s.repsCompleted,
            e1RM,
            achievedDate: sessionDate,
            sessionId: session.id,
          };
        }
      }
    }

    // ── New: workoutLogs transformation for sparklines ─────────────────
    const titanSets: TitanWorkoutSet[] = [];
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (s.completed && typeof s.weight === 'number' && typeof s.repsCompleted === 'number') {
          titanSets.push({
            exerciseId: ex.exerciseName.toLowerCase().trim(),
            weight: s.weight,
            reps: s.repsCompleted,
            notes: s.notes
          });
        }
      }
    }

    const newWorkoutLog: TitanWorkoutLog = {
      id: session.id,
      date: session.date,
      sets: titanSets,
      notes: session.notes
    };

    const next: TitanProfile = {
      ...profile,
      workoutSessions: [session, ...(profile.workoutSessions ?? [])].slice(0, 365),
      workoutLogs: [newWorkoutLog, ...(profile.workoutLogs ?? [])].slice(0, 100),
      personalRecords: updatedPRs,
      updatedAt: new Date().toISOString(),
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    Spine.emit({
      type: 'WORKOUT_COMPLETED',
      source: 'titan',
      domain: 'B',
      data: {
        sessionId: session.id,
        routineName: session.routineName,
        date: session.date,
        totalVolume: session.totalVolume,
        rpe: session.rpe,
        exerciseCount: exercises.length,
        status: session.status,
      },
      cascadeDepth: 0,
      priority: 'info',
    });

    // Emit TITAN_RECOVERY_NEEDED when this session pushes cnsFatigue over threshold
    if (session.rpe != null && session.rpe >= 8) {
      const nsvForRec = getLatestNSV?.() ?? {};
      const bioForRec = (nsvForRec.biological ?? {}) as Record<string, unknown>;
      const currentFatigue = typeof bioForRec.cnsFatigue === 'number' ? bioForRec.cnsFatigue : 0;
      const projectedFatigue = Math.min(10, currentFatigue + session.rpe * 0.5);
      if (projectedFatigue >= 7.5) {
        Spine.emit({
          type: 'TITAN_RECOVERY_NEEDED',
          source: 'titan',
          domain: 'B',
          data: {
            projectedCnsFatigue: Math.round(projectedFatigue * 10) / 10,
            sessionRpe: session.rpe,
            totalVolume: session.totalVolume,
            date: session.date,
            reason: 'high_rpe_accumulated_fatigue',
          },
          cascadeDepth: 0,
          priority: projectedFatigue >= 9 ? 'critical' : 'alert',
        });
      }
    }

    // Emit TITAN_TRAINING_STREAK on milestone consecutive training days
    {
      const allSessions = next.workoutSessions ?? [];
      const uniqueDates = [...new Set(allSessions.map((s: WorkoutSession) => s.date))].sort().reverse();
      let streak = 0;
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      for (const d of uniqueDates) {
        const sessionDay = new Date(d as string);
        sessionDay.setHours(0, 0, 0, 0);
        const diffDays = Math.round((cursor.getTime() - sessionDay.getTime()) / 86_400_000);
        if (diffDays <= 1) { streak++; cursor = sessionDay; }
        else break;
      }
      if ([7, 14, 21, 30].includes(streak)) {
        Spine.emit({
          type: 'TITAN_TRAINING_STREAK',
          source: 'titan',
          domain: 'B',
          data: { streakDays: streak, date: session.date },
          cascadeDepth: 0,
          priority: 'info',
        });
      }
    }

    // Update NSV recovery — high RPE sessions reduce recovery score
    // Note: This uses await because recovery changes can affect clearance decisions
    if (userId && session.rpe != null) {
      const recoveryImpact = session.rpe >= 8 ? -1.5 : session.rpe >= 6 ? -0.5 : 0;
      if (recoveryImpact !== 0) {
        const nsv = getLatestNSV?.() ?? {};
        const bio = (nsv.biological ?? {}) as Record<string, unknown>;
        const currentRecovery = typeof bio.recoveryScore === 'number' ? bio.recoveryScore : 7;
        try {
          await GlobalProjectionService.updateCrossFunctionalState(userId, {
            biological: { recoveryScore: Math.max(0, Math.min(10, currentRecovery + recoveryImpact)) },
          });
        } catch (e) {
          console.error('[Titan] recoveryScore NSV sync failed (will not affect clearance):', e);
        }
      }
    }

    // Auto-update cnsFatigue NSV after session.
    // rawFatigue is an RPE-weighted value (0–10) with a volume component
    // that saturates at 4 points (≥20 000 kg total volume). The final
    // value is the higher of the time-decayed existing fatigue and the
    // newly computed value, then written back atomically.
    if (userId) {
      const sessionRPE = session.rpe ?? 6;
      const volumeLoad = session.totalVolume ?? 0;
      const rawFatigue = Math.min(10, sessionRPE * 0.6 + Math.min(4, volumeLoad / 5000));

      const nsvForFatigue = getLatestNSV?.() ?? {};
      const bioForFatigue = (nsvForFatigue.biological ?? {}) as Record<string, unknown>;
      const existingFatigue = typeof bioForFatigue.cnsFatigue === 'number' ? bioForFatigue.cnsFatigue : 0;

      // Exponential decay: cnsFatigue halves every 48 h since last session.
      const now = Date.now();
      const lastSessionTimestamp = typeof bioForFatigue.lastSessionTimestamp === 'number'
        ? bioForFatigue.lastSessionTimestamp
        : undefined;
      const hoursElapsed = lastSessionTimestamp != null
        ? (now - lastSessionTimestamp) / (1000 * 60 * 60)
        : 48;
      const decayedExisting = existingFatigue * Math.pow(0.5, hoursElapsed / 48);
      const newFatigue = Math.max(decayedExisting, rawFatigue);

      queueNSVUpdate(userId, { biological: { cnsFatigue: Math.round(newFatigue * 10) / 10 } }, 'log_workout_session');
    }
  },

  log_workout_set: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const exerciseName = typeof payload?.exercise === 'string' ? payload.exercise.trim() : 'Exercise';
    const sets = typeof payload?.sets === 'number' ? Math.max(1, payload.sets) : 1;
    const reps = typeof payload?.reps === 'number' ? Math.max(1, payload.reps) : 1;
    const weight = typeof payload?.weight === 'number' && payload.weight > 0 ? payload.weight : undefined;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const sessionId = `ql-set-${Date.now()}`;

    const exerciseSets: ExerciseSet[] = Array.from({ length: sets }, (_, i) => ({
      setNumber: i + 1,
      weight,
      repsCompleted: reps,
      completed: true,
    }));

    const session: WorkoutSession = {
      id: sessionId,
      routineId: 'quick-log',
      routineName: 'Quick Log',
      date: today,
      startedAt: now,
      completedAt: now,
      exercises: [
        {
          exerciseName,
          plannedSets: sets,
          plannedReps: String(reps),
          sets: exerciseSets,
        },
      ],
      totalVolume: weight ? Math.round(weight * reps * sets) : undefined,
      status: 'completed',
    };

    const updatedPRs: Record<string, PersonalRecord> = { ...(profile.personalRecords ?? {}) };
    const key = exerciseName.toLowerCase().trim();
    let isNewPR = false;

    if (weight && reps) {
      const e1RM = reps === 1 ? weight : Math.round(weight * (1 + reps / 30));
      const existing = updatedPRs[key];
      if (!existing || e1RM > existing.e1RM) {
        isNewPR = !existing; // true = first time, still a PR
        updatedPRs[key] = {
          exerciseName,
          maxWeight: weight,
          repsAtMax: reps,
          e1RM,
          achievedDate: today,
          sessionId,
        };
        isNewPR = true;
      }
    }

    const next: TitanProfile = {
      ...profile,
      workoutSessions: [session, ...(profile.workoutSessions ?? [])].slice(0, 365),
      personalRecords: updatedPRs,
      updatedAt: now,
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    // Push feedback message to the AI chat
    if (pushAssistantMessage) {
      const weightStr = weight ? ` @ ${weight}kg` : '';
      const prStr = isNewPR ? ' 🏆 **New PR!**' : '';
      pushAssistantMessage(
        `✅ Logged **${sets}×${reps} ${exerciseName}${weightStr}**.${prStr}`,
      );
    }
  },

};
