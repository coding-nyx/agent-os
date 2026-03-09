/**
 * Soma Module — Default Extension Field Templates & Categories
 *
 * Pre-built extension field suggestions for the Soma (health/biometrics) sub-module
 * within Titan. These are NOT core schema fields — the core schema already covers
 * 26 fields. These templates provide additional health biomarkers that users can
 * quickly add via the "Add Field" flow.
 *
 * Architecture rules:
 *   - Extension fields are capped at 25 per user (SOMA_FIELD_LIMITS.maxExtensions)
 *   - LLM is the sole semantic domain validator — no keyword gates here
 *   - Structural validation (ID uniqueness, type checks) is handled by SchemaRegistry
 *   - These templates are surfaced as suggestions, never force-added
 *   - Normal ranges in descriptions are informational; clinical interpretation is out of scope
 */

import type { FieldDefinition } from '@/lib/field-system/types';
import { FieldType } from '@/lib/field-system/types';

// ============================================================================
// Extension Category Definitions
// ============================================================================

/**
 * Category groupings for Soma extension fields. Each category maps to a
 * display label, color accent, and icon used in the dashboard and field picker UI.
 */
export const SOMA_FIELD_CATEGORIES = {
  vitals: {
    label: 'Vital Signs',
    color: 'emerald',
    icon: 'Heart',
  },
  hormones: {
    label: 'Hormones',
    color: 'purple',
    icon: 'Activity',
  },
  metabolic: {
    label: 'Metabolic',
    color: 'amber',
    icon: 'Droplet',
  },
  general: {
    label: 'General Health',
    color: 'cyan',
    icon: 'Shield',
  },
} as const;

export type SomaFieldCategory = keyof typeof SOMA_FIELD_CATEGORIES;

// ============================================================================
// Clinical Reference Ranges
// ============================================================================

/**
 * Clinical reference ranges for common biomarkers.
 * Used by validation helpers and UI status coloring.
 */
export interface ClinicalRange {
  fieldId: string;
  unit: string;
  normal: { min: number; max: number };
  warning?: { min: number; max: number };
  critical?: { min: number; max: number };
}

export const SOMA_CLINICAL_RANGES: ClinicalRange[] = [
  {
    fieldId: 'cortisol-level',
    unit: 'ng/dL',
    normal: { min: 6, max: 23 },
    warning: { min: 3, max: 30 },
    critical: { min: 0, max: 50 },
  },
  {
    fieldId: 'testosterone-level',
    unit: 'ng/dL',
    normal: { min: 300, max: 1000 },
    warning: { min: 200, max: 1200 },
    critical: { min: 0, max: 1500 },
  },
  {
    fieldId: 'thyroid-tsh',
    unit: 'mIU/L',
    normal: { min: 0.4, max: 4.0 },
    warning: { min: 0.1, max: 6.0 },
    critical: { min: 0, max: 20 },
  },
  {
    fieldId: 'iron-ferritin',
    unit: 'ng/mL',
    normal: { min: 24, max: 336 },
    warning: { min: 10, max: 500 },
    critical: { min: 0, max: 1000 },
  },
  {
    fieldId: 'blood-glucose',
    unit: 'mg/dL',
    normal: { min: 70, max: 100 },
    warning: { min: 55, max: 125 },
    critical: { min: 0, max: 600 },
  },
  {
    fieldId: 'hba1c',
    unit: '%',
    normal: { min: 4.0, max: 5.6 },
    warning: { min: 5.7, max: 6.4 },
    critical: { min: 0, max: 20 },
  },
  {
    fieldId: 'cholesterol-total',
    unit: 'mg/dL',
    normal: { min: 0, max: 199 },
    warning: { min: 200, max: 239 },
    critical: { min: 240, max: 500 },
  },
];

// ============================================================================
// Suggested Extension Fields (10 templates)
// ============================================================================

