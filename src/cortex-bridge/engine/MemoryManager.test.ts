import { describe, expect, it } from 'vitest';
import { MemoryManager } from './MemoryManager';

describe('MemoryManager thresholds', () => {
  it('computes derived thresholds consistently', () => {
    const windowSize = MemoryManager.getActiveWindowSize();
    expect(windowSize).toBeGreaterThan(0);
    expect(MemoryManager.getConsolidationKeepCount()).toBe(windowSize * 2);
    expect(MemoryManager.getConsolidationTokenThreshold()).toBeLessThan(128000);
  });

  it('slices consolidation candidates without trimming too much', () => {
    const activeWindow = MemoryManager.getActiveWindowSize();
    const messages = Array.from({ length: activeWindow + 10 }, (_, i) => ({
      role: 'assistant' as const,
      content: `message-${i}`
    }));
    const candidates = MemoryManager.getMessagesForConsolidation(messages as any);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBe(messages.length - activeWindow);
  });

  it('does not return candidates for short histories', () => {
    const messages = Array.from({ length: MemoryManager.getActiveWindowSize() }, (_, i) => ({
      role: 'assistant' as const,
      content: `msg-${i}`
    }));
    expect(MemoryManager.getMessagesForConsolidation(messages as any)).toHaveLength(0);
  });
});
