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
import { RuntimeSemanticsBuilderJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _runtimeBuilder = new RuntimeSemanticsBuilderJs();

function deriveExecutionStatus(
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'],
): ActionOrchestrationMetadata['execution']['status'] {
  return _runtimeBuilder.deriveExecutionStatus(dispatchStatus) as ActionOrchestrationMetadata['execution']['status'];
}

function defaultApprovalRequirement(
  dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'],
): ApprovalRequirement {
  const SAFE_DEFAULT: ApprovalRequirement = { required: true, reason: 'kmp_error' };
  return safeParseKmp(_runtimeBuilder.defaultApprovalRequirement(dispatchStatus), SAFE_DEFAULT, 'Runtime.defaultApprovalRequirement');
}

export class OrchestrationRuntimeService {
  static buildRuntimeSemantics(input: {
    autopilotLevel: AutopilotLevel;
    historyMode: HistoryMode;
    dispatchStatus: ActionOrchestrationMetadata['dispatchStatus'];
    highRisk: boolean;
  }): RuntimeSemantics {
    const s = _runtimeBuilder.build(input.autopilotLevel, input.historyMode, input.dispatchStatus, input.highRisk);
    return {
      autopilotLevel: s.autopilotLevel as AutopilotLevel,
      autonomy: s.autonomy as RuntimeAutonomy,
      disposition: s.disposition as RuntimeSemantics['disposition'],
      historyDestination: s.historyDestination as RuntimeSemantics['historyDestination'],
      willPersistHistory: s.willPersistHistory,
      shouldNotifyUser: s.shouldNotifyUser,
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
    return _runtimeBuilder.getNoticePrefix(runtime.disposition) ?? null;
  }
}
