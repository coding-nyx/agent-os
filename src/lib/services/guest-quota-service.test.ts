import { describe, it, expect, beforeEach } from 'vitest';
import { GuestQuotaService } from './guest-quota-service';

describe('GuestQuotaService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default quota when localStorage is empty', () => {
    const quota = GuestQuotaService.getQuota();
    expect(quota.totalTurnsUsed).toBe(0);
    expect(quota.maxTurnsAllowed).toBe(10);
    expect(quota.isHardLocked).toBe(false);
  });

  it('incrementTurn increments totalTurnsUsed', () => {
    const q1 = GuestQuotaService.incrementTurn();
    expect(q1.totalTurnsUsed).toBe(1);

    const q2 = GuestQuotaService.incrementTurn();
    expect(q2.totalTurnsUsed).toBe(2);
  });

  it('persists quota to localStorage', () => {
    GuestQuotaService.incrementTurn();
    const stored = JSON.parse(localStorage.getItem('nexus_guest_quota')!);
    expect(stored.totalTurnsUsed).toBe(1);
  });

  it('hard-locks when reaching max turns', () => {
    for (let i = 0; i < 9; i++) {
      GuestQuotaService.incrementTurn();
    }
    const beforeMax = GuestQuotaService.getQuota();
    expect(beforeMax.isHardLocked).toBe(false);

    const atMax = GuestQuotaService.incrementTurn();
    expect(atMax.totalTurnsUsed).toBe(10);
    expect(atMax.isHardLocked).toBe(true);
  });

  it('reset clears the quota from localStorage', () => {
    GuestQuotaService.incrementTurn();
    GuestQuotaService.reset();
    expect(localStorage.getItem('nexus_guest_quota')).toBeNull();

    const fresh = GuestQuotaService.getQuota();
    expect(fresh.totalTurnsUsed).toBe(0);
  });
});
