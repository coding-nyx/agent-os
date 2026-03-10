import { describe, expect, it } from 'vitest';
import type { SpineEventPayload } from '@/lib/types';
import { CORE_CASCADE_RULES } from './cascade-rules';

function getRule(ruleId: string) {
  const rule = CORE_CASCADE_RULES.find((entry) => entry.id === ruleId);
  if (!rule) {
    throw new Error(`Missing cascade rule: ${ruleId}`);
  }
  return rule;
}

function makeEvent(overrides: Partial<SpineEventPayload>): SpineEventPayload {
  return {
    type: 'VITAL_UPDATED',
    source: 'test',
    domain: 'B',
    priority: 'info',
    data: {},
    cascadeDepth: 0,
    ...overrides,
  };
}

describe('CORE_CASCADE_RULES v2', () => {
  it('detects burnout from high fatigue + low resilience', () => {
    const rule = getRule('burnout-warning');

    const hot = makeEvent({
      data: { cnsFatigue: 9, emotionalResilience: 2 }
    });
    const cool = makeEvent({
      data: { cnsFatigue: 6, emotionalResilience: 6 }
    });

    expect(rule.condition(hot)).toBe(true);
    expect(rule.condition(cool)).toBe(false);
  });

  it('emits FLATTEN_ENERGY_WAVE when burnout warning triggers', () => {
    const rule = getRule('burnout-flatten-wave');
    const result = rule.transform(
      makeEvent({
        type: 'BURNOUT_WARNING',
        domain: 'system',
        priority: 'critical',
        data: { reason: 'high_fatigue_low_resilience' }
      })
    );

    expect(result.type).toBe('FLATTEN_ENERGY_WAVE');
    expect(result.target).toBe('atlas');
    expect(result.data.reason).toBe('burnout_warning');
  });

  it('emits FLATTEN_ENERGY_WAVE when high-intensity training is blocked', () => {
    const rule = getRule('intensity-flatten-wave');
    const result = rule.transform(
      makeEvent({
        type: 'BLOCK_HIGH_INTENSITY',
        data: { reason: 'cns_fatigue_high' }
      })
    );

    expect(result.type).toBe('FLATTEN_ENERGY_WAVE');
    expect(result.target).toBe('atlas');
    expect(result.data.reason).toBe('cns_fatigue_high');
  });
});
