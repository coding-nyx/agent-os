import { ActionHub } from '@/lib/actions/action-hub';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import { EnergyWavePoint, RecoveryWindow, AtlasProfile } from '../atlas-profile-service';
import {
  loadProfile,
  persistProfile,
  parseBoundedScore
} from './shared';

export const energyActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  update_energy_wave: async ({ userId, encryptionKey, payload, updateGlobalSoul, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const wave: EnergyWavePoint[] = Array.isArray(payload?.wave)
      ? payload.wave.map((point: Record<string, unknown>, index: number) => ({
          id: typeof point?.id === 'string' ? point.id : `wave_${Date.now()}_${index}`,
          slot: typeof point?.slot === 'string' ? point.slot : `Slot ${index + 1}`,
          energy: parseBoundedScore(point?.energy),
          focus: parseBoundedScore(point?.focus),
          load: parseBoundedScore(point?.load)
        }))
      .slice(0, 48)
      : [];

    if (wave.length === 0) return;

    const next: AtlasProfile = {
      ...profile,
      energyWave: wave,
      updatedAt: new Date().toISOString()
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    await updateGlobalSoul({
      cognitive: {
        energyBudget: parseBoundedScore(payload?.energyBudget, 5),
        focusScore: parseBoundedScore(payload?.focusScore, 5),
        activeLoad: parseBoundedScore(payload?.activeLoad, 5)
      }
    });

    const energyBudget = parseBoundedScore(payload?.energyBudget, 5);
    const focusScore = parseBoundedScore(payload?.focusScore, 5);
    const activeLoad = parseBoundedScore(payload?.activeLoad, 5);

    emitSpineEvent('ATLAS_ENERGY_UPDATED', {
      energyBudget,
      focusScore,
      activeLoad
    });

    if (activeLoad >= 8 || energyBudget <= 3) {
      emitSpineEvent('ATLAS_ENERGY_OVERLOAD', {
        energyBudget,
        activeLoad,
        focusScore,
        trigger: activeLoad >= 8 ? 'active_load' : 'low_energy_budget'
      });
      emitSpineEvent('COGNITIVE_OVERLOAD', {
        energyBudget,
        activeLoad,
        focusScore,
        source: 'atlas'
      });
    }
  },

  create_recovery_window: async ({ userId, encryptionKey, payload, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const window: RecoveryWindow = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      title: typeof payload?.title === 'string' ? payload.title : 'Recovery Window',
      start: typeof payload?.start === 'string' ? payload.start : new Date().toISOString(),
      end: typeof payload?.end === 'string' ? payload.end : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      reason: typeof payload?.reason === 'string' ? payload.reason : 'Recovery allocation',
      status: payload?.status === 'active' || payload?.status === 'completed' ? payload.status : 'planned'
    };

    const next: AtlasProfile = {
      ...profile,
      recoveryWindows: [window, ...profile.recoveryWindows].slice(0, 80),
      updatedAt: new Date().toISOString()
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    emitSpineEvent('ATLAS_RECOVERY_WINDOW_CREATED', {
      windowId: window.id,
      title: window.title,
      start: window.start,
      end: window.end,
      reason: window.reason,
      status: window.status
    });
  },

  sync_vitals: async ({ userId, payload }) => {
    if (!userId) return;
    const cognitive = payload?.cognitive as Record<string, unknown> | undefined;
    if (!cognitive || typeof cognitive !== 'object') return;

    const patch: Record<string, unknown> = {};
    if (typeof cognitive.energyBudget === 'number' && Number.isFinite(cognitive.energyBudget)) {
      patch.energyBudget = Math.max(0, Math.min(10, cognitive.energyBudget));
    }
    if (typeof cognitive.focusScore === 'number' && Number.isFinite(cognitive.focusScore)) {
      patch.focusScore = Math.max(0, Math.min(10, cognitive.focusScore));
    }
    if (typeof cognitive.activeLoad === 'number' && Number.isFinite(cognitive.activeLoad)) {
      patch.activeLoad = Math.max(0, Math.min(10, cognitive.activeLoad));
    }

    if (Object.keys(patch).length > 0) {
      await GlobalProjectionService.updateCrossFunctionalState(userId, { cognitive: patch }).catch((e) => {
        console.error('Atlas sync_vitals failed:', e);
      });
    }
  },

  request_nsv_calibration: async ({ emitSpineEvent, payload }) => {
    emitSpineEvent('NSV_CALIBRATION_REQUEST', {
      metrics: Array.isArray(payload?.metrics)
        ? payload.metrics.filter((m: unknown) => typeof m === 'string')
        : [],
      reason: typeof payload?.reason === 'string' ? payload.reason : 'Manual calibration request'
    });
  },
};
