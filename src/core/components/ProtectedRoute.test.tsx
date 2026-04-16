import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock context hooks before importing ProtectedRoute
const mockAuth = {
  isAuthenticated: false,
  isGuest: false,
  profile: null,
  loading: false,
  user: null,
};

const mockVault = { isLoading: false };
const mockSoul = { isLoading: false };

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/vault-context', () => ({
  useVault: () => mockVault,
}));

vi.mock('@/lib/global-soul-context', () => ({
  useGlobalSoulStore: (selector: any) => selector(mockSoul),
}));

vi.mock('./BootLoader', () => ({
  BootLoader: () => <div data-testid="bootloader">Loading...</div>,
}));

import { ProtectedRoute } from './ProtectedRoute';

function renderWithRouter(initialRoute: string, children: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/" element={<div data-testid="landing">Landing</div>} />
        <Route path="/ara" element={<div data-testid="ara">Ara</div>} />
        <Route path="/hub" element={<ProtectedRoute>{children}</ProtectedRoute>} />
        <Route path="/agnes" element={
          <ProtectedRoute requireOnboarding={false}>
            {children}
          </ProtectedRoute>
        } />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows BootLoader when auth is loading', () => {
    mockAuth.loading = true;
    mockAuth.isAuthenticated = false;
    mockAuth.isGuest = false;
    mockAuth.profile = null;

    renderWithRouter('/hub', <div>Hub Content</div>);
    expect(screen.getByTestId('bootloader')).toBeInTheDocument();

    mockAuth.loading = false;
  });

  it('shows BootLoader when vault is loading for authenticated user', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isGuest = false;
    mockAuth.loading = false;
    mockAuth.profile = { onboardingComplete: true } as any;
    mockVault.isLoading = true;

    renderWithRouter('/hub', <div>Hub Content</div>);
    expect(screen.getByTestId('bootloader')).toBeInTheDocument();

    mockVault.isLoading = false;
  });

  it('renders children when authenticated with complete onboarding', () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isGuest = false;
    mockAuth.loading = false;
    mockAuth.profile = { onboardingComplete: true } as any;
    mockVault.isLoading = false;
    mockSoul.isLoading = false;

    renderWithRouter('/hub', <div data-testid="protected-content">Hub Content</div>);
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
  });

  it('renders children for guest users', () => {
    mockAuth.isAuthenticated = false;
    mockAuth.isGuest = true;
    mockAuth.loading = false;
    mockAuth.profile = null;

    renderWithRouter('/hub', <div data-testid="guest-content">Guest Hub</div>);
    expect(screen.getByTestId('guest-content')).toBeInTheDocument();
  });

  it('redirects to landing when not authenticated and not guest', () => {
    mockAuth.isAuthenticated = false;
    mockAuth.isGuest = false;
    mockAuth.loading = false;
    mockAuth.profile = null;

    renderWithRouter('/hub', <div>Hub Content</div>);
    // Should redirect to landing page
    expect(screen.getByTestId('landing')).toBeInTheDocument();
  });
});
