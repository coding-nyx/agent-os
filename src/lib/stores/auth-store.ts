import { create } from 'zustand';
import type { AuthUser } from '../services/auth-service';
import type { CoreUserProfile } from '../types';

interface AuthStore {
  user: AuthUser | null;
  profile: CoreUserProfile | null;
  loading: boolean;
  isGuest: boolean;
  setUser: (user: AuthUser | null) => void;
  /** Equality-guarded — only updates if data changed, preventing consumer re-renders. */
  setProfile: (profile: CoreUserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setIsGuest: (isGuest: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  loading: true,
  isGuest: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setIsGuest: (isGuest) => set({ isGuest }),
}));
