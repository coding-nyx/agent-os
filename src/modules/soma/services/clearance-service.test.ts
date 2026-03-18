import { describe, it, expect } from 'vitest';
import { ClearanceService } from './clearance-service';
import type { ClearanceRecord } from '@/lib/types';

// Helper: build a minimal profile-like object
function makeProfile(opts: {
  knownConditions?: string[];
  medications?: string[];
  clearances?: ClearanceRecord[];
}) {
  return {
    knownConditions: opts.knownConditions ?? [],
    medications: opts.medications ?? [],
    clearances: opts.clearances ?? [],
  };
}

describe('ClearanceService.evaluate', () => {
  // ── Granted (no contraindications) ──────────────────────────────────

  it('grants clearance when there are no conditions or medications', () => {
    const result = ClearanceService.evaluate(makeProfile({}), 'high_intensity');
    expect(result.status).toBe('granted');
    expect(result.activity).toBe('high_intensity');
    expect(result.reason).toContain('No contraindications');
  });

  it('grants clearance for an unrecognised activity pattern', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['cardiac arrhythmia'] }),
      'meditation'
    );
    expect(result.status).toBe('granted');
  });

  // ── Denied (contraindication match) ─────────────────────────────────

  it('denies high_intensity for a user with cardiac condition', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['cardiac arrhythmia'] }),
      'high_intensity'
    );
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('cardiac');
  });

  it('denies high_intensity for hypertension', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['hypertension stage 2'] }),
      'high_intensity'
    );
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('hypertension');
  });

  it('denies heavy_lifting for spinal condition', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['lumbar disc herniation'] }),
      'heavy_lifting'
    );
    expect(result.status).toBe('denied');
    expect(result.reason).toContain('disc');
  });

  it('denies endurance for asthma condition', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['exercise-induced asthma'] }),
      'endurance'
    );
    expect(result.status).toBe('denied');
  });

  it('denies flexibility for hypermobility condition', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['hypermobility syndrome'] }),
      'flexibility'
    );
    expect(result.status).toBe('denied');
  });

  it('denies based on medication matching (not just conditions)', () => {
    // "cardiac" appears in medications list
    const result = ClearanceService.evaluate(
      makeProfile({ medications: ['cardiac glycoside'] }),
      'high_intensity'
    );
    expect(result.status).toBe('denied');
  });

  // ── Conditional (recent denial) ──────────────────────────────────────

  it('returns conditional when there is a recent denial for the same activity', () => {
    const recentDenied: ClearanceRecord = {
      id: 'cl-1',
      activity: 'high_intensity',
      status: 'denied',
      reason: 'cardiac condition',
      issuedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    };
    const result = ClearanceService.evaluate(
      makeProfile({ clearances: [recentDenied] }),
      'high_intensity'
    );
    expect(result.status).toBe('conditional');
    expect(result.reason).toContain('Previously denied');
  });

  it('ignores stale denial older than 7 days', () => {
    const oldDenied: ClearanceRecord = {
      id: 'cl-2',
      activity: 'high_intensity',
      status: 'denied',
      reason: 'old cardiac issue',
      issuedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), // 8 days ago
    };
    // No active contraindications, stale denial → should grant
    const result = ClearanceService.evaluate(
      makeProfile({ clearances: [oldDenied] }),
      'high_intensity'
    );
    expect(result.status).toBe('granted');
  });

  it('contraindication takes priority over recent denial (hard deny)', () => {
    const recentDenied: ClearanceRecord = {
      id: 'cl-3',
      activity: 'high_intensity',
      status: 'denied',
      reason: 'previous cardiac concern',
      issuedAt: new Date().toISOString(),
    };
    // Active contraindication + recent denial → should be denied (not conditional)
    const result = ClearanceService.evaluate(
      makeProfile({
        knownConditions: ['cardiac arrhythmia'],
        clearances: [recentDenied],
      }),
      'high_intensity'
    );
    expect(result.status).toBe('denied');
  });

  // ── Activity name normalisation ──────────────────────────────────────

  it('normalises activity name with dashes', () => {
    const result = ClearanceService.evaluate(
      makeProfile({ knownConditions: ['cardiac arrhythmia'] }),
      'high-intensity'
    );
    expect(result.status).toBe('denied');
  });

  // ── Return shape ─────────────────────────────────────────────────────

  it('always returns a record with id, activity, status, reason, issuedAt', () => {
    const result = ClearanceService.evaluate(makeProfile({}), 'running');
    expect(typeof result.id).toBe('string');
    expect(result.activity).toBe('running');
    expect(['granted', 'denied', 'conditional']).toContain(result.status);
    expect(typeof result.reason).toBe('string');
    expect(typeof result.issuedAt).toBe('string');
  });

  it('generates a unique id for each evaluation', () => {
    const r1 = ClearanceService.evaluate(makeProfile({}), 'running');
    const r2 = ClearanceService.evaluate(makeProfile({}), 'running');
    expect(r1.id).not.toBe(r2.id);
  });
});

describe('ClearanceService.isActivitySafe', () => {
  it('returns true when clearance is granted', () => {
    expect(ClearanceService.isActivitySafe(makeProfile({}), 'running')).toBe(true);
  });

  it('returns false when clearance is denied', () => {
    expect(
      ClearanceService.isActivitySafe(
        makeProfile({ knownConditions: ['cardiac arrhythmia'] }),
        'high_intensity'
      )
    ).toBe(false);
  });

  it('returns false when clearance is conditional', () => {
    const recentDenied: ClearanceRecord = {
      id: 'cl-safe',
      activity: 'cycling',
      status: 'denied',
      reason: 'test',
      issuedAt: new Date().toISOString(),
    };
    expect(
      ClearanceService.isActivitySafe(makeProfile({ clearances: [recentDenied] }), 'cycling')
    ).toBe(false);
  });
});

describe('ClearanceService.getLatestClearance', () => {
  it('returns null for empty clearances', () => {
    expect(ClearanceService.getLatestClearance(makeProfile({}))).toBeNull();
  });

  it('returns the first clearance in the array', () => {
    const c1: ClearanceRecord = { id: 'c1', activity: 'running', status: 'granted', reason: '', issuedAt: new Date().toISOString() };
    const c2: ClearanceRecord = { id: 'c2', activity: 'cycling', status: 'denied', reason: '', issuedAt: new Date().toISOString() };
    const result = ClearanceService.getLatestClearance(makeProfile({ clearances: [c1, c2] }));
    expect(result?.id).toBe('c1');
  });
});
