import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock `useAuth` and `useDataLayer` before importing the provider under test.
const mockAuth = {
  user: { uid: 'user-123', email: 'alice@test.com' },
  profile: {
    securityPreferences: {
      vaultSessionTtlMinutes: 24 * 60,
    },
  },
  isGuest: false,
  loading: false,
};

const mockDataLayer = {
  subscribeToDocument: vi.fn(),
  getDocument: vi.fn(),
  setDocument: vi.fn(),
  updateDocument: vi.fn(),
};

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('@/lib/data-layer/provider', () => ({
  useDataLayer: () => mockDataLayer,
}));

vi.mock('./services/guest-sync-service', () => ({
  syncAllGuestDataToUser: vi.fn(),
}));

vi.mock('./encryption', () => ({
  deriveKey: vi.fn(async () => ({ mock: 'key' } as unknown as CryptoKey)),
  encryptWithKey: vi.fn(async () => ({ ciphertext: 'cipher', iv: 'iv' })),
  decryptWithKey: vi.fn(async () => 'NEXUS'),
  base64ToUint8Array: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
}));

import { VaultProvider, useVault } from './vault-context';
import {
  __setVaultRedirectorForTests,
  __resetVaultRedirectorForTests,
} from './vault-context';

function InitializeButton() {
  const { initializeVault, unlockVault, setPersistenceMode, persistenceMode, isUnlocked } = useVault();
  return (
    <>
      <button type="button" onClick={initializeVault}>
        Initialize Vault
      </button>
      <button type="button" onClick={() => void unlockVault('top-secret')}>
        Unlock Vault
      </button>
      <button type="button" onClick={() => setPersistenceMode('SESSION')}>
        Set Session
      </button>
      <button type="button" onClick={() => setPersistenceMode('STRICT')}>
        Set Strict
      </button>
      <div data-testid="persistence-mode">{persistenceMode}</div>
      <div data-testid="is-unlocked">{String(isUnlocked)}</div>
    </>
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
    mockDataLayer.getDocument.mockResolvedValue({
      salt: 'c2FsdA==',
      canary: { ciphertext: 'cipher', iv: 'iv' },
    });
    mockDataLayer.setDocument.mockResolvedValue(undefined);
    mockDataLayer.updateDocument.mockResolvedValue(undefined);

    // Ensure we have a stable "current URL" for returnTo.
    window.history.pushState({}, '', '/nexus?foo=bar#baz');
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    __resetVaultRedirectorForTests();
  });

  it('redirects to /vault-gate with returnTo when called', async () => {
    const user = userEvent.setup();
    const originalReturnTo = window.location.pathname + window.location.search + window.location.hash;
    const expectedPath = `/vault-gate?returnTo=${encodeURIComponent(originalReturnTo)}`;

    render(
      <VaultProvider>
        <InitializeButton />
      </VaultProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Initialize Vault' }));

    expect(redirectSpy).toHaveBeenCalledWith(expectedPath);
  });

  it('backfills the retained session secret when switching from STRICT to SESSION while unlocked', async () => {
    const user = userEvent.setup();
    localStorage.setItem('nexus_vault_mode', 'STRICT');
    mockDataLayer.subscribeToDocument.mockImplementation((_collection: string, _uid: string, onUpdate: (record: unknown) => void) => {
      onUpdate({ salt: 'c2FsdA==', canary: { ciphertext: 'cipher', iv: 'iv' } });
      return () => {};
    });

    render(
      <VaultProvider>
        <InitializeButton />
      </VaultProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Unlock Vault' }));

    await waitFor(() => {
      expect(screen.getByTestId('is-unlocked')).toHaveTextContent('true');
    });

    expect(sessionStorage.getItem('nexus_vault_session')).toBeNull();
    expect(screen.getByTestId('persistence-mode')).toHaveTextContent('STRICT');

    await user.click(screen.getByRole('button', { name: 'Set Session' }));

    await waitFor(() => {
      expect(screen.getByTestId('persistence-mode')).toHaveTextContent('SESSION');
    });

    // The session password is now stored as an encrypted blob, not plaintext.
    await waitFor(() => {
      expect(sessionStorage.getItem('nexus_vault_session')).not.toBeNull();
    });
    // Verify it is NOT the plaintext password (security invariant).
    expect(sessionStorage.getItem('nexus_vault_session')).not.toBe('top-secret');
    expect(sessionStorage.getItem('nexus_vault_session_ts')).not.toBeNull();
  });

  it('purges retained session storage when switching back to STRICT', async () => {
    const user = userEvent.setup();
    localStorage.setItem('nexus_vault_mode', 'SESSION');
    mockDataLayer.subscribeToDocument.mockImplementation((_collection: string, _uid: string, onUpdate: (record: unknown) => void) => {
      onUpdate({ salt: 'c2FsdA==', canary: { ciphertext: 'cipher', iv: 'iv' } });
      return () => {};
    });

    render(
      <VaultProvider>
        <InitializeButton />
      </VaultProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Unlock Vault' }));

    await waitFor(() => {
      expect(screen.getByTestId('is-unlocked')).toHaveTextContent('true');
    });

    // Session password is stored as encrypted blob (not plaintext).
    await waitFor(() => {
      expect(sessionStorage.getItem('nexus_vault_session')).not.toBeNull();
    });
    expect(sessionStorage.getItem('nexus_vault_session')).not.toBe('top-secret');

    await user.click(screen.getByRole('button', { name: 'Set Strict' }));

    await waitFor(() => {
      expect(screen.getByTestId('persistence-mode')).toHaveTextContent('STRICT');
    });

    expect(sessionStorage.getItem('nexus_vault_session')).toBeNull();
    expect(sessionStorage.getItem('nexus_vault_session_ts')).toBeNull();
  });
});
