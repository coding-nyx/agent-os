import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { deriveKey, encryptWithKey, decryptWithKey, base64ToUint8Array } from './encryption';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { syncAllGuestDataToUser } from './services/guest-sync-service';
import { useDataLayer } from './data-layer/provider';

export type VaultPersistenceMode = 'STRICT' | 'SESSION' | 'GRACE';

interface VaultContextType {
  isUnlocked: boolean;
  isLoading: boolean;
  isHandshaking: boolean;
  hasVault: boolean;
  persistenceMode: VaultPersistenceMode;
  setPersistenceMode: (mode: VaultPersistenceMode) => void;
  refreshVaultStatus: () => Promise<void>;
  unlockVault: (password: string) => Promise<void>;
  lockVault: () => void;
  /** Canonical API: returns the single vault master key when unlocked, else `null`. */
  getMasterKey: () => Promise<CryptoKey | null>;
  /** @deprecated Use `getMasterKey()` instead. This returns the same master key. */
  getModuleKey: (moduleName: string) => Promise<CryptoKey | null>;
  checkModuleVault: (collectionName: string) => Promise<boolean>;
  isModuleAccessible: (moduleId: ModuleId) => boolean;
  setSessionPassword: (password: string) => void;
  getSessionPassword: () => string | null;
  /** true when vault exists, is locked, and no auto-unlock is in progress */
  isVaultGateVisible: boolean;
  vaultSetupNudgeSeen: boolean;
  dismissVaultSetupNudge: () => void;
  /** Placeholder — will be wired to UnifiedAuthModal VAULT_HANDSHAKE step */
  initializeVault: () => void;
}

const VaultContext = createContext<VaultContextType | null>(null);
const PERSISTENCE_KEY = 'nexus_vault_mode';
const SESSION_PWD_KEY = 'nexus_vault_session';
const VAULT_COLLECTION = 'vaults';

// Redirect hook to make `initializeVault()` testable in jsdom (where
// navigation is often "Not implemented").
export type VaultRedirector = (url: string) => void;
const defaultVaultRedirector: VaultRedirector = (url: string) => {
  if (typeof window === 'undefined') return;
  window.location.assign(url);
};
let vaultRedirector: VaultRedirector = defaultVaultRedirector;

// Test-only injection.
export function __setVaultRedirectorForTests(next: VaultRedirector) {
  vaultRedirector = next;
}

