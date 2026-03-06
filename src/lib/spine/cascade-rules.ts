import { CascadeRule } from './spine-event-bus';

export const CORE_CASCADE_RULES: CascadeRule[] = [
  {
    id: 'burnout-warning',
    trigger: 'VITAL_UPDATED',
    condition: (event) => {
      const cnsFatigue = Number(event.data.cnsFatigue ?? 0);
      const emotionalResilience = Number(event.data.emotionalResilience ?? 10);
      return cnsFatigue >= 8 && emotionalResilience <= 3;
    },
    transform: () => ({
      type: 'BURNOUT_WARNING',
      source: 'cascade',
      domain: 'system',
      priority: 'critical',
      target: 'orchestrator',
      data: {
        reason: 'high_fatigue_low_resilience'
      }
    })
  },
  {
    id: 'block-intensity',
    trigger: 'VITAL_UPDATED',
    condition: (event) => Number(event.data.cnsFatigue ?? 0) >= 8,
    transform: () => ({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'cascade',
      domain: 'B',
      priority: 'alert',
      target: 'trainer',
      data: {
        reason: 'cns_fatigue_high'
      }
    })
  },
  {
    id: 'financial-stress',
    trigger: 'VITAL_UPDATED',
    condition: (event) => Number(event.data.financialFriction ?? 0) >= 8,
    transform: () => ({
      type: 'FINANCIAL_STRESS',
      source: 'cascade',
      domain: 'R',
      priority: 'alert',
      target: 'orchestrator',
      data: {
        reason: 'resource_friction_high'
      }
    })
  },
  {
    id: 'clearance-block-training',
    trigger: 'CLEARANCE_DENIED',
    condition: () => true,
    transform: (event) => ({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'cascade',
      domain: 'B',
      priority: 'alert',
      target: 'trainer',
      data: {
        reason: 'soma_clearance_denied',
        activity: event.data.activity,
        note: event.data.reason
      }
    })
  },
  {
    id: 'clearance-flatten-wave',
    trigger: 'CLEARANCE_DENIED',
    condition: () => true,
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'atlas',
      data: {
        reason: 'soma_clearance_denied',
        activity: event.data.activity,
        note: event.data.reason
      }
    })
  },
  {
    id: 'burnout-flatten-wave',
    trigger: 'BURNOUT_WARNING',
    condition: () => true,
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'atlas',
      data: {
        reason: 'burnout_warning',
        note: event.data.reason
      }
    })
  },
  {
    id: 'intensity-flatten-wave',
    trigger: 'BLOCK_HIGH_INTENSITY',
    condition: () => true,
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'atlas',
      data: {
        reason: 'cns_fatigue_high',
        note: event.data.reason
      }
    })
  }
];
