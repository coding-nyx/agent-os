import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { Message } from '@/lib/types';
import {
  AGNES_ENGAGEMENT_MODE_DEFINITIONS,
  type AgnesEngagementMode,
  type AgnesPersistentEngagementMode,
  buildAgnesPromptContinuity,
  DEFAULT_AGNES_ENGAGEMENT_MODE,
  getAgnesSessionModeOptions,
  resolvePersistentAgnesMode,
  saveGuestAgnesPreferredMode,
  loadGuestAgnesPreferredMode,
} from '../engagement-modes';
import {
  saveAgnesProfile,
  type TherapyIntakeProfile,
} from '../services/agnes-profile-service';

interface UseAgnesEngagementParams {
  profile: TherapyIntakeProfile | null;
  encryptionKey: CryptoKey | null | undefined;
  sessionType: 'impromptu' | 'new' | null;
  /** Kept in a ref internally — callers update via `messagesRef.current = messages`. */
  messagesRef: React.RefObject<Message[]>;
}

export function useAgnesEngagement({
  profile,
  encryptionKey,
  sessionType,
  messagesRef,
}: UseAgnesEngagementParams) {
  const { user } = useAuth();

  const [engagementMode, setEngagementMode] = useState<AgnesEngagementMode>(DEFAULT_AGNES_ENGAGEMENT_MODE);
  const [preferredPersistentMode, setPreferredPersistentMode] = useState<AgnesPersistentEngagementMode>(DEFAULT_AGNES_ENGAGEMENT_MODE);
  const [modeContinuity, setModeContinuity] = useState<ReturnType<typeof buildAgnesPromptContinuity>>();

  const isImpromptu = sessionType === 'impromptu';

  // Resolve stored preferred mode from profile (authenticated) or localStorage (guest)
  useEffect(() => {
    const storedMode = user
      ? resolvePersistentAgnesMode(
          profile?.baseContext && 'preferredEngagementMode' in profile.baseContext
            ? (profile.baseContext as { preferredEngagementMode?: unknown }).preferredEngagementMode
            : DEFAULT_AGNES_ENGAGEMENT_MODE,
        )
      : loadGuestAgnesPreferredMode();

    setPreferredPersistentMode(storedMode);
    if (!sessionType) {
      setEngagementMode(storedMode);
      setModeContinuity(undefined);
    }
  }, [user, profile?.baseContext, sessionType]);

  // Somatic preference toggle (mirrors AgnesSettingsPanel logic)
  const [somaticEnabled, setSomaticEnabled] = useState<boolean>(
    profile?.baseContext?.somaticEnabled !== false,
  );
  const pendingSomaticSaveRef = useRef(false);

  useEffect(() => {
    if (pendingSomaticSaveRef.current) return;
    setSomaticEnabled(profile?.baseContext?.somaticEnabled !== false);
  }, [profile?.baseContext?.somaticEnabled]);

  const handleSomaticToggle = useCallback(async () => {
    if (!profile) return;
    const newValue = !somaticEnabled;
    setSomaticEnabled(newValue);
    pendingSomaticSaveRef.current = true;
    try {
      await saveAgnesProfile(
        {
          ...profile,
          baseContext: { ...profile.baseContext, somaticEnabled: newValue },
          updatedAt: new Date().toISOString(),
        },
        { userId: user?.uid, encryptionKey },
      );
    } finally {
      setTimeout(() => { pendingSomaticSaveRef.current = false; }, 500);
    }
  }, [profile, user, somaticEnabled, encryptionKey]);

  const sessionModeOptions = useMemo(
    () => getAgnesSessionModeOptions(isImpromptu ? 'ephemeral' : 'persistent'),
    [isImpromptu],
  );
  const activeModeDefinition = AGNES_ENGAGEMENT_MODE_DEFINITIONS[engagementMode];

  // Persist preferred mode to Firestore or localStorage
  const persistPreferredMode = useCallback(async (mode: AgnesPersistentEngagementMode) => {
    if (user) {
      if (!profile) return;
      await saveAgnesProfile(
        {
          ...profile,
          baseContext: { ...profile.baseContext, preferredEngagementMode: mode } as TherapyIntakeProfile['baseContext'],
          updatedAt: new Date().toISOString(),
        },
        { userId: user.uid, encryptionKey },
      );
      return;
    }

    saveGuestAgnesPreferredMode(mode);
    if (!profile) return;
    await saveAgnesProfile(
      {
        ...profile,
        baseContext: { ...profile.baseContext, preferredEngagementMode: mode } as TherapyIntakeProfile['baseContext'],
        updatedAt: new Date().toISOString(),
      },
      { userId: undefined, encryptionKey },
    );
  }, [user, profile, encryptionKey]);

  const handlePreferredPersistentModeChange = useCallback(async (mode: AgnesPersistentEngagementMode) => {
    setPreferredPersistentMode(mode);
    if (!sessionType) {
      setEngagementMode(mode);
      setModeContinuity(undefined);
    }
    await persistPreferredMode(mode);
  }, [persistPreferredMode, sessionType]);

  const handleEngagementModeChange = useCallback(async (nextMode: AgnesEngagementMode) => {
    if (nextMode === engagementMode) return;
    // Read messages from ref at call-time so this callback doesn't depend on messages array identity
    setModeContinuity(buildAgnesPromptContinuity(messagesRef.current ?? [], engagementMode));
    setEngagementMode(nextMode);

    if (!isImpromptu && nextMode !== 'impromptu') {
      const persistentMode = resolvePersistentAgnesMode(nextMode);
      setPreferredPersistentMode(persistentMode);
      await persistPreferredMode(persistentMode);
    }
  }, [engagementMode, messagesRef, isImpromptu, persistPreferredMode]);

  // Setters exposed for session lifecycle to reset state
  const resetEngagementToPreferred = useCallback(() => {
    setEngagementMode(preferredPersistentMode);
    setModeContinuity(undefined);
  }, [preferredPersistentMode]);

  const setEngagementForImpromptu = useCallback(() => {
    setEngagementMode('impromptu');
    setModeContinuity(undefined);
  }, []);

  const setEngagementForSession = useCallback(() => {
    setEngagementMode(preferredPersistentMode);
    setModeContinuity(undefined);
  }, [preferredPersistentMode]);

  const resetOnLogout = useCallback(() => {
    setEngagementMode(loadGuestAgnesPreferredMode());
    setPreferredPersistentMode(loadGuestAgnesPreferredMode());
    setModeContinuity(undefined);
  }, []);

  return {
    engagementMode,
    preferredPersistentMode,
    modeContinuity,
    isImpromptu,
    somaticEnabled,
    sessionModeOptions,
    activeModeDefinition,
    handleSomaticToggle,
    handlePreferredPersistentModeChange,
    handleEngagementModeChange,
    resetEngagementToPreferred,
    setEngagementForImpromptu,
    setEngagementForSession,
    resetOnLogout,
  };
}
