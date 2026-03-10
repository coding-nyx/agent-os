import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth-context';
import { useVault } from '../vault-context';
import { useSpineEvent } from '../spine/spine-event-bus';

export interface UseModuleProfileOptions<TProfile> {
  moduleId: string;
  loadProfile: (params: { userId: string; encryptionKey: CryptoKey | null }) => Promise<TProfile | null>;
  /** Optional alias for loadProfile; used to trigger an explicit profile reload from outside the hook. */
  refreshProfile?: (params: { userId: string; encryptionKey: CryptoKey | null }) => Promise<TProfile | null>;
  saveProfile?: (profile: TProfile, params: { userId: string; encryptionKey: CryptoKey | null }) => Promise<void>;
  subscribeProfile?: (params: { userId: string; encryptionKey: CryptoKey }, onUpdate: (profile: TProfile | null) => void) => () => void;
  syncGuestProfile?: (params: { userId: string; encryptionKey: CryptoKey }) => Promise<boolean>;
}

export function useModuleProfile<TProfile extends { onboardingComplete?: boolean }>({
  moduleId,
  loadProfile,
  refreshProfile,
  saveProfile: saveProfileFn,
  subscribeProfile,
  syncGuestProfile
}: UseModuleProfileOptions<TProfile>) {
  const { user, isGuest } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();

  const [profile, setProfile] = useState<TProfile | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [hasSyncedGuest, setHasSyncedGuest] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Listen for external sync events (e.g. from useModuleAI actions)
  useSpineEvent('MODULE_PROFILE_UPDATED' as any, useCallback((event) => {
    if (event.data?.moduleId === moduleId) {
      console.log(`[useModuleProfile] Refreshing ${moduleId} due to external sync event`);
      setRefreshNonce(n => n + 1);
    }
  }, [moduleId]));

  // We use refs for these to avoid infinite loops if the caller provides unstable arrow functions
  const loadProfileRef = useRef(loadProfile);
  const refreshProfileRef = useRef(refreshProfile ?? loadProfile);
  const saveProfileRef = useRef(saveProfileFn);
  const subscribeProfileRef = useRef(subscribeProfile);
  const syncGuestProfileRef = useRef(syncGuestProfile);

  useEffect(() => {
    loadProfileRef.current = loadProfile;
    refreshProfileRef.current = refreshProfile ?? loadProfile;
    saveProfileRef.current = saveProfileFn;
    subscribeProfileRef.current = subscribeProfile;
    syncGuestProfileRef.current = syncGuestProfile;
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      if (!user?.uid) {
        if (!mounted) return;
        setProfile(null);
        setEncryptionKey(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const key = isUnlocked ? await getModuleKey(moduleId) : null;
      if (!mounted) return;
      setEncryptionKey(key);

      if (user && !isGuest && key && subscribeProfileRef.current) {
        const unsub = subscribeProfileRef.current({ userId: user.uid, encryptionKey: key }, (nextProfile) => {
          if (!mounted) return;
          setProfile(nextProfile);
          setIsOnboarding(!nextProfile || !nextProfile.onboardingComplete);
          setIsLoading(false);
        });

        if (!mounted) {
          unsub();
          return;
        }
        unsubscribe = unsub;
        return;
      }

      const loadedProfile = await loadProfileRef.current({ userId: user.uid, encryptionKey: key });
      if (!mounted) return;
      setProfile(loadedProfile);
      setIsOnboarding(!loadedProfile || !loadedProfile.onboardingComplete);
      setIsLoading(false);
    };

    init();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid, isGuest, isUnlocked, getModuleKey, moduleId, refreshNonce]); // Added refreshNonce

  useEffect(() => {
    if (!user || !isUnlocked || hasSyncedGuest || !syncGuestProfileRef.current) return;
    (async () => {
      const key = await getModuleKey(moduleId);
      if (!key) return;
      if (!syncGuestProfileRef.current) return;
      const synced = await syncGuestProfileRef.current({ userId: user.uid, encryptionKey: key });
      if (synced) setHasSyncedGuest(true);
    })();
  }, [user?.uid, isUnlocked, hasSyncedGuest, getModuleKey, moduleId]);

  const persistProfile = useCallback(async (p: TProfile) => {
    if (!saveProfileRef.current || !user?.uid) return;
    try {
      await saveProfileRef.current(p, { userId: user.uid, encryptionKey });
    } catch (e) {
      console.error(`Failed to persist ${moduleId} profile:`, e);
    }
  }, [user?.uid, encryptionKey, moduleId]);

  const reloadProfile = useCallback(async () => {
    if (!user?.uid) {
      setProfile(null);
      setEncryptionKey(null);
      setIsOnboarding(true);
      return null;
    }

    const key = isUnlocked ? await getModuleKey(moduleId) : null;
    setEncryptionKey(key);

    const nextProfile = await refreshProfileRef.current({
      userId: user.uid,
      encryptionKey: key
    });

    setProfile(nextProfile);
    setIsOnboarding(!nextProfile || !nextProfile.onboardingComplete);
    return nextProfile;
  }, [user?.uid, isUnlocked, getModuleKey, moduleId]);

  return {
    profile,
    setProfile,
    isOnboarding,
    setIsOnboarding,
    isLoading,
    encryptionKey,
    persistProfile,
    reloadProfile,
  };
}
