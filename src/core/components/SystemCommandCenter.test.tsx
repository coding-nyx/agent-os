import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockNavigate = vi.fn();
const mockLogout = vi.fn();
const mockRefreshProfile = vi.fn();
const mockRefreshGlobalSoul = vi.fn();
const mockLockVault = vi.fn();
const mockSetPersistenceMode = vi.fn();

const mockAuth = {
  user: { uid: 'user-123', email: 'alice@test.com' },
  isGuest: false,
  profile: { preferredName: 'Alice' },
  logout: mockLogout,
  refreshProfile: mockRefreshProfile,
};

const mockVault = {
  isUnlocked: true,
  lockVault: mockLockVault,
  persistenceMode: 'SESSION' as const,
  setPersistenceMode: mockSetPersistenceMode,
};

const mockSoul = {
  refreshGlobalSoul: mockRefreshGlobalSoul,
};

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/vault-context', () => ({
  useVault: () => mockVault,
}));

vi.mock('@/lib/global-soul-context', () => ({
  useGlobalSoul: () => mockSoul,
}));

vi.mock('./VaultPopoverPanel', () => ({
  VaultPopoverPanel: () => <div data-testid="vault-popover-panel" />,
}));

vi.mock('./GlassCard', () => ({
  GlassCard: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('./NeuralButton', () => ({
  NeuralButton: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { SystemCommandCenter } from './SystemCommandCenter';

describe('SystemCommandCenter vault persistence controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVault.persistenceMode = 'SESSION';
  });

  it('selects the clicked persistence mode explicitly instead of toggling', async () => {
    const user = userEvent.setup();

    render(<SystemCommandCenter />);

    await user.click(screen.getByRole('button', { name: 'User Menu' }));
    await user.click(screen.getByRole('button', { name: 'System Preferences' }));

    await user.click(screen.getByRole('button', { name: /STRICT_MODE/i }));
    expect(mockSetPersistenceMode).toHaveBeenLastCalledWith('STRICT');

    await user.click(screen.getByRole('button', { name: /SESSION_MODE/i }));
    expect(mockSetPersistenceMode).toHaveBeenLastCalledWith('SESSION');
  });
});
