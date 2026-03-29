import { describe, expect, it } from 'vitest';
import { composeBoundedContext } from './context-budgeter';

describe('composeBoundedContext', () => {
  it('enforces strict max chars by trimming sections in priority order', () => {
    const output = composeBoundedContext({
      title: '[SYSTEM CONTEXT]',
      identityLines: ['- Preferred Name: Test User', '- Pronouns: they/them'],
      nsvBlock: 'NSV\n' + 'A'.repeat(1200),
      insightLines: Array.from({ length: 20 }, (_, i) => `Insight ${i}: ${'B'.repeat(120)}`),
      extensionBlock: 'EXT\n' + 'C'.repeat(900),
      maxChars: 900,
      minNsvChars: 200,
    });

    expect(output.length).toBeLessThanOrEqual(900);
    expect(output).toContain('[SYSTEM CONTEXT]');
    expect(output).toContain('Preferred Name');
  });

  it('returns compact header when budget is tiny', () => {
    const output = composeBoundedContext({
      title: '[SYSTEM CONTEXT]',
      identityLines: ['- Preferred Name: T'],
      maxChars: 420,
    });

    expect(output).toContain('[SYSTEM CONTEXT]');
    expect(output.length).toBeLessThanOrEqual(420);
  });
});
