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
      target: 'titan',
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
  // @deprecated — CLEARANCE_DENIED cascade rules. These events are still emitted for
  // backward compatibility but will be removed after 90 days (target: Q3 2026).
  // Source changed from 'soma' to 'titan' as Soma is now absorbed into Titan.
  {
    id: 'clearance-block-training',
    trigger: 'CLEARANCE_DENIED',
    condition: () => true,
    transform: (event) => ({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'cascade',
      domain: 'B',
      priority: 'alert',
      target: 'titan',
      data: {
        reason: 'titan_clearance_denied',
        activity: event.data.activity,
        note: event.data.reason
      }
    })
  },
  // @deprecated — CLEARANCE_DENIED → FLATTEN_ENERGY_WAVE cascade. Will be removed in 90 days.
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
        reason: 'titan_clearance_denied',
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
  },
  // --- Atlas Planner Cascade Rules ---
  {
    id: 'planning-overload',
    trigger: 'VITAL_UPDATED',
    condition: (event) => Number(event.data.planningLoad ?? 0) >= 8,
    transform: () => ({
      type: 'PLANNING_OVERLOAD',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'orchestrator',
      data: {
        reason: 'planning_load_critical'
      }
    })
  },
  {
    id: 'planning-overload-flatten',
    trigger: 'PLANNING_OVERLOAD',
    condition: () => true,
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'atlas',
      data: {
        reason: 'planning_overload',
        note: event.data.reason
      }
    })
  },
  {
    id: 'deadline-crunch',
    trigger: 'VITAL_UPDATED',
    condition: (event) => Number(event.data.deadlinePressure ?? 0) >= 8,
    transform: () => ({
      type: 'DEADLINE_CRUNCH',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'atlas',
      data: {
        reason: 'deadline_pressure_critical'
      }
    })
  },
  {
    id: 'deadline-flatten-wave',
    trigger: 'DEADLINE_CRUNCH',
    condition: () => true,
    transform: () => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'atlas',
      data: {
        reason: 'deadline_crunch'
      }
    })
  },
  {
    id: 'compound-stress',
    trigger: 'VITAL_UPDATED',
    condition: (event) => {
      const stress = Number(event.data.stressLoad ?? 0);
      const fatigue = Number(event.data.cnsFatigue ?? 0);
      const resilience = Number(event.data.emotionalResilience ?? 10);
      return stress >= 8 && fatigue >= 7 && resilience <= 3;
    },
    transform: () => ({
      type: 'CRISIS_MODE',
      source: 'cascade',
      domain: 'system',
      priority: 'critical',
      target: 'orchestrator',
      data: {
        reason: 'compound_stress_crisis',
        note: 'Multiple domains in critical state simultaneously'
      }
    })
  },
  {
    id: 'streak-broken',
    trigger: 'VITAL_UPDATED',
    condition: (event) => Number(event.data.streakHealth ?? 10) <= 3,
    transform: () => ({
      type: 'STREAK_BROKEN',
      source: 'cascade',
      domain: 'C',
      priority: 'alert',
      target: 'agnes',
      data: {
        reason: 'habit_streak_at_risk',
        note: 'Streak health critically low — emotional support may be needed'
      }
    })
  }
];
