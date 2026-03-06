import { ActionHub } from '@/lib/actions/action-hub';
import { TrainerProfile } from '@/lib/types';
import { mergeTrainerProfile, normalizeRoutines } from '../utils';
import { normalizeTrainerProfilePatch } from '../onboarding/intake-accumulator';
import { loadTrainerProfile, saveTrainerProfile } from './trainer-profile-service';

let registered = false;

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadTrainerProfile({ userId, encryptionKey });
}

async function persistProfile(profile: TrainerProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  await saveTrainerProfile(profile, { userId, encryptionKey });
}

export function registerTrainerActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('trainer', {
    update_trainer_profile: async ({ userId, encryptionKey, payload }) => {
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) return;

      const normalizedPatch = normalizeTrainerProfilePatch(payload as Partial<TrainerProfile>);
      const nextProfile = mergeTrainerProfile({ ...current }, normalizedPatch);
      nextProfile.updatedAt = new Date().toISOString();
      await persistProfile(nextProfile, userId ?? null, encryptionKey ?? null);
    },

    update_routine: async ({ userId, encryptionKey, payload }) => {
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) return;

      if (!payload?.routines) return;
      const nextProfile: TrainerProfile = {
        ...current,
        routines: normalizeRoutines(payload.routines as any),
        updatedAt: new Date().toISOString()
      };
      await persistProfile(nextProfile, userId ?? null, encryptionKey ?? null);
    }
  });
}
