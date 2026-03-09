/**
 * Soma Module — Field Actions, Readiness Computation & Spine Events
 *
 * Registers Soma-specific actions with ActionHub for field CRUD,
 * readiness scoring, and biomarker change events.
 *
 * Architecture:
 *   - Soma lives inside Titan and shares Titan's action-feedback system
 *   - Actions are produced by the LLM, dispatched through ActionHub
 *   - Spine is the global event bus; UI components subscribe to typed events
 *   - Medical clearance is a self-assessment workflow, NOT professional
 */

import { ActionHub } from '@/lib/actions/action-hub';
import { SchemaRegistry } from '@/lib/schema-registry';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { FieldDefinition } from '@/lib/field-system/types';

// ============================================================================
// Soma Spine Event Types
// ============================================================================

export const SomaSpineEvents = {
  BIOMARKER_COMMITTED: 'SOMA_BIOMARKER_COMMITTED',
  READINESS_UPDATED: 'SOMA_READINESS_UPDATED',
  CLEARANCE_CHANGED: 'SOMA_CLEARANCE_CHANGED',
  FIELD_CREATED: 'SOMA_FIELD_CREATED',
  FIELD_UPDATED: 'SOMA_FIELD_UPDATED',
  FIELD_DELETED: 'SOMA_FIELD_DELETED',
  VITAL_LOGGED: 'SOMA_VITAL_LOGGED',
  LAB_REPORT_PARSED: 'SOMA_LAB_REPORT_PARSED',
  PROFILE_UPDATED: 'SOMA_PROFILE_UPDATED',
} as const;

// ============================================================================
// Readiness Score Algorithm
// ============================================================================

/** Weight constants for the readiness algorithm. */
const READINESS_WEIGHTS = {
  vitals: 0.40,
  sleep: 0.30,
  energy: 0.20,
  stress: 0.10,
} as const;

/** Default sub-score when a metric is not provided. */
const DEFAULT_SUBSCORE = 50;

/** Ideal resting heart rate target (bpm). */
const IDEAL_RESTING_HR = 60;

/** Penalty multiplier per bpm deviation from ideal HR. */
const HR_PENALTY_PER_BPM = 2;

export interface ComputeReadinessPayload {
  restingHeartRate?: number;
  sleepQuality?: number;
  energyLevel?: number;
  stressPhysical?: number;
  overrides?: Record<string, number>;
}

export interface ReadinessResult {
  score: number;
  breakdown: {
    vitals: number;
    sleep: number;
    energy: number;
    stress: number;
  };
  level: 'optimal' | 'good' | 'fair' | 'poor';
  recommendations: string[];
}

/**
 * Compute a composite physical-readiness score from biometric inputs.
 *
 * Pure function — no side effects, no Spine events. Callers emit events.
 *
 * Weights:
 *   Vitals 40%, Sleep 30%, Energy 20%, Stress 10%
 *
 * Sub-score formulas (each yields 0–100):
 *   - Vitals: max(0, 100 - |restingHeartRate - 60| × 2)
 *   - Sleep:  sleepQuality × 10  (input is 0–10)
 *   - Energy: energyLevel × 10   (input is 0–10)
 *   - Stress: (10 - stressPhysical) × 10 (inverted; input is 0–10)
 */
