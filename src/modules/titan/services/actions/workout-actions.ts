import {
  loadProfile,
  persistProfile,
  GlobalProjectionService,
} from './shared';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import type { ActionHandler, TitanProfile, WorkoutSession, ExerciseLog, ExerciseSet, PersonalRecord, TitanWorkoutSet, TitanWorkoutLog } from './shared';

export const workoutHandlers: Record<string, ActionHandler> = {

  log_workout_session: async ({ userId, encryptionKey, payload, getLatestNSV, emitSpineEvent }) => {
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

    emitSpineEvent(
      'WORKOUT_COMPLETED',
      {
        sessionId: session.id,
        routineName: session.routineName,
        date: session.date,
        totalVolume: session.totalVolume,
        rpe: session.rpe,
        exerciseCount: exercises.length,
        status: session.status,
      },
      { domain: 'B', priority: 'info' },
    );

    // Emit TITAN_RECOVERY_NEEDED when this session pushes cnsFatigue over threshold
    if (session.rpe != null && session.rpe >= 8) {
      const nsvForRec = getLatestNSV?.() ?? {};
      const bioForRec = (nsvForRec.biological ?? {}) as Record<string, unknown>;
      const currentFatigue = typeof bioForRec.cnsFatigue === 'number' ? bioForRec.cnsFatigue : 0;
      const projectedFatigue = Math.min(10, currentFatigue + session.rpe * 0.5);
      if (projectedFatigue >= 7.5) {
        emitSpineEvent(
          'TITAN_RECOVERY_NEEDED',
          {
            projectedCnsFatigue: Math.round(projectedFatigue * 10) / 10,
            sessionRpe: session.rpe,
            totalVolume: session.totalVolume,
            date: session.date,
            reason: 'high_rpe_accumulated_fatigue',
          },
          { domain: 'B', priority: projectedFatigue >= 9 ? 'critical' : 'alert' },
        );
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
        emitSpineEvent(
          'TITAN_TRAINING_STREAK',
          { streakDays: streak, date: session.date },
          { domain: 'B', priority: 'info' },
        );
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

      queueNSVUpdate(userId, { biological: { cnsFatigue: Math.round(newFatigue * 10) / 10, lastSessionTimestamp: now } }, 'log_workout_session');
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
        isNewPR = !existing || e1RM > (existing.e1RM ?? 0);
        updatedPRs[key] = {
          exerciseName,
          maxWeight: weight,
          repsAtMax: reps,
          e1RM,
          achievedDate: today,
          sessionId,
        };
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

  // ── suggest_progression ────────────────────────────────────────────────────
  // Emitted by the AI to surface per-exercise overload recommendations.
  // Does NOT mutate any stored data — purely pushes an advisory message.
  suggest_progression: async ({ payload, pushAssistantMessage }) => {
    if (!pushAssistantMessage) return;
    const exercises = Array.isArray(payload?.exercises) ? payload.exercises as string[] : [];
    const strategy = typeof payload?.strategy === 'string' ? payload.strategy : 'double_progression';
    const message = typeof payload?.message === 'string' ? payload.message : '';

    const strategyLabel: Record<string, string> = {
      linear: '📈 Linear Progression',
      double_progression: '🔁 Double Progression',
      deload: '🔽 Deload Week',
    };

    const lines: string[] = [
      `**${strategyLabel[strategy] ?? 'Progression Plan'}**`,
      ...(message ? [message] : []),
      ...(exercises.length > 0 ? [`Exercises: ${exercises.join(', ')}`] : []),
    ];

    if (strategy === 'linear') {
      lines.push('Add **2.5 kg** to each barbell lift each session. Reset to 3×5 if you miss a rep.');
    } else if (strategy === 'double_progression') {
      lines.push('Work up to the **top of your rep range** across all sets, then add weight and restart at the bottom of the range.');
    } else if (strategy === 'deload') {
      lines.push('Reduce weight by **40–50%** and volume by **40%** for the next 7 days to allow full recovery.');
    }

    pushAssistantMessage(lines.join('\n\n'));
  },

  // ── suggest_exercise_substitute ───────────────────────────────────────────
  // Injury-aware exercise substitution. Looks up the injured body region in a
  // static map and surfaces pain-free alternatives without mutating stored data.
  suggest_exercise_substitute: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
    const originalExercise = typeof payload?.originalExercise === 'string' ? payload.originalExercise.trim() : '';
    const injuryName = typeof payload?.injuryName === 'string' ? payload.injuryName.trim() : undefined;
    const bodyRegionRaw = typeof payload?.bodyRegion === 'string' ? payload.bodyRegion.trim() : '';

    if (!originalExercise) {
      pushAssistantMessage?.('Please specify the original exercise you want to substitute.');
      return;
    }

    // Load profile to cross-reference active injuries when bodyRegion is omitted
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);

    // Derive effective body region: prefer explicit payload, fall back to first
    // active injury region that matches the injuryName (if provided)
    let effectiveRegion = bodyRegionRaw.toLowerCase();

    if (!effectiveRegion && profile) {
      const activeInjuries = (profile.history?.injuries ?? []).filter(
        (inj) => inj.status === 'active' || inj.status === 'recovering'
      );
      const matched = injuryName
        ? activeInjuries.find((inj) => inj.name.toLowerCase().includes(injuryName.toLowerCase()))
        : activeInjuries[0];
      if (matched) {
        // Normalise compound BodyRegion values (e.g. 'upper_back', 'lower_back') to 'back'
        effectiveRegion = matched.bodyRegion.replace(/upper_|lower_/, '').replace(/_back$/, 'back');
      }
    }

    const SUBSTITUTION_MAP: Record<string, string[]> = {
      shoulder: ['Cable pulls', 'Resistance band rows', 'Face pulls', 'Dumbbell Y-raises'],
      knee: ['Seated leg press', 'Hip thrusts', 'Leg curls', 'Step-ups with support'],
      back: ['Dead bugs', 'Bird dogs', 'Pallof press', 'Cable pull-throughs'],
      hip: ['Lateral band walks', 'Clamshells', 'Seated hip abduction', 'Nordic curls'],
      wrist: ['Cable curls (rope)', 'Hammer curls', 'Machine chest press', 'Tricep pushdowns (rope)'],
      ankle: ['Seated calf raises', 'Upper body focus', 'Swimming', 'Pool running'],
    };

    const alternatives = effectiveRegion ? SUBSTITUTION_MAP[effectiveRegion] : undefined;

    if (alternatives && alternatives.length > 0) {
      pushAssistantMessage?.(
        `Since you're working around your ${effectiveRegion}, here are some alternatives to ${originalExercise}: ${alternatives.join(', ')}.`
      );
    } else {
      pushAssistantMessage?.(
        "I don't have specific substitutions for that region yet. Focus on pain-free range of motion and consult your PT."
      );
    }

    emitSpineEvent(
      'SOMA_PROFILE_UPDATED',
      {
        exerciseSubstituted: true,
        original: originalExercise,
        region: effectiveRegion || null,
        injuryName: injuryName ?? null,
      },
      { domain: 'B', priority: 'info' },
    );
  },

  // ── apply_program_template ─────────────────────────────────────────────────
  // Emitted by the AI to apply a complete workout program.
  // The actual routine merge happens client-side via the ProgramTemplateSelector UI;
  // this handler pushes a confirmatory message and a prompt to open the Programs tab.
  apply_program_template: async ({ payload, pushAssistantMessage }) => {
    if (!pushAssistantMessage) return;
    const programId = typeof payload?.programId === 'string' ? payload.programId : '';
    const message = typeof payload?.message === 'string' ? payload.message : '';

    const programLabels: Record<string, string> = {
      ppl: 'Push Pull Legs (PPL)',
      '531': '5/3/1',
      starting_strength: 'Starting Strength',
      upper_lower: 'Upper/Lower Split',
      phul: 'PHUL',
      full_body_3x: 'Full Body 3×/week',
    };

    const label = programLabels[programId] ?? programId;
    const lines = [
      `**Program Selected: ${label}**`,
      ...(message ? [message] : []),
      '👉 Head to the **Plan** tab → **Quick-Start Programs** and click **Apply** to load all routines.',
    ];

    pushAssistantMessage(lines.join('\n\n'));
  },

};
