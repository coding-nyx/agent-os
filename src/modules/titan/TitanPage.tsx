import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { TitanDashboard } from './components/TitanDashboard';
import { TitanDashboardTabs } from './components/TitanDashboardTabs';
import { BiomarkerDashboard } from './components/BiomarkerDashboard';
import { ClearancePanel } from './components/ClearancePanel';
import { TitanRoutinePanel } from './components/TitanRoutinePanel';
import { TitanOnboarding } from './onboarding/TitanOnboarding';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { TitanProfile } from '@/lib/types';
import { buildTitanSessionPrompt } from './prompts/titan-session-prompt';
import type { TitanSessionMode } from './prompts/titan-session-prompt';
import { loadTitanProfile, saveTitanProfile, subscribeTitanProfile, syncGuestTitanProfileToUser } from './services/titan-profile-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { NexusChat } from '@/core/components/NexusChat';
import { cn } from '@/lib/utils';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { UnifiedModulePage } from '@/core/components/UnifiedModulePage';
import { registerTitanActions } from './services/actions';
import { useVault } from '@/lib/vault-context';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { NexusHandoffService } from '@/lib/services/nexus-handoff-service';
import { NexusRoutingService } from '@/lib/services/nexus-routing-service';
import type { ModuleId } from '@/lib/module-manifest';
import { NSV_CALIBRATION_PROMPTS, getMetricOwner, NSVMetricPath } from '@/lib/services/nsv-ownership';

type TitanTab = 'training' | 'biomarkers' | 'recovery';

const TITAN_PROMPT = `You are TITAN, an elite AI Physical Performance Strategist. 
Your tone is direct, clinical, and data-driven. 
You prioritize biological optimization and injury prevention.
Reference the user's CNS fatigue and biometric data when giving advice.`;

registerTitanActions();

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

function resolveInitialTab(searchParams: URLSearchParams): TitanTab {
  const param = searchParams.get('tab');
  if (param === 'biomarkers' || param === 'recovery' || param === 'training') return param;
  return 'training';
}