export function computeReadinessScore(
  payload: ComputeReadinessPayload
): ReadinessResult {
  const overrides = payload.overrides ?? {};

  // ── Sub-scores (0–100 each) ───────────────────────────────────────────

  const vitals: number =
    overrides.vitals ??
    (payload.restingHeartRate != null
      ? Math.max(
          0,
          100 -
            Math.abs(payload.restingHeartRate - IDEAL_RESTING_HR) *
              HR_PENALTY_PER_BPM
        )
      : DEFAULT_SUBSCORE);

  const sleep: number =
    overrides.sleep ??
    (payload.sleepQuality != null
      ? Math.min(100, Math.max(0, payload.sleepQuality * 10))
      : DEFAULT_SUBSCORE);

  const energy: number =
    overrides.energy ??
    (payload.energyLevel != null
      ? Math.min(100, Math.max(0, payload.energyLevel * 10))
      : DEFAULT_SUBSCORE);

  const stress: number =
    overrides.stress ??
    (payload.stressPhysical != null
      ? Math.min(100, Math.max(0, (10 - payload.stressPhysical) * 10))
      : DEFAULT_SUBSCORE);

  // ── Weighted composite ────────────────────────────────────────────────

  const raw =
    vitals * READINESS_WEIGHTS.vitals +
    sleep * READINESS_WEIGHTS.sleep +
    energy * READINESS_WEIGHTS.energy +
    stress * READINESS_WEIGHTS.stress;

  const score = Math.round(Math.min(100, Math.max(0, raw)));

  // ── Level classification ──────────────────────────────────────────────

  let level: ReadinessResult['level'];
  if (score >= 80) {
    level = 'optimal';
  } else if (score >= 60) {
    level = 'good';
  } else if (score >= 40) {
    level = 'fair';
  } else {
    level = 'poor';
  }

  // ── Recommendations (1–3 based on weakest sub-scores) ─────────────────

  const recommendations: string[] = [];

  if (vitals < 60) {
    recommendations.push(
      'Elevated resting heart rate detected — consider light aerobic recovery and stress management.'
    );
  }
  if (sleep < 60) {
    recommendations.push(
      'Sleep quality is below target — aim for 7–9 hours of uninterrupted sleep and consistent bed/wake times.'
    );
  }
  if (energy < 60) {
    recommendations.push(
      'Low energy level — review nutrition, hydration, and training volume for potential over-reaching.'
    );
  }
  if (
    payload.stressPhysical != null &&
    payload.stressPhysical >= 7 &&
    recommendations.length < 3
  ) {
    recommendations.push(
      'High physical stress reported — prioritise recovery modalities (foam rolling, stretching, sleep).'
    );
  }

  return {
    score,
    breakdown: { vitals, sleep, energy, stress },
    level,
    recommendations: recommendations.slice(0, 3),
  };
}

// ============================================================================
// Readiness Level Helpers
// ============================================================================

export const READINESS_LEVELS = {
  optimal: { label: 'Optimal', color: 'emerald', minScore: 80 },
  good: { label: 'Good', color: 'cyan', minScore: 60 },
  fair: { label: 'Fair', color: 'amber', minScore: 40 },
  poor: { label: 'Poor', color: 'red', minScore: 0 },
} as const;

// ============================================================================
// Spine Event Emitters
// ============================================================================

/**
 * Emit a SOMA_BIOMARKER_COMMITTED event when a biomarker value is recorded.
 */
export function emitBiomarkerCommitted(
  fieldId: string,
  newValue: unknown,
  previousValue?: unknown
): void {
  Spine.emit({
    type: SomaSpineEvents.BIOMARKER_COMMITTED,
    source: 'soma',
    domain: 'B',
    data: {
      moduleId: 'soma',
      fieldId,
      previousValue,
      newValue,
      timestamp: Date.now(),
    },
    cascadeDepth: 0,
    priority: 'info',
  });
}

/**
 * Emit a SOMA_READINESS_UPDATED event when readiness is recomputed.
 */
export function emitReadinessUpdated(
  result: ReadinessResult,
  previousScore?: number
): void {
  Spine.emit({
    type: SomaSpineEvents.READINESS_UPDATED,
    source: 'soma',
    domain: 'B',
    data: {
      moduleId: 'soma',
      score: result.score,
      previousScore,
      level: result.level,
      breakdown: result.breakdown,
      recommendations: result.recommendations,
      timestamp: Date.now(),
    },
    cascadeDepth: 0,
    priority: result.level === 'poor' ? 'alert' : 'info',
  });
}

/**
 * Emit a SOMA_CLEARANCE_CHANGED event when clearance status changes.
 */
export function emitClearanceChanged(
  clearanceId: string,
  action: 'issued' | 'revoked' | 'expired',
  clearanceType: string
): void {
  Spine.emit({
    type: SomaSpineEvents.CLEARANCE_CHANGED,
    source: 'soma',
    domain: 'B',
    data: {
      moduleId: 'soma',
      clearanceId,
      action,
      clearanceType,
      timestamp: Date.now(),
    },
    cascadeDepth: 0,
    priority: action === 'revoked' ? 'alert' : 'info',
  });
}

/**
 * Emit a SOMA_FIELD_CREATED event when a custom field is added.
 */
