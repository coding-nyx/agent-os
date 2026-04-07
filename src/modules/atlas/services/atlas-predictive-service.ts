/**
 * AtlasPredictiveService
 *
 * Implements the Atlas risk state machine (Normal → Compressed → Overloaded → Recovery),
 * burnout detection (2-of-3 domain crises), and energy-wave flattening.
 *
 * Pure computation methods delegate to KMP AtlasPredictiveEngineJs.
 * State, history, and Spine subscriptions remain in TypeScript.
 */

import { AtlasPredictiveEngineJs } from '@cortex-logic';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVector, EnergyWavePoint } from '@/lib/types';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type AtlasState = 'Normal' | 'Compressed' | 'Overloaded' | 'Recovery';

export interface AtlasStateDisplay {
  state: AtlasState;
  label: string;
  color: string;
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

const _engine = new AtlasPredictiveEngineJs();

// ─── Service Class ─────────────────────────────────────────────────────────────

export class AtlasPredictiveService {
  private _state: AtlasState = 'Normal';
  private _cleanEvalCount = 0;
  private _unsubs: Array<() => void> = [];
  private _onStateChange?: (state: AtlasState) => void;
  private _history: NeuralStateVector[] = [];

  constructor(onStateChange?: (state: AtlasState) => void) {
    this._onStateChange = onStateChange;
    this._subscribeToSpine();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  get state(): AtlasState {
    return this._state;
  }

  getBurnoutTrajectoryScore(): number {
    if (this._history.length < 2) return 0;
    return _engine.computeBurnoutTrajectoryScore(JSON.stringify(this._history)) as number;
  }

  getTransitionRisk(): number {
    if (this._history.length < 2) return 0;
    return _engine.computeTransitionRisk(
      JSON.stringify(this._history[0]),
      JSON.stringify(this._history[1]),
    ) as number;
  }

  getStateForDisplay(): AtlasStateDisplay {
    return {
      state: this._state,
      ...STATE_DISPLAY[this._state],
      burnoutTrajectoryScore: this.getBurnoutTrajectoryScore(),
    };
  }

  evaluate(nsv: NeuralStateVector): void {
    this._history = [nsv, ...this._history].slice(0, 5);

    const trajectoryScore = this.getBurnoutTrajectoryScore();
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

    const result = JSON.parse(
      _engine.evaluateNextState(this._state, JSON.stringify(nsv), this._cleanEvalCount),
    ) as { nextState: AtlasState; newCleanCount: number; isBurnout: boolean; emitOverload: boolean };

    if (result.isBurnout) {
      this._emitCrisisMode('burnout_multi_domain');
      this._cleanEvalCount = 0;
      this._transition('Recovery');
      return;
    }

    const risk = this.getTransitionRisk();
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
          note: 'Proactive compression recommended due to rapid load increase.',
        },
      });
    }

    if (result.emitOverload) {
      const planningLoad = nsv.cognitive?.planningLoad ?? nsv.planning?.deadlinePressure ?? 0;
      const deadlinePressure = nsv.planning?.deadlinePressure ?? 0;
      Spine.emit({
        type: 'PLANNING_OVERLOAD',
        source: 'atlas-predictive-service',
        domain: 'C',
        priority: 'alert',
        target: 'nexus',
        data: { reason: 'compound_planning_overload', planningLoad, deadlinePressure },
      });
    }

    this._cleanEvalCount = result.newCleanCount;

    if (result.nextState !== this._state) {
      this._transition(result.nextState);
    }
  }

  flattenEnergyWave(energyWave: EnergyWavePoint[], reason: string): FlatteningPlan {
    return JSON.parse(_engine.flattenEnergyWave(JSON.stringify(energyWave), reason)) as FlatteningPlan;
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn());
    this._unsubs = [];
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private _subscribeToSpine(): void {
    this._unsubs.push(
      Spine.subscribe('VITAL_UPDATED', (event) => {
        const data = event.data as Record<string, unknown>;
        const nsv = this._nsvFromEventData(data);
        this.evaluate(nsv);
      }),
    );

    this._unsubs.push(
      Spine.subscribe('FLATTEN_ENERGY_WAVE', (event) => {
        const reason = String(event.data.reason ?? 'flatten_energy_wave');
        Spine.emit({
          type: 'ATLAS_PREDICTIVE_ALERT',
          source: 'atlas-predictive-service',
          domain: 'C',
          priority: 'alert',
          target: 'atlas',
          data: { reason, trigger: 'FLATTEN_ENERGY_WAVE', state: this._state },
        });
        if (this._state === 'Normal') {
          this._transition('Compressed');
        }
      }),
    );

    this._unsubs.push(
      Spine.subscribe('PLANNING_OVERLOAD', () => {
        if (this._state === 'Normal' || this._state === 'Compressed') {
          this._transition('Overloaded');
        }
      }),
    );

    this._unsubs.push(
      Spine.subscribe('CRISIS_MODE', () => {
        this._transition('Recovery');
      }),
    );
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
      cnsFatigue: num('cnsFatigue'),
      emotionalResilience: num('emotionalResilience'),
      sleepQuality: num('sleepQuality'),
    };
  }
}
