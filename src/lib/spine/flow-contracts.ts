import { FlowContractsJs } from '@cortex-logic';
import type { ModuleId } from '@/lib/module-manifest';
import type { SpineEvent, SpineEventPayload } from '@/lib/types';

const _service = new FlowContractsJs();

export const FLOW_SCHEMA_VERSION = 1;

export type ReadinessLevel = 'critical' | 'poor' | 'fair' | 'good' | 'optimal';

export function createFlowMeta(
  source: string,
  flowId?: string,
): Pick<SpineEventPayload, 'flowId' | 'originId' | 'schemaVersion'> {
  return JSON.parse(
    _service.createFlowMeta(source, flowId ?? null),
  ) as Pick<SpineEventPayload, 'flowId' | 'originId' | 'schemaVersion'>;
}

export function deriveReadinessLevel(score: number | null): ReadinessLevel | null {
  const result = _service.deriveReadinessLevel(score);
  // KMP returns the string value or empty string for null
  return result === '' || result === 'null' ? null : (result as ReadinessLevel);
}

export function resolveReadinessScore(data: Record<string, unknown> | undefined): number | null {
  const result = _service.resolveReadinessScore(data !== undefined ? JSON.stringify(data) : null);
  if (result === null || result === 'null') return null;
  const parsed = Number(result);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isCriticalReadiness(data: Record<string, unknown> | undefined): boolean {
  return _service.isCriticalReadiness(data !== undefined ? JSON.stringify(data) : null) as boolean;
}

export function isPhysicalCommitmentMissed(event: Pick<SpineEvent, 'domain' | 'data'>): boolean {
  const domain = typeof event.domain === 'string' ? event.domain : '';
  const dataJson = event.data ? JSON.stringify(event.data) : null;
  return _service.isPhysicalCommitmentMissed(domain, dataJson) as boolean;
}

export function isDelegationCompletionSignal(event: SpineEvent): boolean {
  const eventType = typeof event.type === 'string' ? event.type : '';
  const dataJson = event.data ? JSON.stringify(event.data) : null;
  return _service.isDelegationCompletionSignal(eventType, dataJson) as boolean;
}

export function parseDelegationTarget(event: SpineEvent): ModuleId | null {
  const result = _service.parseDelegationTarget(JSON.stringify(event));
  return result === '' || result === 'null' ? null : (result as ModuleId);
}
