import type { BiomarkerRecord, ClearanceRecord } from '@/lib/types';
import { Spine } from '@/lib/spine/spine-event-bus';
import { SomaDataService } from '@/modules/soma/services/soma-data-service';

type DelegationSource = 'titan_action' | 'titan_diagnosis';

function parseNumericOrText(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

export const SomaTitanDelegationService = {
  async commitBiomarker(params: {
    userId?: string | null;
    encryptionKey?: CryptoKey | null;
    payload: Record<string, unknown>;
    source: DelegationSource;
  }): Promise<BiomarkerRecord | null> {
    const { userId, encryptionKey, payload, source } = params;
    if (!userId || !encryptionKey) return null;

    const biomarker: BiomarkerRecord = {
      id: typeof payload.id === 'string' ? payload.id : crypto.randomUUID(),
      name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'biomarker',
      value: parseNumericOrText(payload.value),
      unit: typeof payload.unit === 'string' ? payload.unit : undefined,
      source: typeof payload.source === 'string' ? payload.source : source,
      recordedAt: typeof payload.recordedAt === 'string' ? payload.recordedAt : new Date().toISOString(),
    };

    await SomaDataService.updateBiomarker(userId, biomarker, encryptionKey);
    Spine.emit({
      type: 'MODULE_DELEGATED',
      source: 'titan',
      target: 'soma',
      domain: 'B',
      data: {
        moduleId: 'titan',
        delegatedTo: 'soma',
        operation: 'commit_biomarker',
        biomarkerId: biomarker.id,
      },
      cascadeDepth: 0,
      priority: 'info',
    });
    return biomarker;
  },

  async issueClearance(params: {
    userId?: string | null;
    encryptionKey?: CryptoKey | null;
    payload: Record<string, unknown>;
    source: DelegationSource;
  }): Promise<ClearanceRecord | null> {
    const { userId, encryptionKey, payload, source } = params;
    if (!userId || !encryptionKey) return null;

    const clearance: ClearanceRecord = {
      id: typeof payload.id === 'string' ? payload.id : crypto.randomUUID(),
      activity: typeof payload.activity === 'string' ? payload.activity : 'activity',
      status:
        payload.status === 'granted' || payload.status === 'denied' || payload.status === 'conditional'
          ? payload.status
          : 'conditional',
      reason: typeof payload.reason === 'string' ? payload.reason : `Clearance issued via ${source}.`,
      issuedAt: typeof payload.issuedAt === 'string' ? payload.issuedAt : new Date().toISOString(),
    };

    await SomaDataService.addClearance(userId, clearance, encryptionKey);
    Spine.emit({
      type: 'MODULE_DELEGATED',
      source: 'titan',
      target: 'soma',
      domain: 'B',
      data: {
        moduleId: 'titan',
        delegatedTo: 'soma',
        operation: 'issue_clearance',
        clearanceId: clearance.id,
      },
      cascadeDepth: 0,
      priority: 'info',
    });
    return clearance;
  },
};
