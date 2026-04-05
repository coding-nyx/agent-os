import { describe, it, expect, vi } from 'vitest';
import { getActionHubJs } from '@/cortex-bridge/action-hub-bridge';

describe('ActionHub KMP bridge', () => {
  it('should have handlers registered for titan actions', () => {
    // Create a mock data layer
    const mockCallbacks = {
      getDocument: vi.fn().mockImplementation((_c, _id, onComplete) => onComplete(null)),
      setDocument: vi.fn().mockImplementation((_c, _id, _d, onComplete) => onComplete()),
      updateDocument: vi.fn().mockImplementation((_c, _id, _u, onComplete) => onComplete()),
      deleteDocument: vi.fn().mockImplementation((_c, _id, onComplete) => onComplete()),
      batchWrite: vi.fn().mockImplementation((_ops, onComplete) => onComplete()),
      updateNsv: vi.fn().mockImplementation((_patch, onComplete) => onComplete()),
      emitSpineEvent: vi.fn().mockImplementation(() => {}),
    };

    const hub = getActionHubJs(null);

    if (!hub) {
      console.warn('ActionHubJs not available');
      expect(hub).toBeTruthy();
      return;
    }

    console.log('ActionHubJs instance created successfully');
    console.log('Testing handler registration...');

    // Test if handlers are registered
    const titanLogSleepRegistered = (hub as any).isRegistered('titan', 'log_sleep');
    console.log('titanLogSleepRegistered:', titanLogSleepRegistered);

    const atlasLogSleepRegistered = (hub as any).isRegistered('atlas', 'log_sleep');
    console.log('atlasLogSleepRegistered:', atlasLogSleepRegistered);

    const ledgerRecordTransactionRegistered = (hub as any).isRegistered('ledger', 'record_transaction');
    console.log('ledgerRecordTransactionRegistered:', ledgerRecordTransactionRegistered);

    // These should be true if handlers are properly registered
    expect(titanLogSleepRegistered).toBe(true);
    expect(atlasLogSleepRegistered).toBe(true);
  });

  it('should execute a titan action', (done) => {
    const hub = getActionHubJs(null);

    if (!hub) {
      expect(hub).toBeTruthy();
      done();
      return;
    }

    const payload = {
      durationHours: 8,
      quality: 8,
      date: '2026-04-01',
      bedtime: '22:00',
      wakeTime: '06:00',
    };

    (hub as any).execute(
      'titan',
      'log_sleep',
      JSON.stringify(payload),
      'test-user-123',
      (handled: boolean) => {
        console.log('Action execution completed, handled:', handled);
        expect(handled).toBe(true);
        done();
      },
      (err: string) => {
        console.error('Action execution failed:', err);
        done(new Error(err));
      }
    );
  });
});
