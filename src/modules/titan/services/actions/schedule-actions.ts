/**
 * schedule-actions — Titan action handlers for workout scheduling.
 *
 * schedule_workout   — Push a PlannedWorkout into profile.plannedWorkouts (cap 200).
 * update_planned_workout — Find by id, update status or other mutable fields.
 *
 * Complexity: O(P) where P = plannedWorkouts.length (≤ 200).
 */

import {
  loadProfile,
  persistProfile,
} from './shared';
import type { ActionHandler } from './shared';
import type { PlannedWorkout } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<string>(['planned', 'completed', 'skipped']);

function isPlannedStatus(v: unknown): v is PlannedWorkout['status'] {
  return typeof v === 'string' && VALID_STATUSES.has(v);
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ─── Action handlers ──────────────────────────────────────────────────────────

export const scheduleHandlers: Record<string, ActionHandler> = {

  /**
   * schedule_workout — Create a new PlannedWorkout entry.
   *
   * Payload:
   * {
   *   date: string;           // ISO YYYY-MM-DD (required)
   *   routineName: string;    // (required)
   *   exerciseNames?: string[];
   *   notes?: string;
   * }
   *
   * Complexity: O(P) — prepend + slice of plannedWorkouts (≤ 200)
   */
  schedule_workout: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const date = isIsoDate(payload?.date) ? payload.date : new Date().toISOString().slice(0, 10);
    const routineName =
      typeof payload?.routineName === 'string' && payload.routineName.trim()
        ? payload.routineName.trim()
        : 'Workout';

    const exerciseNames: string[] = Array.isArray(payload?.exerciseNames)
      ? (payload.exerciseNames as unknown[])
          .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
          .map((e: string) => e.trim())
      : [];

    const notes =
      typeof payload?.notes === 'string' && payload.notes.trim()
        ? payload.notes.trim()
        : undefined;

    const now = new Date().toISOString();

    const planned: PlannedWorkout = {
      id: typeof payload?.id === 'string' && payload.id ? payload.id : crypto.randomUUID(),
      date,
      routineName,
      exerciseNames: exerciseNames.length > 0 ? exerciseNames : undefined,
      notes,
      status: 'planned',
      createdAt: now,
    };

    const existing: PlannedWorkout[] = Array.isArray(profile.plannedWorkouts)
      ? profile.plannedWorkouts
      : [];

    const updated = [planned, ...existing].slice(0, 200);

    await persistProfile(
      {
        ...profile,
        plannedWorkouts: updated,
        updatedAt: now,
      },
      userId ?? null,
      encryptionKey ?? null,
    );

    const exLine =
      exerciseNames.length > 0
        ? `\n📋 **Exercises:** ${exerciseNames.join(', ')}`
        : '';
    const noteLine = notes ? `\n💬 ${notes}` : '';

    if (pushAssistantMessage) {
      pushAssistantMessage(
        `📅 **${routineName}** scheduled for **${date}**.${exLine}${noteLine}\n\n` +
        `It's now on your 4-week calendar. I'll remind you the day before. Consistency is key — let's go! 💪`
      );
    }
  },

  /**
   * update_planned_workout — Update status or fields of an existing planned workout.
   *
   * Payload:
   * {
   *   id: string;              // (required)
   *   status?: PlannedWorkout['status'];
   *   notes?: string;
   * }
   *
   * Complexity: O(P) — linear scan to find target by id (P ≤ 200)
   */
  update_planned_workout: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const targetId = typeof payload?.id === 'string' ? payload.id : null;
    if (!targetId) {
      if (pushAssistantMessage) {
        pushAssistantMessage('⚠️ Could not update planned workout — no ID provided.');
      }
      return;
    }

    const existing: PlannedWorkout[] = Array.isArray(profile.plannedWorkouts)
      ? profile.plannedWorkouts
      : [];

    const targetIndex = existing.findIndex(pw => pw.id === targetId);
    if (targetIndex === -1) {
      if (pushAssistantMessage) {
        pushAssistantMessage(
          `⚠️ Could not find a planned workout with ID \`${targetId}\`. Check your scheduler for the correct entry.`
        );
      }
      return;
    }

    const existing_pw = existing[targetIndex];
    const newStatus: PlannedWorkout['status'] = isPlannedStatus(payload?.status)
      ? payload.status
      : existing_pw.status;

    const newNotes =
      typeof payload?.notes === 'string' ? payload.notes.trim() || existing_pw.notes : existing_pw.notes;

    const updated: PlannedWorkout = {
      ...existing_pw,
      status: newStatus,
      notes: newNotes,
    };

    const updatedList = [...existing];
    updatedList[targetIndex] = updated;

    const now = new Date().toISOString();
    await persistProfile(
      {
        ...profile,
        plannedWorkouts: updatedList,
        updatedAt: now,
      },
      userId ?? null,
      encryptionKey ?? null,
    );

    const statusEmoji =
      newStatus === 'completed' ? '✅' : newStatus === 'skipped' ? '⏭️' : '📅';

    if (pushAssistantMessage) {
      pushAssistantMessage(
        `${statusEmoji} **${existing_pw.routineName}** (${existing_pw.date}) marked as **${newStatus}**.`
      );
    }
  },
};
