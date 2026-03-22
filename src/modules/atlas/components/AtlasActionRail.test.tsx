import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('renders Nexus access alongside the supplied quick add action', () => {
    render(
      <AtlasActionRail quickAddAction={<button type="button">Quick add</button>} />
    );

    expect(screen.getByRole('button', { name: 'Open Nexus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quick add' })).toBeInTheDocument();
  });

  it('dispatches the Nexus overlay handler when pressed', async () => {
    const user = userEvent.setup();
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <AtlasActionRail quickAddAction={<button type="button">Quick add</button>} />
    );

    await user.click(screen.getByRole('button', { name: 'Open Nexus' }));

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'open-nexus' }));
  });
});
