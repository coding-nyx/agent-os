import React, { useEffect, useRef, useState } from 'react';
import { useAITrainer, type OnboardingStatus } from './AITrainerContext';
import { Button } from '../ui/button';
import { Send, Bot, Loader2, Sparkles, ShieldCheck, Zap, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { stripInternalTags } from '../../lib/ai/sanitize';

export const AITrainerOnboarding = () => {
  const { chatHistory, sendMessageToTrainer, isLoading, error, profile, completeOnboarding, onboardingStatus } = useAITrainer();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input;
    setInput('');
    await sendMessageToTrainer(msg);
  };

  const renderContent = (content: string) => {
    const { publicText } = stripInternalTags(content);
    if (!publicText) return null;
    return <ReactMarkdown>{publicText}</ReactMarkdown>;
  };

  // Calculate "Sync Progress" based on profile fields and tracking level
  const getProgress = () => {
      let progress = 0;
      const isIndepth = profile?.trackingLevel === 'indepth';
      const totalPoints = isIndepth ? 5 : 4;
      const pointValue = 100 / totalPoints;

      if (profile?.baselineWeight) progress += pointValue;
      if (profile?.baselineHeight) progress += pointValue;
      if (profile?.supplements && profile.supplements.length > 0) progress += pointValue;

      if (isIndepth) {
          if (profile?.assignedAtBirth) progress += pointValue;
          // For indepth, we check if they've at least started the conversation about intimacy/stress
          if (chatHistory.length > 5) progress += pointValue;
      } else {
          // In standard mode, just having goals is enough for the last point
          if (profile?.goals && profile.goals.length > 0) progress += pointValue;
      }

      return Math.min(100, Math.round(progress));
  };

  const progress = getProgress();

  const handleContinue = () => {
    completeOnboarding();
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,100,255,0.05),transparent_70%)]"></div>
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] animate-pulse"></div>
          <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 ${profile?.trackingLevel === 'indepth' ? 'bg-purple-500/10' : 'bg-primary/10'} rounded-full blur-[120px] animate-pulse delay-700`}></div>
      </div>

      <div className="w-full max-w-4xl flex flex-col h-[85vh] z-10 relative">
        {/* Header / Progress */}
        <div className="mb-8 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shadow-[0_0_20px_rgba(0,100,255,0.3)]">
                        {profile?.trackingLevel === 'indepth' ? <Sparkles className="w-6 h-6 text-primary" /> : <Zap className="w-6 h-6 text-primary" />}
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tighter uppercase italic">Neural Link Initialization</h1>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Protocol: {profile?.trackingLevel === 'indepth' ? 'Deep Biometric Sync' : 'Standard Performance Sync'}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold uppercase text-primary mb-1">Sync Progress: {progress}%</p>
                    <div className="w-48 h-1.5 bg-muted/20 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                            className="h-full bg-primary shadow-[0_0_10px_rgba(0,100,255,0.8)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            <div className={`grid ${profile?.trackingLevel === 'indepth' ? 'grid-cols-5' : 'grid-cols-4'} gap-2`}>
                <div className={`h-1 rounded-full ${profile?.baselineWeight ? 'bg-primary shadow-[0_0_5px_rgba(0,100,255,1)]' : 'bg-white/5'}`}></div>
                <div className={`h-1 rounded-full ${profile?.baselineHeight ? 'bg-primary shadow-[0_0_5px_rgba(0,100,255,1)]' : 'bg-white/5'}`}></div>
                <div className={`h-1 rounded-full ${profile?.supplements && profile.supplements.length > 0 ? 'bg-primary shadow-[0_0_5px_rgba(0,100,255,1)]' : 'bg-white/5'}`}></div>
                {profile?.trackingLevel === 'indepth' ? (
                    <>
                        <div className={`h-1 rounded-full ${profile?.assignedAtBirth ? 'bg-primary shadow-[0_0_5px_rgba(0,100,255,1)]' : 'bg-white/5'}`}></div>
                        <div className={`h-1 rounded-full ${chatHistory.length > 5 ? 'bg-primary shadow-[0_0_5px_rgba(0,100,255,1)]' : 'bg-white/5'}`}></div>
                    </>
                ) : (
                    <div className={`h-1 rounded-full ${profile?.goals && profile.goals.length > 0 ? 'bg-primary shadow-[0_0_5px_rgba(0,100,255,1)]' : 'bg-white/5'}`}></div>
                )}
            </div>
        </div>

        {/* Chat / Conversation Area */}
        {progress === 100 && onboardingStatus === 'collecting' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <div className="text-xs uppercase tracking-widest font-bold text-primary">
              Sync complete. Ready to finalize.
            </div>
            <Button size="sm" onClick={handleContinue} className="rounded-full px-5">
              Continue to Dashboard
            </Button>
          </div>
        )}
        {onboardingStatus === 'completing' && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div className="text-xs uppercase tracking-widest font-bold text-primary">
              Finalizing neural link...
            </div>
          </div>
        )}
        {onboardingStatus === 'failed' && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
            <div className="text-xs uppercase tracking-widest font-bold text-red-400">
              Sync failed. {error || 'Please retry.'}
            </div>
            <Button size="sm" variant="destructive" onClick={handleContinue} className="rounded-full px-5">
              Retry
            </Button>
          </div>
        )}
        {onboardingStatus === 'completed' && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
            <Sparkles className="w-4 h-4 text-green-400" />
            <div className="text-xs uppercase tracking-widest font-bold text-green-400">
              Neural link established. Redirecting...
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-6 mb-6 p-6 bg-white/[0.02] border border-white/10 rounded-3xl backdrop-blur-xl">
            {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                    <div className="relative">
                        <Bot className="w-16 h-16 text-primary opacity-50" />
                        <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-primary animate-pulse" />
                    </div>
                    <div className="max-w-md">
                        <h2 className="text-xl font-bold mb-2">Neural Link Online</h2>
                        <p className="text-sm text-muted-foreground">The AI Strategist is ready for biometric synchronization. Provide your stats to calibrate the training engine.</p>
                    </div>
                    <Button
                        size="lg"
                        onClick={() => sendMessageToTrainer("I'm ready. Let's begin the initialization.")}
                        className="rounded-full px-8 py-6 font-bold shadow-2xl shadow-primary/20"
                    >
                        Begin Initialization
                    </Button>
                </div>
            ) : (
                chatHistory.map((msg, idx) => {
                    if (msg.role === 'system' || (msg.role === 'user' && msg.content.startsWith('[SYSTEM:'))) return null;
                    const isUser = msg.role === 'user';
                    const rendered = renderContent(msg.content);
                    if (!rendered) return null;
                    return (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${isUser ? 'bg-primary text-white border-primary/20 shadow-[0_0_15px_rgba(0,100,255,0.4)]' : 'bg-black border-white/10'}`}>
                                {isUser ? <Activity className="w-5 h-5" /> : <Bot className="w-5 h-5 text-primary" />}
                            </div>
                            <div className={`max-w-[80%] p-5 rounded-3xl ${isUser ? 'bg-primary/20 border border-primary/30 rounded-tr-none' : 'bg-white/[0.05] border border-white/10 rounded-tl-none'}`}>
                                <div className="prose prose-invert prose-sm">
                                    {rendered}
                                </div>
                            </div>
                        </motion.div>
                    );
                })
            )}
            {isLoading && (
                <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-black border border-white/10 flex items-center justify-center shrink-0">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                    <div className="bg-white/[0.05] border border-white/10 p-5 rounded-3xl rounded-tl-none flex items-center gap-3">
                        <div className="flex gap-1">
                            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-primary rounded-full"></motion.span>
                            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-primary rounded-full"></motion.span>
                            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-primary rounded-full"></motion.span>
                        </div>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Syncing Telemetry...</span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSend} className="relative group">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl group-focus-within:bg-primary/30 transition-all opacity-0 group-focus-within:opacity-100"></div>
            <div className="relative flex items-center bg-white/[0.05] border border-white/10 rounded-full p-2 backdrop-blur-3xl group-focus-within:border-primary/50 transition-all shadow-2xl">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter biometric data or answer the trainer's question..."
                    className="flex-1 bg-transparent border-none outline-none px-6 py-4 text-sm"
                    disabled={isLoading}
                />
                <Button
                    type="submit"
                    size="icon"
                    className="w-12 h-12 rounded-full shadow-lg shadow-primary/20"
                    disabled={isLoading || !input.trim()}
                >
                    <Send className="w-5 h-5" />
                </Button>
            </div>
        </form>

        {/* Footer info */}
        <div className="mt-8 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-muted-foreground opacity-50">
            <div className="flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-primary" />
                E2E Encrypted Connection
            </div>
            <div>Secure Vault: Active</div>
            <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-primary" />
                Titan Fitness Neural Link
            </div>
        </div>
      </div>
    </div>
  );
};