export function emitFieldCreated(field: FieldDefinition): void {
  Spine.emit({
    type: SomaSpineEvents.FIELD_CREATED,
    source: 'soma',
    domain: 'B',
    data: {
      moduleId: 'soma',
      fieldId: field.id,
      fieldName: field.name,
      fieldType: field.type,
      category: field.metadata?.category,
      timestamp: Date.now(),
    },
    cascadeDepth: 0,
    priority: 'info',
  });
}

/**
 * Emit a SOMA_FIELD_DELETED event when a custom field is removed.
 */
export function emitFieldDeleted(fieldId: string, fieldName: string): void {
  Spine.emit({
    type: SomaSpineEvents.FIELD_DELETED,
    source: 'soma',
    domain: 'B',
    data: {
      moduleId: 'soma',
      fieldId,
      fieldName,
      timestamp: Date.now(),
    },
    cascadeDepth: 0,
    priority: 'info',
  });
}

// ============================================================================
// Toast Templates
// ============================================================================

export const SOMA_TOAST_TEMPLATES = {
  fieldCreated: (name: string) => ({
    title: 'Biomarker Added',
    description: `"${name}" is now tracked in your Soma profile.`,
    variant: 'success' as const,
  }),
  fieldDeleted: (name: string) => ({
    title: 'Biomarker Removed',
    description: `"${name}" has been removed from your custom fields.`,
    variant: 'info' as const,
  }),
  biomarkerCommitted: (name: string, value: unknown, unit?: string) => ({
    title: 'Biomarker Recorded',
    description: `${name}: ${value}${unit ? ` ${unit}` : ''} saved.`,
    variant: 'success' as const,
  }),
  readinessComputed: (score: number, level: string) => ({
    title: 'Readiness Updated',
    description: `Score: ${score}/100 — ${level}`,
    variant: level === 'poor' ? ('warning' as const) : ('success' as const),
  }),
  clearanceIssued: (type: string) => ({
    title: 'Clearance Issued',
    description: `${type} clearance has been recorded.`,
    variant: type === 'restricted' ? ('warning' as const) : ('success' as const),
  }),
  validationFailed: (reason: string) => ({
    title: 'Validation Failed',
    description: reason,
    variant: 'error' as const,
  }),
  extensionLimitReached: () => ({
    title: 'Field Limit Reached',
    description: 'Maximum custom biomarkers reached (25/25). Remove a field to add a new one.',
    variant: 'warning' as const,
  }),
};

// ============================================================================
// Action Registration
// ============================================================================

let somaActionsRegistered = false;

/**
 * Register Soma-specific field actions with ActionHub.
 *
 * These supplement Titan's existing actions with Soma-specific handlers
 * for field CRUD operations and readiness computation.
 */
