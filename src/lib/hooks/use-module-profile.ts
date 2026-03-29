import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../auth-context';
import { useVault } from '../vault-context';
import { useSpineEvent } from '../spine/spine-event-bus';
import { shouldGateModuleOnboarding } from '../onboarding/onboarding-policy';

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
  const { isUnlocked, getMasterKey } = useVault();

  const [profile, setProfile] = useState<TProfile | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [hasSyncedGuest, setHasSyncedGuest] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const hasLoadedOnce = useRef(false);
  // True while a real-time Firestore subscription is active for this module.
  const hasActiveSubscriptionRef = useRef(false);
  // Stable refs so the MODULE_PROFILE_UPDATED handler never captures stale values.
  const encryptionKeyRef = useRef<CryptoKey | null>(null);
  const userUidRef = useRef<string | undefined>(undefined);

  const resolveOnboardingGate = useCallback((nextProfile: TProfile | null) => {
    return shouldGateModuleOnboarding(moduleId, nextProfile);
  }, [moduleId]);

  // Listen for external sync events (e.g. from useModuleAI actions).
  // When a live Firestore subscription is in place we do NOT increment refreshNonce
  // (that would destroy and recreate the subscription, causing a stale-profile window).
  // Instead we issue a direct re-read as a safety net — the snapshot listener is the
  // primary update path, but this catches any transient decryption or delivery failure.
  useSpineEvent('MODULE_PROFILE_UPDATED', useCallback((event) => {
    if (event.data?.moduleId !== moduleId) return;
    if (hasActiveSubscriptionRef.current) {
      const uid = userUidRef.current ?? '';
      if (!uid) return;
      refreshProfileRef.current({ userId: uid, encryptionKey: encryptionKeyRef.current })
        .then(p => setProfile(p))
        .catch(() => {});
      return;
    }
    setRefreshNonce(n => n + 1);
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
    encryptionKeyRef.current = encryptionKey;
    userUidRef.current = user?.uid;
  });

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      if (!user?.uid && !isGuest) {
        if (!mounted) return;
        setProfile(null);
        setEncryptionKey(null);
        setIsLoading(false);
        return;
      }

      // Only show loading skeleton on initial mount, not on refresh-triggered re-inits.
      // This prevents UnifiedModulePage from unmounting content components mid-session.
      if (!hasLoadedOnce.current) {
        setIsLoading(true);
      }
      const key = !isGuest && isUnlocked ? await getMasterKey() : null;
      if (!mounted) return;
      setEncryptionKey(key);

      if (user && !isGuest && key && subscribeProfileRef.current) {
        hasActiveSubscriptionRef.current = true;
        const unsub = subscribeProfileRef.current({ userId: user.uid, encryptionKey: key }, (nextProfile) => {
          if (!mounted) return;
          setProfile(nextProfile);
          setIsOnboarding(resolveOnboardingGate(nextProfile));
          setIsLoading(false);
          hasLoadedOnce.current = true;
        });

        if (!mounted) {
          hasActiveSubscriptionRef.current = false;
          unsub();
          return;
        }
        unsubscribe = unsub;
        return;
      }

      const guestSafeUserId = user?.uid ?? '';
      const loadedProfile = await loadProfileRef.current({ userId: guestSafeUserId, encryptionKey: key });
      if (!mounted) return;
      setProfile(loadedProfile);
      setIsOnboarding(resolveOnboardingGate(loadedProfile));
      setIsLoading(false);
      hasLoadedOnce.current = true;
    };

    init();

    return () => {
      mounted = false;
      hasActiveSubscriptionRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid, isGuest, isUnlocked, getMasterKey, moduleId, refreshNonce, resolveOnboardingGate]); // Added refreshNonce

  useEffect(() => {
    if (!user || !isUnlocked || hasSyncedGuest || !syncGuestProfileRef.current) return;
    (async () => {
      const key = await getMasterKey();
      if (!key) return;
      if (!syncGuestProfileRef.current) return;
      const synced = await syncGuestProfileRef.current({ userId: user.uid, encryptionKey: key });
      if (synced) setHasSyncedGuest(true);
    })();
  }, [user?.uid, isUnlocked, hasSyncedGuest, getMasterKey, moduleId]);

  const persistProfile = useCallback(async (p: TProfile) => {
    if (!saveProfileRef.current) return;
    const targetUserId = user?.uid ?? (isGuest ? '' : null);
    if (targetUserId === null) return;
    try {
      await saveProfileRef.current(p, { userId: targetUserId, encryptionKey });
    } catch (e) {
      console.error(`Failed to persist ${moduleId} profile:`, e);
    }
  }, [user?.uid, isGuest, encryptionKey, moduleId]);

  const reloadProfile = useCallback(async () => {
    if (!user?.uid && !isGuest) {
      setProfile(null);
      setEncryptionKey(null);
      setIsOnboarding(true);
      return null;
    }

    const key = !isGuest && isUnlocked ? await getMasterKey() : null;
    setEncryptionKey(key);
    const guestSafeUserId = user?.uid ?? '';

    const nextProfile = await refreshProfileRef.current({
      userId: guestSafeUserId,
      encryptionKey: key
    });

    setProfile(nextProfile);
    setIsOnboarding(resolveOnboardingGate(nextProfile));
    return nextProfile;
  }, [user?.uid, isGuest, isUnlocked, getMasterKey, moduleId, resolveOnboardingGate]);

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
