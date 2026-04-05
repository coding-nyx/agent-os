'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthUser, IAuthService } from './services/auth-service';
import { FirebaseAuthService } from './services/firebase-auth-service';
import { CoreProfileService } from './services/core-profile-service';
import { GlobalProjectionService } from './services/global-projection-service';
import { CoreUserProfile } from './types';
import { useDataLayer } from './data-layer/provider';
import { NexusHandoffService } from './services/nexus-handoff-service';
import { CognitiveAgent } from '@/cortex-bridge/engine/CognitiveAgent';
import { invalidateCredentialStore } from '@/cortex-bridge/credential-store-bridge';

interface AuthContextType {
  user: AuthUser | null;
  profile: CoreUserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  enterGuestMode: () => void;
  reloadUser: () => Promise<void>;
  sendVerification: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  initializeNewUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const GUEST_SESSION_KEY = 'nexus_guest_active';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authService: IAuthService = useMemo(() => new FirebaseAuthService(), []);
  const dataLayer = useDataLayer();
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<CoreUserProfile | null>(null);
  const [isGuest, setIsGuest] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(GUEST_SESSION_KEY) === 'true';
  });
  const [loading, setLoading] = useState(true);
  const profileUnsubRef = useRef<null | (() => void)>(null);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      const p = await CoreProfileService.getProfile(user.uid, dataLayer);
      if (p) {
        setProfile(p);
        await GlobalProjectionService.syncFromProfile(p, dataLayer);
      } else {
        setProfile(null);
      }
    } catch (e) {
      console.error("Profile sync suspended due to network integrity.");
    }
  }, [user, dataLayer]);


  useEffect(() => {
    const hasGuestSession = sessionStorage.getItem(GUEST_SESSION_KEY) === 'true';
    if (hasGuestSession) setIsGuest(true);

    const unsubscribe = authService.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setIsGuest(false);
        setLoading(true);
        NexusHandoffService.init(currentUser.uid);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [authService]);

  useEffect(() => {
    if (!user || isGuest) {
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        if (cancelled) return;

        if (profileUnsubRef.current) {
          profileUnsubRef.current();
          profileUnsubRef.current = null;
        }

        profileUnsubRef.current = CoreProfileService.subscribeProfile(user.uid, async (nextProfile) => {
          if (cancelled) return;
          if (authService.getCurrentUser()?.uid !== user.uid) return;
          setProfile(nextProfile);
          if (nextProfile) {
            await GlobalProjectionService.syncFromProfile(nextProfile, dataLayer);
          }
          setLoading(false);
        }, dataLayer);
      } catch (e) {
        console.error('Auth boot sequence encountered a data-sync delay:', e);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }
    };
  }, [user, isGuest, authService, dataLayer]);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await authService.login(email, password);
      return true;
    } catch (error: unknown) {
      setLoading(false);
      throw error;
    }
  }, [authService]);

  const register = useCallback(async (email: string, password: string): Promise<boolean> => {
      setLoading(true);
      try {
          await authService.register(email, password);
          return true;
      } catch (error: unknown) {
          setLoading(false);
          throw error;
      }
  }, [authService]);

  const enterGuestMode = useCallback(() => {
      setIsGuest(true);
      sessionStorage.setItem(GUEST_SESSION_KEY, 'true');
  }, []);

  const logout = useCallback(async () => {
    // Wipe KMP credentials from memory before clearing storage.
    CognitiveAgent.clearCredentials();
    invalidateCredentialStore();

    await authService.logout();
    setUser(null);
    setProfile(null);
    setIsGuest(false);
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    sessionStorage.removeItem('nexus_vault_session');
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('nexus_') || key.includes('integrity')) {
            localStorage.removeItem(key);
        }
    });
    window.location.href = '/';
  }, [authService]);

  const reloadUser = useCallback(async () => {
      const updatedUser = await authService.reloadUser();
      setUser(updatedUser);
  }, [authService]);

  const sendVerification = useCallback(async () => {
      await authService.sendVerificationEmail();
  }, [authService]);

  const initializeNewUser = useCallback(async () => {
      if (!user || !user.email) return;
      setLoading(true);
      try {
          const newP = await CoreProfileService.initializeProfile(user.uid, user.email, dataLayer);
          setProfile(newP);
          await GlobalProjectionService.syncFromProfile(newP, dataLayer);
      } finally {
          setLoading(false);
      }
  }, [user, dataLayer]);

  const isAuthenticated = useMemo(() => !!user || isGuest, [user, isGuest]);

  const contextValue = useMemo(() => ({
    isAuthenticated,
    isGuest,
    user,
    profile,
    login,
    register,
    logout,
    enterGuestMode,
    reloadUser,
    sendVerification,
    refreshProfile,
    initializeNewUser,
    loading,
  }), [isAuthenticated, isGuest, user, profile, login, register, logout,
      enterGuestMode, reloadUser, sendVerification, refreshProfile, initializeNewUser, loading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within a AuthProvider');
  return context;
}
