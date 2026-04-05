import { OrchestrationPerformanceServiceJs } from '@cortex-logic';
import { safeParseKmp } from '@/cortex-bridge/kmp-parse';

const _service = new OrchestrationPerformanceServiceJs();

export type CacheDomain = 'command-parse' | 'routing-decision' | 'planning-suggestion' | 'memory-search';

export interface DomainMetrics {
  cacheHits: number;
  cacheMisses: number;
  totalComputations: number;
  totalDurationMs: number;
}

export class OrchestrationPerformanceService {
  static recordCacheHit(domain: CacheDomain): void {
    _service.recordCacheHit(domain);
  }

  static recordCacheMiss(domain: CacheDomain): void {
    _service.recordCacheMiss(domain);
  }

  static recordComputation(domain: CacheDomain, durationMs: number): void {
    _service.recordComputation(domain, durationMs);
  }

  static getMetrics(domain: CacheDomain): DomainMetrics {
    const ZEROED: DomainMetrics = { cacheHits: 0, cacheMisses: 0, totalComputations: 0, totalDurationMs: 0 };
    return safeParseKmp(_service.getMetrics(domain), ZEROED, 'Performance.getMetrics');
  }

  static getAllMetrics(): Record<CacheDomain, DomainMetrics> {
    const EMPTY: Record<string, DomainMetrics> = {};
    return safeParseKmp(_service.getAllMetrics(), EMPTY, 'Performance.getAllMetrics') as Record<CacheDomain, DomainMetrics>;
  }

  static reset(): void {
    const service = _service as unknown as { reset?: () => void };
    if (typeof service.reset === 'function') {
      service.reset();
    }
  }

  /** @deprecated Use reset() */
  static resetForTests(): void {
    this.reset();
  }
}
