import React, { useState, useEffect } from 'react';
import { ModuleLayout } from '@/core/layout/ModuleLayout';
import { ChatInterface } from '@/core/components/ChatInterface';
import { LedgerDashboard } from './components/LedgerDashboard';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { Message } from '@/llm-engine/types';
import { SessionPersistenceService } from '@/lib/services/session-persistence-service';
import { LEDGER_PERSONA } from './personas';

export default function LedgerPage() {
  const { streamMessage } = useAI();
  const { globalSoul, enhanceContext } = useGlobalSoul();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');

  // Hydrate on mount
  useEffect(() => {
    const saved = SessionPersistenceService.getHistory('ledger');
    if (saved && saved.length > 0) {
        setMessages(saved);
    } else {
        setMessages([
          { 
            role: 'assistant', 
            content: "Medical telemetry link active. I am Dr. Ledger, Chief Medical Officer. I am currently monitoring your biological and psychological homeostasis. How can I assist you with your health data today?" 
          }
        ]);
    }
  }, []);

  // Persist on change
  useEffect(() => {
      if (messages.length > 0) {
          SessionPersistenceService.saveHistory('ledger', messages);
      }
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setError(null);
    setStreamingText('');

    try {
      const { updatedHistory } = await streamMessage(
        content, 
        enhanceContext({
            systemPrompt: LEDGER_PERSONA,
            insights: [],
            summary: "A medical and diagnostic consultation with Dr. Ledger.",
            history: messages
        }),
        (chunk) => {
            setStreamingText(prev => prev + chunk);
        }
      );
      setMessages(updatedHistory);
      setStreamingText('');
    } catch (e: any) {
      console.error("Telemetry link lost:", e);
      setError("Diagnostic telemetry stream interrupted.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ModuleLayout title="The Ledger" themeColor="cyan">
      <div className="h-full flex flex-col md:flex-row">
        {/* Left Side: Diagnostic Dashboard */}
        <div className="w-full md:w-1/2 lg:w-[40%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/5">
          <LedgerDashboard soul={globalSoul} />
        </div>
        
        {/* Right Side: Chat Interface */}
        <div className="flex-1 h-1/2 md:h-full overflow-hidden">
          <ChatInterface 
            messages={streamingText ? [...messages, { role: 'assistant', content: streamingText }] : messages}
            onSendMessage={handleSendMessage}
            isLoading={isProcessing && !streamingText}
            themeColor="cyan"
            agentName="Dr. Ledger"
            placeholder="Input symptoms or request diagnostic analysis..."
            error={error}
            onRetry={() => {
                const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                if (lastUserMsg) handleSendMessage(lastUserMsg.content);
            }}
          />
        </div>
      </div>
    </ModuleLayout>
  );
}
