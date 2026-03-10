import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConsolidation } from './useConsolidation';
import { MemoryManager } from '@/lib/ai-adapters/memory-manager';
import { ModuleMemoryService } from '../services/module-memory-service';

const mockSendMessage = vi.fn(async () => ({
  response: { fullText: 'SUMMARY: short\nINSIGHTS:\n- first\n- second' },
  updatedHistory: []
}));

vi.mock('../services/module-memory-service', () => ({
  ModuleMemoryService: {
    getEnvelope: vi.fn(async () => null),
    initializeEnvelope: vi.fn(),
    commitSession: vi.fn(async () => undefined)
  }
}));

vi.mock('../services/semantic-memory-service', () => ({
  SemanticMemoryService: {
    upsertFact: vi.fn(async () => undefined)
  }
}));

describe('useConsolidation', () => {
  const enhanceContext = vi.fn((context) => context);
  const mountedRef = { current: true };
  const options = {
    moduleId: 'test',
    userId: 'user',
    isGuest: false,
    encryptionKey: {} as CryptoKey,
    sendMessage: mockSendMessage,
    enhanceContext,
    mountedRef
  };

  beforeEach(() => {
    mockSendMessage.mockClear();
    enhanceContext.mockClear();
    ModuleMemoryService.commitSession = vi.fn(async () => undefined);
    vi.spyOn(MemoryManager, 'getConsolidationTokenThreshold').mockRestore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('consolidates when token threshold is exceeded', async () => {
    vi.spyOn(MemoryManager, 'getConsolidationTokenThreshold').mockReturnValue(1);
    const { result } = renderHook(() => useConsolidation(options));
    const history = Array.from({ length: MemoryManager.getConsolidationKeepCount() + 5 }, (_, i) => ({
      role: 'user' as const,
      content: `msg-${i}`
    }));

    let consolidation = null;
    await act(async () => {
      consolidation = await result.current.consolidateIfNeeded(history, new Date().toISOString());
    });

    expect(consolidation).not.toBeNull();
    expect(ModuleMemoryService.commitSession).toHaveBeenCalledTimes(1);
    expect(consolidation?.trimmedHistory.length).toBe(MemoryManager.getConsolidationKeepCount());
    expect(consolidation?.metadata.trigger).toBe('token');
  });

  it('consolidates when window length exceeds keep count even if tokens low', async () => {
    vi.spyOn(MemoryManager, 'getConsolidationTokenThreshold').mockReturnValue(999999);
    const { result } = renderHook(() => useConsolidation(options));
    const longHistory = Array.from({ length: MemoryManager.getConsolidationKeepCount() + 2 }, (_, i) => ({
      role: 'assistant' as const,
      content: `line-${i}`
    }));

    let consolidation = null;
    await act(async () => {
      consolidation = await result.current.consolidateIfNeeded(longHistory, new Date().toISOString());
    });

    expect(consolidation).not.toBeNull();
    expect(consolidation?.metadata.trigger).toBe('window');
  });

  it('skips consolidation when thresholds not met', async () => {
    vi.spyOn(MemoryManager, 'getConsolidationTokenThreshold').mockReturnValue(1_000_000);
    const { result } = renderHook(() => useConsolidation(options));
    const shortHistory = [{ role: 'user' as const, content: 'tiny' }];

    let consolidation = null;
    await act(async () => {
      consolidation = await result.current.consolidateIfNeeded(shortHistory, new Date().toISOString());
    });

    expect(consolidation).toBeNull();
    expect(ModuleMemoryService.commitSession).not.toHaveBeenCalled();
  });

  it('skips consolidation when encryption key is missing for protected modules', async () => {
    const opts = { ...options, moduleId: 'agnes', encryptionKey: null };
    vi.spyOn(MemoryManager, 'getConsolidationTokenThreshold').mockReturnValue(1);
    const { result } = renderHook(() => useConsolidation(opts));
    const history = Array.from({ length: MemoryManager.getConsolidationKeepCount() + 1 }, (_, i) => ({
      role: 'assistant' as const,
      content: `msg-${i}`
    }));

    let consolidation = null;
    await act(async () => {
      consolidation = await result.current.consolidateIfNeeded(history, new Date().toISOString());
    });

    expect(consolidation).toBeNull();
    expect(ModuleMemoryService.commitSession).not.toHaveBeenCalled();
  });
});
