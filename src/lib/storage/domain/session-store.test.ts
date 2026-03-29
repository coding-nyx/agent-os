import { describe, expect, it } from 'vitest';
import { compactSessionMessages, MAX_PERSISTED_SESSION_MESSAGES, sanitizeSessionMessages } from './session-store';
import type { Message } from '@/lib/types';

describe('session-store domain helpers', () => {
  it('strips debug artifacts and preserves canonical fields', () => {
    const input: Message[] = [
      {
        role: 'assistant',
        content: 'hello',
        timestamp: '2026-01-01T00:00:00.000Z',
        threadId: 't1',
        debugMeta: { reasoning: 'internal' },
        tool_calls: [{ id: '1', type: 'function', function: { name: 'x', arguments: '{}' } }],
      },
    ];

    const result = sanitizeSessionMessages(input);
    expect(result.debugStripped).toBe(true);
    expect(result.messages).toHaveLength(1);
    expect((result.messages[0] as any).debugMeta).toBeUndefined();
    expect((result.messages[0] as any).tool_calls).toBeUndefined();
  });

  it('keeps newest messages when compacting', () => {
    const messages = Array.from({ length: MAX_PERSISTED_SESSION_MESSAGES + 5 }, (_, idx) => ({
      role: 'user' as const,
      content: `m-${idx}`,
      timestamp: new Date().toISOString(),
    }));

    const compacted = compactSessionMessages(messages);
    expect(compacted.droppedCount).toBe(5);
    expect(compacted.messages).toHaveLength(MAX_PERSISTED_SESSION_MESSAGES);
    expect(compacted.messages[0].content).toBe(`m-5`);
  });
});
