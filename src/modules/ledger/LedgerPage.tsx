import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { useAuth } from '@/lib/auth-context';
import { useVault } from '@/lib/vault-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { IntakeBaseContextService } from '@/lib/services/intake-base-context-service';
import { LedgerDashboard } from './components/LedgerDashboard';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { NexusChat } from '@/core/components/NexusChat';
import { LedgerOnboarding } from './onboarding/LedgerOnboarding';
import {
  LedgerIntakeProfile,
  loadLedgerProfile,
  saveLedgerProfile,
  syncGuestLedgerProfileToUser
} from './services/ledger-intake-service';
import { NeuralButton } from '@/core/components/NeuralButton';

const LEDGER_PERSONA = `
IDENTITY:
You are the AGNES Chief Medical Officer (The Ledger). 
You are a medical-grade AI agent focused on biometric synthesis and diagnostic analysis.

CORE PROTOCOLS:
1. CAUTION: You are conservative and evidence-based. 
2. SYNTHESIS: You look for correlations between training data (Titan) and psychological state (Agnes).
3. DISCLAIMER: You MUST remind the user that you are an AI tool and not a doctor when giving specific health advice.

TONE: Clinical, precise, professional, but deeply attuned to systemic health.
`.trim();

export default function LedgerPage() {
  const { globalSoul } = useGlobalSoul();
  const { user, isGuest, profile: coreProfile, refreshProfile } = useAuth();
  const { isUnlocked, getModuleKey } = useVault();

  const [showAuth, setShowAuth] = useState(false);
  const [profile, setProfile] = useState<LedgerIntakeProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [hasSyncedGuest, setHasSyncedGuest] = useState(false);
  const baseContext = useMemo(
    () => IntakeBaseContextService.buildForLedger({ coreProfile }),
    [coreProfile]
  );

  const agentAlias = globalSoul?.displayNames?.ledger || 'Ledger';

  const {
    messages,
    setMessages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage
  } = useModuleAI({
    moduleId: 'ledger',
    systemPrompt: LEDGER_PERSONA
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const key = user && isUnlocked ? await getModuleKey('ledger') : null;
      if (!mounted) return;
      setEncryptionKey(key);

      const loadedProfile = await loadLedgerProfile({ userId: user?.uid, encryptionKey: key });
      if (!mounted) return;

      setProfile(loadedProfile);
      setIsOnboarding(!loadedProfile || !loadedProfile.onboardingComplete);
      setIsProfileLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [user?.uid, isUnlocked, getModuleKey]);

  useEffect(() => {
    if (!user || !isUnlocked || hasSyncedGuest) return;

    (async () => {
      const key = await getModuleKey('ledger');
      if (!key) return;
      const synced = await syncGuestLedgerProfileToUser({ userId: user.uid, encryptionKey: key });
      if (synced) setHasSyncedGuest(true);
    })();
  }, [user, isUnlocked, hasSyncedGuest, getModuleKey]);

  useEffect(() => {
    if (messages.length === 0 && !isProcessing && !streamingText && !isOnboarding) {
      setMessages([
        {
          role: 'assistant',
          content: `Medical telemetry link active. I am ${agentAlias}, Chief Medical Officer. I am currently monitoring your biological and psychological homeostasis. How can I assist you with your health data today?`
        }
      ]);
    }
  }, [messages.length, isProcessing, streamingText, agentAlias, setMessages, isOnboarding]);

  if (isProfileLoading) {
    return (
      <ModuleLayout title="The Ledger" themeColor="cyan">
        <div className="h-full flex items-center justify-center text-white/40 text-sm">Initializing ledger profile...</div>
      </ModuleLayout>
    );
  }

  if (isOnboarding) {
    if (user && !isGuest && !isUnlocked) {
      return (
        <ModuleLayout title="The Ledger" themeColor="cyan">
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-xl w-full p-10 rounded-[36px] border border-cyan-500/20 bg-cyan-500/5 text-center space-y-6">
              <h3 className="text-2xl font-black italic uppercase tracking-tight text-cyan-400">Vault Handshake Required</h3>
              <p className="text-sm text-cyan-100/60 leading-relaxed">
                Ledger intake writes encrypted health baseline data. Unlock the vault to continue.
              </p>
              <NeuralButton size="xl" className="w-full" onClick={() => setShowAuth(true)}>
                Unlock Ledger Vault
              </NeuralButton>
            </div>
          </div>
          <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="global" />
        </ModuleLayout>
      );
    }

    return (
      <ModuleLayout title="Ledger Intake" themeColor="cyan">
        <LedgerOnboarding
          initialProfile={profile}
          initialBaseContext={baseContext}
          onGlobalBaseContextFinalize={async (context) => {
            if (!user || isGuest) return;
            const patch = IntakeBaseContextService.toCoreProfilePatch(context);
            if (Object.keys(patch).length > 0) {
              await CoreProfileService.updateProfile(user.uid, patch);
              await refreshProfile();
            }
          }}
          onComplete={async (completed) => {
            setProfile(completed);
            setIsOnboarding(false);
            await saveLedgerProfile(completed, { userId: user?.uid, encryptionKey });
          }}
        />
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout title="The Ledger" themeColor="cyan">
      <div className="h-full flex flex-col relative overflow-hidden">
        <motion.div
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          className="z-50 w-full bg-amber-500/10 border-b border-amber-500/20 backdrop-blur-xl px-6 py-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500 italic leading-none">Neural Integrity Protocol</h4>
              <p className="text-[9px] text-amber-200/40 font-medium tracking-tight mt-1">
                AGNES Ledger is an AI synthesis tool. Not a substitute for professional medical diagnosis or emergency services.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-black uppercase text-amber-500/60 tracking-widest animate-pulse">!! CALL 911 FOR EMERGENCIES !!</span>
            <ShieldAlert className="w-3 h-3 text-amber-500/40" />
          </div>
        </motion.div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="w-full md:w-1/2 lg:w-[40%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto no-scrollbar">
            <LedgerDashboard soul={globalSoul as any} />
          </div>

          <div className="flex-1 h-1/2 md:h-full overflow-hidden">
            <NexusChat
              ai={{ messages, isProcessing, streamingText, error, quota, handleSendMessage }}
              agentName={agentAlias}
              themeColor="cyan"
              placeholder="Input symptoms or request diagnostic analysis..."
            />
          </div>
        </div>

        <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="global" />
      </div>
    </ModuleLayout>
  );
}
