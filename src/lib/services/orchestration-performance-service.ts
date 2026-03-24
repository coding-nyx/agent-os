type CacheDomain = 'command-parse' | 'routing-decision' | 'planning-suggestion' | 'memory-search';

interface DomainMetrics {
  cacheHits: number;
  cacheMisses: number;
  totalComputations: number;
  totalDurationMs: number;
}

function ensureMetrics(
  store: Map<CacheDomain, DomainMetrics>,
  domain: CacheDomain,
): DomainMetrics {
  const existing = store.get(domain);
  if (existing) return existing;
  const created: DomainMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    totalComputations: 0,
    totalDurationMs: 0,
  };
  store.set(domain, created);
  return created;
}

export class OrchestrationPerformanceService {
  private static metrics = new Map<CacheDomain, DomainMetrics>();

  static recordCacheHit(domain: CacheDomain): void {
    ensureMetrics(this.metrics, domain).cacheHits += 1;
  }

  static recordCacheMiss(domain: CacheDomain): void {
    ensureMetrics(this.metrics, domain).cacheMisses += 1;
  }

  static recordComputation(domain: CacheDomain, durationMs: number): void {
    const metrics = ensureMetrics(this.metrics, domain);
    metrics.totalComputations += 1;
    metrics.totalDurationMs += durationMs;
  }

  static getMetrics(domain: CacheDomain): DomainMetrics {
    return { ...ensureMetrics(this.metrics, domain) };
  }

  static resetForTests(): void {
    this.metrics.clear();
  }
}