// Test-only reset.
export function __resetVaultRedirectorForTests() {
  vaultRedirector = defaultVaultRedirector;
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isGuest, loading: authLoading } = useAuth();
  const dataLayer = useDataLayer();
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const unlockInProgressRef = useRef(false);
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHandshaking, setIsHandshaking] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const mode = (localStorage.getItem(PERSISTENCE_KEY) as VaultPersistenceMode) || 'SESSION';
    if (mode === 'STRICT') return false;
    const hasPwd = !!sessionStorage.getItem(SESSION_PWD_KEY);
    return hasPwd;
  });
  const [persistenceMode, _setPersistenceMode] = useState<VaultPersistenceMode>(
      (localStorage.getItem(PERSISTENCE_KEY) as VaultPersistenceMode) || 'SESSION'
  );

  const setPersistenceMode = useCallback((mode: VaultPersistenceMode) => {
      _setPersistenceMode(mode);
      localStorage.setItem(PERSISTENCE_KEY, mode);
  }, []);

  const lockVault = useCallback(() => {
    masterKeyRef.current = null;
    setIsUnlocked(false);
    sessionStorage.removeItem(SESSION_PWD_KEY);
  }, []);

  const setSessionPassword = useCallback((pwd: string) => {
    if (persistenceMode !== 'STRICT') {
        sessionStorage.setItem(SESSION_PWD_KEY, pwd);
    }
  }, [persistenceMode]);

  const getSessionPassword = useCallback(() => {
      return sessionStorage.getItem(SESSION_PWD_KEY);
  }, []);

  const getMasterKey = useCallback(async (): Promise<CryptoKey | null> => {
    return masterKeyRef.current;
  }, []);

  const getModuleKey = useCallback(async (_moduleName: string): Promise<CryptoKey | null> => {
    return getMasterKey();
  }, [getMasterKey]);

  const checkModuleVault = useCallback(async (collectionName: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const vaultDoc = await dataLayer.getDocument(collectionName, user.uid);
      return !!vaultDoc;
    } catch (e) {
      console.error(`Error checking vault for ${collectionName}:`, e);
      return false;
    }
  }, [user?.uid, dataLayer]);

  const refreshVaultStatus = useCallback(async () => {
    if (!user?.uid || authLoading) {
      if (!user?.uid) {
          setHasVault(false);
          setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const vaultDoc = await dataLayer.getDocument(VAULT_COLLECTION, user.uid);
      setHasVault(!!vaultDoc);
    } catch (e: unknown) {
      console.error("Error refreshing vault status:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, authLoading, dataLayer]);

  const unlockVault = useCallback(async (password: string) => {
    if (unlockInProgressRef.current) return;
    unlockInProgressRef.current = true;

    if (!user) throw new Error("User must be logged in");

    setIsHandshaking(true);
    try {
        const snap = await dataLayer.getDocument<{
            salt?: string;
            canary?: { ciphertext: string; iv: string };
        }>(VAULT_COLLECTION, user.uid);

        let salt: Uint8Array;
        let canary: { ciphertext: string; iv: string } | null = null;

        if (snap && snap.salt) {
            salt = base64ToUint8Array(snap.salt);
            canary = snap.canary ?? null;
        } else if (snap) {
            // Document exists but no salt? This is a corruption state.
            // Do NOT generate a new salt as it will orphan all existing data.
            console.error('[Vault] Vault document exists but is missing salt field. Recovery required.');
            throw new Error("Vault corruption detected. Please contact support.");
        } else {
            // Truly new user - generate first salt
            salt = window.crypto.getRandomValues(new Uint8Array(16));
            const saltBase64 = window.btoa(String.fromCharCode(...salt));
            await dataLayer.setDocument(VAULT_COLLECTION, user.uid, { salt: saltBase64 });
        }

        const key = await deriveKey(password, salt);

        if (canary) {
            try {
                const decrypted = await decryptWithKey(canary, key);
                if (decrypted !== 'NEXUS') throw new Error("Invalid Vault Password.");
            } catch (e) {
                // Re-throw with a stable sentinel so auto-unlock can distinguish
                // a wrong password (permanent) from a transient error (retryable).
                throw new Error("Invalid Vault Password.");
            }
        } else {
            const newCanary = await encryptWithKey('NEXUS', key);
            await dataLayer.updateDocument(VAULT_COLLECTION, user.uid, { canary: newCanary });
        }

        masterKeyRef.current = key;
        setIsUnlocked(true);
        setSessionPassword(password);
        // NOTE: do NOT call refreshVaultStatus() here — the Firestore subscription
        // already drives hasVault + isLoading. A second call races with it and
        // causes a spurious loading bounce.
    } finally {
        unlockInProgressRef.current = false;
        setIsHandshaking(false);
    }
  }, [user, dataLayer]);

  // Keep a ref to the latest unlockVault so the auto-unlock effect never
  // captures a stale closure (unlockVault closes over `user`, which is null
  // on initial render; the effect deps don't include unlockVault directly).
  const unlockVaultRef = useRef(unlockVault);
  useEffect(() => { unlockVaultRef.current = unlockVault; });

  useEffect(() => {
    if (isLoading || authLoading) return;

    const pwd = getSessionPassword();

    if (isUnlocked || !hasVault) { setIsHandshaking(false); return; }
    if (persistenceMode === 'STRICT') { setIsHandshaking(false); return; }
    if (!pwd || !user) { setIsHandshaking(false); return; }
    if (unlockInProgressRef.current) return;

    unlockVaultRef.current(pwd)
      .catch((e: unknown) => {
        const isWrongPassword = e instanceof Error && e.message === 'Invalid Vault Password.';
        if (isWrongPassword) {
          sessionStorage.removeItem(SESSION_PWD_KEY);
        }
        setIsHandshaking(false);
      });

    return () => {
      // Reset the in-progress flag on cleanup so React Strict Mode's
      // double-invocation (mount → unmount → remount) doesn't permanently
      // block auto-unlock on the second mount.
      unlockInProgressRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, isLoading, authLoading, persistenceMode, isUnlocked, hasVault]);

  const isModuleAccessible = useCallback((moduleId: ModuleId): boolean => {
    if (isGuest) return true;
    const manifestPolicy = MODULE_MANIFEST[moduleId]?.securityPolicy;
    if (!manifestPolicy) return true;

    const userPref = profile?.securityPreferences?.vaultLocks?.[moduleId];
    const requiresVault = manifestPolicy.mandatory || (userPref ?? manifestPolicy.defaultLocked);

    if (!requiresVault) return true;
    return isUnlocked;
  }, [isGuest, profile?.securityPreferences, isUnlocked]);

  // ── Vault setup nudge ────────────────────────────────────────────────────
  const [nudgeSeen, setNudgeSeen] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('nexus_vault_nudge_seen') === 'true'
      : false
  );

  const dismissVaultSetupNudge = useCallback(() => {
    localStorage.setItem('nexus_vault_nudge_seen', 'true');
    setNudgeSeen(true);
  }, []);

  const initializeVault = useCallback(() => {
    // Non-destructive entrypoint: send the user to the full-screen vault handshake
    // route. The gate calls `unlockVault(password)` which derives the master key.
    if (isGuest) return;
    if (!user) return;

    try {
      const { pathname, search, hash } = window.location;
      const returnTo = pathname + search + hash;
      const url = `/vault-gate?returnTo=${encodeURIComponent(returnTo)}`;
      vaultRedirector(url);
    } catch (e) {
      // In unlikely environments (no window/location), fail closed (no crash).
      console.error('[Vault] Failed to initiate vault handshake:', e);
    }
  }, [isGuest, user]);

  useEffect(() => {
    // Lock vault when user signs out
    if (!user && !authLoading) {
      lockVault();
    }
    // refreshVaultStatus is intentionally NOT called here — the subscription
    // effect below already drives hasVault + isLoading. Calling it here too
    // caused a race: subscription set isLoading=true AFTER the one-shot fetch
    // already set isLoading=false, leaving the app stuck in loading.
  }, [user?.uid, authLoading, lockVault]);

  useEffect(() => {
    if (!user?.uid || authLoading) {
      // Only finalize the "no user" state when auth has confirmed there is no user.
      // During auth boot (user=null, authLoading=true) we must NOT set isLoading=false —
      // that would leave isLoading=false while hasVault=false before the subscription
      // even starts, causing the auto-unlock effect to prematurley clear isHandshaking
      // and expose a vault gate flash when hasVault arrives from Firestore.
      if (!user && !authLoading) {
        setHasVault(false);
        setIsLoading(false);
        if (!sessionStorage.getItem(SESSION_PWD_KEY)) {
          setIsHandshaking(false);
        }
      }
      return () => {};
    }

    setIsLoading(true);

    // Safety: if Firestore subscription never fires (offline, cold start, etc.)
    // release the loading gate after 8 s so the app is never permanently stuck.
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
      setIsHandshaking(false);
    }, 8000);

    const unsubscribe = dataLayer.subscribeToDocument(
      VAULT_COLLECTION,
      user.uid,
      (record) => {
        clearTimeout(safetyTimer);
        setHasVault(!!record);
        setIsLoading(false);
      }
    );

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, [user?.uid, authLoading, dataLayer]);

  useEffect(() => {
    if (isUnlocked && user && !isGuest && masterKeyRef.current) {
      void syncAllGuestDataToUser(user.uid, masterKeyRef.current);
    }
  }, [isUnlocked, user?.uid, isGuest]);

  const computedIsLoading = useMemo(
    () => isLoading || authLoading || isHandshaking,
    [isLoading, authLoading, isHandshaking]
  );

  // Derived: vault exists, is locked, and no auto-unlock is in flight
  const isVaultGateVisible = hasVault && !isUnlocked && !isHandshaking;

  const contextValue = useMemo(() => ({
    isUnlocked,
    isLoading: computedIsLoading,
    isHandshaking,
    hasVault,
    persistenceMode,
    setPersistenceMode,
    refreshVaultStatus,
    unlockVault,
    lockVault,
    getModuleKey,
    getMasterKey,
    checkModuleVault,
    isModuleAccessible,
    setSessionPassword,
    getSessionPassword,
    isVaultGateVisible,
    vaultSetupNudgeSeen: nudgeSeen,
    dismissVaultSetupNudge,
    initializeVault,
  }), [isUnlocked, computedIsLoading, isHandshaking, hasVault, persistenceMode,
      setPersistenceMode, refreshVaultStatus, unlockVault, lockVault, getModuleKey, getMasterKey,
      checkModuleVault, isModuleAccessible, setSessionPassword, getSessionPassword,
      isVaultGateVisible, nudgeSeen, dismissVaultSetupNudge, initializeVault]);

  return (
    <VaultContext.Provider value={contextValue}>
      {children}
    </VaultContext.Provider>
  );
}

// Safe fallback returned when context is absent (e.g. during HMR re-mount).
// Components see "still loading" state and render a spinner rather than crashing.
const VAULT_LOADING_FALLBACK: VaultContextType = {
  isUnlocked: false,
  isLoading: true,
  isHandshaking: false,
  hasVault: false,
  persistenceMode: 'SESSION',
  setPersistenceMode: () => {},
  refreshVaultStatus: async () => {},
  unlockVault: async () => {},
  lockVault: () => {},
  getMasterKey: async () => null,
  getModuleKey: async () => null,
  checkModuleVault: async () => false,
  isModuleAccessible: () => true,
  setSessionPassword: () => {},
  getSessionPassword: () => null,
  isVaultGateVisible: false,
  vaultSetupNudgeSeen: false,
  dismissVaultSetupNudge: () => {},
  initializeVault: () => {},
};

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    if (import.meta.env.DEV) {
      console.error('[useVault] Called outside VaultProvider — returning loading fallback (HMR glitch?)');
    }
    return VAULT_LOADING_FALLBACK;
  }
  return context;
}