function TitanContent({ profile, encryptionKey }: { profile: TitanProfile | null; encryptionKey: CryptoKey | null }) {
  const { globalSoul } = useGlobalSoul();
  const { isModuleAccessible } = useVault();
  const isLocked = !isModuleAccessible('titan');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<TitanTab>(() => resolveInitialTab(searchParams));

  // Collapse chat by default on mobile
  useEffect(() => {
    if (isMobile) setIsChatCollapsed(true);
  }, [isMobile]);

  // Derive prompt mode from active tab
  const promptMode: TitanSessionMode = activeTab === 'biomarkers' || activeTab === 'recovery' ? 'medical' : 'training';

  const agentAlias = globalSoul?.displayNames?.titan || 'Titan';
  const systemPrompt = useMemo(() => {
    if (!profile) return TITAN_PROMPT;
    return buildTitanSessionPrompt(profile, {
      mode: promptMode,
      recoveryScore: globalSoul?.crossFunctionalState?.biological?.recoveryScore ?? null,
      hormonalContext: globalSoul?.crossFunctionalState?.biological?.hormonalContext ?? null,
    });
  }, [profile, promptMode, globalSoul?.crossFunctionalState?.biological?.recoveryScore, globalSoul?.crossFunctionalState?.biological?.hormonalContext]);

  const {
    messages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage,
    setMessages
  } = useModuleAI({
    moduleId: 'titan',
    systemPrompt,
    encryptionKey
  });

  useEffect(() => {
    if (profile?.onboardingComplete && messages.length === 0 && !isProcessing && !streamingText) {
      const hasRoutine = profile.routines && profile.routines.length > 0;
      setMessages([
        {
          role: 'assistant',
          content: hasRoutine
            ? "You're synchronized. Do you want a new routine for this week, or should we keep your current plan?"
            : "You're synchronized. Do you want me to generate a weekly routine, or do you already have one?"
        }
      ]);
    }
  }, [profile?.onboardingComplete, messages.length, isProcessing, streamingText, setMessages]);

  const chatWidth = 'clamp(320px, 32vw, 520px)';

  const handleCalibrate = useCallback(
    (metricKey: string) => {
      const key = metricKey as NSVMetricPath;
      const owner = getMetricOwner(key);
      const prompt = NSV_CALIBRATION_PROMPTS[key] || 'Share the missing metric value.';
      NexusHandoffService.store({
        moduleId: owner,
        type: 'delegate',
        content: prompt,
        reason: 'calibration_request',
        sourceModuleId: 'titan',
        createdAt: new Date().toISOString()
      });
      const route = NexusRoutingService.getRoute(owner as ModuleId);
      if (route) navigate(route);
    },
    [navigate]
  );

  const handleAnalyzeRoutine = useCallback(
    (routine: import('@/lib/types').Routine) => {
      const exerciseList = routine.exercises
        .map((ex, i) => `${i + 1}. **${ex.name}** — ${ex.sets}×${ex.reps}${ex.notes ? ` (${ex.notes})` : ''}`)
        .join('\n');

      const prompt = [
        `Analyze my ${routine.weekday?.toUpperCase() || ''} routine "${routine.name}":`,
        routine.rationale ? `Rationale: ${routine.rationale}` : '',
        `\nExercises:\n${exerciseList}`,
        '\nIs this well-balanced? Any improvements for injury prevention or performance?'
      ].filter(Boolean).join('\n');

      handleSendMessage(prompt);
      if (isChatCollapsed) setIsChatCollapsed(false);
    },
    [handleSendMessage, isChatCollapsed]
  );

  const handleImportLab = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.txt,.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const sanitizedText = text.replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, '[STRIPPED_ACTION_TAG]');
      await handleSendMessage(
        `Lab import received: ${file.name}. Parse the content into structured biomarker records and lab summaries.\n\n---BEGIN LAB DATA---\n${sanitizedText}\n---END LAB DATA---`
      );
    };
    input.click();
  }, [handleSendMessage]);

  const handleAnalyzeImage = useCallback(() => {
    handleSendMessage('I want to analyze a medical image. Please guide me through the process.');
  }, [handleSendMessage]);

  // Badge data for tabs
  const biomarkerCount = profile?.biomarkers?.length ?? 0;
  const latestClearance = profile?.clearances?.length
    ? [...profile.clearances].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())[0]
    : null;
  const clearanceStatus = latestClearance?.status ?? null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'biomarkers':
        return (
          <BiomarkerDashboard
            profile={profile}
            soul={globalSoul}
            isLocked={isLocked}
            onImportLab={handleImportLab}
            onAnalyzeImage={handleAnalyzeImage}
          />
        );
      case 'recovery':
        return (
          <ClearancePanel
            profile={profile}
            soul={globalSoul}
            isLocked={isLocked}
          />
        );
      default:
        return (
          <>
            <TitanRoutinePanel routines={profile?.routines || []} onAnalyzeRoutine={handleAnalyzeRoutine} />
            <TitanDashboard soul={globalSoul} isLocked={isLocked} onCalibrate={handleCalibrate} />
          </>
        );
    }
  };

  return (
    <div className="h-full flex overflow-hidden relative">
      {isChatCollapsed && (
        <motion.button
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => setIsChatCollapsed(false)}
          className={cn(
            'z-[70] flex items-center gap-2 bg-orange-600/20 border border-orange-500/20 rounded-full text-orange-400 font-black text-[9px] uppercase tracking-widest italic backdrop-blur-xl',
            isMobile
              ? 'fixed bottom-6 right-6 px-5 py-3 text-[11px]'
              : 'absolute top-3 right-3 px-4 py-2'
          )}
        >
          <MessageSquare className={isMobile ? 'w-4 h-4' : 'w-3 h-3'} />
          Open Titan Link
        </motion.button>
      )}
      <div className="flex-1 min-w-0 h-full overflow-y-auto no-scrollbar flex flex-col relative">
        <div className="px-6 pt-6 pb-2">
          <TitanDashboardTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            biomarkerCount={biomarkerCount}
            clearanceStatus={clearanceStatus}
          />
        </div>
        <div>{renderTabContent()}</div>
      </div>

      {/* Mobile: full-screen overlay sheet */}
      {isMobile ? (
        !isChatCollapsed && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-orange-500/10">
              <span className="text-orange-400 font-black text-xs uppercase tracking-widest italic">
                Titan Link
              </span>
              <button
                onClick={() => setIsChatCollapsed(true)}
                className="px-3 py-1.5 bg-orange-600/20 border border-orange-500/20 rounded-full text-orange-400 text-[9px] font-black uppercase tracking-widest backdrop-blur-xl hover:bg-orange-600/40 transition-all"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <NexusChat
                ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
                agentName={agentAlias}
                themeColor="orange"
                placeholder="Input training data or queries..."
                authMode="titan"
              />
            </div>
          </motion.div>
        )
      ) : (
        /* Desktop: clamp sidebar */
        <motion.aside
          initial={false}
          animate={{
            width: isChatCollapsed ? 0 : chatWidth,
            opacity: isChatCollapsed ? 0 : 1
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="h-full border-l border-white/5 bg-black/20 flex flex-col relative"
        >
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <NexusChat
              ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
              agentName={agentAlias}
              themeColor="orange"
              placeholder="Input training data or queries..."
              authMode="titan"
            />
          </div>
          {!isChatCollapsed && (
            <button
              onClick={() => setIsChatCollapsed(true)}
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-[60] w-7 h-12 flex items-center justify-center bg-orange-600/20 border border-orange-500/20 text-orange-400 backdrop-blur-xl transition-all hover:bg-orange-600/40 rounded-l-xl'
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </motion.aside>
      )}
    </div>
  );
}

export default function TitanPage() {
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();

  return (
    <UnifiedModulePage<TitanProfile>
      moduleId="titan"
      profileOptions={{
        loadProfile: loadTitanProfile,
        saveProfile: saveTitanProfile,
        subscribeProfile: subscribeTitanProfile,
        syncGuestProfile: syncGuestTitanProfileToUser
      }}
      renderOnboarding={({ profile, onComplete }) => (
        <TitanOnboarding
          initialProfile={profile}
          initialBaseContext={IntakeBaseContextService.buildForTitan({ coreProfile, titanProfile: profile })}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            try {
              onComplete(completed);
            } catch (e) {
              console.error('Titan onboarding completion sync failed:', e);
            }
          }}
        />
      )}
      renderContent={({ profile, encryptionKey }) => (
        <TitanContent profile={profile} encryptionKey={encryptionKey} />
      )}
    />
  );
}
