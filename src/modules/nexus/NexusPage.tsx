import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { ORCHESTRATOR_PERSONA, ORCHESTRATOR_WELCOME } from './personas';
import { useNavigate } from 'react-router-dom';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { CoreUserProfile } from '@/lib/types';
import { NexusOnboarding } from './onboarding/NexusOnboarding';
import { GuestModePanel } from '@/core/components/GuestModePanel';
import { NexusDashboard } from './components/NexusDashboard';
import { VaultSetupNudge } from '@/core/components/VaultSetupNudge';

type PageState = 'ONBOARDING' | 'DASHBOARD';

export default function NexusPage() {
  const { user, isGuest, profile, refreshProfile, initializeNewUser } = useAuth();
  const { hasVault, isUnlocked, vaultSetupNudgeSeen, isLoading: vaultLoading, getMasterKey } = useVault();
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('ONBOARDING');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isUnlocked || isGuest) {
      setEncryptionKey(null);
      return;
    }

    getMasterKey()
      .then((key) => {
        if (cancelled) return;
        setEncryptionKey(key);
      })
      .catch(() => {
        if (cancelled) return;
        setEncryptionKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isUnlocked, isGuest, getMasterKey]);

  const {
    messages,
    setMessages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage,
    clearSession
  } = useModuleAI({
    moduleId: 'nexus',
    systemPrompt: ORCHESTRATOR_PERSONA,
    navigateTo: (path) => navigate(path),
    encryptionKey
  });

  useEffect(() => {
    if (!isGuest && user && !profile && !isSubmitting && (isUnlocked || !hasVault)) {
      initializeNewUser();
    }
  }, [isGuest, user, profile, initializeNewUser, isSubmitting, isUnlocked, hasVault]);

  useEffect(() => {
    if (!isGuest && profile?.onboardingComplete) {
      setPageState('DASHBOARD');
      if (messages.length === 0) {
        setMessages([{ role: 'assistant', content: ORCHESTRATOR_WELCOME(profile.preferredName) }]);
      }
    }
  }, [isGuest, profile?.onboardingComplete, messages.length, profile?.preferredName, setMessages]);

  // Show the one-time vault setup nudge once the page has settled.
  // Conditions: authenticated user, no vault yet, nudge not previously dismissed, ONBOARDING COMPLETE.
  useEffect(() => {
    if (!isGuest && !hasVault && !vaultSetupNudgeSeen && !vaultLoading && profile?.onboardingComplete) {
      // Small delay so it doesn't interrupt page load
      const timer = setTimeout(() => setShowNudge(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [isGuest, hasVault, vaultSetupNudgeSeen, vaultLoading, profile?.onboardingComplete]);

  if (isGuest) {
    return (
      <ModuleLayout title="Nexus" themeColor="cyan" moduleId="nexus" hideBack>
        <GuestModePanel
          moduleId="nexus"
          description="Guest links cannot initialize your core profile. Authenticate to unlock full orchestration."
          limitations={[
            'Core profile initialization is disabled in guest mode.',
            'Cross-module memory and vault sync are unavailable.',
            'Guest sessions are limited by the global quota.'
          ]}
          onContinue={() => navigate('/hub')}
          continueLabel="Return to Hub"
        />
      </ModuleLayout>
    );
  }

  const handleComplete = async (updates: Partial<CoreUserProfile>) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await CoreProfileService.updateProfile(user.uid, updates);
      await refreshProfile();
      setPageState('DASHBOARD');
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
      setOnboardingError('Something went wrong saving your profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pageState === 'DASHBOARD') {
    return (
      <ModuleLayout title="Nexus" themeColor="cyan" moduleId="nexus" hideBack>
        <NexusDashboard
          ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage, clearSession }}
          agentName={profile?.agentPersonalityProvision?.orchestratorAlias || 'Nexus'}
        />
        <AnimatePresence>
          {showNudge && (
            <VaultSetupNudge onClose={() => setShowNudge(false)} />
          )}
        </AnimatePresence>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout title="Nexus" themeColor="cyan" moduleId="nexus" hideBack>
      <NexusOnboarding profile={profile} isSubmitting={isSubmitting} onComplete={handleComplete} />
      {onboardingError && (
        <div
          data-testid="onboarding-error"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--z-toast)] bg-red-500/20 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl backdrop-blur-sm whitespace-nowrap"
        >
          {onboardingError}
        </div>
      )}
    </ModuleLayout>
  );
}
