import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import type { OrchestrationTurnRuntimeSummary } from '@/lib/contracts/orchestration';
import type { RoutingDecision } from './nexus-routing-service';

interface RolloutSnapshot {
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

const EMPTY_SNAPSHOT: RolloutSnapshot = {
  parseSuccesses: 0,
  parseClarifications: 0,
  parsedRouteHits: 0,
  capabilityRouteHits: 0,
  keywordRouteHits: 0,
  defaultRouteHits: 0,
  planningBuilds: 0,
  planningSkips: 0,
  approvalInterruptions: 0,
  executionFailures: 0,
  executionFailureByAction: {},
};

export class OrchestrationRolloutService {
  private static snapshot: RolloutSnapshot = { ...EMPTY_SNAPSHOT, executionFailureByAction: {} };

  static recordParsedCommand(envelope: ParsedCommandEnvelope): void {
    if (envelope.requiresClarification) {
      this.snapshot.parseClarifications += 1;
      return;
    }
    this.snapshot.parseSuccesses += 1;
  }

  static recordRoutingDecision(decision: RoutingDecision): void {
    if (decision.reason.startsWith('command:')) {
      this.snapshot.parsedRouteHits += 1;
      return;
    }
    if (decision.reason.startsWith('capability:')) {
      this.snapshot.capabilityRouteHits += 1;
      return;
    }
    if (decision.reason.startsWith('matched:')) {
      this.snapshot.keywordRouteHits += 1;
      return;
    }
    this.snapshot.defaultRouteHits += 1;
  }

  static recordPlanningAttempt(built: boolean): void {
    if (built) {
      this.snapshot.planningBuilds += 1;
      return;
    }
    this.snapshot.planningSkips += 1;
  }

  static recordRuntimeSummary(summary: OrchestrationTurnRuntimeSummary): void {
    this.snapshot.approvalInterruptions += summary.counts.awaitingApproval;

    for (const action of summary.actions) {
      if (action.executionStatus !== 'failed' && action.executionStatus !== 'failed_escalated') {
        continue;
      }
      this.snapshot.executionFailures += 1;
      this.snapshot.executionFailureByAction[action.actionType] =
        (this.snapshot.executionFailureByAction[action.actionType] ?? 0) + 1;
    }
  }

  static getSnapshot(): RolloutSnapshot {
    return {
      ...this.snapshot,
      executionFailureByAction: { ...this.snapshot.executionFailureByAction },
    };
  }

  static resetForTests(): void {
    this.snapshot = { ...EMPTY_SNAPSHOT, executionFailureByAction: {} };
  }
}
