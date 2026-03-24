import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrchestrationStatusChip } from './OrchestrationStatusChip';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: null,
    isGuest: false,
  }),
}));

vi.mock('@/lib/data-layer/provider', () => ({
  useDataLayer: () => ({}),
}));

vi.mock('@/lib/services/core-profile-service', () => ({
  CoreProfileService: {
    updateOrchestrationPreferences: vi.fn(),
  },
}));

describe('OrchestrationStatusChip', () => {
  beforeEach(() => {
    useOrchestrationStore.setState({
      autopilotLevel: 2,
      historyMode: 'standard',
      activeThreadId: null,
    });
  });

  it('renders current autopilot state', () => {
    render(<OrchestrationStatusChip />);
    expect(screen.getByText(/L2 Guided assist/i)).toBeInTheDocument();
    expect(screen.getByText(/Visible/i)).toBeInTheDocument();
    expect(screen.getByText(/Standard/i)).toBeInTheDocument();
  });

  it('cycles into ghost mode via controls', async () => {
    const user = userEvent.setup();
    render(<OrchestrationStatusChip />);

    const raise = screen.getByRole('button', { name: /Raise autopilot level/i });
    await user.click(raise);
    await user.click(raise);
    await user.click(raise);

    expect(screen.getByText(/L5 Ghost/i)).toBeInTheDocument();
    expect(screen.getByText(/^Ghost$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Silent$/i)).toBeInTheDocument();
  });
});
