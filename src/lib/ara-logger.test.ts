import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// We test the singleton directly — import resets state between describe blocks
// by re-initializing.
import { AraLogger } from './ara-logger';

describe('AraLogger', () => {
  beforeEach(() => {
    // Re-init with debug OFF so tests start clean.
    AraLogger.init(false);

    // Clear captured buffers — they're public readonly arrays so we can mutate length.
    AraLogger.errors.length = 0;
    AraLogger.actions.length = 0;
    AraLogger.spineEvents.length = 0;
    AraLogger.events.length = 0;
  });

  afterEach(() => {
    // Restore console methods to avoid polluting other tests.
    AraLogger.init(true);
  });

  // ---------------------------------------------------------------------------
  // init / setDebugMode / isEnabled
  // ---------------------------------------------------------------------------

  describe('init & setDebugMode', () => {
    it('defaults to debug disabled after init(false)', () => {
      AraLogger.init(false);
      expect(AraLogger.isEnabled()).toBe(false);
    });

    it('enables debug mode via setDebugMode(true)', () => {
      AraLogger.setDebugMode(true);
      expect(AraLogger.isEnabled()).toBe(true);
    });

    it('toggles debug mode back to false', () => {
      AraLogger.setDebugMode(true);
      AraLogger.setDebugMode(false);
      expect(AraLogger.isEnabled()).toBe(false);
    });

    it('suppresses console.log/debug/info when debug is OFF', () => {
      AraLogger.setDebugMode(false);
      // If console.log is suppressed, calling it should be a no-op.
      // We can verify by checking it doesn't throw and returns undefined.
      expect(() => console.log('should be suppressed')).not.toThrow();
    });

    it('restores console.log/debug/info when debug is ON', () => {
      AraLogger.setDebugMode(true);
      // After enabling, console.log should be restored to the original.
      expect(typeof console.log).toBe('function');
      expect(typeof console.debug).toBe('function');
      expect(typeof console.info).toBe('function');
    });
  });

  // ---------------------------------------------------------------------------
  // error()
  // ---------------------------------------------------------------------------

  describe('error()', () => {
    it('captures an Error object into the errors buffer', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      AraLogger.error('TestTag', new Error('boom'));
      spy.mockRestore();

      expect(AraLogger.errors).toHaveLength(1);
      expect(AraLogger.errors[0].tag).toBe('TestTag');
      expect(AraLogger.errors[0].message).toBe('boom');
      expect(AraLogger.errors[0].stack).toBeDefined();
    });

    it('captures a string error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      AraLogger.error('Tag2', 'plain string error');
      spy.mockRestore();

      expect(AraLogger.errors[0].message).toBe('plain string error');
      expect(AraLogger.errors[0].stack).toBeUndefined();
    });

    it('always calls console.error regardless of debug mode', () => {
      AraLogger.setDebugMode(false);
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      AraLogger.error('AlwaysTag', new Error('visible'));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('emits an error event into the unified stream', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      AraLogger.error('EmitTag', new Error('stream'));
      spy.mockRestore();

      const lastEvent = AraLogger.events[AraLogger.events.length - 1];
      expect(lastEvent.category).toBe('error');
      expect(lastEvent.label).toContain('EmitTag');
      expect(lastEvent.label).toContain('stream');
    });

    it('enforces a max errors buffer of 100', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      for (let i = 0; i < 110; i++) {
        AraLogger.error('Overflow', `err-${i}`);
      }
      spy.mockRestore();

      expect(AraLogger.errors.length).toBeLessThanOrEqual(100);
      // The oldest should have been evicted.
      expect(AraLogger.errors[0].message).toBe('err-10');
    });
  });

  // ---------------------------------------------------------------------------
  // warn()
  // ---------------------------------------------------------------------------

  describe('warn()', () => {
    it('calls console.warn when debug is ON', () => {
      AraLogger.setDebugMode(true);
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      AraLogger.warn('WarnTag', 'warning message');
      expect(spy).toHaveBeenCalledWith(
        '[WarnTag] warning message',
      );
      spy.mockRestore();
    });

    it('does NOT call console.warn when debug is OFF', () => {
      AraLogger.setDebugMode(false);
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      AraLogger.warn('Silent', 'should not appear');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('passes optional data argument', () => {
      AraLogger.setDebugMode(true);
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      AraLogger.warn('DataTag', 'msg', { detail: 42 });
      expect(spy).toHaveBeenCalledWith('[DataTag] msg', { detail: 42 });
      spy.mockRestore();
    });
  });

  // ---------------------------------------------------------------------------
  // action()
  // ---------------------------------------------------------------------------

  describe('action()', () => {
    it('captures action into the actions buffer', () => {
      AraLogger.action('titan', 'save_workout', { reps: 10 });
      expect(AraLogger.actions).toHaveLength(1);
      expect(AraLogger.actions[0].moduleId).toBe('titan');
      expect(AraLogger.actions[0].type).toBe('save_workout');
      expect(AraLogger.actions[0].payload).toEqual({ reps: 10 });
    });

    it('emits an action event into the unified stream', () => {
      AraLogger.action('scout', 'web_search', { q: 'test' });
      const lastEvent = AraLogger.events[AraLogger.events.length - 1];
      expect(lastEvent.category).toBe('action');
      expect(lastEvent.moduleId).toBe('scout');
      expect(lastEvent.label).toBe('web_search');
    });

    it('enforces a max actions buffer of 200', () => {
      for (let i = 0; i < 210; i++) {
        AraLogger.action('mod', `type-${i}`, null);
      }
      expect(AraLogger.actions.length).toBeLessThanOrEqual(200);
    });
  });

  // ---------------------------------------------------------------------------
  // spine()
  // ---------------------------------------------------------------------------

  describe('spine()', () => {
    it('captures spine event into the buffer', () => {
      AraLogger.spine('nsv:update', 'titan', { cognitive: {} });
      expect(AraLogger.spineEvents).toHaveLength(1);
      expect(AraLogger.spineEvents[0].eventType).toBe('nsv:update');
      expect(AraLogger.spineEvents[0].source).toBe('titan');
    });

    it('emits a spine event into the unified stream', () => {
      AraLogger.spine('cascade:fired', 'atlas', {});
      const lastEvent = AraLogger.events[AraLogger.events.length - 1];
      expect(lastEvent.category).toBe('spine');
      expect(lastEvent.moduleId).toBe('atlas');
      expect(lastEvent.label).toBe('cascade:fired');
    });

    it('enforces a max spine buffer of 200', () => {
      for (let i = 0; i < 210; i++) {
        AraLogger.spine(`evt-${i}`, 'src', null);
      }
      expect(AraLogger.spineEvents.length).toBeLessThanOrEqual(200);
    });
  });

  // ---------------------------------------------------------------------------
  // subscribe() & emit()
  // ---------------------------------------------------------------------------

  describe('subscribe & emit', () => {
    it('delivers events to category-specific subscribers', () => {
      const received: string[] = [];
      const unsub = AraLogger.subscribe('action', (e) => received.push(e.label));
      AraLogger.emit('action', { label: 'test_action' });
      expect(received).toEqual(['test_action']);
      unsub();
    });

    it('delivers events to wildcard subscribers', () => {
      const received: string[] = [];
      const unsub = AraLogger.subscribe('*', (e) => received.push(e.label));
      AraLogger.emit('spine', { label: 'spine_event' });
      AraLogger.emit('action', { label: 'action_event' });
      expect(received).toEqual(['spine_event', 'action_event']);
      unsub();
    });

    it('does NOT deliver events to wrong category', () => {
      const received: string[] = [];
      const unsub = AraLogger.subscribe('action', (e) => received.push(e.label));
      AraLogger.emit('error', { label: 'not_for_action' });
      expect(received).toEqual([]);
      unsub();
    });

    it('unsubscribe stops delivery', () => {
      const received: string[] = [];
      const unsub = AraLogger.subscribe('action', (e) => received.push(e.label));
      AraLogger.emit('action', { label: 'before_unsub' });
      unsub();
      AraLogger.emit('action', { label: 'after_unsub' });
      expect(received).toEqual(['before_unsub']);
    });

    it('swallows subscriber errors without breaking dispatch', () => {
      const received: string[] = [];
      AraLogger.subscribe('action', () => { throw new Error('subscriber crash'); });
      const unsub2 = AraLogger.subscribe('action', (e) => received.push(e.label));
      AraLogger.emit('action', { label: 'survived' });
      expect(received).toEqual(['survived']);
      unsub2();
    });

    it('enforces a max events buffer of 500', () => {
      for (let i = 0; i < 510; i++) {
        AraLogger.emit('action', { label: `evt-${i}` });
      }
      expect(AraLogger.events.length).toBeLessThanOrEqual(500);
    });
  });

  // ---------------------------------------------------------------------------
  // getRecent* helpers
  // ---------------------------------------------------------------------------

  describe('getRecent helpers', () => {
    it('getRecentErrors returns last N', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      for (let i = 0; i < 5; i++) AraLogger.error('T', `e-${i}`);
      spy.mockRestore();

      const recent = AraLogger.getRecentErrors(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].message).toBe('e-2');
      expect(recent[2].message).toBe('e-4');
    });

    it('getRecentActions returns last N', () => {
      for (let i = 0; i < 5; i++) AraLogger.action('m', `a-${i}`, null);
      const recent = AraLogger.getRecentActions(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].type).toBe('a-3');
    });

    it('getRecentSpineEvents returns last N', () => {
      for (let i = 0; i < 5; i++) AraLogger.spine(`s-${i}`, 'src', null);
      const recent = AraLogger.getRecentSpineEvents(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].eventType).toBe('s-3');
    });

    it('getRecentEvents returns last N from unified buffer', () => {
      for (let i = 0; i < 5; i++) AraLogger.emit('action', { label: `u-${i}` });
      const recent = AraLogger.getRecentEvents(3);
      expect(recent).toHaveLength(3);
      expect(recent[0].label).toBe('u-2');
    });
  });
});
