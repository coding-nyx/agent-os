import {
  loadProfile,
  persistProfile,
  GlobalProjectionService,
} from './shared';
import type { ActionHandler, TitanProfile, SleepEntry } from './shared';

export const sleepHandlers: Record<string, ActionHandler> = {

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

    // Auto-update sleepQuality NSV after sleep log.
    // Combines a hours-optimality score (peak at 8.25 h) with the
    // user's self-reported quality rating. Both are normalised to 0–10
    // and averaged so neither factor dominates alone.
    if (userId) {
      // hoursScore: 10 at 8.25 h, falls linearly outside the 7.5–9 h window.
      const hoursScore = entry.durationHours >= 7.5
        ? Math.min(10, Math.max(0, 10 - Math.abs(entry.durationHours - 8.25)))
        : Math.min(10, Math.max(0, entry.durationHours * (10 / 7.5)));
      // qualityScore: already clamped to [0, 10] by the entry normalisation above.
      const qualityScore = entry.quality;
      const sleepQuality = Math.round(((hoursScore + qualityScore) / 2) * 10) / 10;

      GlobalProjectionService.updateCrossFunctionalState(userId, {
        biological: { sleepQuality },
      }).catch((e) => console.error('sleepQuality NSV update failed:', e));
    }
  },

};
