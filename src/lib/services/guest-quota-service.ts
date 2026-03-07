import { GuestQuota } from '../types';

const STORAGE_KEY = 'nexus_guest_quota';
const MAX_TURNS = 10;

export const GuestQuotaService = {
  getQuota(): GuestQuota {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      totalTurnsUsed: 0,
      maxTurnsAllowed: MAX_TURNS,
      isHardLocked: false
    };
  },

  incrementTurn(): GuestQuota {
    const current = this.getQuota();
    const next: GuestQuota = {
      ...current,
      totalTurnsUsed: current.totalTurnsUsed + 1,
      isHardLocked: (current.totalTurnsUsed + 1) >= current.maxTurnsAllowed
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  },

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
};
