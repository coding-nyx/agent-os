import { describe, expect, it } from 'vitest';
import { InMemoryDataProvider } from '@/lib/data-layer';
import { ChunkedSessionStore } from './chunked-session-store';
import { MAX_PERSISTED_SESSION_MESSAGES } from '@/lib/storage/domain/session-store';
import type { ActiveSessionState, Message } from '@/lib/types';

function buildSession(history: Message[]): ActiveSessionState {
  return {
    sessionId: 's1',
    moduleId: 'agnes',
    startTime: '2026-01-01T00:00:00.000Z',
    lastMessageAt: '2026-01-01T00:00:00.000Z',
    history,
    tokenCount: 0,
    isGuestTrial: false,
  };
}

describe('ChunkedSessionStore contract', () => {
  it('saves and reads compacted history with debug fields stripped', async () => {
    const dataLayer = new InMemoryDataProvider();
    const store = new ChunkedSessionStore(dataLayer);

    const history: Message[] = Array.from({ length: MAX_PERSISTED_SESSION_MESSAGES + 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m-${i}`,
      timestamp: new Date().toISOString(),
    } as Message & { debugMeta: { trace: number } }))
      .map((msg, i) => ({ ...msg, debugMeta: { trace: i } } as Message));

    const result = await store.save({ uid: 'u1', moduleId: 'agnes', sessionId: 's1' }, buildSession(history));
    expect(result.saved).toBe(true);
    expect(result.compacted).toBe(true);
    expect(result.droppedCount).toBe(12);
    expect(result.debugStripped).toBe(true);

    const read = await store.read({ uid: 'u1', moduleId: 'agnes', sessionId: 's1' });
    expect(read).not.toBeNull();
    expect(read!.history).toHaveLength(MAX_PERSISTED_SESSION_MESSAGES);
    expect(read!.history[0].content).toBe('m-12');
    expect((read!.history[0] as Message & { debugMeta?: unknown }).debugMeta).toBeUndefined();
  });

  it('marks near-limit/hard-limit signals for oversized session payloads', async () => {
    const dataLayer = new InMemoryDataProvider();
    const store = new ChunkedSessionStore(dataLayer);
    const longText = 'x'.repeat(100_000);
    const history: Message[] = Array.from({ length: MAX_PERSISTED_SESSION_MESSAGES }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: longText,
      timestamp: new Date().toISOString(),
    }));

    const result = await store.save({ uid: 'u2', moduleId: 'agnes', sessionId: 's2' }, buildSession(history));
    expect(result.nearLimit).toBe(true);
    expect(result.hardLimitExceeded).toBe(true);
  });

  it('clears session metadata and chunks', async () => {
    const dataLayer = new InMemoryDataProvider();
    const store = new ChunkedSessionStore(dataLayer);
    await store.save(
      { uid: 'u3', moduleId: 'agnes', sessionId: 's3' },
      buildSession([{ role: 'user', content: 'hello', timestamp: new Date().toISOString() }]),
    );

    await store.clear({ uid: 'u3', moduleId: 'agnes', sessionId: 's3' });

    const read = await store.read({ uid: 'u3', moduleId: 'agnes', sessionId: 's3' });
    expect(read).toBeNull();
    const chunks = await dataLayer.listDocuments(`active_sessions/u3_agnes_s3/messages`);
    expect(chunks).toHaveLength(0);
  });
});
