import { ActionHub } from '@/lib/actions/action-hub';
import { AtlasProfile } from '../atlas-profile-service';
import {
  createEmptyJournalEntry,
  loadJournalEntry,
  mergeCheckInData,
  saveJournalEntry
} from '../journal-service';
import {
  loadProfile,
  persistProfile
} from './shared';

export const checkinActions: Parameters<typeof ActionHub.registerMultiple>[1] = {
  complete_check_in: async ({ userId, encryptionKey, payload, emitSpineEvent, updateGlobalSoul }) => {
    const raw = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!raw) return;
    const profile = raw;

    const type = payload?.type === 'morning' || payload?.type === 'evening' ? payload.type : null;
    if (!type) return;

    const now = new Date().toISOString();
    const dateOnly = now.slice(0, 10);

    const clamp15 = (v: unknown): number | undefined => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
      return Math.max(1, Math.min(5, Math.round(v)));
    };

    const energyRating = clamp15(payload?.energyRating);
    const moodRating = clamp15(payload?.moodRating);

    const checkInEntry = {
      id: `checkin_${crypto.randomUUID()}`,
      date: dateOnly,
      type,
      energyRating,
      moodRating,
      intention: typeof payload?.intention === 'string' ? payload.intention.slice(0, 500) : undefined,
      reflection: typeof payload?.reflection === 'string' ? payload.reflection.slice(0, 500) : undefined,
      loggedAt: now
    };

    const extProfile = profile as AtlasProfile & { checkIns?: typeof checkInEntry[] };
    if (!Array.isArray(extProfile.checkIns)) extProfile.checkIns = [];
    const existingIdx = extProfile.checkIns.findIndex(
      (c: typeof checkInEntry) => c.date === dateOnly && c.type === type
    );
    if (existingIdx >= 0) {
      extProfile.checkIns[existingIdx] = checkInEntry;
    } else {
      extProfile.checkIns.unshift(checkInEntry);
      if (extProfile.checkIns.length > 60) extProfile.checkIns.splice(60);
    }

    await persistProfile(profile, userId ?? null, encryptionKey ?? null);

    try {
      if (type === 'morning') {
        localStorage.setItem('atlas_last_morning_brief', now);
      } else {
        localStorage.setItem('atlas_last_evening_checkin', now);
      }
    } catch { /* SSR / non-browser environments */ }

    emitSpineEvent('ATLAS_STATE_CHANGED', {
      reason: `${type}_check_in_completed`,
      date: dateOnly
    });

    if (energyRating !== undefined) {
      const energyBudget = Math.round((energyRating / 5) * 10);
      await updateGlobalSoul({ cognitive: { energyBudget } });
    }

    try {
      if (userId && encryptionKey) {
        const existing = await loadJournalEntry(dateOnly, { userId, encryptionKey });
        const base = existing ?? createEmptyJournalEntry(dateOnly);

        const patch: Parameters<typeof mergeCheckInData>[1] = {};

        if (energyRating !== undefined) patch.energyLevel = energyRating;
        if (moodRating !== undefined) patch.mood = moodRating;

        if (type === 'morning' && typeof checkInEntry.intention === 'string') {
          patch.morningIntent = checkInEntry.intention;
        }
        if (type === 'evening' && typeof checkInEntry.reflection === 'string') {
          patch.eveningReflection = checkInEntry.reflection;
        }

        const updated = mergeCheckInData(base, patch);

        const sourceTag = type === 'morning' ? 'checkin-morning' : 'checkin-evening';
        updated.tags = Array.from(new Set([...(updated.tags ?? []), sourceTag]));

        await saveJournalEntry(updated, { userId, encryptionKey });
      }
    } catch (err) {
      console.error('[Atlas] Failed to persist journal from check-in:', err);
    }
  },
};
