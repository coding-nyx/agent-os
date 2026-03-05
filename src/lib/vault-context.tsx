import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { deriveKey, encryptWithKey, decryptWithKey, base64ToUint8Array } from './encryption';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';

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
  setSessionPassword: (password: string) => void;
  getSessionPassword: () => string | null;
}

const VaultContext = createContext<VaultContextType | null>(null);
const PERSISTENCE_KEY = 'agnes_vault_mode';
const SESSION_PWD_KEY = 'agnes_vault_session';
const VAULT_COLLECTION = 'vaults';

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const masterKeyRef = useRef<CryptoKey | null>(null);
  
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

  const checkModuleVault = useCallback(async (collectionName: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const { db } = getFirebase();
      if (!db) return false;
      const docRef = doc(db, collectionName, user.uid);
      const snap = await getDoc(docRef);
      return snap.exists();
    } catch (e) {
      console.error(`Error checking vault for ${collectionName}:`, e);
      return false;
    }
  }, [user]);

  const refreshVaultStatus = useCallback(async () => {
    if (!user || authLoading) {
      if (!user) {
          setHasVault(false);
          setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const { db } = getFirebase();
      if (!db) return;
      const snap = await getDoc(doc(db, VAULT_COLLECTION, user.uid));
      setHasVault(snap.exists());
    } catch (e: any) {
      console.error("Error refreshing vault status:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user, authLoading]);

  const unlockVault = async (password: string) => {
    if (!user) throw new Error("User must be logged in");
    const { db } = getFirebase();
    if (!db) throw new Error("Firebase failure");

    setIsHandshaking(true);
    try {
        const vaultRef = doc(db, VAULT_COLLECTION, user.uid);
        const snap = await getDoc(vaultRef);
        
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
        setIsHandshaking(false);
    }
  };

  useEffect(() => {
      const tryAutoUnlock = async () => {
          const pwd = getSessionPassword();
          // We only auto-unlock if we have a password AND a user, AND we aren't already handshaking
          if (pwd && user && !isUnlocked && !isHandshaking && persistenceMode !== 'STRICT') {
              try { await unlockVault(pwd); } catch(e) {}
          }
      };
      if (!isLoading && !authLoading) tryAutoUnlock();
  }, [user, isLoading, authLoading, persistenceMode, isUnlocked, isHandshaking]);

  const getModuleKey = async (moduleName: string): Promise<CryptoKey | null> => {
    return masterKeyRef.current;
  };

  useEffect(() => {
    if (!user && !authLoading) lockVault();
    if (!authLoading) void refreshVaultStatus();
  }, [user?.uid, authLoading, lockVault, refreshVaultStatus]);

  return (
    <VaultContext.Provider
      value={{
        isUnlocked, isLoading: isLoading || authLoading || isHandshaking, isHandshaking, hasVault,
        persistenceMode, setPersistenceMode,
        refreshVaultStatus, unlockVault, lockVault, getModuleKey, checkModuleVault,
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
