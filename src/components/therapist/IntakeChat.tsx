
import { useState, useRef, useEffect, useMemo } from 'react';
import { TherapistLayout } from './ui/TherapistLayout';
import { ArtisticAvatar, AvatarState } from './ui/ArtisticAvatar';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Message, LLMProvider } from '../../lib/ai/types';
import { AIProvider, useAI } from '../../lib/ai/ai-context';
import { Send, Loader2, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../ui/card';
import { MessageBubble } from './ui/MessageBubble';

const INTAKE_SYSTEM_PROMPT = `You are a warm, professional, and empathetic Intake Specialist for a digital therapy platform.
Your goal is to conduct a preliminary assessment to match the user with the most suitable long-term therapist.

You need to gather information about:
1. Current emotional state and reasons for seeking therapy.
2. Brief history of mental health or therapy.
3. Childhood environment and significant relationships.
4. Any specific trauma or difficult life events (ask gently).
5. Goals for therapy (what does "better" look like?).

Guidelines:
- Ask ONE question at a time. Do not overwhelm the user.
- Be conversational. Follow up on their answers before moving to the next topic.
- If the user is brief, ask a gentle probing question.
- If the user reveals distress, validate them immediately.
- Maintain a neutral but supportive tone.
- Do not offer deep therapeutic interventions yet; your job is assessment.

Start by introducing yourself as the Intake Assistant and asking what brings them here today.`;

interface IntakeChatProps {
    onComplete: (transcript: Message[]) => void;
}

function IntakeChatContent({ onComplete }: IntakeChatProps) {
    const { streamMessage, orchestratorState } = useAI();
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatHistory, setChatHistory] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [avatarState, setAvatarState] = useState<AvatarState>('idle');
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Initial Greeting
    useEffect(() => {
        if (messages.length === 0) {
            const initial: Message = { 
                role: 'assistant', 
                content: "Hello. I'm your Intake Assistant. My goal is to understand your needs so I can match you with the perfect therapist. To start, could you tell me a little about what brings you here today?" 
            };
            setMessages([initial]);
            setChatHistory([initial]);
        }
    }, []);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isStreaming, error]);

    const handleSendMessage = async (textOverride?: string) => {
        const textToSend = textOverride || inputText;
        if (!textToSend.trim() || isStreaming) return;

        const baseHistory = chatHistory;

        if (!textOverride) {
            const userMsg: Message = { role: 'user', content: textToSend };
            setMessages(prev => [...prev, userMsg]);
            setInputText('');
        }
        
        setError(null);
        setIsStreaming(true);
        setAvatarState('thinking');

        try {
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            
            let responseContent = '';

            const ctx = {
                systemPrompt: INTAKE_SYSTEM_PROMPT,
                insights: [],
                summary: '',
                history: baseHistory
            };

            const result = await streamMessage(textToSend, ctx, (chunk) => {
                responseContent += chunk;
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: 'assistant', content: responseContent };
                    return updated;
                });
                setAvatarState('speaking');
            });

            if (!result.response.trim()) {
                throw new Error("Empty response");
            }

            setChatHistory(result.updatedHistory);

        } catch (error) {
            console.error("Intake error", error);
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last.role === 'assistant' && !last.content) return prev.slice(0, -1);
                return prev;
            });
            setError("The system is experiencing high demand. Please try sending your message again.");
            setChatHistory(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'user' && last.content === textToSend) return prev;
                return [...baseHistory, { role: 'user', content: textToSend }];
            });
        } finally {
            setIsStreaming(false);
            setAvatarState('listening');
        }
    };

    const handleRetry = () => {
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
            handleSendMessage(lastUserMsg.content);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <TherapistLayout title="Intake Session" showBack={false}>
            <div className="flex flex-col h-full max-w-4xl mx-auto relative">
                {/* Header / Avatar */}
                <div className="flex-none flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-black/20 backdrop-blur-sm rounded-t-2xl z-10">
                    <div className="flex items-center gap-4">
                        <div className="scale-75 origin-left">
                            <ArtisticAvatar gender="non-binary" archetype="nurturer" state={avatarState} className="w-20 h-20" />
                        </div>
                        <div>
                            <h2 className="font-medium text-lg">Intake Assistant</h2>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">
                                Preliminary Assessment {orchestratorState?.activeModelId ? `• ${orchestratorState.activeModelId.split('/')[1]}` : ''}
                            </p>
                        </div>
                    </div>
                    {messages.length > 5 && (
                        <Button 
                            variant="outline" 
                            size="sm"
                            className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800"
                            onClick={() => onComplete(messages)}
                        >
                            Finish Intake <ArrowRight className="ml-2 w-4 h-4" />
                        </Button>
                    )}
                </div>

                {/* Chat Area */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth bg-gradient-to-b from-slate-50/50 to-white/30 dark:from-black/10 dark:to-black/30 backdrop-blur-sm pb-32">
                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => (
                            <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
                        ))}
                    </AnimatePresence>
                    
                    {isStreaming && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start mb-6">
                            <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100" />
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200" />
                            </div>
                        </motion.div>
                    )}

                    {error && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center my-4">
                            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 p-4 max-w-md w-full text-center">
                                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
                                <h4 className="text-sm font-bold text-red-800 dark:text-red-200">Session Interruption</h4>
                                <p className="text-xs text-red-600 dark:text-red-300 mt-1">{error}</p>
                                <Button size="sm" onClick={handleRetry} className="mt-4">
                                    <RefreshCw className="w-3 h-3 mr-2" /> Retry Sending
                                </Button>
                            </Card>
                        </motion.div>
                    )}
                </div>

                {/* Input Area */}
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
                            disabled={!inputText.trim() || isStreaming}
                        >
                            {isStreaming ? <Loader2 className="animate-spin" /> : <Send className="w-5 h-5" />}
                        </Button>
                    </div>
                </div>
                
                {/* Footer Note */}
                <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
                    <p className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">
                        Secure Intake Process
                    </p>
                </div>
            </div>
        </TherapistLayout>
    );
}

export function IntakeChat(props: IntakeChatProps) {
    return <IntakeChatContent {...props} />;
}
