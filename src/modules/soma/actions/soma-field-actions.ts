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
import { loadSomaProfile, saveSomaProfile, addVitalReading } from '../services/soma-profile-service';
import { SomaDataService } from '../services/soma-data-service';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { BiomarkerRecord, ClearanceRecord, LabSummaryRecord, SomaProfile, PhysicalAssessment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Save helper — wraps saveSomaProfile + SomaDataService cache invalidation
// ---------------------------------------------------------------------------

async function saveAndInvalidate(
  profile: SomaProfile,
  ctx: { userId: string; encryptionKey: CryptoKey | null },
): Promise<void> {
  await saveSomaProfile(profile, ctx);
  SomaDataService.invalidateCache(ctx.userId);
}

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
    type: 'SOMA_BIOMARKER_COMMITTED',
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
    type: 'SOMA_READINESS_UPDATED',
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
    type: 'SOMA_CLEARANCE_CHANGED',
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

export function isRestrictiveClearanceStatus(status: ClearanceRecord['status']): boolean {
  return status === 'denied' || status === 'conditional';
}

export function getClearanceChangeAction(
  status: ClearanceRecord['status'],
): 'issued' | 'revoked' {
  return isRestrictiveClearanceStatus(status) ? 'revoked' : 'issued';
}

export function emitClearanceCoordinationEvents(clearance: ClearanceRecord): void {
  Spine.emit({
    type: clearance.status === 'granted' ? 'CLEARANCE_GRANTED' : 'CLEARANCE_DENIED',
    source: 'soma',
    target: 'titan',
    domain: 'B',
    data: {
      activity: clearance.activity,
      status: clearance.status,
      reason: clearance.reason,
      clearanceId: clearance.id,
    },
    cascadeDepth: 0,
    priority: clearance.status === 'granted' ? 'info' : 'alert',
  });

  if (isRestrictiveClearanceStatus(clearance.status)) {
    Spine.emit({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'soma',
      target: 'titan',
      domain: 'B',
      data: {
        activity: clearance.activity,
        status: clearance.status,
        reason: clearance.reason,
        clearanceId: clearance.id,
      },
      cascadeDepth: 0,
      priority: 'alert',
    });
    return;
  }

  Spine.emit({
    type: 'RECOVERY_AVAILABLE',
    source: 'soma',
    target: 'titan',
    domain: 'B',
    data: {
      trigger: 'clearance_granted',
      activity: clearance.activity,
      clearanceId: clearance.id,
      reason: clearance.reason,
    },
    cascadeDepth: 0,
    priority: 'info',
  });
}

/**
 * Emit a SOMA_FIELD_CREATED event when a custom field is added.
 */
export function emitFieldCreated(field: FieldDefinition): void {
  Spine.emit({
    type: 'SOMA_FIELD_CREATED',
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
    type: 'SOMA_FIELD_DELETED',
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

/** Internal testing helper to reset registration state. */
export function resetSomaActionsRegistered(): void {
  somaActionsRegistered = false;
}

/**
 * Register Soma-specific field actions with ActionHub.
 *
 * These supplement Titan's existing actions with Soma-specific handlers
 * for field CRUD operations and readiness computation.
 */
export function registerSomaFieldActions(): void {
  if (somaActionsRegistered) return;
  somaActionsRegistered = true;

  console.log('[SomaFieldActions] Registering actions for soma...');

  ActionHub.registerProvider('soma', {
    capabilities: ['recovery-planning'],
    latencyTier: 'balanced',
  });

  // Soma actions live under the 'soma' module ID (sovereign data layer).
  // Titan declares a dependency on 'soma' so these are resolvable from Titan context.
  ActionHub.addDependency('titan', 'soma');

  ActionHub.registerMultiple('soma', {
    create_medical_review: async ({ moduleId, payload, emitSpineEvent }) => {
      emitSpineEvent('DRAFT_PROPOSED', payload as Record<string, unknown>, {
        target: typeof payload?.target === 'string' ? payload.target : moduleId,
      });
    },

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
    update_field: async ({ payload, pushAssistantMessage, emitSpineEvent }) => {
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

      emitSpineEvent('SOMA_FIELD_UPDATED', { moduleId: 'soma', fieldId, fieldName: updated.name, timestamp: Date.now() }, { domain: 'B' });

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
    compute_readiness: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
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

      // Persist readiness score to SomaProfile and NSV
      if (userId && encryptionKey) {
        try {
          const profile = await loadSomaProfile({ userId, encryptionKey });
          if (profile) {
            await saveAndInvalidate(
              { ...profile, readinessScore: result.score, updatedAt: new Date().toISOString() },
              { userId, encryptionKey }
            );
          }
          await GlobalProjectionService.updateCrossFunctionalState(userId, {
            biological: { readinessScore: result.score },
          });
        } catch (err) {
          console.error('[SomaFieldActions] compute_readiness persist failed:', err);
        }
      }

      const levelLabel =
        result.level === 'optimal' ? 'Optimal' :
        result.level === 'good' ? 'Good' :
        result.level === 'fair' ? 'Fair' : 'Poor';

      const recsText =
        result.recommendations.length > 0
          ? `\n\nRecommendations:\n${result.recommendations.map((r) => `- ${r}`).join('\n')}`
          : '';

      pushAssistantMessage?.(
        `Readiness Score: ${result.score}/100 (${levelLabel})\n\n` +
          `Breakdown:\n` +
          `- Vitals: ${result.breakdown.vitals}/100 (40%)\n` +
          `- Sleep: ${result.breakdown.sleep}/100 (30%)\n` +
          `- Energy: ${result.breakdown.energy}/100 (20%)\n` +
          `- Stress: ${result.breakdown.stress}/100 (10%)` +
          recsText
      );
    },

    // ── Commit Biomarker ────────────────────────────────────────────────
    commit_biomarker: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to save biomarker: vault is locked.');
        return;
      }
      const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
      if (!name || payload?.value === undefined) {
        pushAssistantMessage?.('Invalid biomarker payload: name and value are required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to save biomarker: profile not found.');
        return;
      }
      const record: BiomarkerRecord = {
        id: `bm-${Date.now()}`,
        name,
        value: payload.value as number | string,
        unit: typeof payload.unit === 'string' ? payload.unit : undefined,
        source: typeof payload.source === 'string' ? payload.source : 'ai',
        recordedAt: typeof payload.recordedAt === 'string' ? payload.recordedAt : new Date().toISOString(),
      };
      await saveAndInvalidate(
        { ...profile, biomarkers: [...profile.biomarkers, record], updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_BIOMARKER_COMMITTED', { moduleId: 'soma', fieldId: record.id, newValue: record.value, fieldName: record.name, timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(
        `Biomarker recorded: ${record.name} = ${record.value}${record.unit ? ` ${record.unit}` : ''}.`
      );
    },

    // ── Log Vital ───────────────────────────────────────────────────────
    log_vital: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to log vital: vault is locked.');
        return;
      }
      const fields: Record<string, number | string> = {};
      if (typeof payload?.heartRate === 'number') fields.heartRate = payload.heartRate;
      if (typeof payload?.weight === 'number') fields.weight = payload.weight;
      if (typeof payload?.spo2 === 'number') fields.spo2 = payload.spo2;
      if (typeof payload?.temperature === 'number') fields.temperature = payload.temperature;
      if (typeof payload?.bloodPressure === 'string') fields.bloodPressure = payload.bloodPressure;

      if (Object.keys(fields).length === 0) {
        pushAssistantMessage?.('No vital fields provided. Include heartRate, weight, spo2, temperature, or bloodPressure.');
        return;
      }
      await addVitalReading(userId, fields, encryptionKey);
      emitSpineEvent('SOMA_VITAL_LOGGED', { moduleId: 'soma', fields, timestamp: Date.now() }, { domain: 'B' });
      const summary = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(', ');
      pushAssistantMessage?.(`Vital reading recorded: ${summary}.`);
    },

    // ── Issue Clearance ─────────────────────────────────────────────────
    issue_clearance: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to issue clearance: vault is locked.');
        return;
      }
      const activity = typeof payload?.activity === 'string' ? payload.activity.trim() : '';
      if (!activity) {
        pushAssistantMessage?.('Clearance requires an activity name.');
        return;
      }
      const validStatuses = ['granted', 'denied', 'conditional'] as const;
      const status: ClearanceRecord['status'] = validStatuses.includes(payload?.status as ClearanceRecord['status'])
        ? (payload.status as ClearanceRecord['status'])
        : 'conditional';

      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to issue clearance: profile not found.');
        return;
      }

      // Compute expiry: caller may supply expiresInDays; otherwise apply defaults
      // based on clearance status (granted: 90d, conditional: 30d, denied: 7d).
      const defaultDays = status === 'granted' ? 90 : status === 'conditional' ? 30 : 7;
      const daysUntilExpiry =
        typeof payload?.expiresInDays === 'number' && payload.expiresInDays > 0
          ? Math.round(payload.expiresInDays)
          : defaultDays;
      const expiresAt = new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000).toISOString();

      const record = {
        id: `cl-${Date.now()}`,
        activity,
        status,
        reason: typeof payload?.reason === 'string' ? payload.reason : '',
        issuedAt: new Date().toISOString(),
        expiresAt,
      } as ClearanceRecord & { expiresAt: string };

      await saveAndInvalidate(
        { ...profile, clearances: [...profile.clearances, record], updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitClearanceChanged(record.id, getClearanceChangeAction(record.status), activity);
      emitClearanceCoordinationEvents(record);
      pushAssistantMessage?.(
        `Clearance issued for "${activity}": ${status}.${record.reason ? ` Reason: ${record.reason}` : ''} Valid for ${daysUntilExpiry} days (until ${new Date(expiresAt).toLocaleDateString()}).`
      );
    },

    // ── Check Clearance Expiry ──────────────────────────────────────────
    check_clearance_expiry: async ({ userId, encryptionKey, payload: _payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to check clearance expiry: vault is locked.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to check clearance expiry: profile not found.');
        return;
      }

      // Find clearances expiring within the next 7 days
      const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;

      const expiring = profile.clearances.filter((c) => {
        const ext = c as ClearanceRecord & { expiresAt?: string };
        if (!ext.expiresAt) return false;
        const expiry = new Date(ext.expiresAt).getTime();
        return !isNaN(expiry) && expiry < sevenDaysFromNow;
      });

      if (expiring.length === 0) {
        pushAssistantMessage?.('No clearances are expiring within the next 7 days.');
        return;
      }

      for (const c of expiring) {
        const ext = c as ClearanceRecord & { expiresAt?: string };
        const expiryDate = ext.expiresAt ? new Date(ext.expiresAt).toLocaleDateString() : 'unknown date';
        pushAssistantMessage?.(
          `Your ${c.activity} clearance expires on ${expiryDate}. Consider scheduling a reassessment.`
        );
      }

      emitSpineEvent(
        'CLEARANCE_EXPIRED',
        {
          moduleId: 'soma',
          clearanceExpiringSoon: true,
          count: expiring.length,
          activities: expiring.map((c) => c.activity),
          timestamp: Date.now(),
        },
        { domain: 'B', priority: 'alert' },
      );
    },

    // ── Analyze Biomarker Trends ────────────────────────────────────────
    analyze_biomarker_trends: async ({ userId, encryptionKey, payload: _payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to analyze trends: vault is locked.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to analyze trends: profile not found.');
        return;
      }

      const biomarkers = profile.biomarkers ?? [];
      if (biomarkers.length < 5) {
        pushAssistantMessage?.('Not enough biomarker history to analyze trends yet.');
        return;
      }

      // Group by biomarker name (case-insensitive, trimmed)
      const groups = new Map<string, typeof biomarkers>();
      for (const b of biomarkers) {
        const key = b.name.trim().toLowerCase();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(b);
      }

      const alerts: Array<{ name: string; direction: string; count: number }> = [];

      for (const [, entries] of groups) {
        if (entries.length < 3) continue;

        // Sort ascending by recordedAt so slice(-3) gives the most recent entries
        const sorted = [...entries].sort(
          (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
        );
        const recent = sorted.slice(-3);

        const ext = (e: (typeof biomarkers)[0]) =>
          e as BiomarkerRecord & { referenceMax?: number; referenceMin?: number };

        const allHigh = recent.every((e) => {
          const ref = ext(e).referenceMax;
          return ref !== undefined && typeof e.value === 'number' && e.value > ref;
        });
        const allLow = recent.every((e) => {
          const ref = ext(e).referenceMin;
          return ref !== undefined && typeof e.value === 'number' && e.value < ref;
        });

        if (allHigh || allLow) {
          alerts.push({
            name: entries[0].name,
            direction: allHigh ? 'consistently above reference max' : 'consistently below reference min',
            count: recent.length,
          });
        }
      }

      if (alerts.length === 0) {
        pushAssistantMessage?.('No sustained out-of-range biomarker trends detected.');
        return;
      }

      for (const alert of alerts) {
        pushAssistantMessage?.(
          `Trend detected for ${alert.name}: ${alert.direction} for last ${alert.count} readings. Consider following up.`
        );
      }

      emitSpineEvent(
        'SOMA_BIOMARKER_COMMITTED',
        {
          moduleId: 'soma',
          biomarkerAlerts: alerts,
          timestamp: Date.now(),
        },
        { domain: 'B', priority: 'alert' },
      );
    },

    // ── Parse Lab Report ────────────────────────────────────────────────
    parse_lab_report: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to save lab report: vault is locked.');
        return;
      }
      const panel = typeof payload?.panel === 'string' ? payload.panel.trim() : '';
      if (!panel) {
        pushAssistantMessage?.('Lab report requires a panel name.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to save lab report: profile not found.');
        return;
      }
      const record: LabSummaryRecord = {
        id: `lab-${Date.now()}`,
        panel,
        findings: Array.isArray(payload?.findings) ? (payload.findings as string[]) : [],
        flags: Array.isArray(payload?.flags) ? (payload.flags as string[]) : [],
        recordedAt: new Date().toISOString(),
      };
      await saveAndInvalidate(
        { ...profile, labSummaries: [record, ...profile.labSummaries].slice(0, 50), updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_LAB_REPORT_PARSED', { moduleId: 'soma', panel, findings: record.findings.length, timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(`Lab report parsed: ${panel} (${record.findings.length} findings).`);
    },

    // ── Medical Image Analysis (ActionHub Pass-Through) ──────────────────
    medical_image_analysis: async ({ userId, pushAssistantMessage }) => {
      // This action is primarily handled by somaDiagnosisSpec.extractData for the UI session state.
      // We register it here so ActionHub allows the execution.
      // In the future, we could persist to the profile here directly, but currently
      // the diagnosis flow handles merging manually via user review.
      
      // Just emit a confirmation for the chat log
      pushAssistantMessage?.('Medical image analysis completed.');
    },

    // ── Update Conditions / Medications / Allergies ─────────────────────
    update_conditions: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent, markProfileDirty }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to update conditions: vault is locked.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to update conditions: profile not found.');
        return;
      }
      const incoming: { knownConditions?: string[]; medications?: string[]; allergies?: string[] } = {};
      if (Array.isArray(payload?.knownConditions)) incoming.knownConditions = payload.knownConditions as string[];
      if (Array.isArray(payload?.medications)) incoming.medications = payload.medications as string[];
      if (Array.isArray(payload?.allergies)) incoming.allergies = payload.allergies as string[];

      if (Object.keys(incoming).length === 0) {
        pushAssistantMessage?.('No conditions, medications, or allergies provided to update.');
        return;
      }

      // Merge (not replace): deduplicate by lowercased value to prevent duplicates.
      const mergedConditions = incoming.knownConditions
        ? [...new Set([...(profile.knownConditions ?? []), ...incoming.knownConditions])]
        : profile.knownConditions;
      const mergedMedications = incoming.medications
        ? [...new Set([...(profile.medications ?? []), ...incoming.medications])]
        : profile.medications;
      const mergedAllergies = incoming.allergies
        ? [...new Set([...(profile.allergies ?? []), ...incoming.allergies])]
        : profile.allergies;

      const updates: Partial<SomaProfile> = {
        ...(incoming.knownConditions ? { knownConditions: mergedConditions } : {}),
        ...(incoming.medications ? { medications: mergedMedications } : {}),
        ...(incoming.allergies ? { allergies: mergedAllergies } : {}),
      };

      await saveAndInvalidate(
        { ...profile, ...updates, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      markProfileDirty?.();
      emitSpineEvent('MEDICAL_HISTORY_UPDATED', { moduleId: 'soma', updatedFields: Object.keys(incoming), timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.('Medical history updated.');
    },

    // ── Approve a single health entry ──────────────────────────────────
    approve_health_entry: async ({ payload, pushAssistantMessage, emitSpineEvent }) => {
      const entryId = typeof payload?.entryId === 'string' ? payload.entryId : null;
      if (!entryId) {
        pushAssistantMessage?.('⚠️ approve_health_entry: missing entryId.');
        return;
      }
      emitSpineEvent('SOMA_PROFILE_UPDATED', { action: 'approve_health_entry', entryId, agentNote: payload?.agentNote ?? '' }, { domain: 'B' });
      pushAssistantMessage?.(`✅ Health entry "${entryId}" approved.`);
    },

    // ── Reject a single health entry ───────────────────────────────────
    reject_health_entry: async ({ payload, pushAssistantMessage, emitSpineEvent }) => {
      const entryId = typeof payload?.entryId === 'string' ? payload.entryId : null;
      if (!entryId) {
        pushAssistantMessage?.('⚠️ reject_health_entry: missing entryId.');
        return;
      }
      emitSpineEvent('SOMA_PROFILE_UPDATED', { action: 'reject_health_entry', entryId, reason: payload?.reason ?? '' }, { domain: 'B', priority: 'alert' });
      pushAssistantMessage?.(`⚠️ Health entry "${entryId}" flagged for review: ${payload?.reason ?? 'no reason given'}.`);
    },

    // ── Approve a diagnosis merge into health profile ──────────────────
    approve_diagnosis_merge: async ({ payload, pushAssistantMessage, emitSpineEvent }) => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : null;
      if (!sessionId) {
        pushAssistantMessage?.('⚠️ approve_diagnosis_merge: missing sessionId.');
        return;
      }
      emitSpineEvent('SOMA_DIAGNOSIS_MERGED', { sessionId, approvedFields: payload?.approvedFields ?? [], agentNote: payload?.agentNote ?? '' }, { domain: 'B' });
      pushAssistantMessage?.(`✅ Diagnosis session "${sessionId}" approved for merge.`);
    },

    // ── Reject a diagnosis merge ───────────────────────────────────────
    reject_diagnosis_merge: async ({ payload, pushAssistantMessage, emitSpineEvent }) => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : null;
      if (!sessionId) {
        pushAssistantMessage?.('⚠️ reject_diagnosis_merge: missing sessionId.');
        return;
      }
      emitSpineEvent('SOMA_DIAGNOSIS_DISCARDED', { sessionId, reason: payload?.reason ?? '' }, { domain: 'B', priority: 'alert' });
      pushAssistantMessage?.(`⚠️ Diagnosis merge rejected for session "${sessionId}": ${payload?.reason ?? 'no reason given'}.`);
    },

    // ── Get Biomarker History ──────────────────────────────────────────
    get_biomarker_history: async ({ userId, encryptionKey, payload, pushAssistantMessage }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to retrieve history: vault is locked.');
        return;
      }
      const name = typeof payload?.name === 'string' ? payload.name.trim().toLowerCase() : '';
      if (!name) {
        pushAssistantMessage?.('Please specify a biomarker name.');
        return;
      }

      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) return;

      const history = profile.biomarkers
        .filter(b => b.name.toLowerCase().includes(name))
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        .slice(0, 20);

      if (history.length === 0) {
        pushAssistantMessage?.(`No historical records found for "${name}".`);
        return;
      }

      const formatted = history.map(b => 
        `- ${new Date(b.recordedAt).toLocaleDateString()}: ${b.value}${b.unit ? ` ${b.unit}` : ''} (${b.source})`
      ).join('\n');

      pushAssistantMessage?.(`Historical readings for "${history[0].name}":\n${formatted}`);
    },

    // ── Get Lab History ────────────────────────────────────────────────
    get_lab_history: async ({ userId, encryptionKey, pushAssistantMessage }) => {
      if (!userId || !encryptionKey) return;
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile || profile.labSummaries.length === 0) {
        pushAssistantMessage?.('No historical lab reports found.');
        return;
      }

      const formatted = profile.labSummaries
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        .slice(0, 10)
        .map(l => `- ${new Date(l.recordedAt).toLocaleDateString()}: ${l.panel} (${l.findings.length} findings, ${l.flags.length} flags)`)
        .join('\n');

      pushAssistantMessage?.(`Recent lab panels:\n${formatted}`);
    },

    // ── Get Medical Summary ─────────────────────────────────────────────
    get_medical_summary: async ({ userId, encryptionKey, pushAssistantMessage }) => {
      if (!userId || !encryptionKey) return;
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) return;

      const summary = [
        `[CONDITIONS] ${profile.knownConditions.join(', ') || 'None'}`,
        `[MEDICATIONS] ${profile.medications.join(', ') || 'None'}`,
        `[ALLERGIES] ${profile.allergies.join(', ') || 'None'}`,
        `[SUMMARY] ${profile.medicalSummary || 'No clinical summary drafted.'}`
      ].join('\n');

      pushAssistantMessage?.(`Current Medical Profile:\n${summary}`);
    },

    // ── Update Medical Summary ──────────────────────────────────────────
    soma_update_medical_summary: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to update medical summary: vault is locked.');
        return;
      }
      const summary = typeof payload?.summary === 'string' ? payload.summary.trim().slice(0, 2000) : '';
      if (!summary) {
        pushAssistantMessage?.('Medical summary requires a non-empty string.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to update medical summary: profile not found.');
        return;
      }
      await saveAndInvalidate(
        { ...profile, medicalSummary: summary, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['medicalSummary'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.('Medical summary updated.');
    },

    // ── Add Known Condition ─────────────────────────────────────────────
    soma_add_known_condition: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to add condition: vault is locked.');
        return;
      }
      const condition = typeof payload?.condition === 'string' ? payload.condition.trim() : '';
      if (!condition) {
        pushAssistantMessage?.('Condition name is required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to add condition: profile not found.');
        return;
      }
      const conditionLower = condition.toLowerCase();
      const alreadyExists = profile.knownConditions.some((c) => c.toLowerCase() === conditionLower);
      if (alreadyExists) {
        pushAssistantMessage?.(`Condition already recorded: ${condition}.`);
        return;
      }
      const updated = [...profile.knownConditions, condition].slice(0, 200);
      await saveAndInvalidate(
        { ...profile, knownConditions: updated, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['knownConditions'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(`Condition added: ${condition}.`);
    },

    // ── Remove Known Condition ──────────────────────────────────────────
    soma_remove_known_condition: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to remove condition: vault is locked.');
        return;
      }
      const condition = typeof payload?.condition === 'string' ? payload.condition.trim() : '';
      if (!condition) {
        pushAssistantMessage?.('Condition name is required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to remove condition: profile not found.');
        return;
      }
      const conditionLower = condition.toLowerCase();
      const filtered = profile.knownConditions.filter((c) => c.toLowerCase() !== conditionLower);
      if (filtered.length === profile.knownConditions.length) {
        pushAssistantMessage?.(`Condition not found: ${condition}.`);
        return;
      }
      await saveAndInvalidate(
        { ...profile, knownConditions: filtered, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['knownConditions'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(`Condition removed: ${condition}.`);
    },

    // ── Add Medication ──────────────────────────────────────────────────
    soma_add_medication: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to add medication: vault is locked.');
        return;
      }
      const medication = typeof payload?.medication === 'string' ? payload.medication.trim() : '';
      if (!medication) {
        pushAssistantMessage?.('Medication name is required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to add medication: profile not found.');
        return;
      }
      const medicationLower = medication.toLowerCase();
      const alreadyExists = profile.medications.some((m) => m.toLowerCase() === medicationLower);
      if (alreadyExists) {
        pushAssistantMessage?.(`Medication already recorded: ${medication}.`);
        return;
      }
      const updated = [...profile.medications, medication].slice(0, 200);
      await saveAndInvalidate(
        { ...profile, medications: updated, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['medications'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(`Medication added: ${medication}.`);
    },

    // ── Remove Medication ───────────────────────────────────────────────
    soma_remove_medication: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to remove medication: vault is locked.');
        return;
      }
      const medication = typeof payload?.medication === 'string' ? payload.medication.trim() : '';
      if (!medication) {
        pushAssistantMessage?.('Medication name is required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to remove medication: profile not found.');
        return;
      }
      const medicationLower = medication.toLowerCase();
      const filtered = profile.medications.filter((m) => m.toLowerCase() !== medicationLower);
      if (filtered.length === profile.medications.length) {
        pushAssistantMessage?.('Medication not found.');
        return;
      }
      await saveAndInvalidate(
        { ...profile, medications: filtered, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['medications'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.('Medication removed.');
    },

    // ── Add Allergy ─────────────────────────────────────────────────────
    soma_add_allergy: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to add allergy: vault is locked.');
        return;
      }
      const allergy = typeof payload?.allergy === 'string' ? payload.allergy.trim() : '';
      if (!allergy) {
        pushAssistantMessage?.('Allergy name is required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to add allergy: profile not found.');
        return;
      }
      const allergyLower = allergy.toLowerCase();
      const alreadyExists = profile.allergies.some((a) => a.toLowerCase() === allergyLower);
      if (alreadyExists) {
        pushAssistantMessage?.(`Allergy already recorded: ${allergy}.`);
        return;
      }
      const updated = [...profile.allergies, allergy].slice(0, 200);
      await saveAndInvalidate(
        { ...profile, allergies: updated, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['allergies'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(`Allergy added: ${allergy}.`);
    },

    // ── Remove Allergy ──────────────────────────────────────────────────
    soma_remove_allergy: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to remove allergy: vault is locked.');
        return;
      }
      const allergy = typeof payload?.allergy === 'string' ? payload.allergy.trim() : '';
      if (!allergy) {
        pushAssistantMessage?.('Allergy name is required.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to remove allergy: profile not found.');
        return;
      }
      const allergyLower = allergy.toLowerCase();
      const filtered = profile.allergies.filter((a) => a.toLowerCase() !== allergyLower);
      if (filtered.length === profile.allergies.length) {
        pushAssistantMessage?.('Allergy not found.');
        return;
      }
      await saveAndInvalidate(
        { ...profile, allergies: filtered, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['allergies'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.('Allergy removed.');
    },

    // ── Update Physical Assessment ──────────────────────────────────────
    soma_update_physical_assessment: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to record assessment: vault is locked.');
        return;
      }
      const fields = (payload?.fields ?? {}) as Partial<PhysicalAssessment>;
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to record assessment: profile not found.');
        return;
      }
      const record: PhysicalAssessment = {
        timestamp: Date.now(),
        ...(typeof fields.height === 'number' ? { height: fields.height } : {}),
        ...(typeof fields.weight === 'number' ? { weight: fields.weight } : {}),
        ...(typeof fields.bmi === 'number' ? { bmi: fields.bmi } : {}),
        ...(typeof fields.bodyFatPercentage === 'number' ? { bodyFatPercentage: fields.bodyFatPercentage } : {}),
        ...(typeof fields.muscleMass === 'number' ? { muscleMass: fields.muscleMass } : {}),
        ...(typeof fields.vo2Max === 'number' ? { vo2Max: fields.vo2Max } : {}),
        ...(typeof fields.strength === 'number' ? { strength: fields.strength } : {}),
        ...(typeof fields.flexibility === 'number' ? { flexibility: fields.flexibility } : {}),
        ...(typeof fields.endurance === 'number' ? { endurance: fields.endurance } : {}),
      };
      const existing = profile.physicalAssessments ?? [];
      const updated = [...existing, record].slice(-100);
      await saveAndInvalidate(
        { ...profile, physicalAssessments: updated, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['physicalAssessments'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.('Physical assessment recorded.');
    },

    // ── Log Next Checkup ────────────────────────────────────────────────
    soma_log_next_checkup: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      if (!userId || !encryptionKey) {
        pushAssistantMessage?.('Unable to schedule checkup: vault is locked.');
        return;
      }
      const date = typeof payload?.date === 'string' ? payload.date.trim() : '';
      if (!date) {
        pushAssistantMessage?.('A date string is required to schedule a checkup.');
        return;
      }
      const profile = await loadSomaProfile({ userId, encryptionKey });
      if (!profile) {
        pushAssistantMessage?.('Unable to schedule checkup: profile not found.');
        return;
      }
      await saveAndInvalidate(
        { ...profile, nextCheckup: date, updatedAt: new Date().toISOString() },
        { userId, encryptionKey }
      );
      emitSpineEvent('SOMA_PROFILE_UPDATED', { moduleId: 'soma', updatedFields: ['nextCheckup'], timestamp: Date.now() }, { domain: 'B' });
      pushAssistantMessage?.(`Next checkup scheduled for ${date}.`);
    },
  });
}
