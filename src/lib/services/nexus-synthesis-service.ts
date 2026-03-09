/**
 * NexusSynthesisService — Cross-Module Conflict Detection & Resolution
 *
 * Implements the 11-pair Conflict Zone Matrix from the orchestrator conflict
 * resolution design doc (docs/design/orchestrator-conflict-resolution.md).
 *
 * This service is intentionally framework-agnostic (no React imports). It is
 * consumed by the ConflictResolutionOverlay and can be unit-tested in isolation.
 */

import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVector } from '@/lib/types';
import type { ModuleId } from '@/lib/module-manifest';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ConflictSeverity = 'warn' | 'block';

export type ConflictResolutionChoice = 'proceed' | 'defer' | 'reroute';

export interface ConflictResult {
  /** Stable conflict identifier — matches design doc matrix IDs for the 11 core pairs
   *  plus the 5 task-specific IDs that cover session-aware scenarios. */
  id: string;
  /** Human-readable title shown in the overlay. */
  title: string;
  /** Modules whose interests are in tension. Used to render icon badges. */
  affectedModules: ModuleId[];
  /** block = always surface, always requires explicit resolution.
   *  warn  = surface at most once per 4 hours per conflict type. */
  severity: ConflictSeverity;
  /** One-sentence recommended action surfaced to the user. */
  suggestedResolution: string;
  /** Unix ms when this instance was detected. */
  detectedAt: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const ONE_HOUR_MS   = 60 * 60 * 1000;

/** Returns the numeric NSV value or -1 when missing / null. */
function n(v: number | null | undefined): number {
  return typeof v === 'number' ? v : -1;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class NexusSynthesisServiceClass {
  /** Records the last time each conflict type was surfaced to the user. */
  private readonly surfacedAt = new Map<string, number>();

  /** Records the user's resolution choice for each active conflict. Entries
   *  are automatically pruned after 1 hour so conflicts can re-emerge. */
  private readonly resolutions = new Map<string, ConflictResolutionChoice>();

  // -------------------------------------------------------------------------
  // detectConflicts — pure detection, no side-effects
  // -------------------------------------------------------------------------

  /**
   * Scans the current NSV snapshot against all 11 conflict pairs defined in
   * the Conflict Zone Matrix and returns every active conflict.
   *
   * Conflicts that the user already resolved with 'proceed' or 'defer' are
   * included in the output; callers can filter via `shouldSurface()`.
   * Conflicts resolved with 'reroute' are excluded entirely (Nyx handled them).
   */
  detectConflicts(nsv: NeuralStateVector): ConflictResult[] {
    const now = Date.now();
    const results: ConflictResult[] = [];

    // Convenience aliases from both the flat legacy fields and the domain objects.
    // Domain-namespaced reads take precedence; legacy flat fields are fallbacks.
    const cnsFatigue         = n(nsv.biological?.cnsFatigue    ?? nsv.cnsFatigue);
    const sleepQuality       = n(nsv.biological?.sleepQuality  ?? nsv.sleepQuality);
    const recoveryScore      = n(nsv.biological?.recoveryScore);
    const resilience         = n(nsv.emotional?.emotionalResilience ?? nsv.emotionalResilience);
    const stress             = n(nsv.emotional?.stressLoad);
    const activeLoad         = n(nsv.cognitive?.activeLoad);
    const planningLoad       = n(nsv.cognitive?.planningLoad);
    const interestDiversity  = n(nsv.cognitive?.interestDiversity);
    const deadlinePressure   = n(nsv.planning?.deadlinePressure);
    const streakHealth       = n(nsv.planning?.streakHealth);
    const friction           = n(nsv.resource?.financialFriction);

    // -----------------------------------------------------------------------
    // Task-specific conflict IDs (GAP-06 spec)
    // -----------------------------------------------------------------------

    // CONFLICT_THERAPY_FATIGUE
    // High CNS fatigue + low emotional resilience → therapy session timing conflict
    if (cnsFatigue >= 7 && resilience >= 0 && resilience <= 4) {
      results.push({
        id: 'CONFLICT_THERAPY_FATIGUE',
        title: 'Titan ↔ Agnes — Intensity / Therapy Timing',
        affectedModules: ['titan', 'agnes'],
        severity: 'block',
        suggestedResolution:
          'CNS fatigue is high and resilience is low. Titan recommends deload; Agnes needs grounding before any intense session.',
        detectedAt: now,
      });
    }

    // CONFLICT_FINANCIAL_STRESS
    // High financial friction + stress elevation → compounding stress loop
    if (friction >= 7 && stress >= 6) {
      results.push({
        id: 'CONFLICT_FINANCIAL_STRESS',
        title: 'Ledger ↔ Agnes — Financial Stress Loop',
        affectedModules: ['ledger', 'agnes'],
        severity: 'block',
        suggestedResolution:
          'New financial commitments should be deferred until stress drops. Agnes can help process the emotional load first.',
        detectedAt: now,
      });
    }

    // CONFLICT_OVERLOAD_TRAINING
    // Atlas overloaded (planningLoad >= 7) + Titan high-intensity planned (cnsFatigue >= 7)
    if (cnsFatigue >= 7 && planningLoad >= 7) {
      results.push({
        id: 'CONFLICT_OVERLOAD_TRAINING',
        title: 'Titan ↔ Atlas — Overload / Training Conflict',
        affectedModules: ['titan', 'atlas'],
        severity: 'block',
        suggestedResolution:
          'Both CNS fatigue and planning load are elevated. Defer high-intensity training and compress the active task list.',
        detectedAt: now,
      });
    }

    // CONFLICT_STRESS_HABIT
    // High stress + Forge streak under pressure (streakHealth critically low)
    if (stress >= 8 && streakHealth >= 0 && streakHealth <= 4) {
      results.push({
        id: 'CONFLICT_STRESS_HABIT',
        title: 'Agnes ↔ Forge — Stress / Habit Streak Conflict',
        affectedModules: ['agnes', 'forge'],
        severity: 'block',
        suggestedResolution:
          'Stress is too high to sustain strict habit pressure. Temporarily relax Forge streak requirements.',
        detectedAt: now,
      });
    }

    // CONFLICT_RESILIENCE_DISPATCH
    // Critically low resilience — any module dispatch carries risk
    if (resilience >= 0 && resilience <= 3) {
      results.push({
        id: 'CONFLICT_RESILIENCE_DISPATCH',
        title: 'Agnes — Critical Resilience Floor Breached',
        affectedModules: ['agnes', 'orchestrator'],
        severity: 'block',
        suggestedResolution:
          'Emotional resilience is critically low. Agnes must intervene before any other module takes action.',
        detectedAt: now,
      });
    }

    // -----------------------------------------------------------------------
    // Design-doc Conflict Zone Matrix — remaining 6 pairs not covered above
    // -----------------------------------------------------------------------

    // TITAN_ATLAS_DEADLINE (HIGH)
    // cnsFatigue >= 8 AND deadlinePressure >= 8
    if (cnsFatigue >= 8 && deadlinePressure >= 8) {
      results.push({
        id: 'TITAN_ATLAS_DEADLINE',
        title: 'Titan ↔ Atlas — Deadline / Fatigue Crisis',
        affectedModules: ['titan', 'atlas'],
        severity: 'block',
        suggestedResolution:
          'Critical fatigue meets critical deadline pressure. Atlas must triage; Titan must enforce rest before execution.',
        detectedAt: now,
      });
    }

    // AGNES_TITAN_SLEEP (HIGH)
    // sleepQuality <= 3 AND resilience <= 4
    if (sleepQuality >= 0 && sleepQuality <= 3 && resilience >= 0 && resilience <= 4) {
      results.push({
        id: 'AGNES_TITAN_SLEEP',
        title: 'Titan ↔ Agnes — Sleep / Resilience Deficit',
        affectedModules: ['titan', 'agnes'],
        severity: 'block',
        suggestedResolution:
          'Poor sleep quality is compounding emotional fragility. Prioritise sleep hygiene; delay all demanding plans.',
        detectedAt: now,
      });
    }

    // AGNES_ATLAS_CAPACITY (HIGH)
    // stress >= 7 AND activeLoad >= 8
    if (stress >= 7 && activeLoad >= 8) {
      results.push({
        id: 'AGNES_ATLAS_CAPACITY',
        title: 'Agnes ↔ Atlas — Capacity Overload',
        affectedModules: ['agnes', 'atlas'],
        severity: 'block',
        suggestedResolution:
          'Emotional stress is compounding cognitive overload. Atlas should reduce active tasks to three or fewer.',
        detectedAt: now,
      });
    }

    // TITAN_LEDGER_RECOVERY (MEDIUM → warn)
    // recovery <= 3 AND friction >= 8
    if (recoveryScore >= 0 && recoveryScore <= 3 && friction >= 8) {
      results.push({
        id: 'TITAN_LEDGER_RECOVERY',
        title: 'Titan ↔ Ledger — Recovery / Financial Strain',
        affectedModules: ['titan', 'ledger'],
        severity: 'warn',
        suggestedResolution:
          'Physical recovery is impaired alongside high financial friction. Avoid major financial decisions until recovery improves.',
        detectedAt: now,
      });
    }

    // ATLAS_SCOUT_HYPERFOCUS (MEDIUM → warn)
    // planningLoad >= 8 AND interestDiversity <= 2
    if (planningLoad >= 8 && interestDiversity >= 0 && interestDiversity <= 2) {
      results.push({
        id: 'ATLAS_SCOUT_HYPERFOCUS',
        title: 'Atlas ↔ Scout — Planning Hyperfocus',
        affectedModules: ['atlas', 'scout'],
        severity: 'warn',
        suggestedResolution:
          'Planning load is maxed while research interest diversity is narrow. Scout should defer new research threads.',
        detectedAt: now,
      });
    }

    // ATLAS_LEDGER_COGNITIVE (MEDIUM → warn)
    // activeLoad >= 8 AND friction >= 6
    if (activeLoad >= 8 && friction >= 6) {
      results.push({
        id: 'ATLAS_LEDGER_COGNITIVE',
        title: 'Atlas ↔ Ledger — Cognitive / Financial Loop',
        affectedModules: ['atlas', 'ledger'],
        severity: 'warn',
        suggestedResolution:
          'Planning overload is amplifying financial friction. Reduce discretionary tasks and revisit budget commitments.',
        detectedAt: now,
      });
    }

    // COMPOUND_3WAY — biological + emotional + resource all in crisis (HIGH)
    // cnsFatigue >= 7 AND stress >= 7 AND friction >= 6
    if (cnsFatigue >= 7 && stress >= 7 && friction >= 6) {
      results.push({
        id: 'COMPOUND_3WAY',
        title: '⚠ Crisis — Biological + Emotional + Financial',
        affectedModules: ['titan', 'agnes', 'ledger'],
        severity: 'block',
        suggestedResolution:
          'Three domains are simultaneously critical. Immediate triage: rest first, emotional grounding second, financial review third.',
        detectedAt: now,
      });
    }

    // Exclude conflicts the user already rerouted (Nyx handled them)
    return results.filter((r) => this.resolutions.get(r.id) !== 'reroute');
  }

  // -------------------------------------------------------------------------
  // shouldSurface
  // -------------------------------------------------------------------------

  /**
   * Decides whether a detected conflict should be shown to the user.
   *
   * - `block` severity → always surface
   * - `warn`  severity → surface at most once per 4 hours per conflict type
   */
  shouldSurface(conflict: ConflictResult): boolean {
    if (conflict.severity === 'block') return true;
    const lastSeen = this.surfacedAt.get(conflict.id) ?? 0;
    return Date.now() - lastSeen >= FOUR_HOURS_MS;
  }

  /**
   * Records that a conflict has been surfaced to the user so the 4-hour
   * throttle can be enforced, and emits a CONFLICT_DETECTED Spine event.
   */
  markSurfaced(conflict: ConflictResult): void {
    this.surfacedAt.set(conflict.id, Date.now());
    Spine.publish({
      type: 'CONFLICT_DETECTED',
      source: 'nexus-synthesis',
      domain: 'system',
      priority: conflict.severity === 'block' ? 'alert' : 'info',
      data: {
        conflictId: conflict.id,
        severity: conflict.severity,
        affectedModules: conflict.affectedModules,
      },
    });
  }

  // -------------------------------------------------------------------------
  // resolveConflict
  // -------------------------------------------------------------------------

  /**
   * Records the user's resolution choice and:
   * - Always emits `CONFLICT_RESOLVED` on the Spine
   * - For `reroute`: emits the appropriate blocking Spine event
   *   (e.g. BLOCK_HIGH_INTENSITY for training-related conflicts)
   * - Prunes the resolution record after 1 hour so the conflict can re-surface
   */
  resolveConflict(conflictId: string, resolution: ConflictResolutionChoice): void {
    this.resolutions.set(conflictId, resolution);

    Spine.publish({
      type: 'CONFLICT_RESOLVED',
      source: 'nexus-synthesis',
      domain: 'system',
      priority: 'info',
      data: { conflictId, resolution },
    });

    if (resolution === 'reroute') {
      this._emitRerouteEvent(conflictId);
    }

    // Auto-expire resolution after 1 hour so conflicts can re-surface if
    // the underlying NSV conditions persist.
    window.setTimeout(() => {
      this.resolutions.delete(conflictId);
    }, ONE_HOUR_MS);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _emitRerouteEvent(conflictId: string): void {
    // Training / intensity conflicts → block high-intensity training
    const trainingConflicts: string[] = [
      'CONFLICT_THERAPY_FATIGUE',
      'CONFLICT_OVERLOAD_TRAINING',
      'TITAN_ATLAS_DEADLINE',
      'AGNES_TITAN_SLEEP',
      'TITAN_LEDGER_RECOVERY',
    ];
    if (trainingConflicts.includes(conflictId)) {
      Spine.publish({
        type: 'BLOCK_HIGH_INTENSITY',
        source: 'nexus-synthesis',
        domain: 'B',
        priority: 'alert',
        data: { reason: `conflict_reroute:${conflictId}` },
      });
      return;
    }

    // Financial-stress reroutes → emit FINANCIAL_STRESS
    if (conflictId === 'CONFLICT_FINANCIAL_STRESS' || conflictId === 'ATLAS_LEDGER_COGNITIVE') {
      Spine.publish({
        type: 'FINANCIAL_STRESS',
        source: 'nexus-synthesis',
        domain: 'R',
        priority: 'alert',
        data: { reason: `conflict_reroute:${conflictId}` },
      });
      return;
    }

    // Compound / crisis reroutes → escalate to CRISIS_MODE
    if (conflictId === 'COMPOUND_3WAY') {
      Spine.publish({
        type: 'CRISIS_MODE',
        source: 'nexus-synthesis',
        domain: 'system',
        priority: 'critical',
        data: { reason: `conflict_reroute:${conflictId}` },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const NexusSynthesisService = new NexusSynthesisServiceClass();
