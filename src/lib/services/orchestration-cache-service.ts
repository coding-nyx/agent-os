import { OrchestrationPerformanceService } from './orchestration-performance-service';

type CacheDomain = 'command-parse' | 'routing-decision' | 'planning-suggestion' | 'memory-search';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS: Record<CacheDomain, number> = {
  'command-parse': 5 * 60 * 1000,
  'routing-decision': 5 * 60 * 1000,
  'planning-suggestion': 2 * 60 * 1000,
  'memory-search': 60 * 1000,
};

function nowMs(): number {
  return Date.now();
}

export class OrchestrationCacheService {
  private static values = new Map<string, CacheEntry<unknown>>();
  private static inflight = new Map<string, Promise<unknown>>();

  private static buildScopedKey(domain: CacheDomain, key: string): string {
    return `${domain}:${key}`;
  }

  private static getValidEntry<T>(domain: CacheDomain, key: string): T | null {
    const scopedKey = this.buildScopedKey(domain, key);
    const entry = this.values.get(scopedKey);
    if (!entry) return null;
    if (entry.expiresAt <= nowMs()) {
      this.values.delete(scopedKey);
      return null;
    }
    return entry.value as T;
  }

  static remember<T>(
    domain: CacheDomain,
    key: string,
    compute: () => T,
    ttlMs: number = DEFAULT_TTL_MS[domain],
  ): T {
    const cached = this.getValidEntry<T>(domain, key);
    if (cached !== null) {
      OrchestrationPerformanceService.recordCacheHit(domain);
      return cached;
    }

    OrchestrationPerformanceService.recordCacheMiss(domain);
    const startedAt = nowMs();
    const value = compute();
    OrchestrationPerformanceService.recordComputation(domain, nowMs() - startedAt);
    this.values.set(this.buildScopedKey(domain, key), {
      value,
      expiresAt: nowMs() + ttlMs,
    });
    return value;
  }

  static async rememberAsync<T>(
    domain: CacheDomain,
    key: string,
    compute: () => Promise<T>,
    ttlMs: number = DEFAULT_TTL_MS[domain],
  ): Promise<T> {
    const cached = this.getValidEntry<T>(domain, key);
    if (cached !== null) {
      OrchestrationPerformanceService.recordCacheHit(domain);
      return cached;
    }

    const scopedKey = this.buildScopedKey(domain, key);
    const existingPromise = this.inflight.get(scopedKey);
    if (existingPromise) {
      OrchestrationPerformanceService.recordCacheHit(domain);
      return existingPromise as Promise<T>;
    }

    OrchestrationPerformanceService.recordCacheMiss(domain);
    const startedAt = nowMs();
    const promise = compute()
      .then((value) => {
        OrchestrationPerformanceService.recordComputation(domain, nowMs() - startedAt);
        this.values.set(scopedKey, {
          value,
          expiresAt: nowMs() + ttlMs,
        });
        return value;
      })
      .finally(() => {
        this.inflight.delete(scopedKey);
      });
    this.inflight.set(scopedKey, promise);
    return promise;
  }

  static resetForTests(): void {
    this.values.clear();
    this.inflight.clear();
  }
}
