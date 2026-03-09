import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpineEventPayload } from '@/lib/types';

// We need to mock firebase to avoid import errors in test environment
vi.mock('@/lib/firebase', () => ({
  getFirebase: () => ({ db: null }),
}));

// Import after mock
const { Spine } = await import('./spine-event-bus');
type CascadeRule = import('./spine-event-bus').CascadeRule;

function makeTestEvent(overrides: Partial<SpineEventPayload> = {}): SpineEventPayload {
  return {
    type: 'VITAL_UPDATED',
    source: 'test',
    domain: 'B',
    data: {},
    priority: 'info',
    ...overrides,
  };
}

describe('SpineEventBus', () => {
  beforeEach(() => {
    Spine.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notify listeners on emit', () => {
    const handler = vi.fn();
    Spine.on('VITAL_UPDATED', handler);

    Spine.emit(makeTestEvent());

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: 'VITAL_UPDATED',
      source: 'test',
    });
  });

  it('unsubscribe removes the listener', () => {
    const handler = vi.fn();
    const unsub = Spine.on('VITAL_UPDATED', handler);

    unsub();
    Spine.emit(makeTestEvent());

    expect(handler).not.toHaveBeenCalled();
  });

  it('wildcard listener receives all event types', () => {
    const handler = vi.fn();
    Spine.on('*', handler);

    Spine.emit(makeTestEvent({ type: 'VITAL_UPDATED' }));
    vi.advanceTimersByTime(600);

    Spine.emit(makeTestEvent({ type: 'SESSION_STARTED', source: 'other' }));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('getRecentEvents stores emitted events', () => {
    Spine.emit(makeTestEvent());
    const events = Spine.getRecentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('VITAL_UPDATED');
  });

  it('getRecentEvents filters by type', () => {
    Spine.emit(makeTestEvent({ type: 'VITAL_UPDATED' }));
    vi.advanceTimersByTime(600);
    Spine.emit(makeTestEvent({ type: 'SESSION_STARTED', source: 'other' }));

    const filtered = Spine.getRecentEvents({ type: 'SESSION_STARTED' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe('SESSION_STARTED');
  });

  it('getRecentEvents filters by source', () => {
    Spine.emit(makeTestEvent({ source: 'alpha' }));
    vi.advanceTimersByTime(600);
    Spine.emit(makeTestEvent({ source: 'beta' }));

    const filtered = Spine.getRecentEvents({ source: 'beta' });
    expect(filtered).toHaveLength(1);
  });

  it('debounces duplicate type+source within 500ms', () => {
    const handler = vi.fn();
    Spine.on('VITAL_UPDATED', handler);

    Spine.emit(makeTestEvent());
    Spine.emit(makeTestEvent()); // same type+source, should be debounced

    expect(handler).toHaveBeenCalledOnce();
  });

  it('allows same type+source after debounce window (500ms)', () => {
    const handler = vi.fn();
    Spine.on('VITAL_UPDATED', handler);

    Spine.emit(makeTestEvent());
    vi.advanceTimersByTime(600);
    Spine.emit(makeTestEvent());

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('defaults cascadeDepth to 0 when omitted and validates payload', () => {
    const handler = vi.fn();
    Spine.on('VITAL_UPDATED', handler);

    const emitted = Spine.emit({
      type: 'VITAL_UPDATED',
      source: 'alpha',
      domain: 'B',
      data: {},
      priority: 'info',
    });

    expect(emitted.cascadeDepth).toBe(0);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('throws when required fields are missing', () => {
    // @ts-expect-error Deliberately invalid for runtime validation
    expect(() => Spine.emit({})).toThrow('[SpineEventBus] Missing required field: type');

    // @ts-expect-error Deliberately invalid for runtime validation
    expect(() =>
      Spine.emit({
        type: 'VITAL_UPDATED',
        source: '',
        domain: 'B',
        data: {},
        priority: 'info',
      })
    ).toThrow('[SpineEventBus] Missing or invalid required field: source');

    // @ts-expect-error invalid domain
    expect(() =>
      Spine.emit({
        type: 'VITAL_UPDATED',
        source: 'alpha',
        // @ts-expect-error invalid domain for runtime validation
        domain: 'X',
        data: {},
        priority: 'info',
      })
    ).toThrow('[SpineEventBus] Invalid domain "X"');
  });

  it('supports publish/subscribe aliases', () => {
    const handler = vi.fn();
    const unsub = Spine.subscribe('SESSION_STARTED', handler);

    Spine.publish({
      type: 'SESSION_STARTED',
      source: 'alias-test',
      domain: 'system',
      priority: 'info',
      data: {},
    });

    expect(handler).toHaveBeenCalledOnce();
    unsub();
  });

  describe('cascade rules', () => {
    it('fires cascade rule when condition matches', () => {
      const cascadeHandler = vi.fn();
      Spine.on('BURNOUT_WARNING', cascadeHandler);

      const rule: CascadeRule = {
        id: 'test-cascade',
        trigger: 'VITAL_UPDATED',
        condition: () => true,
        transform: () => ({
          type: 'BURNOUT_WARNING',
          source: 'cascade',
          domain: 'system',
          priority: 'critical',
          data: { reason: 'test' },
        }),
      };
      Spine.registerCascadeRules([rule]);

      Spine.emit(makeTestEvent());

      expect(cascadeHandler).toHaveBeenCalledOnce();
      expect(cascadeHandler.mock.calls[0][0].cascadeDepth).toBe(1);
    });

    it('does not cascade beyond depth 3', () => {
      const handler = vi.fn();
      Spine.on('VITAL_UPDATED', handler);

      // Self-cascading rule
      const rule: CascadeRule = {
        id: 'recursive',
        trigger: 'VITAL_UPDATED',
        condition: () => true,
        transform: (event) => ({
          type: 'VITAL_UPDATED',
          source: `cascade-${event.cascadeDepth}`,
          domain: 'B',
          priority: 'info',
          data: {},
          cascadeDepth: 0,
        }),
      };
      Spine.registerCascadeRules([rule]);

      Spine.emit(makeTestEvent());

      // depth 0 → cascade at 1 → cascade at 2 → stops at 3 (no cascade)
      expect(handler).toHaveBeenCalledTimes(4);
    });

    it('does not fire cascade when condition returns false', () => {
      const handler = vi.fn();
      Spine.on('BURNOUT_WARNING', handler);

      const rule: CascadeRule = {
        id: 'blocked',
        trigger: 'VITAL_UPDATED',
        condition: () => false,
        transform: () => ({
          type: 'BURNOUT_WARNING',
          source: 'cascade',
          domain: 'system',
          priority: 'critical',
          data: {},
          cascadeDepth: 0,
        }),
      };
      Spine.registerCascadeRules([rule]);

      Spine.emit(makeTestEvent());

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
