import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { deriveKey, encryptWithKey, decryptWithKey, base64ToUint8Array } from './encryption';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { readDocOnce } from './services/firestore-once';
import { MODULE_MANIFEST, ModuleId } from '@/lib/module-manifest';
import { syncAllGuestDataToUser } from './services/guest-sync-service';

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
const PERSISTENCE_KEY = 'agnes_vault_mode';
const SESSION_PWD_KEY = 'agnes_vault_session';
const VAULT_COLLECTION = 'vaults';

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, isGuest, loading: authLoading } = useAuth();
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const unlockInProgressRef = useRef(false);
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [persistenceMode, _setPersistenceMode] = useState<VaultPersistenceMode>(
      (localStorage.getItem(PERSISTENCE_KEY) as VaultPersistenceMode) || 'SESSION'
  );

  const setPersistenceMode = (mode: VaultPersistenceMode) => {
      _setPersistenceMode(mode);
      localStorage.setItem(PERSISTENCE_KEY, mode);
  };

  const lockVault = useCallback(() => {
    masterKeyRef.current = null;
    setIsUnlocked(false);
    sessionStorage.removeItem(SESSION_PWD_KEY);
  }, []);

  const setSessionPassword = (pwd: string) => {
      if (persistenceMode !== 'STRICT') {
          sessionStorage.setItem(SESSION_PWD_KEY, pwd);
      }
  };

  const getSessionPassword = () => {
      return sessionStorage.getItem(SESSION_PWD_KEY);
  };

  const getModuleKey = useCallback(async (moduleName: string): Promise<CryptoKey | null> => {
    return masterKeyRef.current;
  }, []);

  const checkModuleVault = useCallback(async (collectionName: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { db } = getFirebase();
      if (!db) return false;
      const docRef = doc(db, collectionName, user.uid);
      const snap = await readDocOnce(docRef);
      return snap.exists();
    } catch (e) {
      console.error(`Error checking vault for ${collectionName}:`, e);
      return false;
    }
  }, [user?.uid]);

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
      const { db } = getFirebase();
      if (!db) return;
      const snap = await readDocOnce(doc(db, VAULT_COLLECTION, user.uid));
      setHasVault(snap.exists());
    } catch (e: any) {
      console.error("Error refreshing vault status:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, authLoading]);

  const unlockVault = useCallback(async (password: string) => {
    if (unlockInProgressRef.current) return;
    unlockInProgressRef.current = true;

    if (!user) throw new Error("User must be logged in");
    const { db } = getFirebase();
    if (!db) throw new Error("Firebase failure");

    setIsHandshaking(true);
    try {
        const vaultRef = doc(db, VAULT_COLLECTION, user.uid);
        const snap = await readDocOnce(vaultRef);
        
        let salt: Uint8Array;
        let canary: any = null;

        if (snap.exists()) {
            const data = snap.data();
            salt = base64ToUint8Array(data.salt);
            canary = data.canary;
        } else {
            salt = window.crypto.getRandomValues(new Uint8Array(16));
            const saltBase64 = window.btoa(String.fromCharCode(...salt));
            await setDoc(vaultRef, { salt: saltBase64 }, { merge: !0 });
        }

        const key = await deriveKey(password, salt);

        if (canary) {
            try {
                const decrypted = await decryptWithKey(canary, key);
                if (decrypted !== 'AGNES') throw new Error("Invalid Vault Password.");
            } catch (e) {
                throw new Error("Invalid Vault Password.");
            }
        } else {
            const newCanary = await encryptWithKey('AGNES', key);
            await setDoc(vaultRef, { canary: newCanary }, { merge: !0 });
        }

        masterKeyRef.current = key;
        setIsUnlocked(true);
        setSessionPassword(password);
        await refreshVaultStatus();
    } finally {
        unlockInProgressRef.current = false;
        setIsHandshaking(false);
    }
  }, [user, refreshVaultStatus]);

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

    const { db } = getFirebase();
    if (!db) return () => {};

    setIsLoading(true);
    const vaultRef = doc(db, VAULT_COLLECTION, user.uid);
    const unsubscribe = onSnapshot(
      vaultRef,
      (snap) => {
        setHasVault(snap.exists());
        setIsLoading(false);
      },
      (error) => {
        console.error('Vault subscription error:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, authLoading]);

  useEffect(() => {
    if (isUnlocked && user && !isGuest && masterKeyRef.current) {
      void syncAllGuestDataToUser(user.uid, masterKeyRef.current);
    }
  }, [isUnlocked, user?.uid, isGuest]);

  return (
    <VaultContext.Provider
      value={{
        isUnlocked, isLoading: isLoading || authLoading || isHandshaking, isHandshaking, hasVault,
        persistenceMode, setPersistenceMode,
        refreshVaultStatus, unlockVault, lockVault, getModuleKey, checkModuleVault, isModuleAccessible,
        setSessionPassword, getSessionPassword
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within a VaultProvider');
  return context;
}
