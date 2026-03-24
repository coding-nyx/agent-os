import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NexusAgentPresenceStack } from './NexusAgentPresenceStack';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';

describe('NexusAgentPresenceStack', () => {
  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('renders stacked active agents and overflow count compactly', () => {
    render(
      <NexusAgentPresenceStack
        participants={[
          { moduleId: 'nexus', role: 'primary', joinedAt: '2026-01-01T00:00:00.000Z', state: 'active', presence: 'online' },
          { moduleId: 'atlas', role: 'secondary', joinedAt: '2026-01-01T00:00:00.000Z', state: 'joined', presence: 'online', inclusionReasons: ['delegated'] },
          { moduleId: 'ledger', role: 'secondary', joinedAt: '2026-01-01T00:00:00.000Z', state: 'active', presence: 'online', inclusionReasons: ['consulted'] },
          { moduleId: 'soma', role: 'secondary', joinedAt: '2026-01-01T00:00:00.000Z', state: 'waiting', presence: 'idle', inclusionReasons: ['mentioned'] },
          { moduleId: 'titan', role: 'secondary', joinedAt: '2026-01-01T00:00:00.000Z', state: 'invited', presence: 'idle' },
          { moduleId: 'agnes', role: 'secondary', joinedAt: '2026-01-01T00:00:00.000Z', state: 'joined', presence: 'online' },
        ]}
      />,
    );

    expect(screen.getByLabelText(/Active agents:/i)).toBeInTheDocument();
    expect(screen.getByText(/5 active/i)).toBeInTheDocument();
    expect(screen.getByText(/1 mentioned · 1 consulted · 1 delegated/i)).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('falls back to module labels when chat actor identity is disabled', () => {
    AutonomyFeatureFlags.setTestOverrides({ chatActorIdentity: false });

    render(
      <NexusAgentPresenceStack
        participants={[
          {
            moduleId: 'atlas',
            role: 'secondary',
            joinedAt: '2026-01-01T00:00:00.000Z',
            state: 'joined',
            presence: 'online',
            actorId: 'atlas-planner',
            actorLabel: 'Atlas Planner',
            actorShortLabel: 'AP',
          },
        ]}
      />,
    );

    expect(screen.getByLabelText(/Active agents: Atlas/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/atlas planner icon/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/atlas icon/i)).toBeInTheDocument();
  });
});
