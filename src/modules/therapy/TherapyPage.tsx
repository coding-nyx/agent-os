import React, { useState, useEffect } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { ChatInterface } from '@/core/components/ChatInterface';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { AGNES_PERSONA } from './personas';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, Sparkles, LogOut, CheckSquare, Lock, Settings2 } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NeuralModal } from '@/core/components/NeuralModal';
import { ModuleMemoryService } from '@/lib/services/module-memory-service';
import { useModuleAI } from '@/lib/hooks/use-module-ai';
import { TherapyIntake } from './onboarding/TherapyIntake';

type TherapyState = 'selecting' | 'intake' | 'session';

export default function TherapyPage() {
  const { globalSoul } = useGlobalSoul();
  const { checkModuleVault, isUnlocked } = useVault();
  const { user, isGuest } = useAuth();
  
  const [hasTherapyVault, setHasTherapyVault] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [currentState, setCurrentState] = useState<TherapyState>('selecting');
  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [isDeepIntakeDone, setIsDeepIntakeComplete] = useState(false);
  
  const agentAlias = globalSoul?.displayNames?.therapy || 'Agnes';
  const basePersona = sessionType === 'impromptu'
    ? "You are an emergency supportive in-house therapist. Provide immediate, warm support."
    : AGNES_PERSONA;

  const {
    messages,
    setMessages,
    isProcessing,
    streamingText,
    error,
    quota,
    handleSendMessage,
    clearSession,
    summarizeSession
  } = useModuleAI({
    moduleId: 'therapy',
    systemPrompt: basePersona
  });

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);

  useEffect(() => {
    checkModuleVault('therapist_profiles').then(setHasTherapyVault);
    
    if (user) {
        ModuleMemoryService.getEnvelope(user.uid, 'therapy').then(envelope => {
            if (envelope?.metadata?.deepIntakeComplete) {
                setIsDeepIntakeComplete(true);
            }
        });
    }
  }, [checkModuleVault, user]);

  useEffect(() => {
    if (messages.length > 0 && currentState === 'selecting') {
      setCurrentState('session');
      setSessionType('new');
    }
  }, [messages, currentState]);

  const startSession = async (type: 'impromptu' | 'new') => {
      if (type === 'new' && !isDeepIntakeDone && !isGuest) {
          setCurrentState('intake');
          return;
      }

      setSessionType(type);
      setCurrentState('session');

      let initialMsg = `Neural link established. I'm ${agentAlias}. I'm here to provide a safe, encrypted space for your thoughts. Where shall we begin?`;

      if (type === 'impromptu') {
          initialMsg = "Emergency protocol engaged. I am a supportive, in-house neural agent. This session is detached from your primary encrypted context. How can I support you right now?";
      }

      setMessages([{ role: 'assistant', content: initialMsg }]);
  };

  const handleIntakeComplete = async (intakeData: any) => {
      if (user) {
          await ModuleMemoryService.initializeEnvelope(user.uid, 'therapy');
          await ModuleMemoryService.commitSession(user.uid, 'therapy', {
              id: 'intake',
              timestamp: new Date().toISOString(),
              summary: 'Deep therapeutic intake completed.',
              keyInsights: ['Baseline established'],
              sentiment: 5,
              tokenUsage: 0
          }, JSON.stringify(intakeData));
          
          // Update metadata
          const { db } = await import('@/lib/firebase').then(m => m.getFirebase());
          if (db) {
              const { doc, updateDoc } = await import('firebase/firestore');
              await updateDoc(doc(db, 'module_memory', `${user.uid}_therapy`), {
                  'metadata.deepIntakeComplete': true
              });
          }
      }
      setIsDeepIntakeComplete(true);
      startSession('new');
  };

  const endSession = async () => {
      if (messages.length < 3) {
          finalizeEnd(false);
          return;
      }

      setIsSummarizing(true);
      const summary = await summarizeSession();
      setSessionSummary(summary);
      setIsSummarizing(false);
  };

  const finalizeEnd = async (remember: boolean) => {
      if (remember && user && !isGuest) {
          await ModuleMemoryService.commitSession(user.uid, 'therapy', {
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              summary: sessionSummary || '',
              keyInsights: [],
              sentiment: 5,
              tokenUsage: 0
          }, JSON.stringify({ messages }));
      }

      await clearSession();
      setCurrentState('selecting');
      setSessionType(null);
      setSessionSummary(null);
  };

  if (currentState === 'intake') {
      return (
          <ModuleLayout title="Therapy Intake" themeColor="indigo">
              <TherapyIntake onComplete={handleIntakeComplete} />
          </ModuleLayout>
      );
  }

  if (currentState === 'selecting') {
      return (
          <ModuleLayout title="Agnes Therapy" themeColor="indigo">
              <div className="flex flex-col items-center justify-center h-full p-8 max-w-3xl mx-auto">
                  <div className="text-center space-y-4 mb-12">
                      <h2 className="text-4xl font-black italic tracking-widest text-indigo-400 uppercase">Initialize Connection</h2>
                      <p className="text-white/60 text-sm leading-relaxed">Choose your neural synchronization mode.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                      <button onClick={() => startSession('impromptu')} className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group">
                          <ShieldAlert className="w-10 h-10 text-orange-400 mb-6 group-hover:scale-110 transition-transform" />
                          <h3 className="text-xl font-black tracking-wider uppercase mb-3">Impromptu</h3>
                          <p className="text-sm text-white/50 leading-relaxed font-medium">A detached session with an attuned agent. Perfect for trials.</p>
                      </button>

                      {(!isGuest) && (
                          isUnlocked ? (
                              <button onClick={() => startSession('new')} className="p-8 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-left group">
                                  <Sparkles className="w-10 h-10 text-indigo-400 mb-6 group-hover:scale-110 transition-transform" />
                                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">{isDeepIntakeDone ? 'New Session' : 'Begin Intake'}</h3>
                                  <p className="text-sm text-indigo-200/60 leading-relaxed font-medium">
                                      {isDeepIntakeDone ? 'Use your configured base context and preferred traits.' : 'Initialize your deep therapeutic baseline to unlock persistent memory.'}
                                  </p>
                              </button>
                          ) : (
                              <button onClick={() => setShowAuth(true)} className="p-8 rounded-3xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all text-left group">
                                  <Lock className="w-10 h-10 text-amber-500 mb-6 group-hover:scale-110 transition-transform" />
                                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">Vault Locked</h3>
                                  <p className="text-sm text-amber-200/40 leading-relaxed font-medium">Unlock your master vault to synchronize.</p>
                              </button>
                          )
                      )}
                  </div>
                  <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="therapy" />
              </div>
          </ModuleLayout>
      );
  }

  return (
    <ModuleLayout title="Agnes Therapy" themeColor="indigo">
      <div className="flex-1 h-full relative">
        <ChatInterface
            messages={streamingText ? [...messages, { role: 'assistant', content: streamingText }] : messages}
            onSendMessage={handleSendMessage}
            isLoading={isProcessing && !streamingText}
            themeColor="indigo"
            agentName={sessionType === 'impromptu' ? 'Emergency Agent' : agentAlias}
            placeholder="Share your thoughts..."
            error={error}
            isGuestTrial={isGuest}
            quota={quota}
            onQuotaExhausted={() => setShowAuth(true)}
            onRetry={() => {
                const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                if (lastUserMsg) handleSendMessage(lastUserMsg.content);
            }}
        />
        {messages.length > 2 && (
            <div className="absolute top-4 right-8 z-50">
                <NeuralButton size="sm" variant="secondary" onClick={endSession} loading={isSummarizing} className="flex items-center gap-2">
                    <LogOut className="w-3 h-3" /> End Session
                </NeuralButton>
            </div>
        )}

        <NeuralModal isOpen={!!sessionSummary} onClose={() => setSessionSummary(null)} title="Session Reflection" icon={CheckSquare}>
            <div className="space-y-6">
                <p className="text-sm text-indigo-100 italic">"{sessionSummary}"</p>
                <div className="flex gap-4">
                    <NeuralButton variant="ghost" className="flex-1" onClick={() => finalizeEnd(false)}>Discard</NeuralButton>
                    <NeuralButton className="flex-1" onClick={() => finalizeEnd(true)}>Merge & Close</NeuralButton>
                </div>
            </div>
        </NeuralModal>
        <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="therapy" />
      </div>
    </ModuleLayout>
  );
}
