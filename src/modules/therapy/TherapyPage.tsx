import React, { useState, useEffect } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { ChatInterface } from '@/core/components/ChatInterface';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { Message } from '@/llm-engine/types';
import { AGNES_PERSONA } from './personas';
import { SessionPersistenceService } from '@/lib/services/session-persistence-service';
import { TherapyOnboarding } from './onboarding/TherapyOnboarding';
import { useVault } from '@/lib/vault-context';
import { useAuth } from '@/lib/auth-context';
import { getFirebase } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { encryptWithKey, decryptWithKey } from '@/lib/encryption';
import { ShieldAlert, Sparkles, LogOut, CheckSquare, Lock } from 'lucide-react';
import { NeuralButton } from '@/core/components/NeuralButton';
import { UnifiedAuthModal } from '@/core/components/UnifiedAuthModal';
import { NeuralModal } from '@/core/components/NeuralModal';

type TherapyState = 'selecting' | 'onboarding' | 'session';

export default function TherapyPage() {
  const { streamMessage, sendMessage } = useAI();
  const { enhanceContext } = useGlobalSoul();
  const { checkModuleVault, refreshVaultStatus, getModuleKey, isUnlocked } = useVault();
  const [hasTherapyVault, setHasTherapyVault] = useState(false);
  const { user, isGuest } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    checkModuleVault('therapist_profiles').then(setHasTherapyVault);
  }, [checkModuleVault]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');

  const [currentState, setCurrentState] = useState<TherapyState>('selecting');
  const [sessionType, setSessionType] = useState<'impromptu' | 'new' | null>(null);
  const [customPersona, setCustomPersona] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string>('Agnes');

  // Hydrate on mount
  useEffect(() => {
    const saved = SessionPersistenceService.getHistory('therapy');
    if (saved && saved.length > 0) {
        setCurrentState('session');
        setSessionType('new'); // Assumption for persisted sessions
        setMessages(saved);
    }
  }, []);

  // Persist on change
  useEffect(() => {
      if (messages.length > 0 && currentState === 'session') {
          SessionPersistenceService.saveHistory('therapy', messages);
      }
  }, [messages, currentState]);

  const handleSendMessage = async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setError(null);
    setStreamingText('');

    const sessionSystemPrompt = sessionType === 'impromptu'
    ? "You are an emergency supportive in-house therapist. Provide immediate, warm support. You do not know the user's past history. Listen actively and validate their feelings without judgment."
    : customPersona || AGNES_PERSONA;

    try {
      const { updatedHistory } = await streamMessage(
        content, 
        enhanceContext({
            systemPrompt: sessionSystemPrompt,
            insights: [],
            summary: "A therapy session.",
            history: messages
        }),
        (chunk) => {
            setStreamingText(prev => prev + chunk);
        }
      );
      setMessages(updatedHistory);
      setStreamingText('');
    } catch (e: any) {
      console.error("Link failure:", e);
      setError("The neural tunnel encountered an interference packet.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOnboardingComplete = async (context: any) => {
    if (!user) return;
    try {
      const { db } = getFirebase();
      const therapyKey = await getModuleKey('therapy');
      if (db && therapyKey) {
        const encrypted = await encryptWithKey(JSON.stringify(context), therapyKey);
        await setDoc(doc(db, 'therapist_profiles', user.uid), {
          encryptedData: encrypted.ciphertext,
          iv: encrypted.iv,
          salt: 'vault_salt_used',
          metadata: {
            hasVault: true,
            hasActiveSession: false,
            lastActive: new Date().toISOString(),
            sessionCount: 0
          }
        });
        await refreshVaultStatus();
        setCurrentState('selecting');
      }
    } catch (err) {
      console.error("Failed to save therapy context:", err);
    }
  };

  const startSession = async (type: 'impromptu' | 'new') => {
      setSessionType(type);
      setCurrentState('session');

      let initialMsg = "Neural link established. I'm here to provide a safe, encrypted space for your thoughts. Where shall we begin our synchronization today?";

      if (type === 'impromptu') {
          initialMsg = "Emergency protocol engaged. I am a supportive, in-house neural agent. This session is detached from your primary encrypted context. How can I support you right now?";
          setAgentName('Emergency Agent');
      } else {
          if (user) {
              try {
                  const { db } = getFirebase();
                  const therapyKey = await getModuleKey('therapy');
                  if (db && therapyKey) {
                      const docRef = doc(db, 'therapist_profiles', user.uid);
                      const snap = await getDoc(docRef);
                      if (snap.exists() && snap.data().encryptedData) {
                          const data = snap.data() as any;
                          const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, therapyKey);
                          const context = JSON.parse(decrypted);
                          if (context.preferredTherapist) {
                              const { tone, gender, traits } = context.preferredTherapist;
                              const newName = `Dr. ${gender === 'Female' ? 'Sophia' : gender === 'Male' ? 'Marcus' : 'Alex'}`;
                              setAgentName(newName);
                              setCustomPersona(`IDENTITY: You are ${newName}, an AI psychotherapist. Your tone is ${tone}. Your core traits are: ${traits.join(', ')}.

CLINICAL PROTOCOL:
- Use <thought> blocks for internal monologue.
- Prioritize emotional safety and secure E2EE neural links.
- The user's name is ${context.identity?.name || 'Unknown'}. They struggle with ${context.struggles?.join(', ') || 'general issues'}.`);
                          }
                      }
                  }
              } catch (e) {
                  console.error("Failed to load custom persona:", e);
              }
          }
      }

      setMessages([{ role: 'assistant', content: initialMsg }]);
  };

  const endSession = async () => {
      if (messages.length < 3) {
          // Just close if session was too short
          finalizeEnd(false);
          return;
      }

      setIsSummarizing(true);
      try {
          const summaryPrompt = `
            Analyze the following therapy session transcript. 
            Provide a 2-3 sentence summary of what was discussed, worded in a positive, supportive, and attuned manner. 
            Highlight the user's courage and any insights gained.
            
            TRANSCRIPT:
            ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}
          `;

          const { response } = await sendMessage(summaryPrompt, enhanceContext({
              systemPrompt: "You are a clinical supervisor helping summarize a session for a client.",
              insights: [],
              summary: "Summarizing session.",
              history: []
          }));

          setSessionSummary(response.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim());
      } catch (e) {
          console.error("Failed to summarize session:", e);
          setSessionSummary("We shared a meaningful moment of reflection today. Your journey towards stability continues.");
      } finally {
          setIsSummarizing(false);
      }
  };

  const finalizeEnd = async (merge: boolean) => {
      if (merge && sessionType === 'new' && user) {
          try {
              setIsProcessing(true);
              const { db } = getFirebase();
              const therapyKey = await getModuleKey('therapy');

              if (db && therapyKey) {
                  const docRef = doc(db, 'therapist_profiles', user.uid);
                  const snap = await getDoc(docRef);
                  if (snap.exists() && snap.data().encryptedData) {
                      const data = snap.data() as any;
                      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, therapyKey);
                      const context = JSON.parse(decrypted);

                      const newInsight = {
                          date: new Date().toISOString().split('T')[0],
                          summary: sessionSummary || "User completed a session. Chat context synchronized.",
                          keyInsights: ["Emotional sync complete"],
                          theme: "General"
                      };

                      if (!context.integratedInsights) context.integratedInsights = [];
                      context.integratedInsights.push(newInsight);

                      const newEncrypted = await encryptWithKey(JSON.stringify(context), therapyKey);
                      await setDoc(docRef, {
                          encryptedData: newEncrypted.ciphertext,
                          iv: newEncrypted.iv,
                          salt: data.salt || 'vault_salt_used',
                          metadata: { ...data.metadata, sessionCount: (data.metadata.sessionCount || 0) + 1, lastActive: new Date().toISOString() }
                      }, { merge: true });
                  }
              }
          } catch(e) {
              console.error("Failed to merge session:", e);
          } finally {
              setIsProcessing(false);
          }
      }

      SessionPersistenceService.clearHistory('therapy');
      setMessages([]);
      setCurrentState('selecting');
      setSessionType(null);
      setCustomPersona(null);
      setSessionSummary(null);
  };

  if (currentState === 'selecting') {
      return (
          <ModuleLayout title="Agnes Therapy" themeColor="indigo">
              <div className="flex flex-col items-center justify-center h-full p-8 max-w-3xl mx-auto">
                  <div className="text-center space-y-4 mb-12">
                      <h2 className="text-4xl font-black italic tracking-widest text-indigo-400 uppercase">Initialize Connection</h2>
                      <p className="text-white/60 text-sm leading-relaxed">Choose your neural synchronization mode.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                      <button onClick={() => startSession('impromptu')} className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-left group hover:shadow-[0_0_30px_rgba(251,146,60,0.1)]">
                          <ShieldAlert className="w-10 h-10 text-orange-400 mb-6 group-hover:scale-110 transition-transform" />
                          <h3 className="text-xl font-black tracking-wider uppercase mb-3">Impromptu</h3>
                          <p className="text-sm text-white/50 leading-relaxed font-medium">A detached session with an attuned agent. No base context is loaded. Perfect for guests.</p>
                      </button>

                      {(!isGuest && hasTherapyVault) && (
                          isUnlocked ? (
                              <button onClick={() => startSession('new')} className="p-8 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-left group hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                                  <Sparkles className="w-10 h-10 text-indigo-400 mb-6 group-hover:scale-110 transition-transform" />
                                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">New Session</h3>
                                  <p className="text-sm text-indigo-200/60 leading-relaxed font-medium">A standard session using your configured base context and preferred therapist traits.</p>
                              </button>
                          ) : (
                              <button onClick={() => setShowAuth(true)} className="p-8 rounded-3xl bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-all text-left group hover:shadow-[0_0_30px_rgba(251,191,36,0.1)]">
                                  <Lock className="w-10 h-10 text-amber-500 mb-6 group-hover:scale-110 transition-transform" />
                                  <h3 className="text-xl font-black tracking-wider uppercase mb-3">Vault Locked</h3>
                                  <p className="text-sm text-amber-200/40 leading-relaxed font-medium">Your foundation therapy soul is safely encrypted. Unlock your master vault to synchronize.</p>
                              </button>
                          )
                      )}

                      {(!isGuest && !hasTherapyVault) && (
                          <button onClick={() => setCurrentState('onboarding')} className="p-8 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all text-left group hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                              <Sparkles className="w-10 h-10 text-indigo-400 mb-6 group-hover:scale-110 transition-transform" />
                              <h3 className="text-xl font-black tracking-wider uppercase mb-3">Onboarding</h3>
                              <p className="text-sm text-indigo-200/60 leading-relaxed font-medium">Complete your initial baseline synchronization to unlock personalized persistent sessions.</p>
                          </button>
                      )}
                  </div>
                  <UnifiedAuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} mode="therapy" />
              </div>
          </ModuleLayout>
      );
  }

  if (currentState === 'onboarding') {
      return (
          <ModuleLayout title="Agnes Intake" themeColor="indigo">
              <TherapyOnboarding onComplete={handleOnboardingComplete} />
          </ModuleLayout>
      );
  }

  const sessionAgentName = sessionType === 'impromptu' ? 'Emergency Agent' : 'Agnes';

  return (
    <ModuleLayout title="Agnes Therapy" themeColor="indigo">
      <div className="flex-1 h-full relative">
        <ChatInterface
            messages={streamingText ? [...messages, { role: 'assistant', content: streamingText }] : messages}
            onSendMessage={handleSendMessage}
            isLoading={isProcessing && !streamingText}
            themeColor="indigo"
            agentName={sessionAgentName}
            placeholder="Share your thoughts..."
            error={error}
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

        <NeuralModal
            isOpen={!!sessionSummary}
            onClose={() => setSessionSummary(null)}
            title="Session Reflection"
            subtitle="Neural synchronization complete"
            icon={CheckSquare}
            maxWidth="lg"
        >
            <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-sm text-indigo-100 leading-relaxed italic">
                        "{sessionSummary}"
                    </p>
                </div>
                
                <div className="space-y-4">
                    <p className="text-[10px] text-white/40 uppercase font-black tracking-widest text-center">
                        Merge this reflection into your foundational soul?
                    </p>
                    <div className="flex gap-4">
                        <NeuralButton variant="ghost" className="flex-1" onClick={() => finalizeEnd(false)}>Discard</NeuralButton>
                        <NeuralButton className="flex-1" onClick={() => finalizeEnd(true)}>Merge & Close</NeuralButton>
                    </div>
                </div>
            </div>
        </NeuralModal>
      </div>
    </ModuleLayout>
  );
}
