import React, { useEffect, useMemo, useState } from 'react';
import { ChatInterface } from '@/core/components/ChatInterface';
import { useAI } from '@/llm-engine/ai-context';
import { Message } from '@/llm-engine/types';
import { TrainerProfile, TrainerPrivacyLevel } from '../types';
import { buildTrainerOnboardingPrompt } from '../prompts/trainer-onboarding-prompt';
import { mergeTrainerProfile, normalizeRoutines, stripActionTags } from '../utils';
import { Shield, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrainerOnboardingProps {
  onComplete: (profile: TrainerProfile) => void;
  initialProfile?: TrainerProfile | null;
}

const createEmptyProfile = (privacyLevel: TrainerPrivacyLevel): TrainerProfile => ({
  onboardingComplete: false,
  privacyLevel,
  trackingLevel: privacyLevel === 'complete' ? 'indepth' : 'standard',
  nutrition: { supplements: [] },
  activity: {},
  history: {},
  summary: '',
  routines: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export function TrainerOnboarding({ onComplete, initialProfile }: TrainerOnboardingProps) {
  const { streamMessage } = useAI();
  const [privacyLevel, setPrivacyLevel] = useState<TrainerPrivacyLevel | null>(
    initialProfile?.privacyLevel ?? null
  );
  const [profile, setProfile] = useState<TrainerProfile | null>(initialProfile ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');

  const systemPrompt = useMemo(() => {
    if (!privacyLevel) return '';
    return buildTrainerOnboardingPrompt(privacyLevel);
  }, [privacyLevel]);

  useEffect(() => {
    if (!privacyLevel) return;
    if (!profile) {
      setProfile(initialProfile ?? createEmptyProfile(privacyLevel));
    }
    if (messages.length === 0) {
      const intro = privacyLevel === 'complete'
        ? "Onboarding initialized. We'll go deep to build a complete performance profile. Let's start with nutrition: what do you typically eat and which supplements do you take?"
        : "Onboarding initialized. We'll keep this focused on non-intrusive data. Let's start with nutrition: what do you typically eat and which supplements do you take?";
      setMessages([{ role: 'assistant', content: intro }]);
    }
  }, [privacyLevel, profile, messages.length, initialProfile]);

  const handleSendMessage = async (content: string) => {
    if (!privacyLevel || !profile) return;
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setError(null);
    setStreamingText('');

    try {
      const { updatedHistory, response } = await streamMessage(
        content,
        {
          systemPrompt,
          insights: [],
          summary: 'Trainer onboarding intake.',
          history: messages
        },
        (chunk) => {
          setStreamingText(prev => prev + chunk);
        }
      );

      let nextProfile = { ...profile };
      const updateMatches = response.match(/<action type="update_trainer_profile">([\s\S]*?)<\/action>/gi);
      if (updateMatches) {
        for (const match of updateMatches) {
          const jsonStr = match
            .replace(/<action type="update_trainer_profile">/i, '')
            .replace(/<\/action>/i, '');
          try {
            const parsed = JSON.parse(jsonStr) as Partial<TrainerProfile>;
            nextProfile = mergeTrainerProfile(nextProfile, parsed);
          } catch (e) {
            console.error('Failed to parse trainer profile update:', e);
          }
        }
      }

      const routineMatches = response.match(/<action type="update_routine">([\s\S]*?)<\/action>/gi);
      if (routineMatches) {
        for (const match of routineMatches) {
          const jsonStr = match
            .replace(/<action type="update_routine">/i, '')
            .replace(/<\/action>/i, '');
          try {
            const parsed = JSON.parse(jsonStr) as { routines?: any[] };
            if (parsed.routines) {
              nextProfile.routines = normalizeRoutines(parsed.routines as any);
            }
          } catch (e) {
            console.error('Failed to parse routine update:', e);
          }
        }
      }

      nextProfile.updatedAt = new Date().toISOString();
      setProfile(nextProfile);

      const completeMatch = response.match(/<action type="complete_trainer_onboarding">/i);

      const displayHistory = updatedHistory.map(m => ({
        ...m,
        content: stripActionTags(m.content)
      }));

      setMessages(displayHistory);
      setStreamingText('');

      if (completeMatch) {
        const completed = { ...nextProfile, onboardingComplete: true };
        setProfile(completed);
        onComplete(completed);
      }
    } catch (e: any) {
      console.error('Trainer onboarding failed:', e);
      setError('Onboarding neural link interrupted.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl h-[80vh] flex flex-col bg-black/40 backdrop-blur-xl rounded-[24px] border border-white/10 overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black italic uppercase tracking-widest text-orange-400">Trainer Intake</h2>
            <p className="text-xs text-white/50 tracking-tight">Initializing performance profile...</p>
          </div>
          {privacyLevel && (
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
              {privacyLevel === 'complete' ? 'COMPLETE DATA' : 'BASIC DATA'}
            </span>
          )}
        </div>

        {!privacyLevel && (
          <div className="p-6 border-b border-white/5 bg-black/30">
            <p className="text-[10px] text-white/50 uppercase font-black tracking-[0.2em] mb-4">
              Select Data Sharing Level
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setPrivacyLevel('basic')}
                className={cn(
                  'p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left',
                  'group'
                )}
              >
                <Shield className="w-6 h-6 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-sm font-black uppercase tracking-wider mb-2">Basic Data</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Non-intrusive intake. Skips intimate and gender-dependent questions.
                </p>
              </button>

              <button
                onClick={() => setPrivacyLevel('complete')}
                className={cn(
                  'p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-left',
                  'group'
                )}
              >
                <Sparkles className="w-6 h-6 text-orange-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-sm font-black uppercase tracking-wider mb-2">Complete Data</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Full intake including biological and intimate factors for maximum optimization.
                </p>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <ChatInterface
            messages={streamingText ? [...messages, { role: 'assistant', content: stripActionTags(streamingText) }] : messages}
            onSendMessage={handleSendMessage}
            isLoading={isProcessing && !streamingText}
            themeColor="orange"
            agentName="Titan Intake"
            placeholder={privacyLevel ? 'Share your response...' : 'Select a data level to begin'}
            error={error}
            onRetry={() => {
              const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
              if (lastUserMsg) handleSendMessage(lastUserMsg.content);
            }}
          />
        </div>
      </div>
    </div>
  );
}

