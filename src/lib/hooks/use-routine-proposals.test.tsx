import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionHub } from '@/lib/actions/action-hub';
import { Spine } from '@/lib/spine/spine-event-bus';
import { useRoutineProposals } from './use-routine-proposals';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    isGuest: false,
  }),
}));

describe('useRoutineProposals', () => {
  beforeEach(() => {
    Spine.clear();
    vi.restoreAllMocks();
  });

  it('captures routine proposals from Spine events', () => {
    const { result } = renderHook(() => useRoutineProposals('any'));

    act(() => {
      Spine.emit({
        type: 'ROUTINE_PROPOSED',
        source: 'atlas',
        domain: 'system',
        priority: 'info',
        data: {
          proposal: {
            id: 'routine-proposal-1',
            routine: {
              id: 'routine-1',
              name: 'Morning planning',
              moduleId: 'atlas',
              recurrence: { kind: 'once', dueAt: '2026-03-24T09:00:00.000Z', timezone: 'UTC' },
              timezone: 'UTC',
              trigger: { type: 'notification' },
              enabled: true,
              createdBy: 'agent',
              createdAt: '2026-03-24T00:00:00.000Z',
              updatedAt: '2026-03-24T00:00:00.000Z',
            },
            createdBy: 'agent',
            source: { moduleId: 'atlas' },
          },
        },
      });
    });

    expect(result.current.status).toBe('proposed');
    expect(result.current.activeProposal?.routine.name).toBe('Morning planning');
  });

  it('confirms routines through the routine action path', async () => {
    const executeSpy = vi.spyOn(ActionHub, 'execute').mockResolvedValue(true);
    const { result } = renderHook(() => useRoutineProposals('any'));

    act(() => {
      Spine.emit({
        type: 'ROUTINE_PROPOSED',
        source: 'atlas',
        domain: 'system',
        priority: 'info',
        data: {
          proposal: {
            id: 'routine-proposal-2',
            routine: {
              id: 'routine-2',
              name: 'Evening reset',
              moduleId: 'atlas',
              recurrence: { kind: 'once', dueAt: '2026-03-24T20:00:00.000Z', timezone: 'UTC' },
              timezone: 'UTC',
              trigger: { type: 'notification' },
              enabled: true,
              createdBy: 'agent',
              createdAt: '2026-03-24T00:00:00.000Z',
              updatedAt: '2026-03-24T00:00:00.000Z',
            },
            createdBy: 'agent',
            source: { moduleId: 'atlas' },
          },
        },
      });
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(executeSpy).toHaveBeenCalledWith('atlas', 'confirm_routine', expect.objectContaining({
      payload: { proposalId: 'routine-proposal-2' },
    }));
    expect(result.current.status).toBe('confirmed');
    expect(result.current.activeProposal).toBeNull();
  });
});
