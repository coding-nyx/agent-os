import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import { useOrchestrationProfileSync } from './use-orchestration-profile-sync';

const mockUseAuth = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('useOrchestrationProfileSync', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    useOrchestrationStore.getState().resetShell();
  });

  it('hydrates the shell from persisted profile preferences', async () => {
    mockUseAuth.mockReturnValue({
      isGuest: false,
      profile: {
        orchestrationPreferences: {
          autopilotLevel: 4,
          historyMode: 'standard',
        },
      },
    });

    renderHook(() => useOrchestrationProfileSync());

    await waitFor(() => {
      expect(useOrchestrationStore.getState().autopilotLevel).toBe(4);
    });
    expect(useOrchestrationStore.getState().historyMode).toBe('standard');
  });

  it('falls back to migration-safe defaults when the profile has no orchestration preferences', async () => {
    useOrchestrationStore.getState().setAutopilotLevel(5);

    mockUseAuth.mockReturnValue({
      isGuest: false,
      profile: {},
    });

    renderHook(() => useOrchestrationProfileSync());

    await waitFor(() => {
      expect(useOrchestrationStore.getState().autopilotLevel).toBe(2);
    });
    expect(useOrchestrationStore.getState().historyMode).toBe('standard');
  });

  it('resets the shell for guest sessions', async () => {
    useOrchestrationStore.getState().setAutopilotLevel(5);

    mockUseAuth.mockReturnValue({
      isGuest: true,
      profile: {
        orchestrationPreferences: {
          autopilotLevel: 5,
          historyMode: 'silent',
        },
      },
    });

    renderHook(() => useOrchestrationProfileSync());

    await waitFor(() => {
      expect(useOrchestrationStore.getState().autopilotLevel).toBe(2);
    });
    expect(useOrchestrationStore.getState().historyMode).toBe('standard');
  });
});
