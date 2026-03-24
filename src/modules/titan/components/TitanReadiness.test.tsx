import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TitanDashboard } from './TitanReadiness';
import type { GlobalProjection } from '@/lib/types';

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile: { assignedSexAtBirth: 'male' },
  }),
}));

const soul: GlobalProjection = {
  lastSync: '2026-01-10T10:00:00.000Z',
  overallWellnessScore: 82,
  displayNames: {},
  agentGenders: {},
  compactedInsights: [],
  crossFunctionalState: {
    biological: {
      cnsFatigue: 3,
      sleepQuality: 8,
      recoveryScore: 8,
      hormonalContext: null,
    },
    emotional: {
      emotionalResilience: 7,
    },
    cognitive: {},
    planning: {},
    resource: {},
    version: 1,
    lastUpdated: {},
    cnsFatigue: 3,
    emotionalResilience: 7,
    sleepQuality: 8,
    hormonalContext: null,
    traumaMarkers: null,
  },
};

describe('TitanDashboard presentation', () => {
  it('renders performance framing when readiness is open', () => {
    render(
      <TitanDashboard
        soul={soul}
        presentationMode="performance"
        presentationReason={null}
        activeDebtCount={0}
      />,
    );

    expect(screen.getByText('Performance Coach')).toBeInTheDocument();
    expect(screen.getByText(/today/i)).toHaveTextContent('Today&apos;s Readiness');
    expect(screen.queryByText(/override debt/i)).not.toBeInTheDocument();
  });

  it('switches into recovery framing when system debt is active', () => {
    render(
      <TitanDashboard
        soul={soul}
        presentationMode="recovery"
        presentationReason="Soma veto override recorded — Titan is treating today as biological debt repayment."
        activeDebtCount={1}
      />,
    );

    expect(screen.getByText('Recovery Control')).toBeInTheDocument();
    expect(screen.getByText('Recovery & Clearance')).toBeInTheDocument();
    expect(screen.getByText(/biological debt repayment/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Soma veto override recorded/i);
  });
});
