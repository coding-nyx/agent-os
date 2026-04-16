import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrchestrationCacheService } from '@/lib/services/orchestration-cache-service';
import { useAraCoordination } from './useAraCoordination';

describe('useAraCoordination mention-aware routing', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
  });

  it('keeps explicitly mentioned advisory agents in the main thread without raising a routing suggestion', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    const setThreadRoutingSuggestion = vi.fn();

    const { result } = renderHook(() => useAraCoordination({
      ai: {
        messages: [{ role: 'user', content: 'Earlier context' }],
        handleSendMessage,
      },
      userId: 'user-1',
      isGuest: false,
      currentThreadId: 'thread-1',
      autopilotLevel: 2,
      navigate: vi.fn(),
      setThreadRoutingSuggestion,
      patchThreadRoutingSuggestion: vi.fn(),
      clearThreadRoutingSuggestion: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSendWithRouting('Agnes, I feel anxious about my relationship');
    });

    expect(handleSendMessage).toHaveBeenCalledWith(
      'Agnes, I feel anxious about my relationship',
      undefined,
      expect.objectContaining({ threadId: 'thread-1' }),
    );
    expect(setThreadRoutingSuggestion).not.toHaveBeenCalled();
  });

  it('still surfaces routing when a mentioned agent is the owner of a mutating intent', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    const setThreadRoutingSuggestion = vi.fn();

    const { result } = renderHook(() => useAraCoordination({
      ai: {
        messages: [{ role: 'user', content: 'Earlier context' }],
        handleSendMessage,
      },
      userId: 'user-1',
      isGuest: false,
      currentThreadId: 'thread-1',
      autopilotLevel: 2,
      navigate: vi.fn(),
      setThreadRoutingSuggestion,
      patchThreadRoutingSuggestion: vi.fn(),
      clearThreadRoutingSuggestion: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSendWithRouting('Atlas, plan my day tomorrow');
    });

    expect(setThreadRoutingSuggestion).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        target: 'atlas',
        state: 'draft',
      }),
    );
  });

  it('keeps consultative phrasing in Ara control even when a specialist is named', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    const setThreadRoutingSuggestion = vi.fn();

    const { result } = renderHook(() => useAraCoordination({
      ai: {
        messages: [{ role: 'user', content: 'Earlier context' }],
        handleSendMessage,
      },
      userId: 'user-1',
      isGuest: false,
      currentThreadId: 'thread-1',
      autopilotLevel: 2,
      navigate: vi.fn(),
      setThreadRoutingSuggestion,
      patchThreadRoutingSuggestion: vi.fn(),
      clearThreadRoutingSuggestion: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSendWithRouting('Ask Soma whether tomorrow should be a rest day');
    });

    expect(handleSendMessage).toHaveBeenCalledWith(
      'Ask Soma whether tomorrow should be a rest day',
      undefined,
      expect.objectContaining({ threadId: 'thread-1' }),
    );
    expect(setThreadRoutingSuggestion).not.toHaveBeenCalled();
  });

  it('treats ownership-transfer phrasing as a real routing signal', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    const setThreadRoutingSuggestion = vi.fn();

    const { result } = renderHook(() => useAraCoordination({
      ai: {
        messages: [{ role: 'user', content: 'Earlier context' }],
        handleSendMessage,
      },
      userId: 'user-1',
      isGuest: false,
      currentThreadId: 'thread-1',
      autopilotLevel: 2,
      navigate: vi.fn(),
      setThreadRoutingSuggestion,
      patchThreadRoutingSuggestion: vi.fn(),
      clearThreadRoutingSuggestion: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSendWithRouting('Delegate to Atlas and plan my day tomorrow');
    });

    expect(setThreadRoutingSuggestion).toHaveBeenCalledWith(
      'thread-1',
      expect.objectContaining({
        target: 'atlas',
        state: 'draft',
      }),
    );
  });

  it('prefers a fused planning path over a redundant routing draft for multi-intent planning', async () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    const setThreadRoutingSuggestion = vi.fn();

    const { result } = renderHook(() => useAraCoordination({
      ai: {
        messages: [{ role: 'user', content: 'Earlier context' }],
        handleSendMessage,
      },
      userId: 'user-1',
      isGuest: false,
      currentThreadId: 'thread-1',
      autopilotLevel: 2,
      navigate: vi.fn(),
      setThreadRoutingSuggestion,
      patchThreadRoutingSuggestion: vi.fn(),
      clearThreadRoutingSuggestion: vi.fn(),
    }));

    await act(async () => {
      await result.current.handleSendWithRouting('plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow');
    });

    expect(handleSendMessage).toHaveBeenCalledWith(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      undefined,
      expect.objectContaining({ threadId: 'thread-1' }),
    );
    expect(setThreadRoutingSuggestion).not.toHaveBeenCalled();
  });
});
