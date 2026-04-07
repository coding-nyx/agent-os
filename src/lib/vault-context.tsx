import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { deriveKey, encryptWithKey, decryptWithKey, base64ToUint8Array } from './encryption';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { syncAllGuestDataToUser } from './services/guest-sync-service';
import { useDataLayer } from './data-layer/provider';
import { CoreProfileService } from './services/core-profile-service';
import { SoulTerminationService } from './services/soul-termination-service';

// ── Ephemeral session encryption ────────────────────────────────────────────
// Instead of storing the vault password in plaintext in sessionStorage, we
// encrypt it with a per-page-load AES-GCM key held only in a module-scoped
// variable. On hard refresh the key is lost and auto-unlock gracefully fails
// (user re-enters password). On SPA navigation the key persists in memory.
let _sessionEphemeralKey: CryptoKey | null = null;

async function getOrCreateSessionEphemeralKey(): Promise<CryptoKey> {
  if (_sessionEphemeralKey) return _sessionEphemeralKey;
  _sessionEphemeralKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return _sessionEphemeralKey;
}

async function encryptSessionPassword(password: string): Promise<string> {
  const key = await getOrCreateSessionEphemeralKey();
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv } as AesGcmParams,
    key,
    enc.encode(password),
  );
  // Pack as "<base64(iv)>.<base64(ciphertext)>"
  const ivB64 = window.btoa(String.fromCharCode(...iv));
  const ctB64 = window.btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `${ivB64}.${ctB64}`;
}

async function decryptSessionPassword(blob: string): Promise<string | null> {
  if (!_sessionEphemeralKey) return null; // key lost (hard refresh)
  const [ivB64, ctB64] = blob.split('.');
  if (!ivB64 || !ctB64) return null;
  try {
    const iv = Uint8Array.from(window.atob(ivB64), c => c.charCodeAt(0));
    const ct = Uint8Array.from(window.atob(ctB64), c => c.charCodeAt(0));
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv } as AesGcmParams,
      _sessionEphemeralKey,
      ct,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null; // tampered or wrong key
  }
}
// ────────────────────────────────────────────────────────────────────────────

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
  getSessionPassword: () => Promise<string | null>;
  /** true when vault exists, is locked, and no auto-unlock is in progress */
  isVaultGateVisible: boolean;
  vaultSetupNudgeSeen: boolean;
  dismissVaultSetupNudge: () => void;
  /** Placeholder — will be wired to UnifiedAuthModal VAULT_HANDSHAKE step */
  initializeVault: () => void;
  /** Permanently deletes the vault and all associated keys. Irreversible data loss. */
  destroyVault: () => Promise<void>;
}

