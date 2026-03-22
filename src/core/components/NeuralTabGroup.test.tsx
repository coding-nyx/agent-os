import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { NeuralTabGroup } from './NeuralTabGroup';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, layoutId, ...rest }: React.ComponentPropsWithRef<'div'> & { layoutId?: string }) => (
      <div className={className} {...rest}>{children}</div>
    ),
  },
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

describe('NeuralTabGroup', () => {
  const tabs = [
    { id: 'research', label: 'Research', badge: 3 },
    { id: 'overview', label: 'Overview' },
  ] as const;

  it('uses responsive full-width shell-safe nav classes', () => {
    render(
      <NeuralTabGroup
        tabs={tabs}
        activeTab="research"
        onTabChange={vi.fn()}
      />
    );

    const tablist = screen.getByRole('tablist');
    expect(tablist.className).toContain('w-fit');
    expect(tablist.className).toContain('max-w-full');
    expect(tablist.className).toContain('overflow-x-auto');
  });

  it('uses readable sentence-case typography for tabs', () => {
    render(
      <NeuralTabGroup
        tabs={tabs}
        activeTab="research"
        onTabChange={vi.fn()}
      />
    );

    const activeTab = screen.getByRole('tab', { name: /research/i });
    expect(activeTab.className).toContain('text-[12px]');
    expect(activeTab.className).toContain('font-semibold');
    expect(activeTab.className).not.toContain('uppercase');
  });

  it('keeps badges touch-readable', () => {
    const { container } = render(
      <NeuralTabGroup
        tabs={tabs}
        activeTab="research"
        onTabChange={vi.fn()}
      />
    );

    const badge = container.querySelector('span.min-h-4');
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain('text-[10px]');
  });

  it('supports arrow-key roving selection', () => {
    const onTabChange = vi.fn();

    render(
      <NeuralTabGroup
        tabs={tabs}
        activeTab="research"
        onTabChange={onTabChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('tab', { name: /research/i }), { key: 'ArrowRight' });
    expect(onTabChange).toHaveBeenCalledWith('overview');
  });
});
