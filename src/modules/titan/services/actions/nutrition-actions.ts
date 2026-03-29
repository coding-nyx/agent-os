/**
 * nutrition-actions.ts — Titan action handlers for meal and macro logging.
 *
 * Registered actions:
 *   log_meal — persists a MealEntry to profile.mealLog (cap 2 000 entries).
 */

import { loadProfile, persistProfile } from './shared';
import type { ActionHandler } from './shared';
import type { MealEntry, MealType } from '@/lib/types';

const VALID_MEAL_TYPES: readonly MealType[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'pre_workout',
  'post_workout',
];

/** Clamp a non-negative numeric macro value, or return undefined when absent. */
function parseNonNegative(raw: unknown, label: string): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative number (received ${String(raw)}).`);
  }
  return Math.round(n * 10) / 10;
}

export const nutritionHandlers: Record<string, ActionHandler> = {
  /**
   * log_meal — persists a single meal / snack entry to profile.mealLog.
   *
   * Payload schema (AI sends):
   * {
   *   date?: "YYYY-MM-DD",
   *   mealType: "breakfast"|"lunch"|"dinner"|"snack"|"pre_workout"|"post_workout",
   *   name: string,
   *   calories?: number,
   *   protein?: number,  // grams
   *   carbs?: number,    // grams
   *   fat?: number,      // grams
   *   notes?: string
   * }
   */
  log_meal: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
    const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
    if (!profile) return;

    // ── Validate name ────────────────────────────────────────────────────────
    const rawName = payload?.name;
    if (typeof rawName !== 'string' || !rawName.trim()) {
      pushAssistantMessage?.('❌ Meal entry requires a non-empty "name" field.');
      return;
    }

    // ── Validate mealType ────────────────────────────────────────────────────
    const rawType = payload?.mealType;
    if (!VALID_MEAL_TYPES.includes(rawType as MealType)) {
      pushAssistantMessage?.(
        `❌ Invalid mealType "${String(rawType)}". ` +
        `Valid values: ${VALID_MEAL_TYPES.join(', ')}.`,
      );
      return;
    }
    const mealType = rawType as MealType;

    // ── Validate date ────────────────────────────────────────────────────────
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const rawDate = payload?.date;
    const date =
      typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;

    // ── Parse optional macros ────────────────────────────────────────────────
    let calories: number | undefined;
    let protein: number | undefined;
    let carbs: number | undefined;
    let fat: number | undefined;

    try {
      calories = parseNonNegative(payload?.calories, 'calories');
      protein = parseNonNegative(payload?.protein, 'protein');
      carbs = parseNonNegative(payload?.carbs, 'carbs');
      fat = parseNonNegative(payload?.fat, 'fat');
    } catch (err) {
      pushAssistantMessage?.(`❌ ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // Round calories to whole number
    if (calories != null) calories = Math.round(calories);

    // ── Build entry ──────────────────────────────────────────────────────────
    const entry: MealEntry = {
      id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
      date,
      mealType,
      name: rawName.trim(),
      calories,
      protein,
      carbs,
      fat,
      notes:
        typeof payload?.notes === 'string' ? payload.notes.trim() || undefined : undefined,
      recordedAt: now.toISOString(),
    };

    // ── Persist (cap at 2 000 entries) ───────────────────────────────────────
    const updatedProfile = {
      ...profile,
      mealLog: [entry, ...(profile.mealLog ?? [])].slice(0, 2000),
      updatedAt: now.toISOString(),
    };

    await persistProfile(updatedProfile, userId ?? null, encryptionKey ?? null);

    // ── Spine event ──────────────────────────────────────────────────────────
    emitSpineEvent(
      'TITAN_MEAL_LOGGED',
      {
        mealId: entry.id,
        mealType: entry.mealType,
        date: entry.date,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        totalEntries: updatedProfile.mealLog?.length ?? 1,
      },
      { domain: 'B', priority: 'info' },
    );

    // ── Confirmation message ─────────────────────────────────────────────────
    const mealTypeLabel =
      mealType === 'pre_workout'
        ? 'Pre-Workout'
        : mealType === 'post_workout'
        ? 'Post-Workout'
        : mealType.charAt(0).toUpperCase() + mealType.slice(1);

    const macroSummary = [
      calories != null ? `${calories} kcal` : null,
      protein != null ? `${protein}g protein` : null,
      carbs != null ? `${carbs}g carbs` : null,
      fat != null ? `${fat}g fat` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    pushAssistantMessage?.(
      `✅ **${mealTypeLabel}** logged: **${entry.name}** on ${entry.date}` +
        (macroSummary ? ` — ${macroSummary}` : '') +
        '.',
    );
  },
};
