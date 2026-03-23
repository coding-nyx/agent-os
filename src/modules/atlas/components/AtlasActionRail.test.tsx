import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AtlasActionRail } from './AtlasActionRail';

vi.mock('@/core/components/NeuralButton', () => ({
  NeuralButton: ({
    children,
    className,
    themeColor: _themeColor,
    ...props
  }: React.ComponentPropsWithRef<'button'> & { themeColor?: string }) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
}));

describe('AtlasActionRail', () => {
  it('renders alongside the supplied quick add action', () => {
    render(
      <AtlasActionRail quickAddAction={<button type="button">Quick add</button>} />
    );

    expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument();
  });
});
