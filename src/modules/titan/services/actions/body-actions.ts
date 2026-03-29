import {
  loadProfile,
  persistProfile,
} from './shared';
import { queueNSVUpdate } from '@/lib/services/nsv-update-queue';
import type { ActionHandler, TitanProfile, BodyWeightEntry, CardioSession, CardioSessionType } from './shared';

export const bodyHandlers: Record<string, ActionHandler> = {

  /**
   * log_body_weight — persists a BodyWeightEntry to profile.bodyWeightLog.
   * Validates weight range (20–300 kg). Accepts payload.unit = 'lbs' and
   * converts automatically. Caps log at 1 000 entries.
   */
  log_body_weight: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    let weight = typeof payload?.weight === 'number' ? payload.weight : null;
    if (weight === null) {
      pushAssistantMessage?.('❌ Body weight entry requires a numeric weight value.');
      return;
    }

    // Unit conversion
    if (typeof payload?.unit === 'string' && payload.unit.toLowerCase() === 'lbs') {
      weight = Math.round((weight / 2.20462) * 100) / 100;
    }

    if (weight < 20 || weight > 300) {
      pushAssistantMessage?.(`❌ Weight ${weight} kg is out of the valid range (20–300 kg).`);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const entry: BodyWeightEntry = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      date: typeof payload?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date : today,
      weight: Math.round(weight * 100) / 100,
      bodyFatPct: typeof payload?.bodyFatPct === 'number' && payload.bodyFatPct >= 3 && payload.bodyFatPct <= 60
        ? payload.bodyFatPct : undefined,
      measurements: payload?.measurements && typeof payload.measurements === 'object'
        ? (payload.measurements as BodyWeightEntry['measurements'])
        : undefined,
      notes: typeof payload?.notes === 'string' ? payload.notes.trim() || undefined : undefined,
      recordedAt: new Date().toISOString(),
    };

    const next: TitanProfile = {
      ...profile,
      bodyWeightLog: [entry, ...(profile.bodyWeightLog ?? [])].slice(0, 1000),
      updatedAt: new Date().toISOString(),
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    // Write weight into shared NSV so Soma's clearance panel, system prompt, and
    // vitals panel all reflect the latest physical measurement immediately.
    if (userId) {
      const nsvBioPatch: Record<string, number | null> = { weight: entry.weight };
      if (entry.bodyFatPct != null) nsvBioPatch.bodyFatPct = entry.bodyFatPct;
      queueNSVUpdate(userId, { biological: nsvBioPatch }, 'log_body_weight');
    }

    // Compute week-over-week trend for Spine signal
    const prevEntries = profile.bodyWeightLog ?? [];
    const weekAgo = prevEntries.find(e => {
      const diff = (new Date(entry.date).getTime() - new Date(e.date).getTime()) / 86_400_000;
      return diff >= 6;
    });
    const weeklyDeltaKg = weekAgo != null
      ? Math.round((entry.weight - weekAgo.weight) * 100) / 100
      : null;

    emitSpineEvent(
      'TITAN_BODY_WEIGHT_LOGGED',
      {
        weight: entry.weight,
        bodyFatPct: entry.bodyFatPct,
        date: entry.date,
        weeklyDeltaKg,
        // Flag aggressive cut: >1.2 kg/week loss
        aggressiveCut: weeklyDeltaKg != null && weeklyDeltaKg < -1.2,
        totalEntries: next.bodyWeightLog?.length ?? 1,
      },
      { domain: 'B', priority: weeklyDeltaKg != null && weeklyDeltaKg < -1.2 ? 'alert' : 'info' },
    );

    const bfStr = entry.bodyFatPct != null ? ` Body fat: ${entry.bodyFatPct}%.` : '';
    pushAssistantMessage?.(
      `✅ Body weight logged: **${entry.weight} kg** on ${entry.date}.${bfStr}`,
    );
  },

  /**
   * log_cardio_session — persists a CardioSession to profile.cardioLog.
   * Validates type and duration. Emits WORKOUT_COMPLETED Spine event.
   * Caps log at 500 entries.
   */
  log_cardio_session: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const validTypes: CardioSessionType[] = ['run', 'bike', 'swim', 'row', 'hike', 'elliptical', 'jump_rope', 'other'];
    const sessionType: CardioSessionType = validTypes.includes(payload?.type as CardioSessionType)
      ? (payload.type as CardioSessionType)
      : 'other';

    const durationMinutes = typeof payload?.durationMinutes === 'number' && payload.durationMinutes > 0
      ? Math.round(Math.min(payload.durationMinutes, 600))
      : null;

    if (!durationMinutes) {
      pushAssistantMessage?.('❌ Cardio session requires a positive durationMinutes value.');
      return;
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const session: CardioSession = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      date: typeof payload?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
        ? payload.date : today,
      type: sessionType,
      durationMinutes,
      distanceKm: typeof payload?.distanceKm === 'number' && payload.distanceKm > 0
        ? Math.round(payload.distanceKm * 100) / 100 : undefined,
      avgHeartRate: typeof payload?.avgHeartRate === 'number' && payload.avgHeartRate >= 40 && payload.avgHeartRate <= 220
        ? Math.round(payload.avgHeartRate) : undefined,
      calories: typeof payload?.calories === 'number' && payload.calories > 0
        ? Math.round(payload.calories) : undefined,
      notes: typeof payload?.notes === 'string' ? payload.notes.trim() || undefined : undefined,
      rpe: typeof payload?.rpe === 'number'
        ? Math.max(1, Math.min(10, Math.round(payload.rpe))) : undefined,
      status: payload?.status === 'partial' ? 'partial' : 'completed',
      recordedAt: now,
    };

    const next: TitanProfile = {
      ...profile,
      cardioLog: [session, ...(profile.cardioLog ?? [])].slice(0, 500),
      updatedAt: now,
    };

    await persistProfile(next, userId ?? null, encryptionKey ?? null);

    emitSpineEvent(
      'WORKOUT_COMPLETED',
      {
        sessionId: session.id,
        routineName: sessionType,
        date: session.date,
        durationMinutes: session.durationMinutes,
        distanceKm: session.distanceKm,
        rpe: session.rpe,
        status: session.status,
        isCardio: true,
      },
      { domain: 'B', priority: 'info' },
    );

    // Update NSV aerobicLoad — derived from duration and RPE.
    // aerobicLoad is a 0–10 index; sessions ≥ 45 min at RPE 7+ score high.
    if (userId) {
      const rpe = session.rpe ?? 6;
      const minuteFactor = Math.min(1, durationMinutes / 60);
      const rawAerobicLoad = Math.round(rpe * minuteFactor * 10) / 10;
      queueNSVUpdate(userId, { biological: { aerobicLoad: Math.min(10, rawAerobicLoad) } }, 'log_cardio_session');
    }

    const distStr = session.distanceKm ? ` · ${session.distanceKm} km` : '';
    const rpeStr = session.rpe ? ` · RPE ${session.rpe}/10` : '';
    pushAssistantMessage?.(
      `✅ ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)} session logged: ` +
      `**${durationMinutes} min**${distStr}${rpeStr} on ${session.date}.`,
    );
  },

};
