import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickLogPanel } from './QuickLogPanel';

describe('QuickLogPanel', () => {
  it('logs a parsed transaction from the swipe-style quick action', async () => {
    const onAddTransaction = vi.fn();
    const user = userEvent.setup();

    render(
      <QuickLogPanel
        categories={['Food', 'Transport']}
        currency="USD"
        onAddTransaction={onAddTransaction}
      />,
    );

    await user.type(screen.getByPlaceholderText(/type naturally/i), 'coffee $4.50');

    const preview = screen.getByRole('group', { name: /quick log preview/i });
    fireEvent.pointerDown(preview, { clientX: 100 });
    fireEvent.pointerMove(preview, { clientX: 230 });
    fireEvent.pointerUp(preview, { clientX: 230 });

    await waitFor(() => {
      expect(onAddTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Coffee',
          amount: 4.5,
          type: 'expense',
          category: 'Food',
          isRecurring: false,
        }),
      );
    });
  });

  it('opens the manual fallback path with parsed values when swiped left', async () => {
    const user = userEvent.setup();

    render(
      <QuickLogPanel
        categories={['Food', 'Transport']}
        currency="USD"
        onAddTransaction={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/type naturally/i), 'salary $3200 income');

    const preview = screen.getByRole('group', { name: /quick log preview/i });
    fireEvent.pointerDown(preview, { clientX: 220 });
    fireEvent.pointerMove(preview, { clientX: 80 });
    fireEvent.pointerUp(preview, { clientX: 80 });

    expect(screen.getByRole('button', { name: /natural input/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/description/i)).toHaveValue('Salary');
    expect(screen.getByPlaceholderText(/0.00/i)).toHaveValue(3200);
    expect(screen.getAllByRole('button', { name: /income/i })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('preserves the explicit manual logging fallback', async () => {
    const onAddTransaction = vi.fn();
    const user = userEvent.setup();

    render(
      <QuickLogPanel
        categories={['Food', 'Transport']}
        currency="USD"
        onAddTransaction={onAddTransaction}
      />,
    );

    await user.click(screen.getByRole('button', { name: /manual form/i }));
    await user.type(screen.getByPlaceholderText(/description/i), 'Bus pass');
    await user.type(screen.getByPlaceholderText(/0.00/i), '42');
    await user.click(screen.getByRole('button', { name: /log transaction/i }));

    expect(onAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Bus pass',
        amount: 42,
        type: 'expense',
        category: 'Other',
        isRecurring: false,
      }),
    );
  });
});
