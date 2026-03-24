import type { SVGProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NexusShellHud } from './NexusShellHud';

vi.mock('./OrchestrationStatusChip', () => ({
  OrchestrationStatusChip: () => <div data-testid="orchestration-status-chip" />,
}));

describe('NexusShellHud', () => {
  it('renders shell telemetry, proposal indicators, and quick actions', async () => {
    const user = userEvent.setup();
    const onOpenPalette = vi.fn();
    const onToggleThread = vi.fn();
    const StubIcon = (props: SVGProps<SVGSVGElement>) => <svg {...props} />;

    render(
      <NexusShellHud
        activeThreadId="thread.finance.primary"
        runtimeSummary={{
          moduleId: 'nexus',
          autopilotLevel: 4,
          historyMode: 'standard',
          activeThreadId: 'thread.finance.primary',
          actions: [],
          aliveContext: null,
          counts: {
            total: 6,
            visibleExecutions: 2,
            silentExecutions: 1,
            awaitingApproval: 2,
            analysisOnly: 1,
            blocked: 1,
            ephemeral: 0,
            failed: 1,
            escalated: 1,
          },
          shouldSuppressAssistantMessage: false,
        }}
        participants={[
          {
            moduleId: 'nexus',
            role: 'primary',
            joinedAt: '2026-03-24T00:00:00.000Z',
            state: 'active',
            presence: 'online',
          },
          {
            moduleId: 'atlas',
            role: 'secondary',
            joinedAt: '2026-03-24T00:00:00.000Z',
            state: 'waiting',
            presence: 'idle',
          },
          {
            moduleId: 'ledger',
            role: 'secondary',
            joinedAt: '2026-03-24T00:00:00.000Z',
            state: 'joined',
            presence: 'online',
          },
        ]}
        planningSuggestion={{
          id: 'thread.finance.primary.planning.parsed-command',
          title: 'Coordinate 3 Atlas planning steps',
          summary: 'Plan tomorrow, rest update, and cooking schedule are grouped together.',
          prompt: 'Create and coordinate a single plan.',
          state: 'draft',
          targetModuleId: 'atlas',
          nodeCount: 3,
          supportingModuleIds: ['soma', 'agnes'],
          sourceSignalIds: ['intent:plan_day', 'intent:update_schedule'],
        }}
        pendingTargets={['atlas']}
        busyLabel="Waiting for Atlas…"
        isBusy
        isGuest={false}
        quickActions={[
          {
            id: 'open_palette',
            label: 'Command palette',
            shortLabel: 'Palette',
            icon: StubIcon as never,
            execute: onOpenPalette,
            ariaLabel: 'Open command palette',
          },
          {
            id: 'toggle_thread_panel',
            label: 'Hide shell thread',
            shortLabel: 'Hide thread',
            icon: StubIcon as never,
            execute: onToggleThread,
            isActive: true,
            ariaLabel: 'Hide shell thread monitor',
          },
        ]}
      />,
    );

    expect(screen.getByTestId('nexus-shell-hud')).toHaveTextContent('thread.finance.primary');
    expect(screen.getByText(/Plan · 3 steps via Atlas/i)).toBeInTheDocument();
    expect(screen.getByTestId('nexus-shell-hud-metric-visible')).toHaveTextContent('2');
    expect(screen.getByTestId('nexus-shell-hud-metric-silent')).toHaveTextContent('1');
    expect(screen.getByTestId('nexus-shell-hud-metric-awaiting')).toHaveTextContent('2');
    expect(screen.getByTestId('nexus-shell-hud-metric-blocked')).toHaveTextContent('1');
    expect(screen.getByText(/1 failure/i)).toBeInTheDocument();
    expect(screen.getByText(/1 escalated/i)).toBeInTheDocument();
    expect(screen.getAllByText(/User scope/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Visible history/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Auto execution/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Active agents: Atlas, Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/2 active/i)).toBeInTheDocument();
    expect(screen.getByText(/6 actions last turn/i)).toBeInTheDocument();
    expect(screen.getByTestId('orchestration-status-chip')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open command palette/i }));
    await user.click(screen.getByRole('button', { name: /hide shell thread monitor/i }));

    expect(onOpenPalette).toHaveBeenCalledTimes(1);
    expect(onToggleThread).toHaveBeenCalledTimes(1);
  });
});
