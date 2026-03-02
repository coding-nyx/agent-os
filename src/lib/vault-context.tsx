import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebase } from './firebase';
import { useAuth } from './auth-context';

interface VaultContextType {
  isUnlocked: boolean;
  isLoading: boolean;
  hasTherapyVault: boolean;
  hasTrainerVault: boolean;
  refreshVaultStatus: () => Promise<void>;
  getSessionPassword: () => string | null;
  setSessionPassword: (password: string) => void;
  lockVault: () => void;
}

const VaultContext = createContext<VaultContextType | null>(null);

const SESSION_PREFIX = 'vault_session_pwd';

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const passwordRef = useRef<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasTherapyVault, setHasTherapyVault] = useState(false);
  const [hasTrainerVault, setHasTrainerVault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const sessionKey = useMemo(() => {
    return user ? `${SESSION_PREFIX}_${user.uid}` : `${SESSION_PREFIX}_guest`;
  }, [user]);

  const getSessionPassword = () => {
    if (passwordRef.current) return passwordRef.current;
    const stored = sessionStorage.getItem(sessionKey);
    passwordRef.current = stored;
    setIsUnlocked(!!stored);
    return stored;
  };

  const setSessionPassword = (password: string) => {
    sessionStorage.setItem(sessionKey, password);
    passwordRef.current = password;
    setIsUnlocked(true);
  };

  const lockVault = () => {
    sessionStorage.removeItem(sessionKey);
    passwordRef.current = null;
    setIsUnlocked(false);
  };

  const refreshVaultStatus = useCallback(async () => {
    if (!user) {
      setHasTherapyVault(false);
      setHasTrainerVault(false);
      setIsLoading(false);
      return;
    }

    const { db } = getFirebase();
    if (!db) {
      setHasTherapyVault(false);
      setHasTrainerVault(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const therapyRef = doc(db, 'therapist_profiles', user.uid);
      const trainerRef = doc(db, 'ai_trainers', user.uid);
      const [therapySnap, trainerSnap] = await Promise.all([
        getDoc(therapyRef),
        getDoc(trainerRef),
      ]);

      setHasTherapyVault(!!therapySnap.exists() && !!therapySnap.data()?.encryptedData);
      setHasTrainerVault(!!trainerSnap.exists() && !!trainerSnap.data()?.encryptedProfile);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    passwordRef.current = null;
    setIsUnlocked(false);
    void refreshVaultStatus();
    void getSessionPassword();
  }, [user?.uid]);

  return (
    <VaultContext.Provider
      value={{
        isUnlocked,
        isLoading,
        hasTherapyVault,
        hasTrainerVault,
        refreshVaultStatus,
        getSessionPassword,
        setSessionPassword,
        lockVault,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
