import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgnesBeliefWorkflowPanel } from './AgnesBeliefWorkflowPanel';
import { createBeliefSessionInvitationRuntime } from '../services/belief-trigger-service';

describe('AgnesBeliefWorkflowPanel', () => {
  it('renders pending proposals, supports editing, and surfaces invitation controls', async () => {
    const onConfirmProposal = vi.fn().mockResolvedValue(undefined);
    const onDismissProposal = vi.fn().mockResolvedValue(undefined);
    const onAcceptInvitation = vi.fn().mockResolvedValue(undefined);
    const onDismissInvitation = vi.fn().mockResolvedValue(undefined);

    const graph = {
      nodes: [{ id: 'confirmed', label: 'I can recover', valence: 'positive' as const, intensity: 6 }],
      edges: [],
      summary: 'Confirmed resilience anchor.',
      createdAt: '2026-03-24T00:00:00.000Z',
      updatedAt: '2026-03-24T00:00:00.000Z',
    };

    const invitationRuntime = createBeliefSessionInvitationRuntime({
      graph: {
        nodes: [
          { id: 'b1', label: 'I am not enough', valence: 'negative', intensity: 9 },
          { id: 'b2', label: 'I always fail', valence: 'negative', intensity: 8 },
        ],
        edges: [{ from: 'b1', to: 'b2', relation: 'reinforces' }],
        summary: 'Trigger runtime.',
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
      },
      emotionalState: {
        emotionalResilience: 4,
        stressLoad: 8,
        moodTrend: null,
        traumaMarkers: null,
      },
      now: '2026-03-24T00:00:00.000Z',
    });

    render(
      <AgnesBeliefWorkflowPanel
        graph={graph}
        workflow={{
          proposals: [
            {
              id: 'proposal-1',
              source: 'journal_entry',
              title: 'Review journal belief extraction',
              summary: 'Initial draft summary.',
              confidence: 0.84,
              status: 'pending',
              graph: {
                nodes: [{ id: 'b1', label: 'I am hard to love', valence: 'negative', intensity: 8 }],
                edges: [],
                summary: 'Initial draft summary.',
                createdAt: '2026-03-24T00:00:00.000Z',
                updatedAt: '2026-03-24T00:00:00.000Z',
              },
              createdAt: '2026-03-24T00:00:00.000Z',
              updatedAt: '2026-03-24T00:00:00.000Z',
            },
          ],
          invitation: invitationRuntime?.invitation ?? null,
          createdAt: '2026-03-24T00:00:00.000Z',
          updatedAt: '2026-03-24T00:00:00.000Z',
        }}
        invitationSnapshot={invitationRuntime ? {
          thread: {
            threadId: invitationRuntime.invitation.threadId,
            participants: [
              {
                moduleId: 'nexus',
                role: 'primary',
                joinedAt: '2026-03-24T00:00:00.000Z',
                state: 'active',
                presence: 'online',
              },
              {
                moduleId: 'agnes',
                role: 'secondary',
                joinedAt: '2026-03-24T00:00:00.000Z',
                state: 'waiting',
                presence: 'idle',
              },
            ],
            messages: [],
            proposals: [],
            resolution: {
              threadId: invitationRuntime.invitation.threadId,
              status: 'awaiting_approval',
              lastUpdatedAt: '2026-03-24T00:00:00.000Z',
            },
          },
          proposalCard: invitationRuntime.metadata.proposalCard,
          proposals: [
            {
              id: invitationRuntime.metadata.proposalCard.id,
              proposalId: invitationRuntime.metadata.proposal.id,
              title: invitationRuntime.metadata.proposalCard.title,
              summary: invitationRuntime.metadata.proposalCard.summary,
              source: invitationRuntime.metadata.proposalCard.source,
              status: invitationRuntime.metadata.proposalCard.status,
              lifecycle: 'pending_approval',
              approvalRequirement: invitationRuntime.metadata.proposalCard.approvalRequirement,
              executionMode: invitationRuntime.metadata.proposalCard.executionMode,
              historyMode: invitationRuntime.metadata.proposalCard.historyMode,
              dispatchStatus: invitationRuntime.metadata.dispatchStatus,
              runtimeDisposition: invitationRuntime.metadata.runtime.disposition,
              createdAt: '2026-03-24T00:00:00.000Z',
              mutable: false,
              origin: 'runtime' as const,
            },
          ],
          activeProposalId: invitationRuntime.metadata.proposalCard.id,
          runtimeSummary: invitationRuntime.invitation.runtimeSummary,
          aliveContext: null,
          mutationSupport: 'none' as const,
        } : null}
        onConfirmProposal={onConfirmProposal}
        onDismissProposal={onDismissProposal}
        onAcceptInvitation={onAcceptInvitation}
        onDismissInvitation={onDismissInvitation}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('I am hard to love'), {
      target: { value: 'I feel hard to love' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm belief update/i }));

    await waitFor(() => {
      expect(onConfirmProposal).toHaveBeenCalledWith(
        'proposal-1',
        expect.objectContaining({
          nodes: [expect.objectContaining({ label: 'I feel hard to love' })],
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    await waitFor(() => expect(onAcceptInvitation).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/session invitation ready/i)).toBeInTheDocument();
  });
});
