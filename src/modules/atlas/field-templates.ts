/**
 * Atlas Module — Default Extension Field Templates
 *
 * SUGGESTED extension fields that the LLM or UI can offer to users.
 * NOT registered automatically — they serve as templates for the
 * "Add Field" flow (both chat and button paths).
 *
 * Architecture rules:
 *   - LLM is the sole semantic domain validator — no keyword gates here
 *   - Structural validation (ID uniqueness, type checks) is handled by SchemaRegistry
 *   - These templates are surfaced as suggestions, never force-added
 *   - Atlas max extension fields: 15
 */

import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';

// ============================================================================
// Default Extension Field Suggestions
// ============================================================================

/**
 * 10 common productivity/planning extension fields that users frequently want.
 *
 * Categories:
 *   - focus    → Deep work, distraction, and attention metrics
 *   - energy   → Cognitive load and capacity signals
 *   - habits   → Recurring behavior and routine tracking
 *   - meta     → Reflection, journaling, and self-assessment
 */
export const ATLAS_SUGGESTED_EXTENSIONS: FieldDefinition[] = [
  // ── Focus ──────────────────────────────────────────────────────────────

  {
    id: 'deep-work-hours',
    name: 'Deep Work Hours',
    type: FieldType.NUMBER,
    description: 'Total hours of uninterrupted deep work completed today',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 16,
      multipleOf: 0.25,
    },
    metadata: {
      category: 'focus',
      order: 1,
      icon: 'Brain',
      helpText: 'Track focused, uninterrupted work sessions — exclude meetings and admin',
      placeholder: 'e.g., 3.5',
      uiHint: 'stepper',
    },
  },

  {
    id: 'pomodoro-count',
    name: 'Pomodoro Count',
    type: FieldType.NUMBER,
    description: 'Number of completed Pomodoro sessions (25-min focus blocks) today',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 25,
      multipleOf: 1,
    },
    metadata: {
      category: 'focus',
      order: 2,
      icon: 'Timer',
      helpText: 'One Pomodoro = 25 minutes of focused work + 5 minute break',
      placeholder: 'e.g., 6',
      uiHint: 'stepper',
    },
  },

  {
    id: 'distraction-count',
    name: 'Distraction Count',
    type: FieldType.NUMBER,
    description: 'Number of times focus was broken by distractions today',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 100,
      multipleOf: 1,
    },
    metadata: {
      category: 'focus',
      order: 3,
      icon: 'Zap',
      helpText: 'Track interruptions: phone checks, notifications, context switches',
      placeholder: 'e.g., 12',
      uiHint: 'stepper',
    },
  },

  {
    id: 'screen-time',
    name: 'Screen Time',
    type: FieldType.NUMBER,
    description: 'Total screen time in hours for the day (productive + non-productive)',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 24,
      multipleOf: 0.25,
    },
    metadata: {
      category: 'focus',
      order: 4,
      icon: 'Monitor',
      helpText: 'Total hours spent on screens — helps identify digital overload patterns',
      placeholder: 'e.g., 8.5',
    },
  },

  // ── Energy ─────────────────────────────────────────────────────────────

  {
    id: 'meeting-load',
    name: 'Meeting Load',
    type: FieldType.RANGE,
    description: 'How meeting-heavy the day feels (0 = no meetings, 10 = wall-to-wall)',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'energy',
      order: 5,
      icon: 'Users',
      helpText: 'High meeting load drains deep work capacity — track for pattern recognition',
      uiHint: 'slider',
    },
  },

  {
    id: 'decision-fatigue',
    name: 'Decision Fatigue',
    type: FieldType.RANGE,
    description: 'Subjective decision fatigue level (0 = sharp, 10 = paralyzed)',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'energy',
      order: 6,
      icon: 'Scale',
      helpText: 'Track how depleted your decision-making capacity feels by end of day',
      uiHint: 'slider',
    },
  },

  {
    id: 'creative-output-score',
    name: 'Creative Output Score',
    type: FieldType.RANGE,
    description: 'Subjective rating of creative productivity today (0 = none, 10 = peak flow)',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'energy',
      order: 7,
      icon: 'Sparkles',
      helpText: 'Rate your creative output — writing, design, brainstorming, problem-solving',
      uiHint: 'slider',
    },
  },

  // ── Habits ─────────────────────────────────────────────────────────────

  {
    id: 'learning-hours',
    name: 'Learning Hours',
    type: FieldType.NUMBER,
    description: 'Hours spent on deliberate learning or skill development this week',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 40,
      multipleOf: 0.25,
    },
    metadata: {
      category: 'habits',
      order: 8,
      icon: 'BookOpen',
      helpText: 'Courses, reading, tutorials, practice — intentional skill-building only',
      placeholder: 'e.g., 5.5',
    },
  },

  {
    id: 'journaling-streak',
    name: 'Journaling Streak',
    type: FieldType.NUMBER,
    description: 'Consecutive days of journaling practice',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 365,
      multipleOf: 1,
    },
    metadata: {
      category: 'habits',
      order: 9,
      icon: 'PenLine',
      helpText: 'Track your journaling consistency — any length counts, even one sentence',
      placeholder: 'e.g., 14',
      uiHint: 'stepper',
    },
  },

  // ── Meta ────────────────────────────────────────────────────────────────

  {
    id: 'morning-routine-score',
    name: 'Morning Routine Score',
    type: FieldType.RANGE,
    description: 'How well the morning routine was executed (0 = skipped, 10 = perfect)',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'meta',
      order: 10,
      icon: 'Sunrise',
      helpText: 'Rate your morning routine adherence — consistency matters more than perfection',
      uiHint: 'slider',
    },
  },
];

