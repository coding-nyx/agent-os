import { ActionHub } from '@/lib/actions/action-hub';
import {
  AtlasProfile,
  AtlasTaskNode,
  EnergyWavePoint,
  RecoveryWindow,
  loadAtlasProfile,
  saveAtlasProfile
} from './atlas-profile-service';

let registered = false;

function parseBoundedScore(value: unknown, fallback = 5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(10, value));
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadAtlasProfile({ userId, encryptionKey });
}

async function persistProfile(profile: AtlasProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveAtlasProfile(profile, { userId, encryptionKey });
}

export function registerAtlasActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('atlas', {
    update_energy_wave: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const wave: EnergyWavePoint[] = Array.isArray(payload?.wave)
        ? payload.wave.map((point: any, index: number) => ({
            id: typeof point?.id === 'string' ? point.id : `wave_${Date.now()}_${index}`,
            slot: typeof point?.slot === 'string' ? point.slot : `Slot ${index + 1}`,
            energy: parseBoundedScore(point?.energy),
            focus: parseBoundedScore(point?.focus),
            load: parseBoundedScore(point?.load)
          }))
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
    },

    flatten_schedule: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const flattenedUntil = typeof payload?.flattenedUntil === 'string' ? payload.flattenedUntil : new Date().toISOString();
      const next: AtlasProfile = {
        ...profile,
        flattenedUntil,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      const nextLoad = typeof payload?.activeLoad === 'number' ? payload.activeLoad : undefined;
      if (typeof nextLoad === 'number') {
        await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
      }
    },

    create_recovery_window: async ({ userId, encryptionKey, payload }) => {
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
    },

    update_task_graph: async ({ userId, encryptionKey, payload, updateGlobalSoul }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const tasks: AtlasTaskNode[] = Array.isArray(payload?.tasks)
        ? payload.tasks.map((task: any, index: number) => ({
            id: typeof task?.id === 'string' ? task.id : `task_${Date.now()}_${index}`,
            title: typeof task?.title === 'string' ? task.title : `Task ${index + 1}`,
            energyCost: parseBoundedScore(task?.energyCost, 4),
            status: task?.status === 'active' || task?.status === 'done' ? task.status : 'queued',
            dependencies: Array.isArray(task?.dependencies)
              ? task.dependencies.filter((dep: unknown) => typeof dep === 'string')
              : undefined
          }))
        : [];

      if (tasks.length === 0) return;

      const next: AtlasProfile = {
        ...profile,
        taskGraph: tasks,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      const nextLoad = typeof payload?.activeLoad === 'number' ? payload.activeLoad : undefined;
      if (typeof nextLoad === 'number') {
        await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
      }
    }
  });
}
