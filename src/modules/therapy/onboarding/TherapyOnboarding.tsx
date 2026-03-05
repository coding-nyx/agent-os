import React, { useState, useEffect } from 'react';
import { ChatInterface } from '@/core/components/ChatInterface';
import { useAI } from '@/llm-engine/ai-context';
import { Message } from '@/llm-engine/types';
import { BaseContext } from '../types';
import { THERAPY_ONBOARDING_PERSONA } from '../personas';

interface TherapyOnboardingProps {
    onComplete: (context: Partial<BaseContext>) => void;
}

export function TherapyOnboarding({ onComplete }: TherapyOnboardingProps) {
    const { streamMessage } = useAI();
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            content: "Welcome to Agnes Therapy. Before we begin our journey together, I'd like to understand a bit more about you. What should I call you, and what are your pronouns?"
        }
    ]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [accumulatedContext, setAccumulatedContext] = useState<Partial<BaseContext>>({});

    const handleSendMessage = async (content: string) => {
        const userMsg: Message = { role: 'user', content };
        setMessages(prev => [...prev, userMsg]);
        setIsProcessing(true);
        setError(null);
        setStreamingText('');

        try {
            const { updatedHistory, response } = await streamMessage(
                content,
                {
                    systemPrompt: THERAPY_ONBOARDING_PERSONA,
                    insights: [],
                    summary: "Therapy Onboarding Intake.",
                    history: messages
                },
                (chunk) => {
                    setStreamingText(prev => prev + chunk);
                }
            );

            let newContext = { ...accumulatedContext };

            // Extract and handle <action> tags manually since the generic ai-context handleToolCall might not know these yet
            // Wait, does the agent strip action tags in streamMessage? It might.
            // Let's parse the final response string.
            const updateMatches = response.match(/<action type="update_therapy_context">([\s\S]*?)<\/action>/gi);
            if (updateMatches) {
                for (const match of updateMatches) {
                    const jsonStr = match.replace(/<action type="update_therapy_context">/i, '').replace(/<\/action>/i, '');
                    try {
                        const parsed = JSON.parse(jsonStr);
                        newContext = { ...newContext, ...parsed };
                    } catch (e) {
                        console.error("Failed to parse therapy context update:", e);
                    }
                }
                setAccumulatedContext(newContext);
            }

            const completeMatch = response.match(/<action type="complete_therapy_onboarding">/i);

            // Filter out action tags from display messages
            const displayHistory = updatedHistory.map(m => ({
                ...m,
                content: m.content.replace(/<action type=".*?">[\s\S]*?<\/action>/gi, '').trim()
            }));

            setMessages(displayHistory);
            setStreamingText('');

            if (completeMatch) {
                onComplete(newContext);
            }

        } catch (e: any) {
            console.error("Intake link failure:", e);
            setError("The neural tunnel encountered an interference packet during intake.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="h-full w-full flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-4xl h-[80vh] flex flex-col bg-black/40 backdrop-blur-xl rounded-[24px] border border-white/10 overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-white/5 bg-white/5">
                    <h2 className="text-xl font-black italic uppercase tracking-widest text-indigo-400">Intake Protocol</h2>
                    <p className="text-xs text-white/50 tracking-tight">Gathering foundational soul data...</p>
                </div>
                <div className="flex-1 overflow-hidden">
                    <ChatInterface
                        messages={streamingText ? [...messages, { role: 'assistant', content: streamingText.replace(/<action type=".*?">[\s\S]*?<\/action>/gi, '').trim() }] : messages}
                        onSendMessage={handleSendMessage}
                        isLoading={isProcessing && !streamingText}
                        themeColor="indigo"
                        agentName="Agnes Intake"
                        placeholder="Share your response..."
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
