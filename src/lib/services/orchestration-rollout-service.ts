import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { OrchestrationTurnRuntimeSummary } from '@/lib/contracts/orchestration';
import type { RoutingDecision } from './ara-routing-service';
import { OrchestrationRolloutServiceJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _service = new OrchestrationRolloutServiceJs();

export interface RolloutSnapshot {
  parseSuccesses: number;
  parseClarifications: number;
  parsedRouteHits: number;
  capabilityRouteHits: number;
  keywordRouteHits: number;
  defaultRouteHits: number;
  planningBuilds: number;
  planningSkips: number;
  approvalInterruptions: number;
  executionFailures: number;
  executionFailureByAction: Record<string, number>;
}

export class OrchestrationRolloutService {
  static recordParsedCommand(envelope: ParsedCommandEnvelope): void {
    _service.recordParsedCommand(Boolean(envelope.requiresClarification));
  }

  static recordRoutingDecision(decision: RoutingDecision): void {
    _service.recordRoutingDecision(decision.reason ?? 'default_ara');
  }

  static recordPlanningAttempt(built: boolean): void {
    _service.recordPlanningAttempt(built);
  }

  static recordRuntimeSummary(summary: OrchestrationTurnRuntimeSummary): void {
    _service.recordRuntimeSummary(JSON.stringify(summary));
  }

  static getSnapshot(): RolloutSnapshot {
    const EMPTY: RolloutSnapshot = { parseSuccesses: 0, parseClarifications: 0, parsedRouteHits: 0, capabilityRouteHits: 0, keywordRouteHits: 0, defaultRouteHits: 0, planningBuilds: 0, planningSkips: 0, approvalInterruptions: 0, executionFailures: 0, executionFailureByAction: {} };
    return safeParseKmp(_service.getSnapshot(), EMPTY, 'Rollout.getSnapshot');
  }

  static reset(): void {
    const service = _service as unknown as { reset?: () => void };
    if (typeof service.reset === 'function') {
      service.reset();
    }
  }

  /** @deprecated Use reset() */
  static resetForTests(): void {
    this.reset();
  }
}
