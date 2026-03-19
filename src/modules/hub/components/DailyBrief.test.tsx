import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DailyBrief } from './DailyBrief';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useNsvTrends } from '@/modules/nexus/hooks/useNsvTrends';

vi.mock('framer-motion', () => ({
  motion: {
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('lucide-react', () => ({
  Zap: () => <div data-testid="icon-zap" />,
  ChevronUp: () => <div data-testid="icon-up" />,
  ChevronDown: () => <div data-testid="icon-down" />,
  Minus: () => <div data-testid="icon-minus" />,
  RefreshCw: () => <div data-testid="icon-refresh" />,
  Activity: () => <div data-testid="icon-activity" />,
  Brain: () => <div data-testid="icon-brain" />,
  Heart: () => <div data-testid="icon-heart" />,
  Sparkles: () => <div data-testid="icon-sparkles" />,
  Battery: () => <div data-testid="icon-battery" />,
  Flame: () => <div data-testid="icon-flame" />,
  Briefcase: () => <div data-testid="icon-briefcase" />,
  Waves: () => <div data-testid="icon-waves" />
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/global-soul-context', () => ({
  useGlobalSoul: vi.fn(),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('@/modules/nexus/hooks/useNsvTrends', () => ({
  useNsvTrends: vi.fn(),
}));

describe('DailyBrief', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      profile: { preferredName: 'Jules' },
    } as any);

    vi.mocked(useGlobalSoul).mockReturnValue({
      globalSoul: {
        crossFunctionalState: {
          biological: { recoveryScore: 8 },
          cognitive: { focusScore: 7 },
          emotional: { emotionalResilience: 9 },
          resource: { resonanceROI: 6 },
        },
        displayNames: {},
      },
    } as any);

    vi.mocked(useReducedMotion).mockReturnValue(true);

    vi.mocked(useNsvTrends).mockReturnValue({
      biological: 'up',
      cognitive: 'down',
      emotional: 'stable',
      resource: 'unknown',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders trends dynamically from useNsvTrends', () => {
    render(<DailyBrief />);

    // Check greeting
    expect(screen.getByText(/Good (morning|afternoon|evening), Jules./)).toBeInTheDocument();

    // Check specific trend icons rendered based on mock values
    // DOMAIN_ORDER is typically ['biological', 'cognitive', 'emotional', 'resource']

    // biological -> 'up'
    const bioCard = screen.getByLabelText(/Body.*trending up/i);
    expect(bioCard).toBeInTheDocument();

    // cognitive -> 'down'
    const cogCard = screen.getByLabelText(/Mind.*trending down/i);
    expect(cogCard).toBeInTheDocument();

    // emotional -> 'stable'
    const emoCard = screen.getByLabelText(/Heart.*stable/i);
    expect(emoCard).toBeInTheDocument();

    // resource -> 'unknown'
    const resCard = screen.getByLabelText(/Flow.*not calibrated/i);
    expect(resCard).toBeInTheDocument();
  });
});
