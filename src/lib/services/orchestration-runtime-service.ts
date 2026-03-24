import type {
  AliveEntity,
  ActionOrchestrationMetadata,
  ApprovalRequirement,
  AutopilotLevel,
  HistoryMode,
  OrchestrationTurnRuntimeSummary,
  RuntimeAutonomy,
  RuntimeSemantics,
} from '@/lib/contracts/orchestration';
import { buildAliveEntityRuntimeContext } from '@/lib/services/alive-entity-service';
import { OrchestrationRolloutService } from './orchestration-rollout-service';

function deriveRuntimeAutonomy(autopilotLevel: AutopilotLevel): RuntimeAutonomy {
  switch (autopilotLevel) {
    case 0:
      return 'manual_lock';
    case 1:
      return 'proposal_first';
    case 2:
      return 'guided_assist';
    case 3:
      return 'conditional_autonomy';
    case 4:
      return 'supervised_autonomy';
    default:
      return 'ghost';
  }
}

function deriveExecutionStatus(
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'],
): ActionOrchestrationMetadata['execution']['status'] {
  if (dispatchStatus === 'approved') return 'executed';
  if (dispatchStatus === 'awaiting_approval') return 'deferred';
  if (dispatchStatus === 'analysis_only' || dispatchStatus === 'ephemeral') return 'analysis_only';
  return 'blocked';
}

function defaultApprovalRequirement(
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'],
): ApprovalRequirement {
  return dispatchStatus === 'awaiting_approval'
    ? { required: true, reason: 'manual_level' }
    : { required: false, reason: 'none' };
}

export class OrchestrationRuntimeService {
  static buildRuntimeSemantics(input: {
    autopilotLevel: AutopilotLevel;
    historyMode: HistoryMode;
    dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'];
    highRisk: boolean;
  }): RuntimeSemantics {
    const autonomy = deriveRuntimeAutonomy(input.autopilotLevel);

    let disposition: RuntimeSemantics['disposition'] = 'visible_execution';
    if (input.dispatchStatus === 'ephemeral') {
      disposition = 'ephemeral_preview';
    } else if (input.dispatchStatus === 'analysis_only' || input.dispatchStatus === 'blocked') {
      disposition = 'analysis_only';
    } else if (input.dispatchStatus === 'awaiting_approval') {
      if (input.autopilotLevel === 0) {
        disposition = 'manual_review';
      } else if (input.highRisk && input.autopilotLevel >= 3) {
        disposition = 'high_risk_review';
      } else {
        disposition = 'proposal_review';
      }
    } else if (input.historyMode === 'silent' || input.autopilotLevel === 5) {
      disposition = 'silent_execution';
    }

    const historyDestination: RuntimeSemantics['historyDestination'] =
      disposition === 'ephemeral_preview'
        ? 'none'
        : disposition === 'silent_execution'
          ? 'silent_audit'
          : 'standard';

    return {
      autopilotLevel: input.autopilotLevel,
      autonomy,
      disposition,
      historyDestination,
      willPersistHistory: historyDestination === 'standard',
      shouldNotifyUser: disposition !== 'silent_execution',
    };
  }

  static buildTurnSummary(input: {
    moduleId: string;
    autopilotLevel: AutopilotLevel;
    historyMode: HistoryMode;
    activeThreadId?: string | null;
    aliveEntities?: AliveEntity[];
    aliveEntityLimitPerModule?: number;
    decisions: Array<
      Pick<ActionOrchestrationMetadata, 'actionType' | 'proposalCard' | 'dispatchStatus' | 'executionMode' | 'runtime'> &
        Partial<Pick<ActionOrchestrationMetadata, 'approvalRequirement' | 'historyMode' | 'patientScope' | 'execution' | 'failure'>>
    >;
  }): OrchestrationTurnRuntimeSummary {
    const actions = input.decisions.map((decision) => ({
      actionType: decision.actionType,
      proposalId: decision.proposalCard.proposalId,
      label: decision.proposalCard.title,
      summary: decision.proposalCard.summary,
      source: decision.proposalCard.source,
      status: decision.proposalCard.status,
      approvalRequirement: decision.approvalRequirement ?? decision.proposalCard.approvalRequirement ?? defaultApprovalRequirement(decision.dispatchStatus),
      dispatchStatus: decision.dispatchStatus,
      executionMode: decision.executionMode,
      historyMode: decision.historyMode ?? decision.proposalCard.historyMode,
      executionStatus: decision.execution?.status ?? deriveExecutionStatus(decision.dispatchStatus),
      patientScope: decision.patientScope ?? decision.execution?.patientScope ?? 'USER',
      executedAt: decision.execution?.executedAt ?? null,
      failure: decision.failure ?? null,
      runtime: decision.runtime,
    }));

    const counts = {
      total: actions.length,
      visibleExecutions: actions.filter(
        (action) => action.runtime.disposition === 'visible_execution' && action.executionStatus === 'executed',
      ).length,
      silentExecutions: actions.filter(
        (action) => action.runtime.disposition === 'silent_execution' && action.executionStatus === 'executed',
      ).length,
      awaitingApproval: actions.filter((action) =>
        action.runtime.disposition === 'manual_review' ||
        action.runtime.disposition === 'proposal_review' ||
        action.runtime.disposition === 'high_risk_review').length,
      analysisOnly: actions.filter(
        (action) => action.runtime.disposition === 'analysis_only' && action.executionStatus !== 'failed' && action.executionStatus !== 'failed_escalated',
      ).length,
      blocked: actions.filter(
        (action) => action.dispatchStatus === 'blocked' && action.executionStatus !== 'failed' && action.executionStatus !== 'failed_escalated',
      ).length,
      ephemeral: actions.filter((action) => action.runtime.disposition === 'ephemeral_preview').length,
      failed: actions.filter((action) => action.executionStatus === 'failed' || action.executionStatus === 'failed_escalated').length,
      escalated: actions.filter(
        (action) => action.failure?.status === 'escalated' || action.executionStatus === 'failed_escalated',
      ).length,
    };

    const shouldSuppressAssistantMessage =
      counts.total > 0 &&
      counts.silentExecutions > 0 &&
      counts.visibleExecutions === 0 &&
      counts.awaitingApproval === 0 &&
      counts.analysisOnly === 0 &&
      counts.ephemeral === 0 &&
      counts.failed === 0;

    const summary = {
      moduleId: input.moduleId,
      autopilotLevel: input.autopilotLevel,
      historyMode: input.historyMode,
      activeThreadId: input.activeThreadId ?? null,
      actions,
      aliveContext:
        input.aliveEntities && input.aliveEntities.length > 0
          ? buildAliveEntityRuntimeContext(input.aliveEntities, {
              limitPerModule: input.aliveEntityLimitPerModule,
            })
          : null,
      counts,
      shouldSuppressAssistantMessage,
    };
    OrchestrationRolloutService.recordRuntimeSummary(summary);
    return summary;
  }

  static getNoticePrefix(runtime: RuntimeSemantics): string | null {
    switch (runtime.disposition) {
      case 'manual_review':
        return 'Manual review required before execution';
      case 'proposal_review':
        return 'Pending approval before execution';
      case 'high_risk_review':
        return 'High-risk action requires approval';
      case 'analysis_only':
      case 'ephemeral_preview':
        return 'Not executed in this session';
      case 'incident_review':
        return 'Execution failed and requires incident review';
      default:
        return null;
    }
  }
}
