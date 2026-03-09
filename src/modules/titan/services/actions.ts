import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { TitanProfile, Routine, BiomarkerRecord, ClearanceRecord, MedicalImageAnalysis } from '@/lib/types';
import { mergeTitanProfile, normalizeRoutines } from '../utils';
import { normalizeTitanProfilePatch } from '../onboarding/intake-accumulator';
import { loadTitanProfile, saveTitanProfile } from './titan-profile-service';
import { ClearanceService } from '@/modules/soma/services/clearance-service';
import { parseHealthReport, parseWorkoutLog, parseBiometricData } from '@/lib/actions/parsing-actions';

let registered = false;

export function parseNumericValue(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadTitanProfile({ userId, encryptionKey });
}

async function persistProfile(profile: TitanProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  await saveTitanProfile(profile, { userId, encryptionKey });
}

/** All action names registered by Titan (including absorbed Soma actions). */
export const titanAllowedActions = [
  'update_titan_profile',
  'update_routine',
  'commit_biomarker',
  'parse_lab_report',
  'issue_clearance',
  'analyze_medical_image',
  'sync_vitals',
  'self_clearance_check',
  'parse_health_report',
  'parse_workout_log',
  'parse_biometric_data',
] as const;

export function registerTitanActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('titan', {
    // ── Existing Titan actions ──────────────────────────────────────────

    update_titan_profile: async ({ userId, encryptionKey, payload }) => {
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) return;

      const normalizedPatch = normalizeTitanProfilePatch(payload as Partial<TitanProfile>);
      const nextProfile = mergeTitanProfile({ ...current }, normalizedPatch);
      nextProfile.updatedAt = new Date().toISOString();
      await persistProfile(nextProfile, userId ?? null, encryptionKey ?? null);
    },

    update_routine: async ({ userId, encryptionKey, payload }) => {
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) return;

      if (!payload?.routines) return;
      const nextProfile: TitanProfile = {
        ...current,
        routines: normalizeRoutines(payload.routines as Routine[]),
        updatedAt: new Date().toISOString()
      };
      await persistProfile(nextProfile, userId ?? null, encryptionKey ?? null);
    },

    // ── Absorbed Soma actions ───────────────────────────────────────────

    commit_biomarker: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const record: BiomarkerRecord = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        name: typeof payload?.name === 'string' ? payload.name : 'biomarker',
        value: parseNumericValue(payload?.value),
        unit: typeof payload?.unit === 'string' ? payload.unit : undefined,
        source: typeof payload?.source === 'string' ? payload.source : undefined,
        recordedAt: typeof payload?.recordedAt === 'string' ? payload.recordedAt : new Date().toISOString()
      };

      const next: TitanProfile = {
        ...profile,
        biomarkers: [record, ...profile.biomarkers].slice(0, 200),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    parse_lab_report: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const summary = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        panel: typeof payload?.panel === 'string' ? payload.panel : 'lab panel',
        findings: Array.isArray(payload?.findings) ? payload.findings.filter((item: unknown) => typeof item === 'string') : [],
        flags: Array.isArray(payload?.flags) ? payload.flags.filter((item: unknown) => typeof item === 'string') : [],
        recordedAt: new Date().toISOString()
      };

      const next: TitanProfile = {
        ...profile,
        labSummaries: [summary, ...profile.labSummaries].slice(0, 50),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    issue_clearance: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const clearance: ClearanceRecord = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        activity: typeof payload?.activity === 'string' ? payload.activity : 'activity',
        status:
          payload?.status === 'granted' || payload?.status === 'denied' || payload?.status === 'conditional'
            ? payload.status
            : 'conditional',
        reason: typeof payload?.reason === 'string' ? payload.reason : 'No reason provided.',
        issuedAt: new Date().toISOString()
      };

      const next: TitanProfile = {
        ...profile,
        clearances: [clearance, ...profile.clearances].slice(0, 100),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      /** @deprecated CLEARANCE_GRANTED / CLEARANCE_DENIED — kept for backward compat with cascade rules */
      Spine.emit({
        type: clearance.status === 'granted' ? 'CLEARANCE_GRANTED' : 'CLEARANCE_DENIED',
        source: 'titan',
        target: 'titan',
        domain: 'B',
        data: {
          activity: clearance.activity,
          status: clearance.status,
          reason: clearance.reason
        },
        cascadeDepth: 0,
        priority: clearance.status === 'granted' ? 'info' : 'alert'
      });

      // Emit BLOCK_HIGH_INTENSITY when clearance is denied (for Atlas cascade)
      if (clearance.status === 'denied') {
        Spine.emit({
          type: 'BLOCK_HIGH_INTENSITY',
          source: 'titan',
          domain: 'B',
          data: {
            activity: clearance.activity,
            reason: clearance.reason
          },
          cascadeDepth: 0,
          priority: 'alert'
        });
      }
    },

    analyze_medical_image: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const biomarkers = Array.isArray(payload?.biomarkers) ? payload.biomarkers : [];
      const labSummaries = Array.isArray(payload?.labSummaries) ? payload.labSummaries : [];
      const medications = Array.isArray(payload?.medications) ? payload.medications : [];
      const allergies = Array.isArray(payload?.allergies) ? payload.allergies : [];
      const clinicalFlags = Array.isArray(payload?.clinicalFlags) ? payload.clinicalFlags : [];

      const newBiomarkers = biomarkers
        .filter((b: unknown) => b && typeof b === 'object')
        .map((b: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          name: typeof b.name === 'string' ? b.name : 'biomarker',
          value: parseNumericValue(b.value),
          unit: typeof b.unit === 'string' ? b.unit : undefined,
          source: 'medical_image_analysis',
          recordedAt: new Date().toISOString()
        }));

      const newLabSummaries = labSummaries
        .filter((l: unknown) => l && typeof l === 'object')
        .map((l: Record<string, unknown>) => ({
          id: crypto.randomUUID(),
          panel: typeof l.test === 'string' ? l.test : 'extracted_panel',
          findings: [typeof l.summary === 'string' ? l.summary : 'Analysis from medical image'],
          flags: clinicalFlags
            .filter((f: unknown) => f && typeof f === 'object')
            .map((f: Record<string, unknown>) => typeof f.flag === 'string' ? f.flag : 'flag')
            .slice(0, 5),
          recordedAt: new Date().toISOString()
        }));

      const newMedications = medications
        .filter((m: unknown) => typeof m === 'string' || (m && typeof m === 'object'))
        .map((m: unknown) => {
          if (typeof m === 'string') return m;
          const med = m as Record<string, unknown>;
          return typeof med.name === 'string' ? med.name : 'medication';
        });

      const newAllergies = allergies
        .filter((a: unknown) => typeof a === 'string')
        .slice(0, 20);

      const analysis: MedicalImageAnalysis = {
        id: crypto.randomUUID(),
        analyzedAt: new Date().toISOString(),
        reportType: typeof payload?.reportType === 'string' ? payload.reportType : 'medical_report',
        sourceLabel: typeof payload?.sourceLabel === 'string' ? payload.sourceLabel : 'uploaded',
        biomarkerCount: newBiomarkers.length,
        clinicalFlags: clinicalFlags
          .filter((f: unknown) => f && typeof f === 'object')
          .map((f: Record<string, unknown>) => ({
            flag: typeof f.flag === 'string' ? f.flag : 'unknown',
            severity: typeof f.severity === 'string' ? f.severity : 'mild'
          }))
          .slice(0, 10)
      };

      const next: TitanProfile = {
        ...profile,
        biomarkers: [...newBiomarkers, ...profile.biomarkers].slice(0, 200),
        labSummaries: [...newLabSummaries, ...profile.labSummaries].slice(0, 50),
        medications: [...newMedications, ...profile.medications].slice(0, 100),
        allergies: [...newAllergies, ...profile.allergies].slice(0, 50),
        medicalImageAnalyses: [analysis, ...profile.medicalImageAnalyses].slice(0, 100),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      // Emit MEDICAL_ALERT if severe flags found
      const severeFlags = analysis.clinicalFlags.filter(f => f.severity === 'severe');
      if (severeFlags.length > 0) {
        Spine.emit({
          type: 'MEDICAL_ALERT',
          source: 'titan',
          domain: 'B',
          data: {
            alertCount: severeFlags.length,
            flags: severeFlags.map(f => f.flag),
            reportType: analysis.reportType
          },
          cascadeDepth: 0,
          priority: 'alert'
        });
      }
    },

    sync_vitals: async ({ userId, payload }) => {
      if (!userId) return;
      const biological = payload?.biological as Record<string, unknown> | undefined;
      if (!biological || typeof biological !== 'object') return;

      const patch: Record<string, unknown> = {};

      // All 4 biological NSV fields now owned by Titan
      if (typeof biological.recoveryScore === 'number' &&
          Number.isFinite(biological.recoveryScore) &&
          biological.recoveryScore >= 0 && biological.recoveryScore <= 10) {
        patch.recoveryScore = biological.recoveryScore;
      }
      if (typeof biological.hormonalContext === 'string' && biological.hormonalContext.trim()) {
        patch.hormonalContext = biological.hormonalContext.trim();
      }
      if (typeof biological.cnsFatigue === 'number' &&
          Number.isFinite(biological.cnsFatigue) &&
          biological.cnsFatigue >= 0 && biological.cnsFatigue <= 10) {
        patch.cnsFatigue = biological.cnsFatigue;
      }
      if (typeof biological.sleepQuality === 'number' &&
          Number.isFinite(biological.sleepQuality) &&
          biological.sleepQuality >= 0 && biological.sleepQuality <= 10) {
        patch.sleepQuality = biological.sleepQuality;
      }

      if (Object.keys(patch).length > 0) {
        await GlobalProjectionService.updateCrossFunctionalState(userId, { biological: patch }).catch((e) => {
          console.error('Titan sync_vitals failed:', e);
        });
      }
    },

    self_clearance_check: async ({ userId, encryptionKey, payload, pushAssistantMessage, getLatestNSV }) => {
      const activity = typeof payload?.activity === 'string' ? payload.activity : 'high_intensity';
      const RECOVERY_THRESHOLD = 4;

      // Read recovery score from NSV
      const nsv = getLatestNSV?.() ?? {};
      const bio = (nsv.biological ?? {}) as Record<string, unknown>;
      const recoveryScore = typeof bio.recoveryScore === 'number' ? bio.recoveryScore : null;

      // Evaluate contraindications from profile
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      const clearance = profile ? ClearanceService.evaluate(profile, activity) : null;
      const hasContraindication = clearance != null && clearance.status !== 'granted';

      if (hasContraindication || (recoveryScore !== null && recoveryScore < RECOVERY_THRESHOLD)) {
        const reasons: string[] = [];
        if (recoveryScore !== null && recoveryScore < RECOVERY_THRESHOLD) {
          reasons.push(`recovery score ${recoveryScore}/10 is below threshold (${RECOVERY_THRESHOLD})`);
        }
        if (hasContraindication && clearance) {
          reasons.push(clearance.reason);
        }

        const warning = `⚠️ Clearance check failed for "${activity}": ${reasons.join('; ')}. High-intensity training is blocked.`;
        pushAssistantMessage?.(warning);

        Spine.emit({
          type: 'BLOCK_HIGH_INTENSITY',
          source: 'titan',
          domain: 'B',
          data: { activity, recoveryScore, reasons },
          cascadeDepth: 0,
          priority: 'alert',
        });
        return;
      }

      pushAssistantMessage?.(`✅ Clearance check passed for "${activity}". Recovery ${recoveryScore !== null ? `${recoveryScore}/10` : 'unknown'} — proceed safely.`);
    },

    // ── AI Parsing Actions ──────────────────────────────────────────────

    parse_health_report: parseHealthReport,
    parse_workout_log: parseWorkoutLog,
    parse_biometric_data: parseBiometricData,
  });
}
