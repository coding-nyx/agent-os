import {
  loadProfile,
  persistProfile,
  mergeTitanProfile,
  normalizeRoutines,
  normalizeTitanProfilePatch,
  GlobalProjectionService,
  Spine,
  ClearanceService,
  SomaDataService,
} from './shared';
import type { ActionHandler, TitanProfile, Routine } from './shared';

export const coreHandlers: Record<string, ActionHandler> = {

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
      Spine.publish({
        type: 'SOMA_READINESS_UPDATED',
        source: 'titan',
        domain: 'B',
        priority: 'info',
        data: {
          passedClearance: false,
          readinessScore: recoveryScore,
        },
      });
      return;
    }

    pushAssistantMessage?.(`✅ Clearance check passed for "${activity}". Recovery ${recoveryScore !== null ? `${recoveryScore}/10` : 'unknown'} — proceed safely.`);
    Spine.publish({
      type: 'SOMA_READINESS_UPDATED',
      source: 'titan',
      domain: 'B',
      priority: 'info',
      data: {
        passedClearance: true,
        readinessScore: recoveryScore,
      },
    });
  },

};
