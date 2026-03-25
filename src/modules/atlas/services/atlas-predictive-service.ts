/**
 * AtlasPredictiveService
 *
 * Implements the Atlas risk state machine (Normal → Compressed → Overloaded → Recovery),
 * burnout detection (2-of-3 domain crises), and energy-wave flattening.
 *
 * Cross-module isolation: all external communication goes through the Spine event bus.
 * The service subscribes to VITAL_UPDATED, FLATTEN_ENERGY_WAVE, PLANNING_OVERLOAD, and
 * CRISIS_MODE, and emits ATLAS_STATE_CHANGED, ATLAS_PREDICTIVE_ALERT, and CRISIS_MODE.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVector, EnergyWavePoint } from '@/lib/types';

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Canonical Atlas predictive states (UI-facing names per §12 of the design doc). */
export type AtlasState = 'Normal' | 'Compressed' | 'Overloaded' | 'Recovery';

export interface AtlasStateDisplay {
  state: AtlasState;
  label: string;
  /** Tailwind color token used for badge / border coloring. */
  color: string;
  /** Hex value for inline styles where Tailwind tokens are not enough. */
  hex: string;
  description: string;
  burnoutTrajectoryScore?: number;
}

export interface DeferralAction {
  type: 'defer';
  taskId: string;
  reason: string;
  newStatus: 'deferred';
}

export interface RecoveryExtension {
  windowId: string;
  addedHours: number;
}

export interface FlatteningPlan {
  budgetCap: number;
  rescaledWave: EnergyWavePoint[];
  deferrals: DeferralAction[];
  recoveryExtensions: RecoveryExtension[];
  flattenedUntil: string;
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_DISPLAY: Record<AtlasState, Omit<AtlasStateDisplay, 'state'>> = {
  Normal: {
    label: 'Normal',
    color: 'text-sky-500',
    hex: '#0ea5e9',
    description: 'Baseline state. No active compression. Energy wave is user-configured.',
  },
  Compressed: {
    label: 'Compressed',
    color: 'text-amber-400',
    hex: '#fbbf24',
    description:
      'Early warning signals detected. Schedule is being soft-compressed. You are not yet disrupted.',
  },
  Overloaded: {
    label: 'Overloaded',
    color: 'text-orange-500',
    hex: '#f97316',
    description:
      'Energy wave flattened. High-energy tasks deferred. No new high-load commitments accepted.',
  },
  Recovery: {
    label: 'Recovery',
    color: 'text-rose-600',
    hex: '#e11d48',
    description:
      'Cascade-triggered recovery mode. New commitments locked. Agnes and Titan have been notified.',
  },
};

// Minimum consecutive "clean" evaluations before downgrading from Compressed → Normal.
const CLEAN_EVALS_TO_DOWNGRADE = 2;

// ─── Service Class ─────────────────────────────────────────────────────────────

export class AtlasPredictiveService {
  private _state: AtlasState = 'Normal';
  /** Number of consecutive evaluations where all signals were below thresholds. */
  private _cleanEvalCount = 0;
  private _unsubs: Array<() => void> = [];
  private _onStateChange?: (state: AtlasState) => void;
  
  /** Historical snapshots for velocity calculation (max 5) */
  private _history: NeuralStateVector[] = [];

