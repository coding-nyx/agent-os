import { describe, expect, it, vi } from 'vitest';

vi.mock('@cortex-logic', async () => await import('@/test/__mocks__/cortex-logic-mock'));

import { buildBeliefSessionInvitationSnapshot, createBeliefSessionInvitationRuntime, evaluateBeliefSessionInvitationThreshold } from './belief-trigger-service';
import type { BeliefGraph } from './belief-graph-service';

const graph: BeliefGraph = {
  nodes: [
    { id: 'b1', label: 'I am not enough', valence: 'negative', intensity: 9 },
    { id: 'b2', label: 'I always fail', valence: 'negative', intensity: 8 },
    { id: 'b3', label: 'I can recover', valence: 'positive', intensity: 6 },
  ],
  edges: [{ from: 'b1', to: 'b2', relation: 'reinforces' }],
  summary: 'Two high-intensity negative beliefs are co-activating.',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
};

describe('belief-trigger-service', () => {
  it('triggers an Agnes session invitation when negative belief intensity crosses threshold', () => {
    const decision = evaluateBeliefSessionInvitationThreshold({
      graph,
      emotionalState: {
        emotionalResilience: 4,
        stressLoad: 8,
        moodTrend: 'downward',
        traumaMarkers: null,
      },
    });

    expect(decision.shouldInvite).toBe(true);
    expect(decision.metrics.highIntensityNegativeCount).toBe(2);
    expect(decision.rationale).toEqual(
      expect.arrayContaining([
        expect.stringContaining('high-intensity negative beliefs'),
        expect.stringContaining('high stress'),
      ]),
    );
  });

  it('routes invitations through orchestration runtime and master thread snapshot', () => {
    const runtime = createBeliefSessionInvitationRuntime({
      graph,
      emotionalState: {
        emotionalResilience: 4,
        stressLoad: 8,
        moodTrend: null,
        traumaMarkers: null,
      },
      now: '2026-03-24T00:00:00.000Z',
    });

    expect(runtime).not.toBeNull();
    expect(runtime?.metadata.dispatchStatus).toBe('awaiting_approval');
    expect(runtime?.invitation.runtimeSummary.counts.awaitingApproval).toBe(1);
    expect(runtime?.invitation.threadId).toMatch(/^agnes\.belief-trigger\.[a-z0-9._-]+\.[a-z0-9]+$/);
    expect(runtime?.invitation.threadId.includes('/')).toBe(false);
    expect(runtime?.metadata.proposal.id.includes('/')).toBe(false);

    const snapshot = buildBeliefSessionInvitationSnapshot(runtime?.invitation);
    expect(snapshot?.thread.resolution.status).toBe('awaiting_approval');
    expect(snapshot?.proposals[0]).toMatchObject({
      lifecycle: 'pending_approval',
      origin: 'runtime',
    });
  });
});