// ============================================================================
// Field Validation Helpers (Productivity Domain)
// ============================================================================

/**
 * Validate a time-based value (hours) for productivity fields.
 * Used for Deep Work Hours, Screen Time, Learning Hours, etc.
 */
export function validateHoursValue(
  value: number,
  context: 'daily' | 'weekly' = 'daily'
): { valid: boolean; message?: string } {
  const maxHours = context === 'weekly' ? 168 : 24;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: 'Hours must be a finite number' };
  }
  if (value < 0) {
    return { valid: false, message: 'Hours cannot be negative' };
  }
  if (value > maxHours) {
    return {
      valid: false,
      message: `Hours exceeds ${context} maximum (${maxHours}h)`,
    };
  }
  return { valid: true };
}

/**
 * Validate a count value (integer) for productivity fields.
 * Used for Pomodoro Count, Distraction Count, Journaling Streak, etc.
 */
export function validateCountValue(
  value: number,
  max: number = 100
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: 'Count must be a finite number' };
  }
  if (!Number.isInteger(value)) {
    return { valid: false, message: 'Count must be a whole number' };
  }
  if (value < 0) {
    return { valid: false, message: 'Count cannot be negative' };
  }
  if (value > max) {
    return {
      valid: false,
      message: `Count exceeds reasonable maximum (${max})`,
    };
  }
  return { valid: true };
}

/**
 * Validate a 0-10 range score for subjective assessment fields.
 * Used for Meeting Load, Decision Fatigue, Creative Output Score, Morning Routine Score.
 */
export function validateRangeScore(
  value: number
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { valid: false, message: 'Score must be a finite number' };
  }
  if (value < 0 || value > 10) {
    return { valid: false, message: 'Score must be between 0 and 10' };
  }
  return { valid: true };
}

/**
 * Compute safe planning capacity from energy budget.
 * Atlas rule: energyBudget × 0.8 = safe threshold.
 */
export function computeSafePlanningThreshold(energyBudget: number): number {
  const clamped = Math.max(0, Math.min(10, energyBudget));
  return Math.round(clamped * 0.8 * 10) / 10;
}

/**
 * Check if total scheduled task energy exceeds safe threshold.
 */
export function checkEnergyOverload(
  totalEnergyCost: number,
  energyBudget: number
): { exceeded: boolean; threshold: number; excess: number } | null {
  const threshold = computeSafePlanningThreshold(energyBudget);

  if (totalEnergyCost > threshold) {
    return {
      exceeded: true,
      threshold,
      excess: Math.round((totalEnergyCost - threshold) * 10) / 10,
    };
  }

  return null;
}

// ============================================================================
// Field Category Definitions
// ============================================================================

/**
 * Category groupings for displaying extension fields on the Atlas dashboard.
 */
export const ATLAS_FIELD_CATEGORIES = {
  focus: {
    icon: 'Crosshair',
    color: 'sky',
    description: 'Deep work, distraction, and attention metrics',
  },
  energy: {
    icon: 'Zap',
    color: 'amber',
    description: 'Cognitive load, decision fatigue, and capacity signals',
  },
  habits: {
    icon: 'Repeat',
    color: 'emerald',
    description: 'Recurring behavior and routine tracking',
  },
  meta: {
    icon: 'BarChart3',
    color: 'purple',
    description: 'Reflection, journaling, and self-assessment',
  },
} as const;

export type AtlasFieldCategory = keyof typeof ATLAS_FIELD_CATEGORIES;

/**
 * Get the category config for a given Atlas extension field.
 * Falls back to a generic "custom" category if no match.
 */
export function getAtlasFieldCategory(field: FieldDefinition): {
  name: string;
  icon: string;
  color: string;
  description: string;
} {
  const categoryName = field.metadata?.category || 'custom';
  const config =
    ATLAS_FIELD_CATEGORIES[categoryName as keyof typeof ATLAS_FIELD_CATEGORIES];

  if (config) {
    return { name: categoryName, ...config };
  }

  return {
    name: categoryName,
    icon: field.metadata?.icon || 'SlidersHorizontal',
    color: 'sky',
    description: 'User-defined custom productivity field',
  };
}
