import { describe, expect, it } from 'vitest';
import { OrchestrationOperatingModeService } from './orchestration-operating-mode-service';

describe('OrchestrationOperatingModeService', () => {
  it('derives guest analysis-only semantics', () => {
    const semantics = OrchestrationOperatingModeService.derive({
      autopilotLevel: 4,
      historyMode: 'standard',
      isGuest: true,
    });

    expect(semantics.scopeLabel).toBe('Guest scope');
    expect(semantics.authorityLabel).toBe('Analysis-only');
    expect(semantics.summaryLabel).toBe('Guest analysis-only');
  });

  it('derives ghost silent semantics for high-autonomy silent mode', () => {
    const semantics = OrchestrationOperatingModeService.derive({
      autopilotLevel: 5,
      historyMode: 'silent',
      awaitingApprovalCount: 0,
      failedCount: 0,
      escalatedCount: 0,
    });

    expect(semantics.levelLabel).toBe('L5 Ghost');
    expect(semantics.historyLabel).toBe('Silent audit');
    expect(semantics.summaryLabel).toBe('Ghost silent');
  });

  it('prioritizes incidents and approvals over normal autonomy messaging', () => {
    const approvalSemantics = OrchestrationOperatingModeService.derive({
      autopilotLevel: 4,
      historyMode: 'standard',
      awaitingApprovalCount: 2,
    });
    const incidentSemantics = OrchestrationOperatingModeService.derive({
      autopilotLevel: 4,
      historyMode: 'standard',
      awaitingApprovalCount: 2,
      escalatedCount: 1,
    });

    expect(approvalSemantics.summaryLabel).toBe('Approval gated');
    expect(incidentSemantics.summaryLabel).toBe('Incident posture');
  });
});