const VaultContext = createContext<VaultContextType | null>(null);
const PERSISTENCE_KEY = 'nexus_vault_mode';
const SESSION_PWD_KEY = 'nexus_vault_session';
const SESSION_TS_KEY = 'nexus_vault_session_ts';
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
  const { user, profile, isGuest, loading: authLoading, refreshProfile } = useAuth();
  const dataLayer = useDataLayer();
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const sessionPasswordRef = useRef<string | null>(null);
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

  const clearSessionPassword = useCallback(() => {
    sessionPasswordRef.current = null;
    sessionStorage.removeItem(SESSION_PWD_KEY);
    sessionStorage.removeItem(SESSION_TS_KEY);
  }, []);

  const writeRetainedSessionPassword = useCallback((pwd: string) => {
    sessionPasswordRef.current = pwd;
    // Encrypt the password with the ephemeral in-memory key before persisting.
    // On hard refresh the ephemeral key is lost and the blob becomes undecryptable,
    // gracefully falling back to manual unlock.
    encryptSessionPassword(pwd).then((blob) => {
      sessionStorage.setItem(SESSION_PWD_KEY, blob);
      sessionStorage.setItem(SESSION_TS_KEY, String(Date.now()));
    }).catch(() => {
      // If encryption fails (e.g. no crypto.subtle), don't store anything.
      sessionStorage.removeItem(SESSION_PWD_KEY);
      sessionStorage.removeItem(SESSION_TS_KEY);
    });
  }, []);

  const setPersistenceMode = useCallback((mode: VaultPersistenceMode) => {
    _setPersistenceMode(mode);
    localStorage.setItem(PERSISTENCE_KEY, mode);

    if (mode === 'STRICT') {
      sessionStorage.removeItem(SESSION_PWD_KEY);
      sessionStorage.removeItem(SESSION_TS_KEY);
      return;
    }

    if (isUnlocked && sessionPasswordRef.current) {
      writeRetainedSessionPassword(sessionPasswordRef.current);
    }
  }, [isUnlocked, writeRetainedSessionPassword]);

  const lockVault = useCallback(() => {
    masterKeyRef.current = null;
    setIsUnlocked(false);
    clearSessionPassword();
  }, [clearSessionPassword]);

  const getSessionTtlMs = useCallback(() => {
    const ttlMinutes = profile?.securityPreferences?.vaultSessionTtlMinutes ?? 0;
    if (!ttlMinutes || ttlMinutes <= 0) return 0;
    return ttlMinutes * 60 * 1000;
  }, [profile?.securityPreferences?.vaultSessionTtlMinutes]);

  const setSessionPassword = useCallback((pwd: string) => {
    sessionPasswordRef.current = pwd;
    if (persistenceMode !== 'STRICT') {
        writeRetainedSessionPassword(pwd);
    }
  }, [persistenceMode, writeRetainedSessionPassword]);

  const getSessionPassword = useCallback(async (): Promise<string | null> => {
      const blob = sessionStorage.getItem(SESSION_PWD_KEY);
      if (!blob) return null;

      // Decrypt the stored blob using the ephemeral in-memory key.
      // Returns null on hard refresh (key lost) or tampering.
      const pwd = await decryptSessionPassword(blob);
      if (!pwd) {
        clearSessionPassword();
        return null;
      }

      sessionPasswordRef.current = pwd;
      const ttlMs = getSessionTtlMs();
      if (ttlMs <= 0) return pwd;

      const rawTs = sessionStorage.getItem(SESSION_TS_KEY);
      if (!rawTs) {
        sessionStorage.setItem(SESSION_TS_KEY, String(Date.now()));
        return pwd;
      }

      const ts = Number(rawTs);
      if (!Number.isFinite(ts)) {
        clearSessionPassword();
        return null;
      }

      if (Date.now() - ts > ttlMs) {
        clearSessionPassword();
        return null;
      }
      return pwd;
  }, [clearSessionPassword, getSessionTtlMs]);

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

    if (isUnlocked || !hasVault) { setIsHandshaking(false); return; }
    if (persistenceMode === 'STRICT') { setIsHandshaking(false); return; }
    if (!user) { setIsHandshaking(false); return; }
    if (unlockInProgressRef.current) return;

    let cancelled = false;

    getSessionPassword().then((pwd) => {
      if (cancelled) return;
      if (!pwd) { setIsHandshaking(false); return; }

      unlockVaultRef.current(pwd)
        .catch((e: unknown) => {
          if (cancelled) return;
          const isWrongPassword = e instanceof Error && e.message === 'Invalid Vault Password.';
          if (isWrongPassword) {
            clearSessionPassword();
          }
          setIsHandshaking(false);
        });
    });

    return () => {
      cancelled = true;
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
    if (!hasVault) return true; // no vault set up yet — module accessible, data unencrypted
    return isUnlocked;
  }, [isGuest, profile?.securityPreferences, isUnlocked, hasVault]);

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

  const destroyVault = useCallback(async () => {
    if (!user) throw new Error("User must be logged in to destroy vault");
    
    // 1. Synchronously clear local state to prevent UI flashes
    masterKeyRef.current = null;
    setIsUnlocked(false);
    setHasVault(false);
    clearSessionPassword();

    // 2. Purge all encrypted module data (and the vault record) to prevent decryption
    //    errors when a new vault/key is created.
    //    This also triggers the onboardingComplete: false reset inside SoulTerminationService.
    try {
      await SoulTerminationService.purgeUserData(user.uid);
      SoulTerminationService.clearLocalArtifacts(); // clears nexus_vault_nudge_seen + session keys
    } catch (err) {
      console.error('[Vault] Purge failed during destruction:', err);
    }

    // 3. Force a re-fetch of the profile so AppContent reacts immediately
    await refreshProfile();
  }, [user, refreshProfile, clearSessionPassword]);

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
    // Only sync guest data if the user is unlocked and NOT currently 
    // undergoing a vault destruction/reset.
    if (isUnlocked && user && !isGuest && masterKeyRef.current && hasVault) {
      void syncAllGuestDataToUser(user.uid, masterKeyRef.current);
    }
  }, [isUnlocked, user?.uid, isGuest, hasVault]);

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
    destroyVault,
  }), [isUnlocked, computedIsLoading, isHandshaking, hasVault, persistenceMode,
      setPersistenceMode, refreshVaultStatus, unlockVault, lockVault, getModuleKey, getMasterKey,
      checkModuleVault, isModuleAccessible, setSessionPassword, getSessionPassword,
      isVaultGateVisible, nudgeSeen, dismissVaultSetupNudge, initializeVault, destroyVault]);

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
  getSessionPassword: async () => null,
  isVaultGateVisible: false,
  vaultSetupNudgeSeen: false,
  dismissVaultSetupNudge: () => {},
  initializeVault: () => {},
  destroyVault: async () => {},
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
