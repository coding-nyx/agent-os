import { afterEach, describe, expect, it } from 'vitest';
import { AnticipatoryPlanningService } from './anticipatory-planning-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';

describe('AnticipatoryPlanningService', () => {
  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('creates an atlas triage proposal for planning collapse with alive context', () => {
    const proposal = AnticipatoryPlanningService.buildProposal({
      threadId: 'ara.dashboard',
      conversationDepth: 0,
      alerts: [
        {
          id: 'PLANNING_COLLAPSE',
          severity: 'critical',
          title: 'Planning Collapse',
          description: 'Deadlines are mounting while completion rate is critically low.',
          involvedDomains: ['planning', 'cognitive'],
          suggestedActions: [],
          detectedAt: Date.now(),
        },
      ],
      aliveContext: {
        total: 2,
        moduleIds: ['atlas'],
        byModule: {
          atlas: [
            {
              id: 'alive.goal.1',
              label: 'Morning planning',
              type: 'ACTION',
              sourceModule: 'atlas',
              provenance: 'adapter',
              semantic_tags: ['planning'],
              updatedAt: '2026-03-24T00:00:00.000Z',
            },
          ],
        },
        tags: ['planning'],
        lastUpdatedAt: '2026-03-24T00:00:00.000Z',
      },
    });

    expect(proposal).toMatchObject({
      targetModuleId: 'atlas',
      title: 'Draft a workload triage plan',
      state: 'draft',
    });
    expect(proposal?.summary).toContain('Alive inputs are available from atlas (1).');
  });

  it('does not surface a proactive draft deep into an active conversation', () => {
    const proposal = AnticipatoryPlanningService.buildProposal({
      threadId: 'ara.dashboard',
      conversationDepth: 3,
      alerts: [
        {
          id: 'BURNOUT_TRAJECTORY',
          severity: 'critical',
          title: 'Burnout Trajectory',
          description: 'High cognitive load with poor sleep and low resilience.',
          involvedDomains: ['cognitive', 'biological', 'emotional'],
          suggestedActions: [],
          detectedAt: Date.now(),
        },
      ],
      aliveContext: null,
    });

    expect(proposal).toBeNull();
  });

  it('honors the anticipatory planning feature flag', () => {
    AutonomyFeatureFlags.setTestOverrides({ anticipatoryPlanning: false });

    const proposal = AnticipatoryPlanningService.buildProposal({
      threadId: 'ara.dashboard',
      conversationDepth: 0,
      alerts: [
        {
          id: 'PLANNING_COLLAPSE',
          severity: 'critical',
          title: 'Planning Collapse',
          description: 'Deadlines are mounting while completion rate is critically low.',
          involvedDomains: ['planning', 'cognitive'],
          suggestedActions: [],
          detectedAt: Date.now(),
        },
      ],
      aliveContext: null,
    });

    expect(proposal).toBeNull();
  });
});
