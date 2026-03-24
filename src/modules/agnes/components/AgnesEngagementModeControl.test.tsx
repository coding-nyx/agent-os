import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgnesEngagementModeControl } from './AgnesEngagementModeControl';

describe('AgnesEngagementModeControl', () => {
  it('renders the selected mode and switches when clicked', async () => {
    const onChange = vi.fn();
    render(
      <AgnesEngagementModeControl
        value="deep"
        onChange={onChange}
        modes={['casual', 'deep', 'somatic']}
        label="Session mode"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Deep Session' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', { name: 'Somatic Mode' }));

    expect(onChange).toHaveBeenCalledWith('somatic');
  });

  it('supports compact rendering for in-session mode switching', () => {
    render(
      <AgnesEngagementModeControl
        compact
        value="impromptu"
        onChange={() => {}}
        modes={['impromptu', 'casual', 'deep', 'somatic']}
        label="Compact mode switcher"
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Compact mode switcher' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Impromptu' })).toHaveAttribute('aria-selected', 'true');
  });
});
