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
  getModuleKey: (moduleName: string) => Promise<CryptoKey | null>;
  checkModuleVault: (collectionName: string) => Promise<boolean>;
  isModuleAccessible: (moduleId: ModuleId) => boolean;
  setSessionPassword: (password: string) => void;
  getSessionPassword: () => string | null;
}

const VaultContext = createContext<VaultContextType | null>(null);
const PERSISTENCE_KEY = 'nexus_vault_mode';
const SESSION_PWD_KEY = 'nexus_vault_session';
const VAULT_COLLECTION = 'vaults';

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isGuest, loading: authLoading } = useAuth();
  const dataLayer = useDataLayer();
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const unlockInProgressRef = useRef(false);
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHandshaking, setIsHandshaking] = useState(false);
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

  const getModuleKey = useCallback(async (moduleName: string): Promise<CryptoKey | null> => {
    return masterKeyRef.current;
  }, []);

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
        } else {
            salt = window.crypto.getRandomValues(new Uint8Array(16));
            const saltBase64 = window.btoa(String.fromCharCode(...salt));
            if (snap) {
                await dataLayer.updateDocument(VAULT_COLLECTION, user.uid, { salt: saltBase64 });
            } else {
                await dataLayer.setDocument(VAULT_COLLECTION, user.uid, { salt: saltBase64 });
            }
        }

        const key = await deriveKey(password, salt);

        if (canary) {
            try {
                const decrypted = await decryptWithKey(canary, key);
                if (decrypted !== 'NEXUS') throw new Error("Invalid Vault Password.");
            } catch (e) {
                throw new Error("Invalid Vault Password.");
            }
        } else {
            const newCanary = await encryptWithKey('NEXUS', key);
            await dataLayer.updateDocument(VAULT_COLLECTION, user.uid, { canary: newCanary });
        }

        masterKeyRef.current = key;
        setIsUnlocked(true);
        setSessionPassword(password);
        await refreshVaultStatus();
    } finally {
        unlockInProgressRef.current = false;
        setIsHandshaking(false);
    }
  }, [user, refreshVaultStatus, dataLayer]);

  useEffect(() => {
      const tryAutoUnlock = async () => {
          const pwd = getSessionPassword();
          if (pwd && user && !isUnlocked && !isHandshaking && persistenceMode !== 'STRICT') {
              try { await unlockVault(pwd); } catch(e) { console.warn('Auto-unlock failed:', e); }
          }
      };
      if (!isLoading && !authLoading) tryAutoUnlock();
  }, [user?.uid, isLoading, authLoading, persistenceMode, isUnlocked, isHandshaking, unlockVault]);

  const isModuleAccessible = useCallback((moduleId: ModuleId): boolean => {
    if (isGuest) return true;
    const manifestPolicy = MODULE_MANIFEST[moduleId]?.securityPolicy;
    if (!manifestPolicy) return true;

    const userPref = profile?.securityPreferences?.vaultLocks?.[moduleId];
    const requiresVault = manifestPolicy.mandatory || (userPref ?? manifestPolicy.defaultLocked);

    if (!requiresVault) return true;
    return isUnlocked;
  }, [isGuest, profile?.securityPreferences, isUnlocked]);

  useEffect(() => {
    if (!user && !authLoading) lockVault();
    if (!authLoading) void refreshVaultStatus();
  }, [user?.uid, authLoading, lockVault, refreshVaultStatus]);

  useEffect(() => {
    if (!user?.uid || authLoading) {
      if (!user) {
        setHasVault(false);
        setIsLoading(false);
      }
      return () => {};
    }

    setIsLoading(true);
    const unsubscribe = dataLayer.subscribeToDocument(
      VAULT_COLLECTION,
      user.uid,
      (record) => {
        setHasVault(!!record);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
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
    checkModuleVault,
    isModuleAccessible,
    setSessionPassword,
    getSessionPassword,
  }), [isUnlocked, computedIsLoading, isHandshaking, hasVault, persistenceMode,
      setPersistenceMode, refreshVaultStatus, unlockVault, lockVault, getModuleKey,
      checkModuleVault, isModuleAccessible, setSessionPassword, getSessionPassword]);

  return (
    <VaultContext.Provider value={contextValue}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within a VaultProvider');
  return context;
}