export const SOMA_SUGGESTED_FIELDS: FieldDefinition[] = [
  // ── Hormones ───────────────────────────────────────────────────────────
  {
    id: 'cortisol-level',
    name: 'Cortisol Level',
    type: FieldType.NUMBER,
    description:
      'Serum cortisol concentration in ng/dL. Normal morning range: 6–23 ng/dL. ' +
      'Elevated levels may indicate chronic stress, Cushing syndrome, or adrenal dysfunction. ' +
      'Values vary by time of day — morning samples are the clinical standard.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 50,
      multipleOf: 0.1,
    },
    metadata: {
      category: 'hormones',
      order: 1,
      icon: 'Activity',
      unit: 'ng/dL',
      helpText: 'Enter your morning (AM) serum cortisol value from lab work',
      placeholder: 'e.g., 14.5',
      searchable: true,
    },
  },
  {
    id: 'testosterone-level',
    name: 'Testosterone Level',
    type: FieldType.NUMBER,
    description:
      'Total testosterone concentration in ng/dL. Normal ranges — Male: 300–1000 ng/dL, ' +
      'Female: 15–70 ng/dL. Values outside these ranges may warrant clinical follow-up. ' +
      'Best measured via morning blood draw.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 1500,
      multipleOf: 0.1,
    },
    metadata: {
      category: 'hormones',
      order: 2,
      icon: 'TrendingUp',
      unit: 'ng/dL',
      helpText: 'Total testosterone from lab results (morning blood draw recommended)',
      placeholder: 'e.g., 550',
      searchable: true,
    },
  },
  {
    id: 'thyroid-tsh',
    name: 'Thyroid TSH',
    type: FieldType.NUMBER,
    description:
      'Thyroid-stimulating hormone (TSH) level in mIU/L. Normal range: 0.4–4.0 mIU/L. ' +
      'Values above 4.0 may suggest hypothyroidism; below 0.4 may indicate hyperthyroidism. ' +
      'TSH is the primary screening marker for thyroid function.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 20,
      multipleOf: 0.01,
    },
    metadata: {
      category: 'hormones',
      order: 3,
      icon: 'Activity',
      unit: 'mIU/L',
      helpText: 'TSH from thyroid panel lab work — the key thyroid screening marker',
      placeholder: 'e.g., 2.15',
      searchable: true,
    },
  },

  // ── Metabolic ──────────────────────────────────────────────────────────
  {
    id: 'vitamin-d-status',
    name: 'Vitamin D Status',
    type: FieldType.SELECT,
    description:
      'Serum 25-hydroxyvitamin D classification based on standard clinical thresholds. ' +
      'Deficient: <20 ng/mL, Insufficient: 20–29 ng/mL, Optimal: 30–100 ng/mL, ' +
      'High: >100 ng/mL. Adequate vitamin D supports bone health, immunity, and mood.',
    required: false,
    options: [
      { value: 'deficient', label: 'Deficient (<20 ng/mL)' },
      { value: 'insufficient', label: 'Insufficient (20–29 ng/mL)' },
      { value: 'optimal', label: 'Optimal (30–100 ng/mL)' },
      { value: 'high', label: 'High (>100 ng/mL)' },
    ],
    validation: {
      enum: ['deficient', 'insufficient', 'optimal', 'high'],
    },
    metadata: {
      category: 'metabolic',
      order: 4,
      icon: 'Sun',
      helpText: 'Select the classification from your most recent 25(OH)D lab result',
      uiHint: 'chip-group',
      searchable: true,
    },
  },
  {
    id: 'iron-ferritin',
    name: 'Iron / Ferritin',
    type: FieldType.NUMBER,
    description:
      'Serum ferritin level in ng/mL — the primary marker of iron storage. ' +
      'Normal ranges — Male: 24–336 ng/mL, Female: 11–307 ng/mL. ' +
      'Low ferritin indicates depleted iron stores; very high levels may signal ' +
      'inflammation or iron overload conditions.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 1000,
      multipleOf: 0.1,
    },
    metadata: {
      category: 'metabolic',
      order: 5,
      icon: 'Droplet',
      unit: 'ng/mL',
      helpText: 'Ferritin from your iron panel — the best single marker of iron stores',
      placeholder: 'e.g., 85',
      searchable: true,
    },
  },
  {
    id: 'blood-glucose',
    name: 'Blood Glucose',
    type: FieldType.NUMBER,
    description:
      'Blood glucose concentration in mg/dL. Normal fasting range: 70–100 mg/dL. ' +
      'Pre-diabetic fasting: 100–125 mg/dL, Diabetic fasting: ≥126 mg/dL. ' +
      'Post-meal values naturally run higher. Track fasting values for consistency.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 600,
      multipleOf: 1,
    },
    metadata: {
      category: 'metabolic',
      order: 6,
      icon: 'Droplet',
      unit: 'mg/dL',
      helpText: 'Enter fasting blood glucose for the most comparable day-to-day tracking',
      placeholder: 'e.g., 92',
      searchable: true,
    },
  },
  {
    id: 'hba1c',
    name: 'HbA1c',
    type: FieldType.NUMBER,
    description:
      'Glycated hemoglobin (HbA1c) percentage — reflects average blood sugar over ' +
      '2–3 months. Normal: <5.7%, Pre-diabetic: 5.7–6.4%, Diabetic: ≥6.5%. ' +
      'HbA1c is the gold-standard marker for long-term glycemic control.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 20,
      multipleOf: 0.1,
    },
    metadata: {
      category: 'metabolic',
      order: 7,
      icon: 'BarChart3',
      unit: '%',
      helpText: 'HbA1c from lab work — measures your 2–3 month average blood sugar',
      placeholder: 'e.g., 5.4',
      searchable: true,
    },
  },
  {
    id: 'cholesterol-total',
    name: 'Cholesterol Total',
    type: FieldType.NUMBER,
    description:
      'Total cholesterol in mg/dL. Desirable: <200 mg/dL, Borderline high: 200–239 mg/dL, ' +
      'High: ≥240 mg/dL. Total cholesterol is one component of a full lipid panel — ' +
      'consider tracking alongside HDL, LDL, and triglycerides for a complete picture.',
    required: false,
    validation: {
      minimum: 0,
      maximum: 500,
      multipleOf: 1,
    },
    metadata: {
      category: 'metabolic',
      order: 8,
      icon: 'Heart',
      unit: 'mg/dL',
      helpText: 'Total cholesterol from your lipid panel lab results',
      placeholder: 'e.g., 185',
      searchable: true,
    },
  },

  // ── General Health ─────────────────────────────────────────────────────
  {
    id: 'allergy-severity',
    name: 'Allergy Severity',
    type: FieldType.RANGE,
    description:
      'Self-assessed allergy severity on a 0–10 scale. 0 = no symptoms, ' +
      '1–3 = mild (occasional sneezing, minor irritation), 4–6 = moderate ' +
      '(persistent congestion, itchy eyes, skin reaction), 7–10 = severe ' +
      '(significant impairment, requires medication or medical attention).',
    required: false,
    defaultValue: 0,
    validation: {
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'general',
      order: 9,
      icon: 'AlertTriangle',
      helpText:
        'Rate your current allergy severity. Track alongside common allergens ' +
        '(pollen, dust, pet dander, food) to identify patterns and seasonal trends.',
      uiHint: 'slider',
    },
  },
  {
    id: 'skin-health-score',
    name: 'Skin Health Score',
    type: FieldType.RANGE,
    description:
      'Self-assessed overall skin health on a 0–10 scale. 0 = severe issues, ' +
      '10 = excellent condition. Consider factors such as hydration, clarity, ' +
      'elasticity, acne/breakouts, redness, and texture when scoring.',
    required: false,
    defaultValue: 5,
    validation: {
      minimum: 0,
      maximum: 10,
      multipleOf: 1,
    },
    metadata: {
      category: 'general',
      order: 10,
      icon: 'Shield',
      helpText:
        'Rate your overall skin condition. Consider hydration, clarity, elasticity, ' +
        'breakouts, redness, and texture. Consistent daily logging helps surface ' +
        'correlations with diet, sleep, and stress.',
      uiHint: 'slider',
    },
  },
];

