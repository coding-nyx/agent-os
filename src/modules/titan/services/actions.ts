import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { TitanProfile, Routine, BiomarkerRecord, MedicalImageAnalysis, SleepEntry, CycleEntry, CyclePhase, WorkoutSession, ExerciseLog, ExerciseSet } from '@/lib/types';
import { mergeTitanProfile, normalizeRoutines } from '../utils';
import { normalizeTitanProfilePatch } from '../onboarding/intake-accumulator';
import { loadTitanProfile, saveTitanProfile } from './titan-profile-service';
import { ClearanceService } from '@/modules/soma/services/clearance-service';
import { SomaDataService } from '@/modules/soma/services/soma-data-service';
import { parseHealthReport, parseWorkoutLog, parseBiometricData } from '@/lib/actions/parsing-actions';
import { SomaTitanDelegationService } from '@/lib/services/soma-titan-delegation-service';

let registered = false;

export function parseNumericValue(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadTitanProfile({ userId, encryptionKey });
}

async function persistProfile(profile: TitanProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  await saveTitanProfile(profile, { userId, encryptionKey });
}

/** All action names registered by Titan (including absorbed Soma actions). */
export const titanAllowedActions = [
  'update_titan_profile',
  'update_routine',
  'commit_biomarker',
  'parse_lab_report',
  'issue_clearance',
  'analyze_medical_image',
  'sync_vitals',
  'self_clearance_check',
  'parse_health_report',
  'parse_workout_log',
  'parse_biometric_data',
  'log_sleep',
  'create_cycle',
  'advance_cycle_phase',
  'complete_cycle',
  'log_workout_session',
] as const;

