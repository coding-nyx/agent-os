import type {
  ApprovalRequirement,
  AutopilotLevel,
  ExecutionMode,
  HistoryMode,
  MutationProposal,
} from '@/lib/contracts/orchestration';
import { OrchestrationPolicyServiceJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _service = new OrchestrationPolicyServiceJs();

export interface ExecutionPolicy {
  requiresApproval: ApprovalRequirement;
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
  canMutateState: boolean;
}

export class OrchestrationPolicyService {
  static sortProposals(proposals: MutationProposal[]): MutationProposal[] {
    return safeParseKmp(
      _service.sortProposals(JSON.stringify(proposals)),
      proposals,
      'Policy.sortProposals',
    );
  }

  static resolveWinningProposal(proposals: MutationProposal[]): MutationProposal | null {
    const result = _service.resolveWinningProposal(JSON.stringify(proposals));
    return result ? safeParseKmp<MutationProposal | null>(result, null, 'Policy.resolveWinningProposal') : null;
  }

  static getExecutionPolicy(
    autopilotLevel: AutopilotLevel,
    proposal: MutationProposal,
    options?: {
      hasConflict?: boolean;
      highRisk?: boolean;
    },
  ): ExecutionPolicy {
    return safeParseKmp(
      _service.getExecutionPolicy(
        autopilotLevel,
        JSON.stringify(proposal),
        options?.hasConflict ?? false,
        options?.highRisk ?? false,
      ),
      {
        requiresApproval: { required: true, reason: 'kmp_parse_error' },
        executionMode: 'autonomous' as ExecutionMode,
        historyMode: 'standard' as HistoryMode,
        canMutateState: false,
      },
      'Policy.getExecutionPolicy',
    );
  }
}
