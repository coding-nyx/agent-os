/**
 * Regression tests for S22-017: LandingPage returnTo deep-link fix.
 *
 * ProtectedRoute encodes ?returnTo=<path> when it redirects an unauthenticated
 * user to `/`. LandingPage must honour that param and navigate there after a
 * successful auth instead of unconditionally going to /nexus.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Mock auth context ────────────────────────────────────────────────────────
const mockAuth = {
  isAuthenticated: false,
  isGuest: false,
  enterGuestMode: vi.fn(),
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

// ── Mock heavy core components ───────────────────────────────────────────────
vi.mock('@/core/components/UnifiedAuthModal', () => ({
  UnifiedAuthModal: () => null,
}));

vi.mock('@/core/components/NeuralButton', () => ({
  NeuralButton: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// ── Mock framer-motion (avoids animation timers) ─────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...p }: any) => <div {...p}>{children}</div>,
    article: ({ children, ...p }: any) => <article {...p}>{children}</article>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import LandingPage from './LandingPage';

// ── Helper: render LandingPage inside a MemoryRouter with a given initial URL ─
function renderAt(initialUrl: string) {
  const navigateSpy = vi.fn();

  // We need to capture what react-router-dom's navigate is called with.
  // Wrap inside a real MemoryRouter so useSearchParams / useNavigate resolve.
  const { unmount } = render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/* Dummy target routes so navigate doesn't 404 in the tree */}
        <Route path="/nexus" element={<div data-testid="nexus" />} />
        <Route path="/atlas" element={<div data-testid="atlas" />} />
      </Routes>
    </MemoryRouter>,
  );

  return { navigateSpy, unmount };
}

describe('LandingPage — returnTo deep-link (S22-017)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.isAuthenticated = false;
    mockAuth.isGuest = false;
  });

  it('navigates to /nexus when authenticated and no returnTo param is present', () => {
    mockAuth.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/nexus" element={<div data-testid="nexus-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    // After the effect fires the router replaces / with /nexus.
    expect(container.querySelector('[data-testid="nexus-page"]')).not.toBeNull();
  });

  it('navigates to returnTo path when authenticated and returnTo is a valid relative path', () => {
    mockAuth.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/?returnTo=%2Fatlas']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/atlas" element={<div data-testid="atlas-page" />} />
          <Route path="/nexus" element={<div data-testid="nexus-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-testid="atlas-page"]')).not.toBeNull();
    // Must NOT have landed on /nexus
    expect(container.querySelector('[data-testid="nexus-page"]')).toBeNull();
  });

  it('falls back to /nexus when returnTo is an absolute URL (open-redirect guard)', () => {
    mockAuth.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/?returnTo=http%3A%2F%2Fevil.com']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/nexus" element={<div data-testid="nexus-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-testid="nexus-page"]')).not.toBeNull();
  });

  it('falls back to /nexus when returnTo starts with // (protocol-relative open-redirect)', () => {
    mockAuth.isAuthenticated = true;

    const { container } = render(
      <MemoryRouter initialEntries={['/?returnTo=%2F%2Fevil.com%2Fhijack']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/nexus" element={<div data-testid="nexus-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(container.querySelector('[data-testid="nexus-page"]')).not.toBeNull();
  });

  it('does not redirect when not authenticated', () => {
    mockAuth.isAuthenticated = false;

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/nexus" element={<div data-testid="nexus-page" />} />
        </Routes>
      </MemoryRouter>,
    );

    // LandingPage itself should still be rendered (not replaced).
    expect(container.querySelector('[data-testid="nexus-page"]')).toBeNull();
  });
});