export function registerTitanActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('titan', {
    // ── Existing Titan actions ──────────────────────────────────────────

    update_titan_profile: async ({ userId, encryptionKey, payload }) => {
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) return;

      const normalizedPatch = normalizeTitanProfilePatch(payload as Partial<TitanProfile>);
      const nextProfile = mergeTitanProfile({ ...current }, normalizedPatch);
      nextProfile.updatedAt = new Date().toISOString();
      await persistProfile(nextProfile, userId ?? null, encryptionKey ?? null);
    },

    update_routine: async ({ userId, encryptionKey, payload }) => {
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) return;

      if (!payload?.routines || !Array.isArray(payload.routines)) return;
      
      const newRoutines = normalizeRoutines(payload.routines as Routine[]);
      const existingRoutines = current.routines || [];
      
      // Merge: replace existing weekdays if present, else append
      const mergedRoutines = [...existingRoutines];
      for (const nr of newRoutines) {
        const idx = mergedRoutines.findIndex(r => r.weekday === nr.weekday);
        if (idx !== -1) {
          mergedRoutines[idx] = nr;
        } else {
          mergedRoutines.push(nr);
        }
      }

      const nextProfile: TitanProfile = {
        ...current,
        routines: mergedRoutines,
        updatedAt: new Date().toISOString()
      };
      await persistProfile(nextProfile, userId ?? null, encryptionKey ?? null);
    },

    // ── Absorbed Soma actions ───────────────────────────────────────────

    commit_biomarker: async ({ userId, encryptionKey, payload }) => {
      await SomaTitanDelegationService.commitBiomarker({
        userId,
        encryptionKey,
        payload,
        source: 'titan_action',
      });
    },

    parse_lab_report: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const summary = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        panel: typeof payload?.panel === 'string' ? payload.panel : 'lab panel',
        findings: Array.isArray(payload?.findings) ? payload.findings.filter((item: unknown) => typeof item === 'string') : [],
        flags: Array.isArray(payload?.flags) ? payload.flags.filter((item: unknown) => typeof item === 'string') : [],
        recordedAt: new Date().toISOString()
      };

      const next: TitanProfile = {
        ...profile,
        labSummaries: [summary, ...profile.labSummaries].slice(0, 50),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    issue_clearance: async ({ userId, encryptionKey, payload }) => {
      const clearance = await SomaTitanDelegationService.issueClearance({
        userId,
        encryptionKey,
        payload,
        source: 'titan_action',
      });
      if (!clearance) return;

      // Keep deprecated events for compatibility until all listeners consume SOMA_*.
      Spine.emit({
        type: clearance.status === 'granted' ? 'CLEARANCE_GRANTED' : 'CLEARANCE_DENIED',
        source: 'titan',
        target: 'titan',
        domain: 'B',
        data: {
          activity: clearance.activity,
          status: clearance.status,
          reason: clearance.reason
        },
        cascadeDepth: 0,
        priority: clearance.status === 'granted' ? 'info' : 'alert'
      });

      if (clearance.status === 'denied') {
        Spine.emit({
          type: 'BLOCK_HIGH_INTENSITY',
          source: 'titan',
          domain: 'B',
          data: {
            activity: clearance.activity,
            reason: clearance.reason
          },
          cascadeDepth: 0,
          priority: 'alert'
        });
      }
    },

    analyze_medical_image: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const biomarkers = Array.isArray(payload?.biomarkers) ? payload.biomarkers : [];
      const labSummaries = Array.isArray(payload?.labSummaries) ? payload.labSummaries : [];
      const medications = Array.isArray(payload?.medications) ? payload.medications : [];
      const allergies = Array.isArray(payload?.allergies) ? payload.allergies : [];
      const clinicalFlags = Array.isArray(payload?.clinicalFlags) ? payload.clinicalFlags : [];

      const newBiomarkers = biomarkers
        .filter((b: unknown) => b && typeof b === 'object')
        .map((b: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          name: typeof b.name === 'string' ? b.name : 'biomarker',
          value: parseNumericValue(b.value),
          unit: typeof b.unit === 'string' ? b.unit : undefined,
          source: 'medical_image_analysis',
          recordedAt: new Date().toISOString()
        }));

      const newLabSummaries = labSummaries
        .filter((l: unknown) => l && typeof l === 'object')
        .map((l: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          panel: typeof l.test === 'string' ? l.test : 'extracted_panel',
          findings: [typeof l.summary === 'string' ? l.summary : 'Analysis from medical image'],
          flags: clinicalFlags
            .filter((f: unknown) => f && typeof f === 'object')
            .map((f: Record<string, unknown>) => typeof f.flag === 'string' ? f.flag : 'flag')
            .slice(0, 5),
          recordedAt: new Date().toISOString()
        }));

      const newMedications = medications
        .filter((m: unknown) => typeof m === 'string' || (m && typeof m === 'object'))
        .map((m: unknown) => {
          if (typeof m === 'string') return m;
          const med = m as Record<string, unknown>;
          return typeof med.name === 'string' ? med.name : 'medication';
        });

      const newAllergies = allergies
        .filter((a: unknown) => typeof a === 'string')
        .slice(0, 20);

      const analysis: MedicalImageAnalysis = {
        id: crypto.randomUUID(),
        analyzedAt: new Date().toISOString(),
        reportType: typeof payload?.reportType === 'string' ? payload.reportType : 'medical_report',
        sourceLabel: typeof payload?.sourceLabel === 'string' ? payload.sourceLabel : 'uploaded',
        biomarkerCount: newBiomarkers.length,
        clinicalFlags: clinicalFlags
          .filter((f: unknown) => f && typeof f === 'object')
          .map((f: Record<string, unknown>) => ({
            flag: typeof f.flag === 'string' ? f.flag : 'unknown',
            severity: typeof f.severity === 'string' ? f.severity : 'mild'
          }))
          .slice(0, 10)
      };

      const next: TitanProfile = {
        ...profile,
        labSummaries: [...newLabSummaries, ...profile.labSummaries].slice(0, 50),
        medications: [...newMedications, ...profile.medications].slice(0, 100),
        allergies: [...newAllergies, ...profile.allergies].slice(0, 50),
        medicalImageAnalyses: [analysis, ...profile.medicalImageAnalyses].slice(0, 100),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
      if (userId && encryptionKey) {
        await Promise.all(
          newBiomarkers.map((biomarker) =>
            SomaTitanDelegationService.commitBiomarker({
              userId,
              encryptionKey,
              payload: biomarker as unknown as Record<string, unknown>,
              source: 'titan_action',
            })
          )
        );
      }

      // Emit MEDICAL_ALERT if severe flags found
      const severeFlags = analysis.clinicalFlags.filter(f => f.severity === 'severe');
      if (severeFlags.length > 0) {
        Spine.emit({
          type: 'MEDICAL_ALERT',
          source: 'titan',
          domain: 'B',
          data: {
            alertCount: severeFlags.length,
            flags: severeFlags.map(f => f.flag),
            reportType: analysis.reportType
          },
          cascadeDepth: 0,
          priority: 'alert'
        });
      }
    },

    sync_vitals: async ({ userId, payload }) => {
      if (!userId) return;
      const biological = payload?.biological as Record<string, unknown> | undefined;
      if (!biological || typeof biological !== 'object') return;

      const patch: Record<string, unknown> = {};

      // All 4 biological NSV fields now owned by Titan
      if (typeof biological.recoveryScore === 'number' &&
          Number.isFinite(biological.recoveryScore) &&
          biological.recoveryScore >= 0 && biological.recoveryScore <= 10) {
        patch.recoveryScore = biological.recoveryScore;
      }
      if (typeof biological.hormonalContext === 'string' && biological.hormonalContext.trim()) {
        patch.hormonalContext = biological.hormonalContext.trim();
      }
      if (typeof biological.cnsFatigue === 'number' &&
          Number.isFinite(biological.cnsFatigue) &&
          biological.cnsFatigue >= 0 && biological.cnsFatigue <= 10) {
        patch.cnsFatigue = biological.cnsFatigue;
      }
      if (typeof biological.sleepQuality === 'number' &&
          Number.isFinite(biological.sleepQuality) &&
          biological.sleepQuality >= 0 && biological.sleepQuality <= 10) {
        patch.sleepQuality = biological.sleepQuality;
      }

      if (Object.keys(patch).length > 0) {
        await GlobalProjectionService.updateCrossFunctionalState(userId, { biological: patch }).catch((e) => {
          console.error('Titan sync_vitals failed:', e);
        });
      }
    },

    self_clearance_check: async ({ userId, encryptionKey, payload, pushAssistantMessage, getLatestNSV }) => {
      const activity = typeof payload?.activity === 'string' ? payload.activity : 'high_intensity';
      const RECOVERY_THRESHOLD = 4;

      // Read recovery score from NSV
      const nsv = getLatestNSV?.() ?? {};
      const bio = (nsv.biological ?? {}) as Record<string, unknown>;
      const recoveryScore = typeof bio.recoveryScore === 'number' ? bio.recoveryScore : null;

      // Titan consumes Soma state (read-only) for medical clearance decisions.
      const healthSnapshot =
        userId && encryptionKey
          ? await SomaDataService.getHealthSnapshot(userId, encryptionKey)
          : null;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      const clearance = healthSnapshot
        ? ClearanceService.evaluate(healthSnapshot, activity)
        : profile
          ? ClearanceService.evaluate(profile, activity)
          : null;
      const hasContraindication = clearance != null && clearance.status !== 'granted';

      if (hasContraindication || (recoveryScore !== null && recoveryScore < RECOVERY_THRESHOLD)) {
        const reasons: string[] = [];
        if (recoveryScore !== null && recoveryScore < RECOVERY_THRESHOLD) {
          reasons.push(`recovery score ${recoveryScore}/10 is below threshold (${RECOVERY_THRESHOLD})`);
        }
        if (hasContraindication && clearance) {
          reasons.push(clearance.reason);
        }

        const warning = `⚠️ Clearance check failed for "${activity}": ${reasons.join('; ')}. High-intensity training is blocked.`;
        pushAssistantMessage?.(warning);

        Spine.emit({
          type: 'BLOCK_HIGH_INTENSITY',
          source: 'titan',
          domain: 'B',
          data: { activity, recoveryScore, reasons },
          cascadeDepth: 0,
          priority: 'alert',
        });
        return;
      }

      pushAssistantMessage?.(`✅ Clearance check passed for "${activity}". Recovery ${recoveryScore !== null ? `${recoveryScore}/10` : 'unknown'} — proceed safely.`);
    },

    log_sleep: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const entry: SleepEntry = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        date: typeof payload?.date === 'string' ? payload.date : new Date().toISOString().slice(0, 10),
        bedtime: typeof payload?.bedtime === 'string' ? payload.bedtime : undefined,
        wakeTime: typeof payload?.wakeTime === 'string' ? payload.wakeTime : undefined,
        durationHours: typeof payload?.durationHours === 'number' && Number.isFinite(payload.durationHours)
          ? Math.max(0, Math.min(24, payload.durationHours))
          : 7,
        quality: typeof payload?.quality === 'number' && Number.isFinite(payload.quality)
          ? Math.max(0, Math.min(10, payload.quality))
          : 5,
        deepSleepPct: typeof payload?.deepSleepPct === 'number' ? payload.deepSleepPct : undefined,
        remSleepPct: typeof payload?.remSleepPct === 'number' ? payload.remSleepPct : undefined,
        awakenings: typeof payload?.awakenings === 'number' ? payload.awakenings : undefined,
        notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
        tags: Array.isArray(payload?.tags) ? payload.tags.filter((t: unknown) => typeof t === 'string') : undefined,
        recordedAt: new Date().toISOString(),
      };

      const next: TitanProfile = {
        ...profile,
        sleepLog: [entry, ...(profile.sleepLog ?? [])].slice(0, 365),
        updatedAt: new Date().toISOString(),
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      // Sync quality score to NSV so all modules see the updated sleep state
      if (userId) {
        await GlobalProjectionService.updateCrossFunctionalState(userId, {
          biological: { sleepQuality: entry.quality },
        }).catch((e) => console.error('log_sleep NSV sync failed:', e));
      }
    },

    // ── Cycle Actions ───────────────────────────────────────────────────

    create_cycle: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const rawPhases = Array.isArray(payload?.phases) ? payload.phases : [];
      const phases: CyclePhase[] = rawPhases
        .filter((p: unknown) => p && typeof p === 'object')
        .map((p: Record<string, unknown>) => ({
          id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
          name: typeof p.name === 'string' ? p.name : 'Phase',
          durationDays: typeof p.durationDays === 'number' && Number.isFinite(p.durationDays)
            ? Math.max(1, Math.floor(p.durationDays))
            : 7,
          notes: typeof p.notes === 'string' ? p.notes : undefined,
          dosage: typeof p.dosage === 'string' ? p.dosage : undefined,
          trainingModifier:
            p.trainingModifier === 'increase' || p.trainingModifier === 'maintain' ||
            p.trainingModifier === 'reduce' || p.trainingModifier === 'rest'
              ? p.trainingModifier
              : undefined,
        }));

      if (phases.length === 0) return;

      const now = new Date().toISOString();
      const cycle: CycleEntry = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        name: typeof payload?.name === 'string' ? payload.name : 'Custom Cycle',
        type:
          payload?.type === 'supplement' || payload?.type === 'workout' ||
          payload?.type === 'hormonal' || payload?.type === 'nutrition' ||
          payload?.type === 'recovery' || payload?.type === 'custom'
            ? payload.type
            : 'custom',
        description: typeof payload?.description === 'string' ? payload.description : undefined,
        startDate: typeof payload?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) ? payload.startDate : now.slice(0, 10),
        endDate: typeof payload?.endDate === 'string' ? payload.endDate : undefined,
        phases,
        currentPhaseIndex: 0,
        currentPhaseStartDate: typeof payload?.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) ? payload.startDate : now.slice(0, 10),
        status: 'active',
        notes: typeof payload?.notes === 'string' ? payload.notes : undefined,
        cycleLength: typeof payload?.cycleLength === 'number' ? payload.cycleLength : undefined,
        lastPeriodDate: typeof payload?.lastPeriodDate === 'string' ? payload.lastPeriodDate : undefined,
        createdAt: now,
        updatedAt: now,
      };

      const next: TitanProfile = {
        ...profile,
        cycles: [cycle, ...(profile.cycles ?? [])].slice(0, 50),
        updatedAt: now,
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      Spine.emit({
        type: 'CYCLE_STARTED',
        source: 'titan',
        domain: 'B',
        data: { cycleId: cycle.id, name: cycle.name, type: cycle.type },
        cascadeDepth: 0,
        priority: 'info',
      });
    },

    advance_cycle_phase: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile || !profile.cycles) return;

      const cycleId = typeof payload?.cycleId === 'string' ? payload.cycleId : null;
      if (!cycleId) return;

      if (!profile.cycles.some(c => c.id === cycleId)) {
        console.warn(`advance_cycle_phase: cycle "${cycleId}" not found — no-op`);
        return;
      }

      const now = new Date().toISOString();
      const updatedCycles = profile.cycles.map((cycle) => {
        if (cycle.id !== cycleId) return cycle;
        const nextPhaseIndex = cycle.currentPhaseIndex + 1;
        if (nextPhaseIndex >= cycle.phases.length) {
          // All phases done — mark complete
          return { ...cycle, status: 'completed' as const, updatedAt: now };
        }
        return {
          ...cycle,
          currentPhaseIndex: nextPhaseIndex,
          currentPhaseStartDate: now.slice(0, 10),
          updatedAt: now,
        };
      });

      const next: TitanProfile = { ...profile, cycles: updatedCycles, updatedAt: now };
      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      const cycle = updatedCycles.find(c => c.id === cycleId);
      if (cycle?.status === 'completed') {
        Spine.emit({
          type: 'CYCLE_COMPLETED',
          source: 'titan',
          domain: 'B',
          data: { cycleId: cycle.id, name: cycle.name, type: cycle.type },
          cascadeDepth: 0,
          priority: 'info',
        });
      }
    },

    complete_cycle: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile || !profile.cycles) return;

      const cycleId = typeof payload?.cycleId === 'string' ? payload.cycleId : null;
      if (!cycleId) return;

      const now = new Date().toISOString();
      const updatedCycles = profile.cycles.map((cycle) =>
        cycle.id === cycleId
          ? { ...cycle, status: 'completed' as const, updatedAt: now }
          : cycle
      );

      await persistProfile({ ...profile, cycles: updatedCycles, updatedAt: now }, userId ?? null, encryptionKey ?? null);
    },

    // ── Workout Session Actions ─────────────────────────────────────────

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

      const next: TitanProfile = {
        ...profile,
        workoutSessions: [session, ...(profile.workoutSessions ?? [])].slice(0, 365),
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

      // Update NSV recovery — high RPE sessions reduce recovery score
      if (userId && session.rpe != null) {
        const recoveryImpact = session.rpe >= 8 ? -1.5 : session.rpe >= 6 ? -0.5 : 0;
        if (recoveryImpact !== 0) {
          const nsv = getLatestNSV?.() ?? {};
          const bio = (nsv.biological ?? {}) as Record<string, unknown>;
          const currentRecovery = typeof bio.recoveryScore === 'number' ? bio.recoveryScore : 7;
          await GlobalProjectionService.updateCrossFunctionalState(userId, {
            biological: { recoveryScore: Math.max(0, Math.min(10, currentRecovery + recoveryImpact)) },
          }).catch((e) => console.error('log_workout_session NSV sync failed:', e));
        }
      }
    },

    // ── AI Parsing Actions ──────────────────────────────────────────────

    parse_health_report: parseHealthReport,
    parse_workout_log: parseWorkoutLog,
    parse_biometric_data: parseBiometricData,
  });
}