  /**
   * @param onStateChange  Called whenever the internal state machine transitions.
   *                       Use this to re-render reactive UI without polling.
   */
  constructor(onStateChange?: (state: AtlasState) => void) {
    this._onStateChange = onStateChange;
    this._subscribeToSpine();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get state(): AtlasState {
    return this._state;
  }

  /** Returns the current burnout trajectory score (0–10). */
  getBurnoutTrajectoryScore(): number {
    return this.computeBurnoutTrajectoryScore();
  }

  /**
   * Calculates the probability of a state transition based on metric velocity.
   * Returns a risk score from 0.0 to 1.0.
   */
  getTransitionRisk(): number {
    if (this._history.length < 2) return 0;

    const current = this._history[0];
    const previous = this._history[1];

    const getVal = (nsv: NeuralStateVector) => 
      (nsv.cognitive?.planningLoad ?? 0) + 
      (nsv.planning?.deadlinePressure ?? 0) + 
      (nsv.biological?.cnsFatigue ?? 0);

    const delta = getVal(current) - getVal(previous);
    
    // If metrics are rising sharply (>1.5 points aggregate), risk is elevated
    if (delta > 0) {
      return Math.min(1.0, delta / 5); // 5 points aggregate rise = 100% risk
    }

    return 0;
  }

  getStateForDisplay(): AtlasStateDisplay {
    return {
      state: this._state,
      ...STATE_DISPLAY[this._state],
      burnoutTrajectoryScore: this.computeBurnoutTrajectoryScore(),
    };
  }

  /**
   * Evaluate the current NSV snapshot against all thresholds and advance the
   * state machine as needed.  Call this whenever a fresh NSV is available.
   */
  evaluate(nsv: NeuralStateVector): void {
    // Update history
    this._history = [nsv, ...this._history].slice(0, 5);

    // Check burnout trajectory after updating history
    const trajectoryScore = this.computeBurnoutTrajectoryScore();
    if (trajectoryScore >= 7 && this._state !== 'Recovery') {
      Spine.emit({
        type: 'BURNOUT_TRAJECTORY_WARNING',
        source: 'atlas-predictive-service',
        domain: 'C',
        priority: 'alert',
        target: 'atlas',
        data: {
          trajectoryScore,
          note: 'Rising burnout trajectory detected. Proactive intervention recommended.',
        },
      });
    }

    // Guard against NaN: treat non-finite values as 0 so they never block transitions.
    const rawPlanningLoad = nsv.cognitive?.planningLoad ?? nsv.planning?.deadlinePressure ?? 0;
    const rawDeadlinePressure = nsv.planning?.deadlinePressure ?? 0;
    const planningLoad = Number.isFinite(rawPlanningLoad) ? rawPlanningLoad : 0;
    const deadlinePressure = Number.isFinite(rawDeadlinePressure) ? rawDeadlinePressure : 0;
    
    const risk = this.getTransitionRisk();

    // ── Burnout detection (runs first — can skip straight to Recovery) ────────
    if (this._detectBurnout(nsv)) {
      this._emitCrisisMode('burnout_multi_domain');
      this._transition('Recovery');
      return;
    }

    // ── Proactive Flattening (Velocity-based) ──
    if (this._state === 'Normal' && risk >= 0.6) {
      Spine.emit({
        type: 'ATLAS_PREDICTIVE_ALERT',
        source: 'atlas-predictive-service',
        domain: 'C',
        priority: 'alert',
        target: 'atlas',
        data: { 
          reason: 'high_velocity_risk', 
          riskScore: risk,
          note: 'Proactive compression recommended due to rapid load increase.'
        },
      });
    }

    // ── State machine transitions ─────────────────────────────────────────────
    switch (this._state) {
      case 'Normal':
        if (
          (planningLoad ?? 0) >= 6 ||
          (deadlinePressure ?? 0) >= 6
        ) {
          this._transition('Compressed');
        }
        break;

      case 'Compressed': {
        // Advance to Overloaded
        if (
          (planningLoad ?? 0) >= 8 &&
          (deadlinePressure ?? 0) >= 6
        ) {
          // Emit PLANNING_OVERLOAD as specified — cascade rules will also emit
          // FLATTEN_ENERGY_WAVE automatically, but we make it explicit here.
          Spine.emit({
            type: 'PLANNING_OVERLOAD',
            source: 'atlas-predictive-service',
            domain: 'C',
            priority: 'alert',
            target: 'nexus',
            data: {
              reason: 'compound_planning_overload',
              planningLoad,
              deadlinePressure,
            },
          });
          this._transition('Overloaded');
          break;
        }

        // Check for downgrade to Normal
        const allClear =
          (planningLoad ?? 0) < 6 &&
          (deadlinePressure ?? 0) < 6;

        if (allClear) {
          this._cleanEvalCount += 1;
          if (this._cleanEvalCount >= CLEAN_EVALS_TO_DOWNGRADE) {
            this._cleanEvalCount = 0;
            this._transition('Normal');
          }
        } else {
          this._cleanEvalCount = 0;
        }
        break;
      }

      case 'Overloaded': {
        // Allow downgrade to Compressed when both pressure metrics drop below threshold.
        // Without this path, the machine would be permanently stuck in Overloaded unless
        // a CRISIS_MODE event fires (which requires external cascade rules to trigger).
        const overloadedClear =
          planningLoad < 6 &&
          deadlinePressure < 6;

        if (overloadedClear) {
          this._cleanEvalCount += 1;
          if (this._cleanEvalCount >= CLEAN_EVALS_TO_DOWNGRADE) {
            this._cleanEvalCount = 0;
            this._transition('Compressed'); // land softly in Compressed, not Normal
          }
        } else {
          this._cleanEvalCount = 0;
        }
        break;
      }

      case 'Recovery': {
        // Exit Recovery only when both pressure metrics are low.
        const canExit =
          (planningLoad ?? 10) < 4 &&
          (deadlinePressure ?? 10) < 4;

        if (canExit) {
          this._cleanEvalCount += 1;
          if (this._cleanEvalCount >= CLEAN_EVALS_TO_DOWNGRADE) {
            this._cleanEvalCount = 0;
            this._transition('Compressed'); // land softly in Compressed, not Normal
          }
        } else {
          this._cleanEvalCount = 0;
        }
        break;
      }
    }
  }

  /**
   * Apply the energy-wave flattening algorithm per the spec:
   * - Current slot: energy reduced by 20 %
   * - Removed capacity redistributed: day+1 40%, day+2 35%, day+3 25%
   *
   * @returns A new (immutable) rescaled wave — does NOT mutate the input.
   */
  flattenEnergyWave(energyWave: EnergyWavePoint[], reason: string): FlatteningPlan {
    const rescaled = energyWave.map((p) => ({ ...p }));

    if (rescaled.length === 0) {
      return {
        budgetCap: 0.8,
        rescaledWave: rescaled,
        deferrals: [],
        recoveryExtensions: [],
        flattenedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        reason,
      };
    }

    // Current day (index 0): reduce energy/focus/load by 20 %
    const current = rescaled[0];
    const removedEnergy = current.energy * 0.2;
    const removedFocus = current.focus * 0.2;
    const removedLoad = current.load * 0.2;

    current.energy = parseFloat((current.energy - removedEnergy).toFixed(2));
    current.focus = parseFloat((current.focus - removedFocus).toFixed(2));
    current.load = parseFloat((current.load - removedLoad).toFixed(2));

    // Decay redistribution weights across next 3 days
    const weights = [0.4, 0.35, 0.25];
    for (let i = 1; i <= 3; i++) {
      if (i >= rescaled.length) break;
      const w = weights[i - 1];
      const pt = rescaled[i];
      pt.energy = Math.min(10, parseFloat((pt.energy + removedEnergy * w).toFixed(2)));
      pt.focus = Math.min(10, parseFloat((pt.focus + removedFocus * w).toFixed(2)));
      pt.load = Math.min(10, parseFloat((pt.load + removedLoad * w).toFixed(2)));
    }

    return {
      budgetCap: 0.8,
      rescaledWave: rescaled,
      deferrals: [],
      recoveryExtensions: [],
      flattenedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      reason,
    };
  }

  /** Unsubscribe from all Spine events and clean up. Call on component unmount. */
  destroy(): void {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Compute a 0–10 burnout trajectory score from historical NSV snapshots.
   * Signals with rising trends (fatigue, stress, load) or falling resilience
   * contribute weighted scores that sum to the trajectory risk.
   */
  private computeBurnoutTrajectoryScore(): number {
    if (this._history.length < 2) return 0;

    const newest = this._history[0];
    const oldest = this._history[this._history.length - 1];

    const get = (nsv: NeuralStateVector, domain: 'cnsFatigue' | 'stressLoad' | 'planningLoad' | 'deadlinePressure' | 'emotionalResilience' | 'streakHealth'): number => {
      switch (domain) {
        case 'cnsFatigue': return nsv.biological?.cnsFatigue ?? nsv.cnsFatigue ?? 0;
        case 'stressLoad': return nsv.emotional?.stressLoad ?? 0;
        case 'planningLoad': return nsv.cognitive?.planningLoad ?? 0;
        case 'deadlinePressure': return nsv.planning?.deadlinePressure ?? 0;
        case 'emotionalResilience': return nsv.emotional?.emotionalResilience ?? nsv.emotionalResilience ?? 0;
        case 'streakHealth': return nsv.planning?.streakHealth ?? 0;
      }
    };

    // Rising signals (bad when increasing): contribution = Math.max(0, delta) / 10 * weight
    const cnsFatigueDelta = get(newest, 'cnsFatigue') - get(oldest, 'cnsFatigue');
    const stressLoadDelta = get(newest, 'stressLoad') - get(oldest, 'stressLoad');
    const planningLoadDelta = get(newest, 'planningLoad') - get(oldest, 'planningLoad');
    const deadlinePressureDelta = get(newest, 'deadlinePressure') - get(oldest, 'deadlinePressure');

    // Falling signals (bad when decreasing): contribution = Math.max(0, -delta) / 10 * weight
    const resilienceDelta = get(newest, 'emotionalResilience') - get(oldest, 'emotionalResilience');
    const streakHealthDelta = get(newest, 'streakHealth') - get(oldest, 'streakHealth');

    const score =
      Math.max(0, cnsFatigueDelta) / 10 * 2 +
      Math.max(0, stressLoadDelta) / 10 * 2 +
      Math.max(0, planningLoadDelta) / 10 * 1.5 +
      Math.max(0, deadlinePressureDelta) / 10 * 1.5 +
      Math.max(0, -resilienceDelta) / 10 * 2 +
      Math.max(0, -streakHealthDelta) / 10 * 1;

    return Math.round(Math.min(10, score) * 10) / 10;
  }

  private _subscribeToSpine(): void {
    // VITAL_UPDATED: run the evaluation on fresh NSV snapshots
    this._unsubs.push(
      Spine.subscribe('VITAL_UPDATED', (event) => {
        // Build a minimal NSV-compatible snapshot from flat event data
        const data = event.data as Record<string, unknown>;
        const nsv = this._nsvFromEventData(data);
        this.evaluate(nsv);
      })
    );

    // FLATTEN_ENERGY_WAVE: received from cascade rules or direct emit
    this._unsubs.push(
      Spine.subscribe('FLATTEN_ENERGY_WAVE', (event) => {
        const reason = String(event.data.reason ?? 'flatten_energy_wave');
        // Emit a predictive alert so UI can react
        Spine.emit({
          type: 'ATLAS_PREDICTIVE_ALERT',
          source: 'atlas-predictive-service',
          domain: 'C',
          priority: 'alert',
          target: 'atlas',
          data: { reason, trigger: 'FLATTEN_ENERGY_WAVE', state: this._state },
        });

        // Advance state if we are still in Normal
        if (this._state === 'Normal') {
          this._transition('Compressed');
        }
      })
    );

    // PLANNING_OVERLOAD: push to Overloaded if not already there
    this._unsubs.push(
      Spine.subscribe('PLANNING_OVERLOAD', () => {
        if (this._state === 'Normal' || this._state === 'Compressed') {
          this._transition('Overloaded');
        }
      })
    );

    // CRISIS_MODE: received from compound-stress cascade or burnout path
    this._unsubs.push(
      Spine.subscribe('CRISIS_MODE', () => {
        this._transition('Recovery');
      })
    );
  }

  /**
   * Detect burnout using the 2-of-3 domain crisis model per the task spec.
   *
   * Crises:
   * 1. emotional resilience <= 3
   * 2. cnsFatigue >= 8
   * 3. financialFriction >= 7
   */
  private _detectBurnout(nsv: NeuralStateVector): boolean {
    const resilience = nsv.emotional?.emotionalResilience ?? nsv.emotionalResilience ?? -1;
    const cnsFatigue = nsv.biological?.cnsFatigue ?? nsv.cnsFatigue ?? -1;
    const financialFriction = nsv.resource?.financialFriction ?? -1;

    const emotionalCrisis = resilience !== -1 && resilience <= 3;
    const biologicalCrisis = cnsFatigue !== -1 && cnsFatigue >= 8;
    const resourceCrisis = financialFriction !== -1 && financialFriction >= 7;

    const crisisCount = [emotionalCrisis, biologicalCrisis, resourceCrisis].filter(Boolean).length;
    return crisisCount >= 2;
  }

  private _emitCrisisMode(reason: string): void {
    Spine.emit({
      type: 'CRISIS_MODE',
      source: 'atlas-predictive-service',
      domain: 'system',
      priority: 'critical',
      target: 'nexus',
      data: { reason, note: 'Multi-domain crisis — Atlas transitioning to Recovery' },
    });
  }

  private _transition(next: AtlasState): void {
    if (this._state === next) return;

    const previous = this._state;
    this._state = next;
    this._cleanEvalCount = 0;

    Spine.emit({
      type: 'ATLAS_STATE_CHANGED',
      source: 'atlas-predictive-service',
      domain: 'C',
      priority: next === 'Recovery' ? 'critical' : 'alert',
      target: 'atlas',
      data: {
        previous,
        current: next,
        label: STATE_DISPLAY[next].label,
        description: STATE_DISPLAY[next].description,
      },
    });

    this._onStateChange?.(next);
  }

  /**
   * Reconstruct a minimal NeuralStateVector from flat VITAL_UPDATED event data
   * (the cascade rules write flat keys like `cnsFatigue`, `planningLoad`, etc.).
   */
  private _nsvFromEventData(data: Record<string, unknown>): NeuralStateVector {
    const num = (key: string): number | null => {
      const v = data[key];
      return typeof v === 'number' ? v : null;
    };

    return {
      biological: {
        cnsFatigue: num('cnsFatigue'),
        sleepQuality: num('sleepQuality'),
        recoveryScore: num('recoveryScore'),
        hormonalContext: typeof data.hormonalContext === 'string' ? data.hormonalContext : null,
      },
      emotional: {
        emotionalResilience: num('emotionalResilience'),
        stressLoad: num('stressLoad'),
        moodTrend: typeof data.moodTrend === 'string' ? data.moodTrend : null,
        traumaMarkers: null,
      },
      cognitive: {
        energyBudget: num('energyBudget'),
        focusScore: num('focusScore'),
        activeLoad: num('activeLoad'),
        planningLoad: num('planningLoad'),
        taskCompletionRate: num('taskCompletionRate'),
      },
      planning: {
        streakHealth: num('streakHealth'),
        deadlinePressure: num('deadlinePressure'),
      },
      resource: {
        financialFriction: num('financialFriction'),
        resonanceROI: num('resonanceROI'),
      },
      version: 0,
      lastUpdated: {},
      // Legacy aliases
      cnsFatigue: num('cnsFatigue'),
      emotionalResilience: num('emotionalResilience'),
      sleepQuality: num('sleepQuality'),
    };
  }
}
