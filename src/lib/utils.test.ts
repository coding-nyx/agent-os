import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn – Tailwind class merger', () => {
  it('merges multiple class strings', () => {
    expect(cn('p-4', 'mt-2')).toBe('p-4 mt-2');
  });

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });

  it('handles conditional class values', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('');
  });

  it('filters out falsy values', () => {
    expect(cn('a', undefined, null, false, 'b')).toBe('a b');
  });
});
