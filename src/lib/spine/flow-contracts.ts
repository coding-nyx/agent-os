import type { ModuleId } from '@/lib/module-manifest';
import type { SpineEvent, SpineEventPayload } from '@/lib/types';

export const FLOW_SCHEMA_VERSION = 1;

export type ReadinessLevel = 'critical' | 'poor' | 'fair' | 'good' | 'optimal';

export function createFlowMeta(source: string, flowId?: string): Pick<SpineEventPayload, 'flowId' | 'originId' | 'schemaVersion'> {
  return {
    flowId: flowId ?? crypto.randomUUID(),
    originId: source,
    schemaVersion: FLOW_SCHEMA_VERSION,
  };
}

export function deriveReadinessLevel(score: number | null): ReadinessLevel | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  if (score < 0) return null;
  if (score < 40) return 'critical';
  if (score < 60) return 'poor';
  if (score < 80) return 'fair';
  if (score < 90) return 'good';
  return 'optimal';
}

export function resolveReadinessScore(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const score = data.score;
  if (typeof score === 'number' && Number.isFinite(score)) return score;
  const legacyScore = data.readinessScore;
  if (typeof legacyScore === 'number' && Number.isFinite(legacyScore)) return legacyScore;
  return null;
}

export function isCriticalReadiness(data: Record<string, unknown> | undefined): boolean {
  const score = resolveReadinessScore(data);
  if (typeof score === 'number' && score < 40) return true;
  const level = typeof data?.level === 'string' ? data.level.toLowerCase() : '';
  return level === 'critical' || level === 'poor';
}

export function isPhysicalCommitmentMissed(event: Pick<SpineEvent, 'domain' | 'data'>): boolean {
  const rawImpactDomain = event.data?.impactDomain;
  if (typeof rawImpactDomain === 'string' && rawImpactDomain.toLowerCase() === 'physical') return true;
  const legacyDomain = event.data?.domain;
  if (typeof legacyDomain === 'string' && legacyDomain.toLowerCase() === 'physical') return true;
  const affinities = event.data?.moduleAffinity;
  if (Array.isArray(affinities) && affinities.some((entry) => entry === 'titan' || entry === 'physical')) return true;
  return event.domain === 'B';
}

export function isDelegationCompletionSignal(event: SpineEvent): boolean {
  if (event.type === 'VITAL_UPDATED' || event.type === 'MODULE_PROFILE_UPDATED' || event.type === 'AI_LINK_FAILURE') {
    return true;
  }
  if (event.type !== 'MODULE_DELEGATED') return false;
  const reason = typeof event.data?.reason === 'string' ? event.data.reason : '';
  if (reason === 'query_result') return true;
  const status = typeof event.data?.status === 'string' ? event.data.status.toLowerCase() : '';
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout';
}

export function parseDelegationTarget(event: SpineEvent): ModuleId | null {
  if (typeof event.target === 'string') return event.target as ModuleId;
  const target = event.data?.targetModuleId;
  if (typeof target === 'string') return target as ModuleId;
  return null;
}
