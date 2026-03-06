import React, { useState, useEffect } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useAuth } from '@/lib/auth-context';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { ORCHESTRATOR_PERSONA, ORCHESTRATOR_WELCOME } from './personas';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { CoreUserProfile } from '@/lib/types';
import { NexusChat } from '@/core/components/NexusChat';
import { OrchestratorOnboarding } from './onboarding/OrchestratorOnboarding';
import { GuestModePanel } from '@/core/components/GuestModePanel';

type PageState = 'ONBOARDING' | 'CHAT';

export default function OrchestratorPage() {
  const { user, isGuest, profile, refreshProfile, initializeNewUser } = useAuth();
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('ONBOARDING');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    messages,
    setMessages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage
  } = useModuleAI({
    moduleId: 'orchestrator',
    systemPrompt: ORCHESTRATOR_PERSONA,
    navigateTo: (path) => navigate(path)
  });

  if (isGuest) {
    return (
      <ModuleLayout title="Nexus" themeColor="indigo" moduleId="orchestrator">
        <GuestModePanel
          moduleId="orchestrator"
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

  useEffect(() => {
    if (user && !profile && !isSubmitting) {
      initializeNewUser();
    }
  }, [user, profile, initializeNewUser, isSubmitting]);

  useEffect(() => {
    if (profile?.onboardingComplete) {
      setPageState('CHAT');
      if (messages.length === 0) {
        setMessages([{ role: 'assistant', content: ORCHESTRATOR_WELCOME(profile.preferredName) }]);
      }
    }
  }, [profile?.onboardingComplete, messages.length, profile?.preferredName, setMessages]);

  const handleComplete = async (updates: Partial<CoreUserProfile>) => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await CoreProfileService.updateProfile(user.uid, updates);
      await refreshProfile();
      setPageState('CHAT');
      navigate('/hub');
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pageState === 'CHAT') {
    return (
      <ModuleLayout title="Nexus" themeColor="indigo">
        <NexusChat
          ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
          agentName={profile?.agentPersonalityProvision?.orchestratorAlias || 'Nexus'}
          themeColor="indigo"
          placeholder="System command or inquiry..."
          headerActions={
            <NeuralButton size="sm" variant="secondary" onClick={() => navigate('/hub')} className="flex items-center gap-2">
              <LayoutGrid className="w-3 h-3" /> Return to Hub
            </NeuralButton>
          }
        />
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout title="Nexus" themeColor="indigo">
      <OrchestratorOnboarding profile={profile} isSubmitting={isSubmitting} onComplete={handleComplete} />
    </ModuleLayout>
  );
}
