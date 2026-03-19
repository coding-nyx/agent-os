import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock `useAuth` and `useDataLayer` before importing the provider under test.
const mockAuth = {
  user: { uid: 'user-123', email: 'alice@test.com' },
  profile: null,
  isGuest: false,
  loading: false,
};

const mockDataLayer = {
  subscribeToDocument: vi.fn(),
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/data-layer/provider', () => ({
  useDataLayer: () => mockDataLayer,
}));

import { VaultProvider, useVault } from './vault-context';
import {
  __setVaultRedirectorForTests,
  __resetVaultRedirectorForTests,
} from './vault-context';

function InitializeButton() {
  const { initializeVault } = useVault();
  return (
    <button type="button" onClick={initializeVault}>
      Initialize Vault
    </button>
  );
}

describe('VaultProvider.initializeVault', () => {
  let redirectSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    redirectSpy = vi.fn();
    __setVaultRedirectorForTests(redirectSpy);

    // Some test environments provide a non-standard `localStorage` shape.
    // Ensure the minimal Web Storage API is present for VaultProvider.
    if (typeof (globalThis as any).localStorage?.getItem !== 'function') {
      const store = new Map<string, string>();
      const mockStorage = {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
      } as any;
      vi.stubGlobal('localStorage', mockStorage);
    }

    if (typeof (globalThis as any).sessionStorage?.getItem !== 'function') {
      const store = new Map<string, string>();
      const mockStorage = {
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
        clear: () => { store.clear(); },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() { return store.size; },
      } as any;
      vi.stubGlobal('sessionStorage', mockStorage);
    }

    mockDataLayer.subscribeToDocument.mockImplementation((_collection: string, _uid: string, onUpdate: (record: unknown) => void) => {
      // Vault does not exist -> hasVault=false.
      onUpdate(null);
      return () => {};
    });

    // Ensure we have a stable "current URL" for returnTo.
    window.history.pushState({}, '', '/nexus?foo=bar#baz');
  });

  afterEach(() => {
    __resetVaultRedirectorForTests();
  });

  it('redirects to /vault-gate with returnTo when called', () => {
    const originalReturnTo = window.location.pathname + window.location.search + window.location.hash;
    const expectedPath = `/vault-gate?returnTo=${encodeURIComponent(originalReturnTo)}`;

    render(
      <VaultProvider>
        <InitializeButton />
      </VaultProvider>
    );

    screen.getByRole('button', { name: 'Initialize Vault' }).click();

    expect(redirectSpy).toHaveBeenCalledWith(expectedPath);
  });
});

