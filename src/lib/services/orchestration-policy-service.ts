import {
  compareAgentPrecedence,
  type ApprovalRequirement,
  type AutopilotLevel,
  type ExecutionMode,
  type HistoryMode,
  type MutationProposal,
} from '@/lib/contracts/orchestration';

export interface ExecutionPolicy {
  requiresApproval: ApprovalRequirement;
  executionMode: ExecutionMode;
  historyMode: HistoryMode;
  canMutateState: boolean;
}

function hasMutations(proposal: MutationProposal): boolean {
  return Boolean(
    (proposal.patch && Object.keys(proposal.patch).length > 0) ||
      (proposal.vectorMutations && Object.keys(proposal.vectorMutations).length > 0) ||
      proposal.metadata?.mutatesState === true,
  );
}

export class OrchestrationPolicyService {
  static sortProposals(proposals: MutationProposal[]): MutationProposal[] {
    return [...proposals].sort((left, right) => {
      const precedence = compareAgentPrecedence(left.source, right.source);
      if (precedence !== 0) return precedence;
      if (left.confidence !== right.confidence) return right.confidence - left.confidence;
      return left.createdAt.localeCompare(right.createdAt);
    });
  }

  static resolveWinningProposal(proposals: MutationProposal[]): MutationProposal | null {
    if (proposals.length === 0) return null;
    return this.sortProposals(proposals)[0];
  }

  static getExecutionPolicy(
    autopilotLevel: AutopilotLevel,
    proposal: MutationProposal,
    options?: {
      hasConflict?: boolean;
      highRisk?: boolean;
    },
  ): ExecutionPolicy {
    const hasConflict = options?.hasConflict === true;
    const highRisk = options?.highRisk === true;
    const mutatesState = hasMutations(proposal);

    if (proposal.patientScope === 'GUEST') {
      return {
        requiresApproval: { required: false, reason: 'guest_scope' },
        executionMode: 'analysis_only',
        historyMode: 'standard',
        canMutateState: false,
      };
    }

    if (!mutatesState) {
      return {
        requiresApproval: { required: false, reason: 'none' },
        executionMode: autopilotLevel >= 5 ? 'ghost' : autopilotLevel >= 3 ? 'autonomous' : 'assisted',
        historyMode: autopilotLevel >= 5 ? 'silent' : 'standard',
        canMutateState: false,
      };
    }

    if (proposal.requiresApproval) {
      return {
        requiresApproval: { required: true, reason: 'explicit_gate' },
        executionMode: 'manual',
        historyMode: 'standard',
        canMutateState: false,
      };
    }

    if (autopilotLevel <= 2) {
      return {
        requiresApproval: { required: true, reason: 'manual_level' },
        executionMode: autopilotLevel === 0 ? 'manual' : 'assisted',
        historyMode: 'standard',
        canMutateState: false,
      };
    }

    if (hasConflict) {
      return {
        requiresApproval: { required: true, reason: 'conflict' },
        executionMode: 'manual',
        historyMode: 'standard',
        canMutateState: false,
      };
    }

    if (highRisk) {
      return {
        requiresApproval: { required: autopilotLevel < 5, reason: autopilotLevel < 5 ? 'high_risk' : 'none' },
        executionMode: autopilotLevel >= 5 ? 'ghost' : 'manual',
        historyMode: autopilotLevel >= 5 ? 'silent' : 'standard',
        canMutateState: autopilotLevel >= 5,
      };
    }

    if (autopilotLevel === 3) {
      const canAutoExecute = proposal.confidence >= 0.85;
      return {
        requiresApproval: { required: !canAutoExecute, reason: canAutoExecute ? 'none' : 'manual_level' },
        executionMode: canAutoExecute ? 'autonomous' : 'assisted',
        historyMode: 'standard',
        canMutateState: canAutoExecute,
      };
    }

    if (autopilotLevel === 4) {
      const canAutoExecute = proposal.confidence >= 0.7;
      return {
        requiresApproval: { required: !canAutoExecute, reason: canAutoExecute ? 'none' : 'manual_level' },
        executionMode: canAutoExecute ? 'autonomous' : 'assisted',
        historyMode: 'standard',
        canMutateState: canAutoExecute,
      };
    }

    return {
      requiresApproval: { required: false, reason: 'none' },
      executionMode: 'ghost',
      historyMode: 'silent',
      canMutateState: true,
    };
  }
}
