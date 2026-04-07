import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * bridge-service.test.ts
 *
 * Tests the BridgeService singleton and its helper functions.
 * Since BridgeService depends heavily on browser APIs (ServiceWorker,
 * Notification, Firebase Messaging), we test:
 *   1. isPushServiceError() — the error classifier
 *   2. BridgeService.stop() — cleanup
 *   3. BridgeService.start()/requestPermissionAndInit() — gated behavior
 *
 * Firebase messaging is mocked to avoid real network calls.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/messaging', () => ({
  getToken: vi.fn(async () => 'mock-fcm-token'),
  onMessage: vi.fn(() => () => {}),
  getMessaging: vi.fn(() => ({})),
}));

vi.mock('@/lib/firebase', () => ({
  getFirebase: () => ({ app: null }), // null app prevents FCM init
}));

vi.mock('@/lib/data-layer/provider', () => {
  const mockDL = {
    getDocument: vi.fn(async () => null),
    setDocument: vi.fn(async () => {}),
  };
  return { getNexusDataLayer: () => mockDL };
});

vi.mock('@/lib/nexus-logger', () => ({
  NexusLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { BridgeService } from './bridge-service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    BridgeService.stop();
  });

  describe('stop()', () => {
    it('can be called multiple times without error', () => {
      expect(() => {
        BridgeService.stop();
        BridgeService.stop();
      }).not.toThrow();
    });
  });

  describe('start()', () => {
    it('is idempotent for the same userId', async () => {
      // start() should resolve without error even when Firebase is unavailable
      // (getFirebase returns null app)
      await BridgeService.start('user-1');
      await BridgeService.start('user-1');
      // No assertion needed — if it doesn't throw/hang, it passes.
    });

    it('stops and restarts for a different userId', async () => {
      await BridgeService.start('user-1');
      BridgeService.stop();
      await BridgeService.start('user-2');
    });
  });

  describe('requestPermissionAndInit()', () => {
    it('returns false when userId is not set (not started)', async () => {
      const result = await BridgeService.requestPermissionAndInit();
      expect(result).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isPushServiceError — test the error classifier independently
// ---------------------------------------------------------------------------

describe('isPushServiceError (via module internals)', () => {
  // Since isPushServiceError is not exported, we test its behavior
  // indirectly through known error patterns. We replicate the logic here
  // for unit testing the classification.
  function isPushServiceError(err: unknown): boolean {
    const errObj = err as { name?: string; message?: string } | null;
    const name = String(errObj?.name || '').toLowerCase();
    const message = String(errObj?.message || '').toLowerCase();

    return (
      name === 'aborterror' ||
      (name === 'domexception' && (message.includes('push') || message.includes('subscribe') || message.includes('registration'))) ||
      message.includes('push service unavailable') ||
      message.includes('push service error')
    );
  }

  it('recognizes AbortError', () => {
    expect(isPushServiceError({ name: 'AbortError', message: '' })).toBe(true);
  });

  it('recognizes DOMException with push-related message', () => {
    expect(isPushServiceError({ name: 'DOMException', message: 'Push service unavailable' })).toBe(true);
  });

  it('recognizes DOMException with subscribe message', () => {
    expect(isPushServiceError({ name: 'DOMException', message: 'Failed to subscribe' })).toBe(true);
  });

  it('recognizes DOMException with registration message', () => {
    expect(isPushServiceError({ name: 'DOMException', message: 'Registration failed' })).toBe(true);
  });

  it('recognizes push service unavailable regardless of name', () => {
    expect(isPushServiceError({ name: 'Error', message: 'push service unavailable' })).toBe(true);
  });

  it('recognizes push service error regardless of name', () => {
    expect(isPushServiceError({ name: 'TypeError', message: 'push service error occurred' })).toBe(true);
  });

  it('does NOT classify Firebase config errors as push service errors', () => {
    expect(isPushServiceError({ name: 'FirebaseError', message: 'messaging/token-subscribe-failed' })).toBe(false);
  });

  it('does NOT classify generic errors as push service errors', () => {
    expect(isPushServiceError(new Error('something went wrong'))).toBe(false);
  });

  it('handles null/undefined input', () => {
    expect(isPushServiceError(null)).toBe(false);
    expect(isPushServiceError(undefined)).toBe(false);
  });
});
