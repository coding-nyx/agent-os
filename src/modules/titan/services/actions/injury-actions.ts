import {
  loadProfile,
  persistProfile,
} from './shared';
import type { ActionHandler } from './shared';
import type { Injury, InjurySeverity, InjuryStatus, BodyRegion } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_BODY_REGIONS = new Set<string>([
  'shoulder', 'elbow', 'wrist', 'hand',
  'upper_back', 'lower_back', 'hip',
  'knee', 'ankle', 'foot',
  'neck', 'chest', 'abdomen', 'other',
]);

const VALID_SEVERITIES = new Set<string>(['mild', 'moderate', 'severe']);
const VALID_STATUSES = new Set<string>(['active', 'recovering', 'resolved']);

function isBodyRegion(v: unknown): v is BodyRegion {
  return typeof v === 'string' && VALID_BODY_REGIONS.has(v);
}

function isSeverity(v: unknown): v is InjurySeverity {
  return typeof v === 'string' && VALID_SEVERITIES.has(v);
}

function isStatus(v: unknown): v is InjuryStatus {
  return typeof v === 'string' && VALID_STATUSES.has(v);
}

// ─── Action handlers ──────────────────────────────────────────────────────────

export const injuryHandlers: Record<string, ActionHandler> = {

  /**
   * log_injury — Create a new structured Injury entry in the user's profile.
   *
   * Payload:
   * {
   *   name: string;
   *   bodyRegion: BodyRegion;
   *   onsetDate: string;        // ISO YYYY-MM-DD
   *   severity: InjurySeverity;
   *   exercisesToAvoid?: string[];
   *   modifications?: string;
   *   notes?: string;
   * }
   *
   * Complexity: O(n) where n = existing injuries (capped at 50)
   */
  log_injury: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const now = new Date().toISOString();

    const name = typeof payload?.name === 'string' ? payload.name.trim() : 'Unspecified injury';
    const bodyRegion: BodyRegion = isBodyRegion(payload?.bodyRegion)
      ? payload.bodyRegion
      : 'other';
    const onsetDate =
      typeof payload?.onsetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.onsetDate)
        ? payload.onsetDate
        : new Date().toISOString().slice(0, 10);
    const severity: InjurySeverity = isSeverity(payload?.severity)
      ? payload.severity
      : 'mild';

    const exercisesToAvoid: string[] = Array.isArray(payload?.exercisesToAvoid)
      ? payload.exercisesToAvoid
          .filter((e: unknown) => typeof e === 'string' && e.trim())
          .map((e: string) => e.trim())
      : [];

    const modifications =
      typeof payload?.modifications === 'string' ? payload.modifications.trim() || undefined : undefined;
    const notes =
      typeof payload?.notes === 'string' ? payload.notes.trim() || undefined : undefined;

    const injury: Injury = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      name,
      bodyRegion,
      onsetDate,
      severity,
      status: 'active',
      exercisesToAvoid: exercisesToAvoid.length > 0 ? exercisesToAvoid : undefined,
      modifications,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    // Migrate any legacy string[] injuries before appending
    const existingInjuries: Injury[] = Array.isArray(profile.history?.injuries)
      ? (profile.history!.injuries as Injury[]).filter(
          (i): i is Injury => typeof i === 'object' && i !== null && 'id' in i
        )
      : [];

    // Preserve any legacy string values separately
    const legacyStrings: string[] = Array.isArray(profile.history?.injuries)
      ? (profile.history!.injuries as unknown[])
          .filter((i): i is string => typeof i === 'string')
      : (profile.history?.legacyInjuryStrings ?? []);

    const updatedInjuries = [injury, ...existingInjuries].slice(0, 50);

    await persistProfile(
      {
        ...profile,
        history: {
          ...profile.history,
          injuries: updatedInjuries,
          legacyInjuryStrings: legacyStrings.length > 0 ? legacyStrings : undefined,
        },
        updatedAt: now,
      },
      userId ?? null,
      encryptionKey ?? null
    );

    // Build confirmation message
    const avoidLine =
      exercisesToAvoid.length > 0
        ? `\n\n⚠️ **Exercises to avoid:** ${exercisesToAvoid.join(', ')}.`
        : '';
    const modLine = modifications ? `\n\n💡 **Modification:** ${modifications}` : '';

    if (pushAssistantMessage) {
      pushAssistantMessage(
        `✅ Injury logged: **${name}** (${bodyRegion.replace('_', ' ')}, ${severity} severity) starting ${onsetDate}.${avoidLine}${modLine}\n\nI'll factor this into your workout recommendations going forward. Make sure to listen to your body and progress gradually.`
      );
    }
  },

  /**
   * update_injury — Update status, resolvedDate, or modifications of an existing injury.
   *
   * Payload:
   * {
   *   id: string;
   *   status?: InjuryStatus;
   *   resolvedDate?: string;    // ISO YYYY-MM-DD — required when status → resolved
   *   modifications?: string;
   *   notes?: string;
   * }
   *
   * Complexity: O(n) where n = injuries array length (≤ 50)
   */
  update_injury: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const targetId = typeof payload?.id === 'string' ? payload.id : null;
    if (!targetId) return;

    const existingInjuries: Injury[] = Array.isArray(profile.history?.injuries)
      ? (profile.history!.injuries as Injury[]).filter(
          (i): i is Injury => typeof i === 'object' && i !== null && 'id' in i
        )
      : [];

    const targetIndex = existingInjuries.findIndex((i) => i.id === targetId);
    if (targetIndex === -1) {
      if (pushAssistantMessage) {
        pushAssistantMessage(
          `⚠️ Could not find injury with ID \`${targetId}\`. Please check the injury tracker for the correct ID.`
        );
      }
      return;
    }

    const existing = existingInjuries[targetIndex];
    const now = new Date().toISOString();

    const newStatus: InjuryStatus = isStatus(payload?.status)
      ? payload.status
      : existing.status;

    const resolvedDate =
      newStatus === 'resolved'
        ? typeof payload?.resolvedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.resolvedDate)
          ? payload.resolvedDate
          : new Date().toISOString().slice(0, 10)
        : existing.resolvedDate;

    const modifications =
      typeof payload?.modifications === 'string'
        ? payload.modifications.trim() || existing.modifications
        : existing.modifications;

    const notes =
      typeof payload?.notes === 'string'
        ? payload.notes.trim() || existing.notes
        : existing.notes;

    const updated: Injury = {
      ...existing,
      status: newStatus,
      resolvedDate,
      modifications,
      notes,
      updatedAt: now,
    };

    const updatedInjuries = [...existingInjuries];
    updatedInjuries[targetIndex] = updated;

    await persistProfile(
      {
        ...profile,
        history: {
          ...profile.history,
          injuries: updatedInjuries,
        },
        updatedAt: now,
      },
      userId ?? null,
      encryptionKey ?? null
    );

    if (pushAssistantMessage) {
      const statusMsg =
        newStatus === 'resolved'
          ? `✅ Great news — **${existing.name}** marked as resolved (${resolvedDate}). Keep up the recovery work!`
          : newStatus === 'recovering'
          ? `🔄 **${existing.name}** updated to *recovering* status. Stay consistent with your rehab protocol.`
          : `📋 **${existing.name}** updated to *active* status.`;
      pushAssistantMessage(statusMsg);
    }
  },
};
