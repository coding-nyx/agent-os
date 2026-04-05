import { GuestQuota } from '../types';
import { GuestQuotaServiceJs } from '@cortex-logic';

const _quota = new GuestQuotaServiceJs();

const STORAGE_KEY = 'nexus_guest_quota';

// Vitest/JSDOM test environment may provide a partial or proxy-mocked `localStorage`.
// We polyfill by replacing the global `localStorage` object (not mutating it),
// since some stubs reject property writes.
(() => {
  const ls: any = (globalThis as any).localStorage;
  const needsPolyfill =
    !ls ||
    typeof ls.getItem !== 'function' ||
    typeof ls.setItem !== 'function' ||
    typeof ls.removeItem !== 'function' ||
    typeof ls.clear !== 'function';

  if (!needsPolyfill) return;

  const memory = new Map<string, string>();
  const polyfill = {
    getItem: (key: string) => (memory.has(key) ? memory.get(key) ?? null : null),
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => {
      memory.clear();
    },
  };

  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: polyfill,
      configurable: true,
      writable: true,
    });
  } catch {
    try {
      (globalThis as any).localStorage = polyfill;
    } catch {
      // If we cannot polyfill, tests will surface the error anyway.
    }
  }
})();

export const GuestQuotaService = {
  getQuota(): GuestQuota {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as GuestQuota;
    return JSON.parse(_quota.getDefault()) as GuestQuota;
  },

  incrementTurn(): GuestQuota {
    const current = localStorage.getItem(STORAGE_KEY) ?? _quota.getDefault();
    const next = JSON.parse(_quota.computeNext(current)) as GuestQuota;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  },

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
