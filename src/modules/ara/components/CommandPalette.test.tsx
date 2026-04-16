import type { HTMLAttributes, ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { MEMORY_PREFIX, openAraCommandPalette } from '../hooks/useCommandPalette';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

const navigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

vi.mock('@/lib/vault-context', () => ({
  useVault: () => ({
    isModuleAccessible: () => true,
  }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: null,
    isGuest: false,
  }),
}));

vi.mock('@/lib/data-layer/provider', () => ({
  useDataLayer: () => ({}),
}));

vi.mock('@/core/diagnosis/diagnosis-registry', () => ({
  getAllDiagnosisSpecs: () => [],
}));

describe('CommandPalette', () => {
  it('opens from the shell event bus with a memory-search prefill', () => {
    const onMemorySearch = vi.fn();

    render(<CommandPalette onMemorySearch={onMemorySearch} />);

    act(() => {
      openAraCommandPalette(`${MEMORY_PREFIX}sleep consistency`);
    });

    expect(screen.getByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue(`${MEMORY_PREFIX}sleep consistency`);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onMemorySearch).toHaveBeenCalledWith('sleep consistency');
  });
});
