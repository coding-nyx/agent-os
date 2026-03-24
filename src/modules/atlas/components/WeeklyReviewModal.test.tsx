import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GlobalProjection, NeuralStateVector } from '@/lib/types';
import { createEmptyAtlasProfile } from '../services/atlas-profile-service';
import { WeeklyReviewModal } from './WeeklyReviewModal';

const { emit } = vi.hoisted(() => ({
  emit: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('@/core/components/NeuralButton', () => ({
  NeuralButton: ({ children, onClick, themeColor: _themeColor, ...props }: React.ComponentProps<'button'> & { themeColor?: string }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/core/components/NeuralModal', () => ({
  NeuralModal: ({
    isOpen,
    children,
    title,
    subtitle,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    subtitle?: string;
  }) => (isOpen ? <div><h2>{title}</h2><p>{subtitle}</p>{children}</div> : null),
}));

vi.mock('@/lib/spine/spine-event-bus', () => ({
  Spine: {
    emit,
  },
}));

function makeSoul(): GlobalProjection {
  const nsv: NeuralStateVector = {
    biological: { cnsFatigue: 6, sleepQuality: 5, recoveryScore: 4, hormonalContext: null },
    emotional: { emotionalResilience: 4, stressLoad: 7, moodTrend: null, traumaMarkers: null },
    cognitive: { energyBudget: 5, focusScore: 5, activeLoad: 7, planningLoad: 7, taskCompletionRate: 0.5 },
    planning: { streakHealth: 4, deadlinePressure: 7, goalAlignment: 0.5, habitMomentum: 0.4 },
    resource: { financialFriction: 6, resonanceROI: 4 },
    version: 1,
    lastUpdated: {},
    cnsFatigue: 6,
    emotionalResilience: 4,
    sleepQuality: 5,
  };

  return {
    lastSync: new Date().toISOString(),
    overallWellnessScore: 5,
    displayNames: { atlas: 'Atlas' },
    agentGenders: { atlas: 'non-binary' },
    compactedInsights: [],
    crossFunctionalState: nsv,
  };
}

function makeProfile() {
  const profile = createEmptyAtlasProfile();
  profile.energyWave = Array.from({ length: 7 }, (_, index) => ({
    id: `wave-${index}`,
    slot: `Day ${index + 1}`,
    energy: 6,
    focus: 5,
    load: 6,
  }));
  profile.tasks = [
    {
      id: 'task-1',
      title: 'Prepare planning memo',
      priority: 1,
      energyCost: 8,
      status: 'active',
      dependencies: [],
      deadline: new Date(Date.now() + 2 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  profile.habits = [
    {
      id: 'habit-1',
      title: 'Evening review',
      frequency: 'daily',
      targetStreak: 14,
      currentStreak: 1,
      bestStreak: 5,
      energyCost: 2,
      minimumViableVersion: 'Review tomorrow',
      status: 'active',
      lastCompleted: new Date(Date.now() - 25 * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  profile.scheduledTasks = [
    {
      id: 'sched-1',
      title: 'Memo block',
      energyCost: 6,
      focusCost: 6,
      scheduledAt: new Date().toISOString(),
      duration: 90,
      category: 'deep_work',
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    },
  ];
  return profile;
}

describe('WeeklyReviewModal', () => {
  it('renders actionable projection surfaces and saves an adjusted blueprint', async () => {
    const user = userEvent.setup();
    const onCompleteReview = vi.fn();

    render(
      <WeeklyReviewModal
        isOpen
        onClose={vi.fn()}
        profile={makeProfile()}
        soul={makeSoul()}
        predictiveDisplay={{
          state: 'Compressed',
          label: 'Compressed',
          color: 'text-amber-400',
          hex: '#f59e0b',
          description: 'Atlas is soft-compressing the plan.',
        }}
        onCompleteReview={onCompleteReview}
      />,
    );

    expect(screen.getByText(/Next week blueprint/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended actions/i)).toBeInTheDocument();
    expect(screen.getByText(/Projection control/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Adjust next week's capacity percentage/i), {
      target: { value: '70' },
    });

    await user.click(screen.getByRole('button', { name: /Complete review & save blueprint/i }));

    expect(onCompleteReview).toHaveBeenCalledTimes(1);
    expect(onCompleteReview.mock.calls[0][0].capacity.recommendedCapacityPct).toBe(70);
  });

  it('emits recovery scheduling with blueprint context', async () => {
    const user = userEvent.setup();
    emit.mockClear();

    render(
      <WeeklyReviewModal
        isOpen
        onClose={vi.fn()}
        profile={makeProfile()}
        soul={makeSoul()}
        predictiveDisplay={{
          state: 'Compressed',
          label: 'Compressed',
          color: 'text-amber-400',
          hex: '#f59e0b',
          description: 'Atlas is soft-compressing the plan.',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Schedule Recovery Day/i }));

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ATLAS_RECOVERY_SCHEDULED',
      data: expect.objectContaining({
        blueprint: expect.objectContaining({
          period: 'weekly',
        }),
      }),
    }));
  });
});
