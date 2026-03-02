import React, { useState, useEffect, useRef } from 'react';
import { useAITrainer } from '../AITrainerContext';
import { Button } from '../../ui/button';
import { Send, User, Bot, Loader2, AlertCircle, Dumbbell, CheckCircle2, Activity, ShieldCheck, HeartPulse } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Routine } from '../../../lib/types';
import { stripInternalTags } from '../../../lib/ai/sanitize';

export const AITrainerChat = () => {
  const { chatHistory, sendMessageToTrainer, isLoading, error, profile, routines, approveAction } = useAITrainer();
  const [input, setInput] = useState('');
  const [approvedActionKeys, setApprovedActionKeys] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isLoading, error, routines]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input;
    setInput('');
    await sendMessageToTrainer(msg);
  };

  const handleApprove = async (actionType: string, payload: any, actionKey: string) => {
      await approveAction(actionType, payload);
      setApprovedActionKeys(prev => ({ ...prev, [actionKey]: true }));
  };

  const renderActionCards = (content: string, messageIndex: number) => {
      const actionRegex = /<action\s+type="([^"]+)">([\s\S]*?)<\/action>/g;
      let match;
      const cards = [];

      while ((match = actionRegex.exec(content)) !== null) {
          const actionType = match[1];
          if (actionType === 'add_soul_insight' || actionType === 'complete_onboarding') continue;

          try {
              const payload = JSON.parse(match[2].trim());
              const actionKey = `${messageIndex}-${actionType}-${match[2].trim().substring(0, 20)}`;
              const isApproved = approvedActionKeys[actionKey];

              if (actionType === 'propose_routine') {
                  const isRoutineApproved = isApproved || routines.some(r => r.rationale === payload.rationale && r.status === 'active');
                  cards.push(
                      <div key={actionKey} className="mt-3 bg-card border border-primary/20 rounded-xl p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-2">
                              <Dumbbell className="w-5 h-5 text-primary" />
                              <h4 className="font-bold text-sm">Protocol Deployed</h4>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3 italic">"{payload.rationale}"</p>
                          <div className="space-y-2 mb-4">
                              {payload.exercises.map((ex: any, i: number) => (
                                  <div key={i} className="flex justify-between items-center text-xs bg-muted/50 p-2 rounded">
                                      <span className="font-medium">{ex.name}</span>
                                      <span className="text-muted-foreground">{ex.sets} x {ex.reps}</span>
                                  </div>
                              ))}
                          </div>
                          {!isRoutineApproved ? (
                              <Button
                                  size="sm"
                                  className="w-full font-bold"
                                  onClick={() => handleApprove(actionType, payload, actionKey)}
                              >
                                  Approve & Sync to Dashboard
                              </Button>
                          ) : (
                              <div className="flex items-center justify-center gap-2 text-green-500 text-xs font-bold py-2 bg-green-500/10 rounded-md">
                                  <CheckCircle2 className="w-4 h-4" />
                                  Protocol Active
                              </div>
                          )}
                      </div>
                  );
              } else {
                  // Generic card for other actions
                  let title = "Update Data";
                  let icon = <Activity className="w-4 h-4 text-primary" />;
                  let details = [];

                  if (actionType === 'update_metrics') {
                      title = "Health Metrics Update";
                      if (payload.weight) details.push(`Weight: ${payload.weight}`);
                      if (payload.baselineHeight || payload.height) details.push(`Height: ${payload.baselineHeight || payload.height}`);
                      if (payload.moodScore) details.push(`Mood: ${payload.moodScore}/5`);
                      if (payload.cnsFatigueScore) details.push(`CNS Fatigue: ${payload.cnsFatigueScore}/10`);
                  } else if (actionType === 'sync_supplements') {
                      title = "New Supplement";
                      icon = <HeartPulse className="w-4 h-4 text-primary" />;
                      details.push(`Name: ${payload.name}`);
                      if (payload.category) details.push(`Category: ${payload.category}`);
                  } else if (actionType === 'update_identity') {
                      title = "Identity Update";
                      icon = <ShieldCheck className="w-4 h-4 text-primary" />;
                      if (payload.genderIdentity) details.push(`Identity: ${payload.genderIdentity}`);
                      if (payload.preferredCoachingStyle) details.push(`Style: ${payload.preferredCoachingStyle}`);
                  } else if (actionType === 'update_profile') {
                      title = "Profile Update";
                      if (payload.goals) details.push(`Goals: ${payload.goals.join(', ')}`);
                      if (payload.trackingLevel) details.push(`Tracking: ${payload.trackingLevel}`);
                      if (payload.traits) details.push(`Traits: ${payload.traits.join(', ')}`);
                  }

                  cards.push(
                      <div key={actionKey} className="mt-3 bg-card border border-primary/20 rounded-xl p-3 shadow-sm">
                          <div className="flex items-center gap-2 mb-2 border-b border-border/50 pb-2">
                              {icon}
                              <h4 className="font-bold text-sm">{title}</h4>
                          </div>
                          <ul className="text-xs text-muted-foreground mb-3 space-y-1 list-disc list-inside">
                              {details.map((d, i) => <li key={i}>{d}</li>)}
                          </ul>
                          {!isApproved ? (
                              <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full font-bold text-xs h-8 border-primary/50 hover:bg-primary/10"
                                  onClick={() => handleApprove(actionType, payload, actionKey)}
                              >
                                  Approve Update
                              </Button>
                          ) : (
                              <div className="flex items-center justify-center gap-2 text-green-500 text-xs font-bold py-1.5 bg-green-500/10 rounded-md">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Updated
                              </div>
                          )}
                      </div>
                  );
              }
          } catch (e) {
              console.error("Failed to parse action card", e);
          }
      }
      return cards;
  };

  const renderContent = (content: string, messageIndex: number) => {
    const actionCards = renderActionCards(content, messageIndex);
    const { publicText } = stripInternalTags(content);

    if (!publicText && actionCards.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-col gap-4 w-full">
        {publicText && (
          <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
            <ReactMarkdown>{publicText}</ReactMarkdown>
          </div>
        )}
        {actionCards}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-background/50 backdrop-blur-md flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center relative">
             <Bot className="w-6 h-6 text-primary" />
             {isLoading && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-blue-500 rounded-full animate-ping"></span>}
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">{profile?.name || 'AI Trainer'}</h3>
            <p className="text-xs text-muted-foreground">{profile?.traits.join(' • ')}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center px-6">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p>Welcome to your personal AI Trainer.</p>
            <p className="text-sm mt-2">I analyze your health data to optimize your performance and recovery.</p>
          </div>
        ) : (
          chatHistory.map((msg, idx) => {
            if (msg.role === 'system') return null;
            if (msg.role === 'user' && msg.content.startsWith('[SYSTEM:')) return null;
            const isUser = msg.role === 'user';
            const rendered = renderContent(msg.content, idx);
            if (!rendered) return null;
            return (
              <div key={idx} className={`flex gap-3 max-w-[90%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`p-4 rounded-2xl ${isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted/50 border rounded-tl-sm w-full'}`}>
                  {rendered}
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex gap-3 max-w-[80%] mr-auto">
             <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-pulse" />
             </div>
             <div className="p-4 rounded-2xl bg-muted/50 border rounded-tl-sm flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Formulating advice...</span>
             </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex gap-3 max-w-[90%] mr-auto mt-4">
             <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4 text-destructive" />
             </div>
             <div className="p-4 rounded-2xl bg-destructive/5 border border-destructive/20 rounded-tl-sm flex flex-col gap-2">
                <span className="text-sm font-medium text-destructive">Connection Interrupted</span>
                <span className="text-xs text-muted-foreground">{error}</span>
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-fit h-7 text-xs"
                    onClick={() => {
                        // Resend the last user message
                        const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user');
                        if (lastUserMsg) {
                            sendMessageToTrainer(lastUserMsg.content);
                        }
                    }}
                >
                    Retry Failed Request
                </Button>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your trainer anything..."
            className="flex-1 bg-muted/50 border-0 rounded-full pl-6 pr-12 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 rounded-full w-8 h-8"
            disabled={isLoading || !input.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};