export function registerSomaFieldActions(): void {
  if (somaActionsRegistered) return;
  somaActionsRegistered = true;

  // Soma actions live under the 'soma' module ID (sovereign data layer).
  // Titan declares a dependency on 'soma' so these are resolvable from Titan context.
  ActionHub.addDependency('titan', 'soma');

  ActionHub.registerMultiple('soma', {
    // ── Create Extension Field ──────────────────────────────────────────
    create_field: async ({ payload, pushAssistantMessage }) => {
      const fieldDef = payload as unknown as FieldDefinition;

      if (!fieldDef.id || !fieldDef.name || !fieldDef.type) {
        pushAssistantMessage?.(
          '⚠️ Field creation failed: missing required properties (id, name, type).'
        );
        return;
      }

      // Structural validation via SchemaRegistry
      const validation = SchemaRegistry.validateExtension('soma', fieldDef);
      if (!validation.valid) {
        const reasons = validation.errors.map((e) => e.message).join('; ');
        pushAssistantMessage?.(
          `⚠️ Field creation failed: ${reasons}`
        );
        return;
      }

      // Add to SchemaRegistry
      const result = await SchemaRegistry.extendSchema('soma', [fieldDef]);
      if (!result.valid) {
        const reasons = result.errors.map((e) => e.message).join('; ');
        pushAssistantMessage?.(
          `⚠️ Field creation failed: ${reasons}`
        );
        return;
      }

      // Emit Spine event
      emitFieldCreated(fieldDef);

      pushAssistantMessage?.(
        `✅ Added "${fieldDef.name}" to your custom biomarkers. You can now track this in the Biomarkers dashboard.`
      );
    },

    // ── Update Extension Field ──────────────────────────────────────────
    update_field: async ({ payload, pushAssistantMessage }) => {
      const fieldId =
        typeof payload?.fieldId === 'string' ? payload.fieldId : null;
      if (!fieldId) {
        pushAssistantMessage?.('⚠️ Field update failed: missing fieldId.');
        return;
      }

      const extensions = SchemaRegistry.getExtensions('soma');
      const existing = extensions.find((f) => f.id === fieldId);
      if (!existing) {
        pushAssistantMessage?.(
          `⚠️ Field "${fieldId}" not found in custom fields.`
        );
        return;
      }

      // Apply updates to the field definition
      const updated: FieldDefinition = {
        ...existing,
        ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
        ...(typeof payload.description === 'string'
          ? { description: payload.description }
          : {}),
        ...(payload.validation ? { validation: payload.validation as FieldDefinition['validation'] } : {}),
        ...(payload.metadata ? { metadata: { ...existing.metadata, ...(payload.metadata as FieldDefinition['metadata']) } } : {}),
        ...(payload.options ? { options: payload.options as FieldDefinition['options'] } : {}),
      };

      // Remove old, add updated
      await SchemaRegistry.removeExtension('soma', fieldId);
      await SchemaRegistry.extendSchema('soma', [updated]);

      Spine.emit({
        type: SomaSpineEvents.FIELD_UPDATED,
        source: 'soma',
        domain: 'B',
        data: {
          moduleId: 'soma',
          fieldId,
          fieldName: updated.name,
          timestamp: Date.now(),
        },
        cascadeDepth: 0,
        priority: 'info',
      });

      pushAssistantMessage?.(
        `✅ Updated field "${updated.name}" successfully.`
      );
    },

    // ── Delete Extension Field ──────────────────────────────────────────
    delete_field: async ({ payload, pushAssistantMessage }) => {
      const fieldId =
        typeof payload?.fieldId === 'string' ? payload.fieldId : null;
      if (!fieldId) {
        pushAssistantMessage?.('⚠️ Field deletion failed: missing fieldId.');
        return;
      }

      const extensions = SchemaRegistry.getExtensions('soma');
      const existing = extensions.find((f) => f.id === fieldId);
      if (!existing) {
        pushAssistantMessage?.(
          `⚠️ Field "${fieldId}" not found in custom fields.`
        );
        return;
      }

      try {
        await SchemaRegistry.removeExtension('soma', fieldId);
        emitFieldDeleted(fieldId, existing.name);
        pushAssistantMessage?.(
          `✅ Removed "${existing.name}" from your custom biomarkers.`
        );
      } catch (error) {
        console.error('[SomaFieldActions] Failed to delete field:', error);
        pushAssistantMessage?.(
          `⚠️ Failed to delete field "${fieldId}". Please try again.`
        );
      }
    },

    // ── Compute Readiness ───────────────────────────────────────────────
    compute_readiness: async ({ payload, pushAssistantMessage }) => {
      const readinessPayload: ComputeReadinessPayload = {
        restingHeartRate:
          typeof payload?.restingHeartRate === 'number'
            ? payload.restingHeartRate
            : undefined,
        sleepQuality:
          typeof payload?.sleepQuality === 'number'
            ? payload.sleepQuality
            : undefined,
        energyLevel:
          typeof payload?.energyLevel === 'number'
            ? payload.energyLevel
            : undefined,
        stressPhysical:
          typeof payload?.stressPhysical === 'number'
            ? payload.stressPhysical
            : undefined,
      };

      const result = computeReadinessScore(readinessPayload);
      emitReadinessUpdated(result);

      const levelEmoji =
        result.level === 'optimal'
          ? '🟢'
          : result.level === 'good'
            ? '🔵'
            : result.level === 'fair'
              ? '🟡'
              : '🔴';

      const recsText =
        result.recommendations.length > 0
          ? `\n\nRecommendations:\n${result.recommendations.map((r) => `• ${r}`).join('\n')}`
          : '';

      pushAssistantMessage?.(
        `${levelEmoji} **Readiness Score: ${result.score}/100 (${result.level})**\n\n` +
          `Breakdown:\n` +
          `• Vitals: ${result.breakdown.vitals}/100 (40%)\n` +
          `• Sleep: ${result.breakdown.sleep}/100 (30%)\n` +
          `• Energy: ${result.breakdown.energy}/100 (20%)\n` +
          `• Stress: ${result.breakdown.stress}/100 (10%)` +
          recsText
      );
    },
  });
}
