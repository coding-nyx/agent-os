import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { OrchestrationPerformanceService } from './orchestration-performance-service';

describe('OrchestrationCacheService', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
    OrchestrationPerformanceService.resetForTests();
  });

  it('reuses sync results for repeated command parsing keys', () => {
    const compute = vi.fn(() => ({ ok: true }));

    const first = OrchestrationCacheService.remember('command-parse', 'same-key', compute);
    const second = OrchestrationCacheService.remember('command-parse', 'same-key', compute);

    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(OrchestrationPerformanceService.getMetrics('command-parse')).toMatchObject({
      cacheHits: 1,
      cacheMisses: 1,
      totalComputations: 1,
    });
  });

  it('dedupes inflight async lookups for repeated memory queries', async () => {
    const compute = vi.fn(async () => ['result']);

    const [first, second] = await Promise.all([
      OrchestrationCacheService.rememberAsync('memory-search', 'same-query', compute),
      OrchestrationCacheService.rememberAsync('memory-search', 'same-query', compute),
    ]);

    expect(first).toEqual(['result']);
    expect(second).toEqual(['result']);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(OrchestrationPerformanceService.getMetrics('memory-search')).toMatchObject({
      cacheHits: 1,
      cacheMisses: 1,
      totalComputations: 1,
    });
  });
});
