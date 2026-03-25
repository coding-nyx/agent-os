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
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import { ownsMetric, isExclusiveOwner, type NSVMetricPath } from '@/lib/services/nsv-ownership';
import type { ActionHandler, TitanProfile, Routine } from './shared';

export const coreHandlers: Record<string, ActionHandler> = {

  create_workout_plan: async ({ moduleId, payload }) => {
    Spine.emit({
      type: 'DRAFT_PROPOSED',
      source: moduleId,
      target: typeof payload?.target === 'string' ? payload.target : moduleId,
      domain: 'system',
      data: payload,
      cascadeDepth: 0,
      priority: 'info',
    });
  },

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

  sync_vitals: async ({ userId, payload, pushAssistantMessage }) => {
    if (!userId) return;
    const biological = payload?.biological as Record<string, unknown> | undefined;
    if (!biological || typeof biological !== 'object') return;

    const patch: Record<string, unknown> = {};
    const validationRequired: string[] = [];

    // Validate each field against ownership rules
    const validateAndAdd = (fieldName: string, value: unknown, validator: (v: unknown) => boolean) => {
      if (!validator(value)) return;
      
      const metric = `biological.${fieldName}` as NSVMetricPath;
      
      // Titan must own this metric
      if (!ownsMetric('titan', metric)) {
        console.warn(`[Titan] sync_vitals: "${fieldName}" not owned by Titan — skipping`);
        return;
      }
      
      // If co-owned (not exclusive), log a warning but allow (Titan is primary owner for bio)
      if (!isExclusiveOwner('titan', metric)) {
        validationRequired.push(fieldName);
      }
      
      patch[fieldName] = value;
    };

    validateAndAdd('recoveryScore', biological.recoveryScore, (v) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10
    );
    validateAndAdd('hormonalContext', biological.hormonalContext, (v) =>
      typeof v === 'string' && (v as string).trim().length > 0
    );
    validateAndAdd('cnsFatigue', biological.cnsFatigue, (v) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10
    );
    validateAndAdd('sleepQuality', biological.sleepQuality, (v) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10
    );

    if (Object.keys(patch).length === 0) return;

    // Warn if co-owned fields are being written
    if (validationRequired.length > 0) {
      console.log(
        `[Titan] sync_vitals: Writing co-owned fields (${validationRequired.join(', ')}). ` +
        `Titan is primary owner for biological domain.`
      );
    }

    // Queue the update (Titan is primary owner for all biological fields)
    queueNSVUpdate(userId, { biological: patch }, 'sync_vitals');
    
    if (pushAssistantMessage && Object.keys(patch).length > 0) {
      pushAssistantMessage(`✅ Synced ${Object.keys(patch).length} vital(s) to NSV.`);
    }
  },

  self_clearance_check: async ({ userId, encryptionKey, payload, pushAssistantMessage, getLatestNSV, emitSpineEvent }) => {
    const activity = typeof payload?.activity === 'string' ? payload.activity : 'high_intensity';
    const RECOVERY_THRESHOLD = 4;

    // SAFETY-CRITICAL: Force fresh NSV read for clearance decisions.
    // Session-cached NSV (getLatestNSV) can be minutes stale, which could
    // allow training when the user is actually fatigued.
    let recoveryScore: number | null = null;
    let cnsFatigue: number | null = null;
    
    if (userId) {
      try {
        const freshProjection = await GlobalProjectionService.getProjection(userId);
        const freshBio = freshProjection?.crossFunctionalState?.biological;
        if (freshBio) {
          recoveryScore = typeof freshBio.recoveryScore === 'number' ? freshBio.recoveryScore : null;
          cnsFatigue = typeof freshBio.cnsFatigue === 'number' ? freshBio.cnsFatigue : null;
        }
      } catch (e) {
        console.warn('[Titan] Fresh NSV read failed, falling back to session cache:', e);
      }
    }
    
    // Fallback to session cache only if fresh read failed
    if (recoveryScore === null) {
      const nsv = getLatestNSV?.() ?? {};
      const bio = (nsv.biological ?? {}) as Record<string, unknown>;
      recoveryScore = typeof bio.recoveryScore === 'number' ? bio.recoveryScore : null;
      cnsFatigue = typeof bio.cnsFatigue === 'number' ? bio.cnsFatigue : null;
    }

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
    
    // Additional CNS fatigue check for high-intensity activities
    const hasCnsFatigueBlock = activity === 'high_intensity' && cnsFatigue !== null && cnsFatigue >= 8;

    if (hasContraindication || (recoveryScore !== null && recoveryScore < RECOVERY_THRESHOLD) || hasCnsFatigueBlock) {
      const reasons: string[] = [];
      if (recoveryScore !== null && recoveryScore < RECOVERY_THRESHOLD) {
        reasons.push(`recovery score ${recoveryScore}/10 is below threshold (${RECOVERY_THRESHOLD})`);
      }
      if (hasCnsFatigueBlock) {
        reasons.push(`CNS fatigue ${cnsFatigue}/10 is too high for high-intensity training`);
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
        data: { activity, recoveryScore, cnsFatigue, reasons },
        cascadeDepth: 0,
        priority: 'alert',
      });
      emitSpineEvent('CLEARANCE_DENIED', {
        activity,
        recoveryScore,
        cnsFatigue,
        reasons
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
    emitSpineEvent('CLEARANCE_GRANTED', {
      activity,
      recoveryScore,
      cnsFatigue
    });
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
