import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { Message, ConversationContext } from './types';
import { TherapistAgent } from './engine/Agent';
import { WebStorageAdapter } from './adapters/WebStorageAdapter';

export interface AIContextType {
  sendMessage: (
    content: string, 
    context: ConversationContext
  ) => Promise<{ response: string, updatedHistory: Message[] }>;
  streamMessage: (
    content: string, 
    context: ConversationContext,
    onChunk: (chunk: string) => void
  ) => Promise<{ response: string, updatedHistory: Message[] }>;
  isInitialized: boolean;
}

const AIContext = createContext<AIContextType | null>(null);

interface AIProviderProps {
  children: ReactNode;
  onToolCall?: (name: string, args: any) => Promise<any>;
}

export function AIProvider({ children, onToolCall }: AIProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [agent, setAgent] = useState<TherapistAgent | null>(null);

  useEffect(() => {
    const init = async () => {
        const openrouterKey = localStorage.getItem('VITE_OPENROUTER_API_KEY') || import.meta.env.VITE_OPENROUTER_API_KEY;
        const grokKey = localStorage.getItem('VITE_GROK_API_KEY') || import.meta.env.VITE_GROK_API_KEY;
        const googleKey = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;

        const config = {
            openrouterKey,
            grokKey,
            googleKey,
            preferredModelId: localStorage.getItem('preferred_model') || undefined,
            isMockMode: !openrouterKey && !grokKey && !googleKey
        };

        const storage = new WebStorageAdapter();
        const newAgent = new TherapistAgent(config, storage, onToolCall);
        await newAgent.initialize();
        
        setAgent(newAgent);
        setIsInitialized(true);
    };

    if (isInitialized) return;
    
    const timer = setTimeout(() => {
        if (!isInitialized) {
            console.warn("AIProvider initialization timed out. Proceeding without agent.");
            setIsInitialized(true);
        }
    }, 3000);

    init().finally(() => clearTimeout(timer));
  }, [onToolCall, isInitialized]);

  const sendMessage = useCallback(async (content: string, context: ConversationContext) => {
      if (!agent) throw new Error("Agent not initialized");
      const result = await agent.chat(content, context);
      return result;
  }, [agent]);

  const streamMessage = useCallback(async (content: string, context: ConversationContext, onChunk: (chunk: string) => void) => {
      if (!agent) throw new Error("Agent not initialized");
      const result = await agent.chat(content, context, onChunk);
      return result;
  }, [agent]);

  return (
    <AIContext.Provider value={{ sendMessage, streamMessage, isInitialized }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) throw new Error("useAI must be used within AIProvider");
  return context;
}
