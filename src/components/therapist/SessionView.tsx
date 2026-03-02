
import { useState, useRef, useEffect } from 'react';
import { TherapistLayout } from './ui/TherapistLayout';
import { ArtisticAvatar, AvatarState } from './ui/ArtisticAvatar';
import { Button } from '../ui/button';
import { useAI } from '../../lib/ai/ai-context';
import { Message, GeneratedTherapist, BaseContext, ActiveSession, SessionSummary } from '../../lib/ai/types';
import { getReflectionPrompt, getWarmWelcomePrompt } from '../../lib/ai/personas';
import { Send, LogOut, Loader2, Save, AlertTriangle, RefreshCw, Sparkles, Trash2, Coffee } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from './ui/MessageBubble';
import { Card } from '../ui/card';

interface SessionViewProps {
  initialContext: BaseContext;
  initialActiveSession: ActiveSession | null;
  therapist: GeneratedTherapist;
  onAutoSave: (updatedSession: ActiveSession) => Promise<void>;
  onEndSession: (insightToIntegrate?: SessionSummary) => Promise<void>;
}

export function SessionView({ 
  initialContext, 
  initialActiveSession, 
  therapist, 
  onAutoSave, 
  onEndSession 
}: SessionViewProps) {
  const { streamMessage, sendMessage, orchestratorState } = useAI();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<Message[]>([]); 
  const [inputText, setInputText] = useState('');
  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [avatarAction, setAvatarAction] = useState<string | undefined>(undefined);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [isGeneratingReflection, setIsGeneratingReflection] = useState(false);
  const [reflection, setReflection] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { name, role, systemPrompt, greeting, gender, archetypeId } = therapist;

  // Initialize or Resume
  useEffect(() => {
    const init = async () => {
        if (initialActiveSession) {
            setMessages(initialActiveSession.messages);
            setChatHistory(initialActiveSession.messages);
        } else if (messages.length === 0) {
            // Check if returning user
            if (initialContext?.integratedInsights && initialContext.integratedInsights.length > 0) {
                setIsInitializing(true);
                setAvatarState('thinking');
                try {
                    const welcomePrompt = getWarmWelcomePrompt(therapist, initialContext);
                    const result = await sendMessage(welcomePrompt, {
                        systemPrompt: therapist.systemPrompt,
                        insights: initialContext.integratedInsights || [],
                        summary: initialContext.lastSessionSummary || '',
                        history: []
                    });
                    const welcomeMsg: Message = { role: 'assistant', content: result.response };
                    setMessages([welcomeMsg]);
                    setChatHistory([welcomeMsg]);
                } catch (e) {
                    const initialMsg: Message = { role: 'assistant', content: greeting };
                    setMessages([initialMsg]);
                    setChatHistory([initialMsg]);
                } finally {
                    setIsInitializing(false);
                    setAvatarState('idle');
                }
            } else {
                const initialMsg: Message = { role: 'assistant', content: greeting };
                setMessages([initialMsg]);
                setChatHistory([initialMsg]);
            }
        }
    };
    init();
  }, []);

  // Auto-Save whenever chatHistory changes
  useEffect(() => {
    if (chatHistory.length > 1) { // Don't auto-save just the greeting
      const session: ActiveSession = {
        id: initialActiveSession?.id || `session_${Date.now()}`,
        messages: chatHistory,
        emotionalTrend: [], // Could implement later
        startedAt: initialActiveSession?.startedAt || Date.now(),
        lastUpdatedAt: Date.now()
      };
      onAutoSave(session);
    }
  }, [chatHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, error]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      const content = lastMsg.content;
      const matches = content.match(/\*([a-zA-Z\s]+)\*/g);
      
      if (matches && matches.length > 0) {
        const lastAction = matches[matches.length - 1].replace(/\*/g, '').trim().toLowerCase();
        
        if (lastAction.includes('smile') || lastAction.includes('laugh')) setAvatarAction('smile');
        else if (lastAction.includes('nod') || lastAction.includes('agree')) setAvatarAction('nod');
        else if (lastAction.includes('lean')) setAvatarAction('lean_in');
        else if (lastAction.includes('think') || lastAction.includes('ponder')) setAvatarState('thinking');
        else setAvatarAction(undefined);

        const timer = setTimeout(() => setAvatarAction(undefined), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [messages]);

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || isStreaming || isInitializing) return;

    const baseHistory = chatHistory;

    if (!textOverride) {
        const userMsg: Message = { role: 'user', content: textToSend };
        setMessages(prev => [...prev, userMsg]);
        setInputText('');
    }
    
    setError(null);
    setAvatarState('thinking');
    setIsStreaming(true);

    try {
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      let currentResponse = '';

      const ctx = {
          systemPrompt,
          insights: Array.isArray(initialContext?.integratedInsights) ? initialContext.integratedInsights : [],
          summary: initialContext?.lastSessionSummary || '',
          history: baseHistory
      };

      const result = await streamMessage(textToSend, ctx, (chunk) => {
        currentResponse += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastMsgIndex = newMsgs.length - 1;
          const lastMsg = { ...newMsgs[lastMsgIndex] };
          if (lastMsg.role === 'assistant') {
            lastMsg.content = currentResponse;
            newMsgs[lastMsgIndex] = lastMsg;
          }
          return newMsgs;
        });
        setAvatarState('speaking');
      });

      if (!result.response.trim()) {
        throw new Error("Empty response");
      }

      setChatHistory(result.updatedHistory);
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
        return prev;
      });
      setError("AI Engine encountered an error.");
      setChatHistory(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'user' && last.content === textToSend) return prev;
        return [...baseHistory, { role: 'user', content: textToSend }];
      });
    } finally {
      setIsStreaming(false);
      setAvatarState('idle');
    }
  };

  const startReflection = async () => {
    setShowEndModal(false);
    setIsGeneratingReflection(true);
    setAvatarState('thinking');

    try {
      const prompt = getReflectionPrompt(name, role, chatHistory);
      const result = await sendMessage(prompt, {
        systemPrompt: "You are a clinical summarizer. Output only JSON.",
        insights: [],
        summary: "",
        history: []
      });

      const parsedReflection = JSON.parse(result.response);
      setReflection({
        ...parsedReflection,
        date: new Date().toLocaleDateString()
      });
    } catch (e) {
      console.error("Reflection failed", e);
      // Fallback reflection
      setReflection({
        date: new Date().toLocaleDateString(),
        summary: "We had a deep conversation today about your journey.",
        theme: "General Exploration",
        keyInsights: ["You are showing great courage in sharing your thoughts."]
      });
    } finally {
      setIsGeneratingReflection(false);
      setAvatarState('idle');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (reflection) {
    return (
      <TherapistLayout title="Session Reflection" showBack={false}>
        <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto p-4 space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
            <Sparkles className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold">Reflection</h2>
            <p className="text-slate-500 italic">"{reflection.summary}"</p>
          </motion.div>

          <Card className="w-full p-8 space-y-6 bg-white dark:bg-slate-900 border-indigo-100 dark:border-indigo-900 shadow-xl">
             <div className="space-y-4">
                <div className="flex items-center gap-2">
                   <div className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold uppercase tracking-widest">
                      Theme: {reflection.theme}
                   </div>
                </div>
                
                <div className="space-y-3">
                   <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Key Insights:</h3>
                   <ul className="space-y-2">
                      {reflection.keyInsights.map((insight, i) => (
                        <li key={i} className="flex gap-3 text-slate-600 dark:text-slate-400">
                          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-none" />
                          {insight}
                        </li>
                      ))}
                   </ul>
                </div>
             </div>

             <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 text-center">
                Choosing "Integrate" will save these insights to your Soul profile and permanently delete the raw chat transcript.
             </div>
          </Card>

          <div className="flex gap-4 w-full">
             <Button variant="outline" className="flex-1 h-12" onClick={() => onEndSession()}>
                <Trash2 className="w-4 h-4 mr-2" /> Discard All
             </Button>
             <Button className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700" onClick={() => onEndSession(reflection)}>
                <Save className="w-4 h-4 mr-2" /> Integrate & Finish
             </Button>
          </div>
        </div>
      </TherapistLayout>
    );
  }

  return (
    <TherapistLayout title={`Session with ${name}`} showBack={false}>
      <div className="flex flex-col h-full max-w-4xl mx-auto relative">
        <div className="flex-none flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-black/20 backdrop-blur-sm rounded-t-2xl z-10">
           <div className="flex items-center gap-4">
              <div className="scale-75 origin-left">
                <ArtisticAvatar 
                  gender={gender}
                  archetype={archetypeId}
                  state={avatarState} 
                  action={avatarAction}
                  className="w-24 h-24" 
                />
              </div>
              <div>
                <h3 className="font-medium text-lg">{name}</h3>
                <p className="text-xs text-slate-500 uppercase tracking-wider">
                    {role} {orchestratorState?.activeModelId ? `• ${orchestratorState.activeModelId.split('/')[1]}` : ''}
                </p>
              </div>
           </div>

           <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => setShowEndModal(true)}>
             <LogOut className="w-4 h-4 mr-2" />
             End
           </Button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth bg-gradient-to-b from-slate-50/50 to-white/30 dark:from-black/10 dark:to-black/30 backdrop-blur-sm pb-32">
          {initialActiveSession && messages.length === initialActiveSession.messages.length && (
            <div className="flex justify-center mb-8">
               <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs px-4 py-2 rounded-full border border-amber-100 dark:border-amber-800/50">
                  Resuming your previous conversation...
               </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
               <MessageBubble key={idx} message={msg} isLast={idx === messages.length - 1} />
            ))}
          </AnimatePresence>
          
          {(isStreaming || isGeneratingReflection || isInitializing) && (
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start mb-6">
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-1.5">
                   <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                   <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100" />
                   <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200" />
                   <span className="text-[10px] text-slate-400 ml-2 uppercase tracking-widest font-bold">
                      {isGeneratingReflection ? "Reflecting..." : (isInitializing ? `Dr. ${name} is preparing...` : "Listening...")}
                   </span>
                 </div>
               </motion.div>
          )}

          {error && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
                  <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 p-4 max-w-md w-full text-center">
                      <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-red-800 dark:text-red-200">System Interruption</h4>
                      <p className="text-xs text-red-600 dark:text-red-300 mt-1">{error}</p>
                      <Button size="sm" variant="outline" onClick={() => handleSendMessage()} className="mt-4">
                        <RefreshCw className="w-3 h-3 mr-2" /> Try Recovery
                      </Button>
                  </Card>
              </motion.div>
          )}
        </div>

        <div className="absolute bottom-6 left-0 right-0 px-4 pointer-events-none flex justify-center z-20">
          <div className="pointer-events-auto w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl shadow-indigo-500/10 dark:shadow-black/50 p-2 flex items-end gap-2 transition-all focus-within:ring-2 ring-indigo-500/20">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="w-full min-h-[50px] max-h-[150px] py-3 px-4 resize-none bg-transparent border-none focus:outline-none text-[16px] placeholder:text-slate-400 text-slate-700 dark:text-slate-200"
            />
            <Button
              size="icon"
              className={`h-11 w-11 rounded-full flex-none mb-1 transition-all ${
                  inputText.trim() 
                  ? 'bg-indigo-600 text-white shadow-lg scale-100' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 scale-95'
              }`}
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isStreaming || isGeneratingReflection}
            >
              {isStreaming ? <Loader2 className="animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {showEndModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                    <h3 className="text-xl font-bold mb-2">Finish Session?</h3>
                    <p className="text-slate-500 mb-6">Dr. {name} will provide a brief reflection before you leave.</p>
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowEndModal(false)}>Cancel</Button>
                        <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={startReflection}>
                            <Sparkles className="w-4 h-4 mr-2" /> Reflect & End
                        </Button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </TherapistLayout>
  );
}
