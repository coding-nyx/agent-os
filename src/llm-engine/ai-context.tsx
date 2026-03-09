import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { Message, ConversationContext, MessageContent } from './types';
import { CognitiveAgent } from './engine/CognitiveAgent';
import { StructuredResponse, StreamChunk } from './engine/types';

export interface AIContextType {
  sendMessage: (
    content: MessageContent,
    context: ConversationContext,
    signal?: AbortSignal
  ) => Promise<{ response: StructuredResponse, updatedHistory: Message[] }>;
  streamMessage: (
    content: MessageContent,
    context: ConversationContext,
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ) => Promise<{ response: StructuredResponse, updatedHistory: Message[] }>;
  isInitialized: boolean;
}

const AIContext = createContext<AIContextType | null>(null);

interface AIProviderProps {
  children: ReactNode;
  guestMode?: boolean;
}

export function AIProvider({ children, guestMode }: AIProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [agent, setAgent] = useState<CognitiveAgent | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
        const openrouterKey = localStorage.getItem('VITE_OPENROUTER_API_KEY') || import.meta.env.VITE_OPENROUTER_API_KEY;
        const grokKey = localStorage.getItem('VITE_GROK_API_KEY') || import.meta.env.VITE_GROK_API_KEY;
        const googleKey = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;

        const config = {
            openrouterKey,
            grokKey,
            googleKey,
            preferredModelId: localStorage.getItem('preferred_model') || undefined,
            isMockMode: !openrouterKey && !grokKey && !googleKey,
            freeModelsOnly: guestMode
        };

        const newAgent = new CognitiveAgent(config);
        await newAgent.initialize();

        setAgent(newAgent);
        setIsInitialized(true);
    };

    const timer = setTimeout(() => {
        console.warn("AIProvider: initialization timed out after 8s. Proceeding with limited functionality.");
        setIsInitialized(true);
    }, 8000);

    init().finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (agent) {
      agent.setFreeModelsOnly(!!guestMode);
    }
  }, [guestMode, agent]);

  const sendMessage = useCallback(async (content: MessageContent, context: ConversationContext, signal?: AbortSignal) => {
      if (!agent) throw new Error("Agent not initialized");
      const result = await agent.chat(content, context, undefined, signal);
      return result;
  }, [agent]);

  const streamMessage = useCallback(async (content: MessageContent, context: ConversationContext, onChunk: (chunk: StreamChunk) => void, signal?: AbortSignal) => {
      if (!agent) throw new Error("Agent not initialized");
      const safeChunk = (chunk: StreamChunk) => {
        try { onChunk(chunk); } catch (e) { console.warn('onChunk callback error:', e); }
      };
      const result = await agent.chat(content, context, safeChunk, signal);
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
