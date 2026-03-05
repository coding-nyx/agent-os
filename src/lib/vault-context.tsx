import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { deriveKey, encryptWithKey, decryptWithKey, base64ToUint8Array } from './encryption';
import { IVaultStorageService } from './services/vault-storage-service';
import { FirebaseVaultStorageService } from './services/firebase-vault-storage-service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';

export type VaultPersistenceMode = 'STRICT' | 'SESSION' | 'GRACE';

interface VaultContextType {
  isUnlocked: boolean;
  isLoading: boolean;
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

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  const storageService: IVaultStorageService = useMemo(() => new FirebaseVaultStorageService(), []);
  
  const masterKeyRef = useRef<CryptoKey | null>(null);
  
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasVault, setHasVault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
    if (!user) {
      setHasVault(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { auth } = getFirebase();
      
      // Wait for auth to be ready if possible
      if (auth?.currentUser) {
          try { await auth.currentUser.getIdToken(); } catch (e) {}
      }

      const exists = await storageService.hasVault(user.uid);
      setHasVault(exists);
    } catch (e: any) {
      console.error("Error refreshing vault status:", e);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid, storageService]);

  /**
   * Helper to verify a derived key against existing encrypted module data.
   * This is used during migration (salt exists, but canary doesn't).
   */
  const verifyMasterKeyAgainstModules = async (uid: string, key: CryptoKey): Promise<boolean> => {
      const { db } = getFirebase();
      if (!db) return true; // Can't verify, assume OK or handle later

      try {
          // Check therapy profile
          const therapyRef = doc(db, 'therapist_profiles', uid);
          const tSnap = await getDoc(therapyRef);
          if (tSnap.exists() && tSnap.data().encryptedData) {
              const data = tSnap.data();
              await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, key);
              return true; // Success!
          }

          // Check trainer profile
          const trainerRef = doc(db, 'ai_trainers', uid);
          const trSnap = await getDoc(trainerRef);
          if (trSnap.exists() && trSnap.data().encryptedData) {
              const data = trSnap.data();
              await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, key);
              return true; // Success!
          }

          // No module data to verify against
          return true;
      } catch (e) {
          console.warn("Key verification against modules failed:", e);
          return false;
      }
  };

  const unlockVault = async (password: string) => {
    if (!user) throw new Error("User must be logged in");

    let salt: Uint8Array;
    const existingSaltBase64 = await storageService.getSalt(user.uid);

    if (existingSaltBase64) {
      salt = base64ToUint8Array(existingSaltBase64);
    } else {
      // Security: Double check if vault actually exists to prevent overwriting salt
      const vaultExists = await storageService.hasVault(user.uid);
      if (vaultExists) {
          throw new Error("Vault configuration sync error. Please refresh and try again.");
      }
      salt = window.crypto.getRandomValues(new Uint8Array(16));
      const newSaltBase64 = window.btoa(String.fromCharCode(...salt));
      await storageService.saveSalt(user.uid, newSaltBase64);
    }

    // Derive master key
    const key = await deriveKey(password, salt);

    // Verify password with canary if it exists
    const existingCanary = await storageService.getCanary(user.uid);
    if (existingCanary) {
        try {
            const decrypted = await decryptWithKey(existingCanary, key);
            if (decrypted !== 'AGNES') throw new Error("Invalid Vault Password.");
        } catch (e) {
            console.error("Vault verification failed:", e);
            throw new Error("Invalid Vault Password.");
        }
    } else {
        // Migration mode OR truly new vault
        const vaultExists = await storageService.hasVault(user.uid);
        if (vaultExists) {
            // Migration: Salt exists, but no canary.
            // Verify key against module data before "poisoning" the canary.
            const isValid = await verifyMasterKeyAgainstModules(user.uid, key);
            if (!isValid) {
                throw new Error("Invalid Vault Password.");
            }
        }
        
        // Either truly new OR verified migration: Safe to save canary
        const newCanary = await encryptWithKey('AGNES', key);
        await storageService.saveCanary(user.uid, newCanary);
    }

    masterKeyRef.current = key;
    setIsUnlocked(true);
    setSessionPassword(password);
    await refreshVaultStatus();
  };

  useEffect(() => {
      const tryAutoUnlock = async () => {
          const pwd = getSessionPassword();
          if (pwd && user && !isUnlocked && persistenceMode !== 'STRICT') {
              try { await unlockVault(pwd); } catch(e) {}
          }
      };
      if (!isLoading) tryAutoUnlock();
  }, [user, isLoading, persistenceMode]);

  const getModuleKey = async (moduleName: string): Promise<CryptoKey | null> => {
    return masterKeyRef.current;
  };

  useEffect(() => {
    if (!user) lockVault();
    void refreshVaultStatus();
  }, [user?.uid, lockVault, refreshVaultStatus]);

  return (
    <VaultContext.Provider
      value={{
        isUnlocked, isLoading, hasVault,
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
