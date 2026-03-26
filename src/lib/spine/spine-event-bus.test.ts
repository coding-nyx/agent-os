import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpineEventPayload } from '@/lib/types';
import { InMemoryDataProvider } from '@/lib/data-layer';

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
    Spine.setUser(null);
    Spine.setDataLayer(new InMemoryDataProvider());
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

  it('persists spec-adapted events alongside spine event logs', async () => {
    const dataLayer = new InMemoryDataProvider();
    Spine.setDataLayer(dataLayer);
    Spine.setUser('user-1');

    Spine.emit({
      type: 'FINANCIAL_STRESS',
      source: 'ledger',
      domain: 'R',
      priority: 'alert',
      data: {
        intent: 'reduce friction',
        confidence: 0.92,
        patient_scope: 'GUEST',
        mutations: {
          friction: -0.3,
          vitality: 0.1,
          ignored: 'skip-me',
        },
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    const spineEvents = await dataLayer.listDocuments('spine_events/user-1/events');
    const specEvents = await dataLayer.listDocuments('spine_events/user-1/spec_events');

    expect(spineEvents).toHaveLength(1);
    expect(specEvents).toHaveLength(1);
    expect(specEvents[0]).toMatchObject({
      header: {
        source: 'LEDGER',
        priority: 2,
      },
      payload: {
        intent: 'reduce friction',
        mutations: {
          friction: -0.3,
          vitality: 0.1,
        },
      },
      logic_gates: {
        confidence: 0.92,
        patient_scope: 'GUEST',
      },
    });
    expect(specEvents[0].payload.mutations).not.toHaveProperty('ignored');
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

    it('suppresses duplicate system alert cascades within the cooldown window', () => {
      const burnoutHandler = vi.fn();
      Spine.on('BURNOUT_WARNING', burnoutHandler);

      const rule: CascadeRule = {
        id: 'burnout-cooldown-test',
        trigger: 'VITAL_UPDATED',
        condition: () => true,
        transform: () => ({
          type: 'BURNOUT_WARNING' as const,
          source: 'cascade:test',
          domain: 'system' as const,
          priority: 'critical' as const,
          data: { reason: 'high_fatigue_low_resilience' },
          cascadeDepth: 0,
        }),
      };
      Spine.registerCascadeRules([rule]);

      // Emit VITAL_UPDATED twice in quick succession.
      Spine.emit(makeTestEvent());
      Spine.emit(makeTestEvent());

      // Only the first cascade should fire; the second is suppressed by the cooldown.
      expect(burnoutHandler).toHaveBeenCalledTimes(1);
    });

    it('allows a system alert to re-fire after resetAlertCooldowns()', () => {
      const burnoutHandler = vi.fn();
      Spine.on('BURNOUT_WARNING', burnoutHandler);

      const rule: CascadeRule = {
        id: 'burnout-reset-test',
        trigger: 'VITAL_UPDATED',
        condition: () => true,
        transform: () => ({
          type: 'BURNOUT_WARNING' as const,
          source: 'cascade:test',
          domain: 'system' as const,
          priority: 'critical' as const,
          data: { reason: 'high_fatigue_low_resilience' },
          cascadeDepth: 0,
        }),
      };
      Spine.registerCascadeRules([rule]);

      Spine.emit(makeTestEvent());
      expect(burnoutHandler).toHaveBeenCalledTimes(1);

      // Advance past the 500ms debounce window and reset the alert cooldown.
      vi.advanceTimersByTime(600);
      Spine.resetAlertCooldowns();

      Spine.emit(makeTestEvent());
      expect(burnoutHandler).toHaveBeenCalledTimes(2);
    });
  });
});
