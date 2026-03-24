import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickCaptureBar } from './QuickCaptureBar';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

describe('QuickCaptureBar ingestion semantics', () => {
  it('surfaces structured entry guidance in structured mode', async () => {
    const user = userEvent.setup();

    render(
      <QuickCaptureBar
        onAddTask={vi.fn()}
        onAddHabit={vi.fn()}
        onAddGoal={vi.fn()}
        preferenceMode="structured"
      />,
    );

    expect(screen.getByText(/Structured mode:/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Quick capture input/i), 'goal: Launch due:tomorrow priority:high energy:high');
    await user.click(screen.getByRole('button', { name: /Add entry/i }));

    expect(screen.getByText(/Structured entry/i)).toBeInTheDocument();
    expect(screen.getByText(/Atlas will respect these explicit fields on confirm/i)).toBeInTheDocument();
  });

  it('surfaces freeform inference guidance in conversational mode', async () => {
    const user = userEvent.setup();

    render(
      <QuickCaptureBar
        onAddTask={vi.fn()}
        onAddHabit={vi.fn()}
        onAddGoal={vi.fn()}
        preferenceMode="conversational"
      />,
    );

    expect(screen.getByText(/Conversational mode:/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Quick capture input/i), 'call dentist tomorrow urgent');
    await user.click(screen.getByRole('button', { name: /Add entry/i }));

    expect(screen.getByText(/Freeform inference/i)).toBeInTheDocument();
    expect(screen.getByText(/Atlas inferred this from freeform text/i)).toBeInTheDocument();
  });
});
