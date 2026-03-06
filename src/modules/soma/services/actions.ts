import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import {
  BiomarkerRecord,
  ClearanceRecord,
  SomaProfile,
  loadSomaProfile,
  saveSomaProfile
} from './soma-profile-service';

let registered = false;

export function parseNumericValue(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadSomaProfile({ userId, encryptionKey });
}

async function persistProfile(profile: SomaProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  await saveSomaProfile(profile, { userId, encryptionKey });
}

export function registerSomaActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('soma', {
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

      const next: SomaProfile = {
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

      const next: SomaProfile = {
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

      const next: SomaProfile = {
        ...profile,
        clearances: [clearance, ...profile.clearances].slice(0, 100),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      Spine.emit({
        type: clearance.status === 'granted' ? 'CLEARANCE_GRANTED' : 'CLEARANCE_DENIED',
        source: 'soma',
        target: 'trainer',
        domain: 'B',
        data: {
          activity: clearance.activity,
          status: clearance.status,
          reason: clearance.reason
        },
        cascadeDepth: 0,
        priority: clearance.status === 'granted' ? 'info' : 'alert'
      });
    },

    sync_vitals: async ({ userId, payload }) => {
      if (!userId) return;
      const biological = payload?.biological as Record<string, unknown> | undefined;
      if (!biological || typeof biological !== 'object') return;

      const patch: Record<string, unknown> = {};
      // Only write Soma-owned metrics
      if (typeof biological.recoveryScore === 'number' && 
          Number.isFinite(biological.recoveryScore) && 
          biological.recoveryScore >= 0 && biological.recoveryScore <= 10) {
        patch.recoveryScore = biological.recoveryScore;
      }
      if (typeof biological.hormonalContext === 'string' && biological.hormonalContext.trim()) {
        patch.hormonalContext = biological.hormonalContext.trim();
      }

      if (Object.keys(patch).length > 0) {
        await GlobalProjectionService.updateCrossFunctionalState(userId, { biological: patch }).catch((e) => {
          console.error('Soma sync_vitals failed:', e);
        });
      }
    }
  });
}
