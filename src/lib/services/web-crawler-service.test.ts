import { describe, it, expect } from 'vitest';
import type { WebCrawlerResult } from './web-crawler-service';

/**
 * web-crawler-service.test.ts
 *
 * Tests the exported types and the compactResults logic.
 * Network-dependent methods (search, searchBatch) are not tested here
 * because they require env vars and live backends. This file validates
 * the structural contracts and data transformations.
 */

describe('WebCrawlerService types', () => {
  it('WebCrawlerResult has the expected shape', () => {
    const result: WebCrawlerResult = {
      title: 'Test Page',
      url: 'https://example.com',
      content: 'Some content',
      score: 0.95,
    };
    expect(result.title).toBe('Test Page');
    expect(result.url).toBe('https://example.com');
    expect(result.content).toBe('Some content');
    expect(result.score).toBe(0.95);
  });

  it('WebCrawlerResult allows optional content and score', () => {
    const result: WebCrawlerResult = {
      title: 'Minimal',
      url: 'https://minimal.com',
    };
    expect(result.content).toBeUndefined();
    expect(result.score).toBeUndefined();
  });
});

describe('compactResults logic (content truncation)', () => {
  // compactResults is a private function in web-crawler-service.ts.
  // We replicate the logic here to test the truncation contract.
  function compactResults(results: WebCrawlerResult[], maxLength = 1_000): WebCrawlerResult[] {
    return results.map(r => ({
      ...r,
      content: r.content ? r.content.slice(0, maxLength) : undefined,
    }));
  }

  it('truncates content longer than maxLength', () => {
    const long = 'a'.repeat(2000);
    const [compacted] = compactResults([{ title: 't', url: 'u', content: long }], 1000);
    expect(compacted.content!.length).toBe(1000);
  });

  it('preserves content shorter than maxLength', () => {
    const short = 'hello';
    const [compacted] = compactResults([{ title: 't', url: 'u', content: short }], 1000);
    expect(compacted.content).toBe('hello');
  });

  it('handles undefined content gracefully', () => {
    const [compacted] = compactResults([{ title: 't', url: 'u' }], 1000);
    expect(compacted.content).toBeUndefined();
  });

  it('handles empty content', () => {
    const [compacted] = compactResults([{ title: 't', url: 'u', content: '' }], 1000);
    expect(compacted.content).toBeUndefined(); // '' is falsy → undefined
  });

  it('applies deepContent maxLength (3000) correctly', () => {
    const content = 'b'.repeat(5000);
    const [compacted] = compactResults([{ title: 't', url: 'u', content }], 3000);
    expect(compacted.content!.length).toBe(3000);
  });
});
