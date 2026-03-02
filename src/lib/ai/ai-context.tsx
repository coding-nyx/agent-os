import { createContext, useContext, useState, ReactNode, useRef, useEffect } from 'react';
import { Message, ConversationContext } from './types';
import { TherapistAgent } from './engine/Agent';
import { WebStorageAdapter } from './adapters/WebStorageAdapter';
import { OrchestratorState } from './engine/types';

export interface AIContextType {
  agent: TherapistAgent | null;
  orchestratorState: OrchestratorState | null;
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

export function AIProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState | null>(null);
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
        const newAgent = new TherapistAgent(config, storage);
        await newAgent.initialize();
        
        setAgent(newAgent);
        setOrchestratorState(newAgent.getOrchestratorState());
        setIsInitialized(true);
    };

    init();
  }, []);

  const sendMessage = async (
      content: string, 
      context: ConversationContext
  ) => {
      if (!agent) throw new Error("Agent not initialized");
      const result = await agent.chat(content, context);
      setOrchestratorState(agent.getOrchestratorState());
      return result;
  };

  const streamMessage = async (
      content: string, 
      context: ConversationContext,
      onChunk: (chunk: string) => void
  ) => {
      if (!agent) throw new Error("Agent not initialized");
      const result = await agent.chat(content, context, onChunk);
      setOrchestratorState(agent.getOrchestratorState());
      return result;
  };

  return (
    <AIContext.Provider value={{
      agent,
      orchestratorState,
      sendMessage,
      streamMessage,
      isInitialized
    }}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) throw new Error("useAI must be used within AIProvider");
  return context;
}
