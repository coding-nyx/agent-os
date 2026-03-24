import { describe, expect, it } from 'vitest';
import type { MutationProposal } from '@/lib/contracts/orchestration';
import { OrchestrationPolicyService } from './orchestration-policy-service';

const baseProposal: MutationProposal = {
  id: 'proposal-1',
  source: 'atlas',
  intent: 'adjust bandwidth',
  vectorMutations: { bandwidth: -0.1 },
  confidence: 0.82,
  patientScope: 'USER',
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('OrchestrationPolicyService', () => {
  it('sorts proposals by precedence then confidence', () => {
    const winner = OrchestrationPolicyService.resolveWinningProposal([
      { ...baseProposal, id: 'ledger', source: 'ledger', confidence: 0.99 },
      { ...baseProposal, id: 'agnes', source: 'agnes', confidence: 0.6 },
      { ...baseProposal, id: 'atlas', source: 'atlas', confidence: 0.95 },
    ]);

    expect(winner?.id).toBe('agnes');
  });

  it('forces manual approval for low autopilot levels', () => {
    const policy = OrchestrationPolicyService.getExecutionPolicy(1, baseProposal);
    expect(policy.requiresApproval.required).toBe(true);
    expect(policy.executionMode).toBe('assisted');
    expect(policy.canMutateState).toBe(false);
  });

  it('allows autonomous execution for autopilot 4 when confidence is sufficient', () => {
    const policy = OrchestrationPolicyService.getExecutionPolicy(4, baseProposal);
    expect(policy.requiresApproval.required).toBe(false);
    expect(policy.executionMode).toBe('autonomous');
    expect(policy.canMutateState).toBe(true);
  });

  it('keeps autopilot 3 proposal-first for the same medium-confidence mutation', () => {
    const policy = OrchestrationPolicyService.getExecutionPolicy(3, baseProposal);
    expect(policy.requiresApproval.required).toBe(true);
    expect(policy.executionMode).toBe('assisted');
    expect(policy.canMutateState).toBe(false);
  });

  it('routes guest proposals into analysis-only mode', () => {
    const policy = OrchestrationPolicyService.getExecutionPolicy(5, {
      ...baseProposal,
      patientScope: 'GUEST',
    });
    expect(policy.executionMode).toBe('analysis_only');
    expect(policy.canMutateState).toBe(false);
  });

  it('uses silent ghost execution for level 5', () => {
    const policy = OrchestrationPolicyService.getExecutionPolicy(5, {
      ...baseProposal,
      confidence: 0.95,
    });
    expect(policy.executionMode).toBe('ghost');
    expect(policy.historyMode).toBe('silent');
    expect(policy.canMutateState).toBe(true);
  });

  it('treats metadata-marked mutations as state-changing proposals', () => {
    const policy = OrchestrationPolicyService.getExecutionPolicy(2, {
      ...baseProposal,
      vectorMutations: undefined,
      metadata: {
        mutatesState: true,
      },
    });

    expect(policy.requiresApproval.required).toBe(true);
    expect(policy.canMutateState).toBe(false);
  });
});
