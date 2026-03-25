import {
  loadProfile,
  persistProfile,
} from './shared';
import type { ActionHandler } from './shared';
import type { WorkoutGoal, GoalMetric, GoalStatus } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_METRICS = new Set<string>([
  'lift_1rm', 'body_weight', 'body_fat_pct',
  'run_pace', 'cardio_distance', 'weekly_sessions', 'custom',
]);

const VALID_STATUSES = new Set<string>(['active', 'achieved', 'missed', 'abandoned']);

function isGoalMetric(v: unknown): v is GoalMetric {
  return typeof v === 'string' && VALID_METRICS.has(v);
}

function isGoalStatus(v: unknown): v is GoalStatus {
  return typeof v === 'string' && VALID_STATUSES.has(v);
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ─── Action handlers ──────────────────────────────────────────────────────────

export const goalHandlers: Record<string, ActionHandler> = {

  /**
   * log_goal — Create a new structured WorkoutGoal in the user's profile.
   *
   * Payload:
   * {
   *   name: string;
   *   metric: GoalMetric;
   *   targetValue: number;
   *   currentValue?: number;
   *   unit: string;
   *   exerciseName?: string;    // required when metric = 'lift_1rm'
   *   deadline?: string;        // ISO YYYY-MM-DD
   *   notes?: string;
   * }
   *
   * Complexity: O(n) where n = existing goals array length (capped at 50)
   */
  log_goal: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const now = new Date().toISOString();

    const name =
      typeof payload?.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : 'Unnamed Goal';

    const metric: GoalMetric = isGoalMetric(payload?.metric)
      ? payload.metric
      : 'custom';

    const targetValue =
      typeof payload?.targetValue === 'number' && payload.targetValue > 0
        ? payload.targetValue
        : 0;

    const currentValue =
      typeof payload?.currentValue === 'number' ? payload.currentValue : undefined;

    const unit =
      typeof payload?.unit === 'string' && payload.unit.trim()
        ? payload.unit.trim()
        : '';

    const exerciseName =
      metric === 'lift_1rm' && typeof payload?.exerciseName === 'string' && payload.exerciseName.trim()
        ? payload.exerciseName.trim()
        : undefined;

    const deadline = isIsoDate(payload?.deadline) ? payload.deadline : undefined;

    const notes =
      typeof payload?.notes === 'string' && payload.notes.trim()
        ? payload.notes.trim()
        : undefined;

    const goal: WorkoutGoal = {
      id: typeof payload?.id === 'string' && payload.id ? payload.id : crypto.randomUUID(),
      name,
      metric,
      targetValue,
      currentValue,
      unit,
      exerciseName,
      deadline,
      status: 'active',
      notes,
      createdAt: now,
      updatedAt: now,
    };

    const existingGoals: WorkoutGoal[] = Array.isArray(profile.goals)
      ? (profile.goals as WorkoutGoal[]).filter(
          (g): g is WorkoutGoal => typeof g === 'object' && g !== null && 'id' in g
        )
      : [];

    const updatedGoals = [goal, ...existingGoals].slice(0, 50);

    await persistProfile(
      {
        ...profile,
        goals: updatedGoals,
        updatedAt: now,
      },
      userId ?? null,
      encryptionKey ?? null
    );

    const deadlineLine = deadline ? ` by **${deadline}**` : '';
    const currentLine = currentValue !== undefined
      ? ` You're currently at **${currentValue} ${unit}**.`
      : '';

    if (pushAssistantMessage) {
      pushAssistantMessage(
        `🎯 Goal set: **${name}** — target **${targetValue} ${unit}**${deadlineLine}.${currentLine} I'll track your progress and cheer you on!`
      );
    }
  },

  /**
   * update_goal — Update status, currentValue, achievedDate, or notes of an existing goal.
   *
   * Payload:
   * {
   *   id: string;
   *   status?: GoalStatus;
   *   achievedDate?: string;    // ISO YYYY-MM-DD — set when status → achieved
   *   currentValue?: number;
   *   notes?: string;
   * }
   *
   * Complexity: O(n) where n = goals array length (≤ 50)
   */
  update_goal: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    const targetId = typeof payload?.id === 'string' ? payload.id : null;
    if (!targetId) return;

    const existingGoals: WorkoutGoal[] = Array.isArray(profile.goals)
      ? (profile.goals as WorkoutGoal[]).filter(
          (g): g is WorkoutGoal => typeof g === 'object' && g !== null && 'id' in g
        )
      : [];

    const targetIndex = existingGoals.findIndex((g) => g.id === targetId);
    if (targetIndex === -1) {
      if (pushAssistantMessage) {
        pushAssistantMessage(
          `⚠️ Could not find goal with ID \`${targetId}\`. Please check the Goal Tracker for the correct ID.`
        );
      }
      return;
    }

    const existing = existingGoals[targetIndex];
    const now = new Date().toISOString();

    const newStatus: GoalStatus = isGoalStatus(payload?.status)
      ? payload.status
      : existing.status;

    const achievedDate =
      newStatus === 'achieved'
        ? isIsoDate(payload?.achievedDate)
          ? payload.achievedDate
          : new Date().toISOString().slice(0, 10)
        : existing.achievedDate;

    const currentValue =
      typeof payload?.currentValue === 'number'
        ? payload.currentValue
        : existing.currentValue;

    const notes =
      typeof payload?.notes === 'string' && payload.notes.trim()
        ? payload.notes.trim()
        : existing.notes;

    const updated: WorkoutGoal = {
      ...existing,
      status: newStatus,
      achievedDate,
      currentValue,
      notes,
      updatedAt: now,
    };

    const updatedGoals = [...existingGoals];
    updatedGoals[targetIndex] = updated;

    await persistProfile(
      {
        ...profile,
        goals: updatedGoals,
        updatedAt: now,
      },
      userId ?? null,
      encryptionKey ?? null
    );

    if (pushAssistantMessage) {
      if (newStatus === 'achieved') {
        pushAssistantMessage(
          `🏆 GOAL ACHIEVED! **${existing.name}** — you hit your target of **${existing.targetValue} ${existing.unit}**! Absolutely incredible work. Mark this day and set your next challenge!`
        );
      } else if (newStatus === 'missed') {
        pushAssistantMessage(
          `📋 Goal **${existing.name}** marked as missed. Every setback is data — let's review what happened and adjust your approach.`
        );
      } else if (newStatus === 'abandoned') {
        pushAssistantMessage(
          `📋 Goal **${existing.name}** has been abandoned. Priorities shift — we can always revisit this later.`
        );
      } else {
        pushAssistantMessage(
          `📋 Goal **${existing.name}** updated.${currentValue !== undefined ? ` Current value: **${currentValue} ${existing.unit}**.` : ''}`
        );
      }
    }
  },
};
