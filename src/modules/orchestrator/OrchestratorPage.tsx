import React, { useState, useEffect } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { NeuralButton } from '@/core/components/NeuralButton';
import { useAuth } from '@/lib/auth-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { ORCHESTRATOR_PERSONA, ORCHESTRATOR_WELCOME } from './personas';
import { LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CoreUserProfile } from '@/lib/types';
import { NexusChat } from '@/core/components/NexusChat';
import { OrchestratorOnboarding } from './onboarding/OrchestratorOnboarding';

type PageState = 'ONBOARDING' | 'CHAT';

export default function OrchestratorPage() {
  const { user, profile, refreshProfile, initializeNewUser } = useAuth();
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
    systemPrompt: ORCHESTRATOR_PERSONA
  });

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
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (pageState === 'CHAT') {
    return (
      <ModuleLayout title="Nyx" themeColor="indigo">
        <NexusChat
          ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
          agentName={profile?.agentPersonalityProvision?.orchestratorAlias || 'Nyx'}
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
    <ModuleLayout title="Nyx" themeColor="indigo">
      <OrchestratorOnboarding profile={profile} isSubmitting={isSubmitting} onComplete={handleComplete} />
    </ModuleLayout>
  );
}