// ============================================================================
// Field Limits
// ============================================================================

export const SOMA_FIELD_LIMITS = {
  /** Maximum extension fields allowed per user */
  maxExtensions: 25,
  /** Number of suggested templates shipped */
  suggestedCount: SOMA_SUGGESTED_FIELDS.length,
} as const;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Get the clinical range definition for a given field ID.
 */
export function getClinicalRange(fieldId: string): ClinicalRange | undefined {
  return SOMA_CLINICAL_RANGES.find((r) => r.fieldId === fieldId);
}

/**
 * Evaluate a biomarker value against its clinical reference range.
 * Returns 'normal' | 'warning' | 'critical' | 'unknown'.
 */
export function evaluateBiomarkerStatus(
  fieldId: string,
  value: number
): 'normal' | 'warning' | 'critical' | 'unknown' {
  const range = getClinicalRange(fieldId);
  if (!range) return 'unknown';

  if (value >= range.normal.min && value <= range.normal.max) {
    return 'normal';
  }

  if (range.warning && value >= range.warning.min && value <= range.warning.max) {
    return 'warning';
  }

  if (range.critical && value >= range.critical.min && value <= range.critical.max) {
    return 'critical';
  }

  return 'critical';
}

/**
 * Returns Soma extension field templates that the user has not yet added.
 */
export function getSomaFieldSuggestions(
  existingFieldIds: string[]
): FieldDefinition[] {
  const existingSet = new Set(existingFieldIds);
  return SOMA_SUGGESTED_FIELDS.filter((field) => !existingSet.has(field.id));
}

/**
 * Group extension fields by their metadata.category.
 */
export function groupFieldsByCategory(
  fields: FieldDefinition[]
): Record<string, FieldDefinition[]> {
  const grouped: Record<string, FieldDefinition[]> = {};
  for (const field of fields) {
    const category = field.metadata?.category || 'general';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(field);
  }
  // Sort each group by order
  for (const key of Object.keys(grouped)) {
    grouped[key].sort(
      (a, b) => (a.metadata?.order ?? 999) - (b.metadata?.order ?? 999)
    );
  }
  return grouped;
}
