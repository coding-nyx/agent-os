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
  },
  // --- Soma Cascade Rules ---
  // Rule 1: SOMA_READINESS_UPDATED → MEDICAL_ALERT when readiness is poor (<40)
  // Maps readiness score (0-100) to biological state vector (0-10 scale)
  // and emits a cross-module alert so all modules are aware of degraded state.
  {
    id: 'soma-readiness-biological-alert',
    trigger: 'SOMA_READINESS_UPDATED',
    condition: (event) => Number(event.data.score ?? 100) < 40,
    transform: (event) => {
      const score = Number(event.data.score ?? 0);
      // Map 0-100 readiness → 0-10 NSV-compatible biological vector
      const biologicalVector = Math.round((score / 10) * 10) / 10;
      return {
        type: 'MEDICAL_ALERT',
        source: 'cascade',
        domain: 'B',
        priority: 'critical',
        target: 'orchestrator',
        data: {
          reason: 'soma_readiness_poor',
          readinessScore: score,
          level: event.data.level,
          biologicalVector,
          recommendations: event.data.recommendations,
          note: `Readiness score ${score}/100 is critically low — biological state degraded`
        }
      };
    }
  },
  // Rule 2: SOMA_CLEARANCE_CHANGED → BLOCK_HIGH_INTENSITY when clearance revoked/expired
  // Prevents Titan from recommending high-intensity training when clearance is denied.
  {
    id: 'soma-clearance-block-training',
    trigger: 'SOMA_CLEARANCE_CHANGED',
    condition: (event) => {
      const action = String(event.data.action ?? '');
      return action === 'revoked' || action === 'expired';
    },
    transform: (event) => ({
      type: 'BLOCK_HIGH_INTENSITY',
      source: 'cascade',
      domain: 'B',
      priority: 'alert',
      target: 'titan',
      data: {
        reason: 'soma_clearance_denied',
        clearanceId: event.data.clearanceId,
        clearanceType: event.data.clearanceType,
        action: event.data.action,
        note: `Soma clearance ${event.data.action} — high-intensity training blocked`
      }
    })
  },
  // Rule 3: SOMA_BIOMARKER_COMMITTED → FLATTEN_ENERGY_WAVE for energy-relevant biomarkers
  // When cortisol, sleep quality, or HRV are logged, Atlas may need to recalculate
  // the energy budget. Emits FLATTEN_ENERGY_WAVE so Atlas's energy planner reacts.
  {
    id: 'soma-biomarker-energy-recalc',
    trigger: 'SOMA_BIOMARKER_COMMITTED',
    condition: (event) => {
      const fieldId = String(event.data.fieldId ?? '').toLowerCase();
      return ['cortisol', 'sleep_quality', 'sleep', 'hrv', 'heart_rate_variability'].some(
        (key) => fieldId.includes(key)
      );
    },
    transform: (event) => ({
      type: 'FLATTEN_ENERGY_WAVE',
      source: 'cascade',
      domain: 'C',
      priority: 'info',
      target: 'atlas',
      data: {
        reason: 'soma_biomarker_energy_relevant',
        fieldId: event.data.fieldId,
        newValue: event.data.newValue,
        note: 'Energy-relevant biomarker changed — Atlas should recalculate energy budget'
      }
    })
  },
  // Rule 4: SOMA_PROFILE_UPDATED → HEALTH_CONTEXT_STALE
  // When the Soma profile changes, the GlobalSoul's health context is stale.
  // This ensures the next enhanceContextForModule() call fetches fresh data.
  {
    id: 'soma-profile-context-stale',
    trigger: 'SOMA_PROFILE_UPDATED',
    condition: () => true,
    transform: () => ({
      type: 'HEALTH_CONTEXT_STALE',
      source: 'cascade',
      domain: 'B',
      priority: 'info',
      target: 'orchestrator',
      data: {
        reason: 'soma_profile_changed',
        note: 'Soma profile updated — health context should be refreshed'
      }
    })
  }
];
