import { describe, expect, it } from 'vitest';
import type { SpineEvent } from '@/lib/types';
import {
  createFlowMeta,
  deriveReadinessLevel,
  isCriticalReadiness,
  isDelegationCompletionSignal,
  isPhysicalCommitmentMissed,
  resolveReadinessScore,
} from './flow-contracts';

function makeEvent(overrides: Partial<SpineEvent>): SpineEvent {
  return {
    id: 'evt-1',
    type: 'MODULE_DELEGATED',
    source: 'nexus',
    domain: 'system',
    data: {},
    timestamp: Date.now(),
    cascadeDepth: 0,
    priority: 'info',
    sequence: 1,
    idempotencyKey: 'k1',
    ...overrides,
  };
}

describe('flow-contracts', () => {
  it('resolves readiness score from canonical and legacy keys', () => {
    expect(resolveReadinessScore({ score: 72 })).toBe(72);
    expect(resolveReadinessScore({ readinessScore: 45 })).toBe(45);
    expect(resolveReadinessScore({})).toBeNull();
  });

  it('derives readiness level from normalized score', () => {
    expect(deriveReadinessLevel(30)).toBe('critical');
    expect(deriveReadinessLevel(55)).toBe('poor');
    expect(deriveReadinessLevel(70)).toBe('fair');
    expect(deriveReadinessLevel(85)).toBe('good');
    expect(deriveReadinessLevel(95)).toBe('optimal');
  });

  it('treats poor or critical readiness as critical path', () => {
    expect(isCriticalReadiness({ score: 39 })).toBe(true);
    expect(isCriticalReadiness({ level: 'poor' })).toBe(true);
    expect(isCriticalReadiness({ score: 65, level: 'fair' })).toBe(false);
  });

  it('detects physical commitment flow via domain, impactDomain, or module affinity', () => {
    expect(isPhysicalCommitmentMissed(makeEvent({ type: 'COMMITMENT_MISSED', domain: 'B' }))).toBe(true);
    expect(isPhysicalCommitmentMissed(makeEvent({ type: 'COMMITMENT_MISSED', domain: 'C', data: { impactDomain: 'physical' } }))).toBe(true);
    expect(isPhysicalCommitmentMissed(makeEvent({ type: 'COMMITMENT_MISSED', domain: 'C', data: { moduleAffinity: ['titan'] } }))).toBe(true);
    expect(isPhysicalCommitmentMissed(makeEvent({ type: 'COMMITMENT_MISSED', domain: 'C', data: { impactDomain: 'cognitive' } }))).toBe(false);
  });

  it('detects delegation completion signals', () => {
    expect(isDelegationCompletionSignal(makeEvent({ type: 'MODULE_DELEGATED', target: 'nexus', data: { reason: 'query_result' } }))).toBe(true);
    expect(isDelegationCompletionSignal(makeEvent({ type: 'MODULE_DELEGATED', target: 'nexus', data: { status: 'completed' } }))).toBe(true);
    expect(isDelegationCompletionSignal(makeEvent({ type: 'MODULE_PROFILE_UPDATED' }))).toBe(true);
    expect(isDelegationCompletionSignal(makeEvent({ type: 'MODULE_DELEGATED', data: { reason: 'delegated' } }))).toBe(false);
  });

  it('creates schema-tagged flow metadata', () => {
    const meta = createFlowMeta('scout', 'flow-1');
    expect(meta.flowId).toBe('flow-1');
    expect(meta.originId).toBe('scout');
    expect(meta.schemaVersion).toBe(1);
  });
});
