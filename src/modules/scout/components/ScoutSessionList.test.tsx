import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScoutSessionList } from './ScoutSessionList';
import type { ResearchSession } from '../types';

const sessions: ResearchSession[] = [
  {
    id: 'session-1',
    userId: 'user-1',
    topic: 'Trace semiconductor supply disruptions across multiple regions',
    status: 'searching',
    subQuestions: [{ id: 'q-1', text: 'Where are the bottlenecks?', intent: 'causal', status: 'pending' }],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T12:00:00.000Z',
  },
  {
    id: 'session-2',
    userId: 'user-1',
    topic: 'Review rare earth pricing changes',
    status: 'complete',
    subQuestions: [],
    createdAt: '2024-01-03T00:00:00.000Z',
    updatedAt: '2024-01-04T12:00:00.000Z',
  },
];

describe('ScoutSessionList', () => {
  it('renders a clear empty state when no sessions exist', () => {
    render(<ScoutSessionList sessions={[]} onSelect={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/no research sessions yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/start a deep research session and your active investigations will appear here/i)
    ).toBeInTheDocument();
  });

  it('separates session selection from deletion controls', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    render(
      <ScoutSessionList
        sessions={sessions}
        onSelect={onSelect}
        onDelete={onDelete}
        activeSessionId="session-1"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /open research session trace semiconductor supply disruptions/i }));
    expect(onSelect).toHaveBeenCalledWith('session-1');

    fireEvent.click(screen.getByRole('button', { name: /delete research session trace semiconductor supply disruptions/i }));
    expect(onDelete).toHaveBeenCalledWith('session-1');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows active session context and session metadata without hover-only affordances', () => {
    render(
      <ScoutSessionList
        sessions={sessions}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        activeSessionId="session-1"
      />
    );

    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText(/updated jan 2, 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/1 question/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^Open$/)).toHaveLength(2);
  });
});
