import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePendingRecovery } from './use-pending-recovery';

describe('usePendingRecovery', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      }
    });
  });

  it('saves pending request with attempts and context hash', () => {
    const { result } = renderHook(() => usePendingRecovery('agnes'));
    act(() => {
      result.current.savePendingRequest('hello', 'ctx-hash');
    });

    const raw = localStorage.getItem('ara_pending_agnes');
    const parsed = raw ? JSON.parse(raw) : null;
    expect(parsed?.status).toBe('pending');
    expect(parsed?.attempts).toBe(0);
    expect(parsed?.contextHash).toBe('ctx-hash');
    expect(result.current.pendingRequest).toBeNull();
  });

  it('marks request blocked and then failed after max attempts', () => {
    const { result } = renderHook(() => usePendingRecovery('agnes'));
    act(() => {
      result.current.savePendingRequest('hello');
      result.current.markPendingRequestBlocked();
    });
    expect(result.current.pendingRequest?.status).toBe('blocked');

    act(() => {
      result.current.markPendingRequestFailed();
      result.current.markPendingRequestFailed();
      result.current.markPendingRequestFailed();
    });
    expect(result.current.pendingRequest?.status).toBe('failed');
    expect(result.current.pendingRequest?.attempts).toBe(3);
  });

  it('supports force-failed transition', () => {
    const { result } = renderHook(() => usePendingRecovery('agnes'));
    act(() => {
      result.current.savePendingRequest('hello');
      result.current.markPendingRequestFailed(true);
    });
    expect(result.current.pendingRequest?.status).toBe('failed');
  });
});
