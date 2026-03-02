'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getFirebase } from './firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { BootLoader } from '@/components/ui/boot-loader';
import { AnimatePresence } from 'framer-motion';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (emailOrPassword: string, password?: string) => Promise<boolean>;
  registerWithEmail: (email: string, password: string) => Promise<boolean>;
  sendVerification: () => Promise<boolean>;
  checkVerificationStatus: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  finishLogin: (email: string, href: string) => Promise<void>;
  logout: () => Promise<void>;
  trainerSlug: string | null;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [trainerSlug, setTrainerSlug] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    // Check for hardcoded super admin session first
    const isSuper = sessionStorage.getItem('is_super_admin') === 'true';
    if (isSuper) {
        setIsAuthenticated(true);
        setIsSuperAdmin(true);
        setTrainerSlug('platform');
        // Synthesize a fake user for the context
        setUser({ uid: 'super-admin-uid', email: 'admin@admin.com' } as User);
        setLoading(false);
        return;
    }

    const { auth } = getFirebase();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthenticated(!!currentUser);
      setIsSuperAdmin(false);

      if (currentUser) {
          // Resolve slug via DataProvider logic (duplicated here to avoid circular dep or complex injection)
          // We need to query the 'trainers' collection for ownerUid == currentUser.uid
          try {
             const { db } = getFirebase();
             if (db) {
                 const docRef = doc(db, 'trainers', currentUser.uid);
                 const docSnap = await getDoc(docRef);
                 if (docSnap.exists()) {
                     setTrainerSlug(docSnap.id);
                 } else {
                     // No profile yet. It will be created on first save/access in dashboard.
                     setTrainerSlug(null);
                 }
             }
          } catch (e) {
              console.error("Failed to fetch trainer slug", e);
          }
      } else {
          setTrainerSlug(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password?: string) => {
    // Super Admin Bypass
    if (email === 'admin@admin.com' && password === 'admin123') {
        setIsAuthenticated(true);
        setIsSuperAdmin(true);
        setTrainerSlug('platform');
        setUser({ uid: 'super-admin-uid', email: 'admin@admin.com', emailVerified: true } as User);
        sessionStorage.setItem('is_super_admin', 'true');
        return true;
    }

    // Firebase Auth flow
    const { auth } = getFirebase();
    if (!auth) {
      console.error("Firebase Auth not initialized");
      return false;
    }

    try {
        if (password) {
            await signInWithEmailAndPassword(auth, email, password);
        } else {
            // Assume email link flow if only email provided (though standard login form asks for pass)
            // But for this task, we mainly care about the admin login form which has email/password
            throw new Error("Password required");
        }
      return true;
    } catch (error) {
      console.error("Login failed", error);
      return false;
    }
  };

  const registerWithEmail = async (email: string, password: string): Promise<boolean> => {
      const { auth } = getFirebase();
      if (!auth) return false;
      try {
          const { createUserWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          await sendEmailVerification(userCredential.user);
          return true;
      } catch (error) {
          console.error("Registration failed", error);
          return false;
      }
  };

  const sendVerification = async (): Promise<boolean> => {
      const { auth } = getFirebase();
      if (!auth || !auth.currentUser) return false;
      try {
          const { sendEmailVerification } = await import('firebase/auth');
          await sendEmailVerification(auth.currentUser);
          return true;
      } catch (error) {
           console.error("Verification email failed", error);
           return false;
      }
  };

  const checkVerificationStatus = async (): Promise<boolean> => {
      const { auth } = getFirebase();
      if (!auth || !auth.currentUser) return false;
      try {
          await auth.currentUser.reload();
          // Update local state if needed, though onAuthStateChanged usually handles it
          // Force a re-render of user state might be tricky without triggering a full auth state change
          // But setUser will trigger it.
          setUser({ ...auth.currentUser }); 
          return auth.currentUser.emailVerified;
      } catch (error) {
          console.error("Reload failed", error);
          return false;
      }
  };

  const resetPassword = async (email: string): Promise<boolean> => {
       const { auth } = getFirebase();
       if (!auth) return false;
       try {
           const { sendPasswordResetEmail } = await import('firebase/auth');
           await sendPasswordResetEmail(auth, email);
           return true;
       } catch (error) {
           console.error("Reset password failed", error);
           return false;
       }
  };

  const finishLogin = async (email: string, href: string) => {
    const { auth } = getFirebase();
    if (!auth) throw new Error("Firebase Auth not initialized");

    if (isSignInWithEmailLink(auth, href)) {
      await signInWithEmailLink(auth, email, href);
      window.localStorage.removeItem('emailForSignIn');
    } else {
        throw new Error("Invalid sign-in link");
    }
  };

  const logout = async () => {
    const { auth } = getFirebase();
    if (auth) {
      await signOut(auth);
    }
    setIsAuthenticated(false);
    setUser(null);
    setTrainerSlug(null);
    setIsSuperAdmin(false);
    sessionStorage.removeItem('is_super_admin');
  };

  return (
    <AuthContext.Provider value={{ 
        isAuthenticated, 
        user, 
        login, 
        registerWithEmail,
        sendVerification,
        checkVerificationStatus,
        resetPassword,
        finishLogin, 
        logout, 
        loading, 
        trainerSlug, 
        isSuperAdmin 
    }}>
      <AnimatePresence>
        {loading && <BootLoader />}
      </AnimatePresence>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a AuthProvider');
  }
  return context;
}
