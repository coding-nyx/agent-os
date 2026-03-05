'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { AuthUser, IAuthService } from './services/auth-service';
import { FirebaseAuthService } from './services/firebase-auth-service';
import { MockAuthService } from './services/MockAuthService';
import { getFirebase } from './firebase';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  enterGuestMode: () => void;
  reloadUser: () => Promise<void>;
  sendVerification: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);
const GUEST_SESSION_KEY = 'agnes_guest_active';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authService: IAuthService = useMemo(() => new FirebaseAuthService(), []);
  
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hasGuestSession = sessionStorage.getItem(GUEST_SESSION_KEY) === 'true';
    if (hasGuestSession) setIsGuest(true);

    const unsubscribe = authService.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) setIsGuest(false);
      setLoading(false);
    });

    const timer = setTimeout(() => setLoading(false), 2000);

    return () => {
        unsubscribe();
        clearTimeout(timer);
    };
  }, [authService]);

  const login = async (email: string, password: string) => {
    try {
      await authService.login(email, password);
      return true;
    } catch (error: any) {
      console.error("Login failed", error);
      throw error;
    }
  };

  const register = async (email: string, password: string): Promise<boolean> => {
      try {
          await authService.register(email, password);
          return true;
      } catch (error: any) {
          console.error("Registration failed:", error.message);
          throw error;
      }
  };

  const enterGuestMode = useCallback(() => {
      setIsGuest(true);
      sessionStorage.setItem(GUEST_SESSION_KEY, 'true');
  }, []);

  const logout = async () => {
    await authService.logout();
    setUser(null);
    setIsGuest(false);
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    sessionStorage.removeItem('agnes_vault_session');
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('agnes_') || key.includes('integrity')) {
            localStorage.removeItem(key);
        }
    });
    window.location.href = '/';
  };

  const reloadUser = async () => {
      const updatedUser = await authService.reloadUser();
      setUser(updatedUser);
  };

  const sendVerification = async () => {
      await authService.sendVerificationEmail();
  };

  return (
    <AuthContext.Provider value={{ 
        isAuthenticated: !!user || isGuest, 
        isGuest,
        user, 
        login, 
        register,
        logout, 
        enterGuestMode,
        reloadUser,
        sendVerification,
        loading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within a AuthProvider');
  return context;
}
