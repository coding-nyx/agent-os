/**
 * DailyBriefSection — T-23
 *
 * T-23 — cascade events update reactively after mount
 * Regression for BUG-H2 / p1-cascade-stale.
 * Verifies the useState + useSpineEvent pattern replaced the stale useMemo(fn, []).
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Spine } from '@/lib/spine/spine-event-bus';

// ─── Framer Motion ─────────────────────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, variants, layout, layoutId, custom, whileHover, whileTap, ...r }: any) => <div {...r}>{children}</div>,
    section: ({ children, initial, animate, exit, transition, variants, layout, layoutId, custom, whileHover, whileTap, ...r }: any) => <section {...r}>{children}</section>,
    button: ({ children, initial, animate, exit, transition, variants, layout, layoutId, custom, whileHover, whileTap, ...r }: any) => <button {...r}>{children}</button>,
  },
}));

// ─── Context hooks ──────────────────────────────────────────────────────────────
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ profile: { preferredName: 'Alex' } }),
}));

vi.mock('@/lib/global-soul-context', () => ({
  useGlobalSoul: () => ({ globalSoul: null }),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

// ─── NSV trends stub ────────────────────────────────────────────────────────────
vi.mock('../hooks/useNsvTrends', () => ({
  useNsvTrends: () => ({}),
}));

// ─── state-display-config stubs ────────────────────────────────────────────────
vi.mock('@/lib/state-display-config', () => ({
  DOMAIN_PILLARS: {},
  DOMAIN_ORDER: [],
  computePillarState: () => ({ tone: 'neutral', label: 'Neutral', summary: '' }),
  generateBriefSentence: () => 'All systems nominal.',
}));

// ─── GlassCard + TrendArrow stubs ──────────────────────────────────────────────
vi.mock('@/core/components/GlassCard', () => ({
  GlassCard: ({ children, ...r }: any) => <div data-testid="glass-card" {...r}>{children}</div>,
}));

vi.mock('@/core/components/TrendArrow', () => ({
  TrendArrow: () => null,
}));

import { DailyBriefSection } from './DailyBriefSection';

describe('DailyBriefSection', () => {
  // Reset Spine listeners between tests to avoid cross-test pollution
  beforeEach(() => {
    // Ensure getRecentEvents starts empty
    vi.spyOn(Spine, 'getRecentEvents').mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('T-23 — cascade events update reactively after a Spine event fires post-mount', async () => {
    render(
      <DailyBriefSection
        collapsed={false}
        onToggleCollapse={() => {}}
        onAskAboutDomain={() => {}}
      />
    );

    // At mount there are no cascade events — section should not show the "cascade events" banner
    expect(screen.queryByText(/cascade event/i)).not.toBeInTheDocument();

    // Simulate a cascade event arriving after mount
    act(() => {
      vi.spyOn(Spine, 'getRecentEvents').mockReturnValue([
        {
          id: 'evt-1',
          type: 'REDUCE_TRAINING_LOAD',
          source: 'cascade:burnout',
          domain: 'B',
          priority: 'info',
          data: {},
          timestamp: Date.now(),
        } as any,
      ]);
      Spine.publish({
        type: 'REDUCE_TRAINING_LOAD',
        source: 'cascade:burnout',
        domain: 'B',
        priority: 'info',
        data: {},
      });
    });

    // The reactive subscription must have updated state — banner should now be visible
    expect(await screen.findByText(/1 cascade event/i)).toBeInTheDocument();
  });
});
