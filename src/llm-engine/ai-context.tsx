/**
 * App-facing LLM runtime entrypoint.
 * See docs/architecture/llm-entrypoint-runtime.md for the boot chain,
 * runtime modes, and extension boundaries.
 */
import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from 'react';
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
  generateJSON: <T = any>(
    prompt: string,
    options?: { systemPrompt?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; model?: string }
  ) => Promise<T>;
  analyzeImage: (
    imageDataUrl: string,
    prompt: string,
    options?: { model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal; format?: 'json_object' | 'text' }
  ) => Promise<string>;
  activeModelId: string | null;
  activeProvider: 'openrouter' | 'grok' | 'google' | 'mock' | null;
  isInitialized: boolean;
  /** True when initialization timed out or failed; agent will be null. */
  initFailed: boolean;
}

const AIContext = createContext<AIContextType | null>(null);

interface AIProviderProps {
  children: ReactNode;
  guestMode?: boolean;
}

export function AIProvider({ children, guestMode }: AIProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  const [agent, setAgent] = useState<CognitiveAgent | null>(null);
  const [runtimeModelId, setRuntimeModelId] = useState<string | null>(null);
  const [runtimeProvider, setRuntimeProvider] = useState<'openrouter' | 'grok' | 'google' | 'mock' | null>(null);
  const initRef = useRef(false);
  const reinitRef = useRef(false);
  const lastConfigRef = useRef<{ model: string | null; provider: string | null; guest: boolean } | null>(null);

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
            preferredProvider: (localStorage.getItem('nexus_debug_provider') as 'openrouter' | 'grok' | 'google' | null) || undefined,
            isMockMode: !openrouterKey && !grokKey && !googleKey,
            freeModelsOnly: guestMode
        };

        const newAgent = new CognitiveAgent(config);
        await newAgent.initialize();

        setAgent(newAgent);
        const state = newAgent.getOrchestratorState();
        setRuntimeModelId(state.activeModelId);
        setRuntimeProvider(state.provider);
        setIsInitialized(true);
    };

    const timer = setTimeout(() => {
        console.warn("AIProvider: initialization timed out after 8s. Running in degraded mode.");
        // Do NOT set isInitialized — agent is still null here.
        // Signal failure so the gate can render a degraded-mode banner instead of blocking.
        setInitFailed(true);
    }, 8000);

    init().finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (agent) {
      agent.setFreeModelsOnly(!!guestMode);
      const state = agent.getOrchestratorState();
      setRuntimeModelId(state.activeModelId);
      setRuntimeProvider(state.provider);
    }
  }, [guestMode, agent]);

  useEffect(() => {
    if (!agent) return;
    const readConfig = () => ({
      model: localStorage.getItem('preferred_model'),
      provider: localStorage.getItem('nexus_debug_provider'),
      guest: !!guestMode,
    });
    lastConfigRef.current = readConfig();

    const reinitIfChanged = async () => {
      const next = readConfig();
      const prev = lastConfigRef.current;
      if (prev && prev.model === next.model && prev.provider === next.provider && prev.guest === next.guest) return;
      if (reinitRef.current) return;
      reinitRef.current = true;
      lastConfigRef.current = next;
      try {
        const openrouterKey = localStorage.getItem('VITE_OPENROUTER_API_KEY') || import.meta.env.VITE_OPENROUTER_API_KEY;
        const grokKey = localStorage.getItem('VITE_GROK_API_KEY') || import.meta.env.VITE_GROK_API_KEY;
        const googleKey = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;

        const config = {
          openrouterKey,
          grokKey,
          googleKey,
          preferredModelId: localStorage.getItem('preferred_model') || undefined,
          preferredProvider: (localStorage.getItem('nexus_debug_provider') as 'openrouter' | 'grok' | 'google' | null) || undefined,
          isMockMode: !openrouterKey && !grokKey && !googleKey,
          freeModelsOnly: !!guestMode
        };

        const newAgent = new CognitiveAgent(config);
        await newAgent.initialize();
        setAgent(newAgent);
        const state = newAgent.getOrchestratorState();
        setRuntimeModelId(state.activeModelId);
        setRuntimeProvider(state.provider);
        setInitFailed(false);
      } catch (e) {
        console.warn('AIProvider: re-init failed', e);
        setInitFailed(true);
      } finally {
        reinitRef.current = false;
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'preferred_model' || e.key === 'nexus_debug_provider') {
        void reinitIfChanged();
      }
    };
    const handleCustom = () => { void reinitIfChanged(); };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('nexus_model_changed', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('nexus_model_changed', handleCustom);
    };
  }, [agent, guestMode]);

  /** Empty StructuredResponse returned when the agent is unavailable (degraded mode). */
  const degradedResponse = useCallback((context: ConversationContext) => ({
    response: {
      fullText: '',
      publicText: '',
      internalThoughts: null,
      actions: [],
      isInterrupted: false,
    } satisfies StructuredResponse,
    updatedHistory: context.history,
  }), []);

  const sendMessage = useCallback(async (content: MessageContent, context: ConversationContext, signal?: AbortSignal) => {
      if (!agent) {
        throw new Error('AI Engine is currently unavailable (initialization failed or missing API keys).');
      }
      const result = await agent.chat(content, context, undefined, signal);
      return result;
  }, [agent]);

  const streamMessage = useCallback(async (content: MessageContent, context: ConversationContext, onChunk: (chunk: StreamChunk) => void, signal?: AbortSignal) => {
      if (!agent) {
        throw new Error('AI Engine is currently unavailable (initialization failed or missing API keys).');
      }
      const safeChunk = (chunk: StreamChunk) => {
        try { onChunk(chunk); } catch (e) { console.warn('onChunk callback error:', e); }
      };
      const result = await agent.chat(content, context, safeChunk, signal);
      return result;
  }, [agent]);

  const generateJSON = useCallback(async (prompt: string, options?: any) => {
    if (!agent) throw new Error('AI agent unavailable');
    return agent.generateJSON(prompt, options);
  }, [agent]);

  const analyzeImage = useCallback(async (imageDataUrl: string, prompt: string, options?: any) => {
    if (!agent) throw new Error('AI agent unavailable');
    return agent.analyzeImage(imageDataUrl, prompt, options);
  }, [agent]);

  const analyzeImageJSON = useCallback(async (imageDataUrl: string, prompt: string, options?: any) => {
    if (!agent) throw new Error('AI agent unavailable');
    return agent.analyzeImageJSON(imageDataUrl, prompt, options);
  }, [agent]);

  const aiContextValue = useMemo(
    () => ({
      sendMessage,
      streamMessage,
      generateJSON,
      analyzeImage,
      analyzeImageJSON,
      activeModelId: runtimeModelId,
      activeProvider: runtimeProvider,
      isInitialized,
      initFailed
    }),
    [sendMessage, streamMessage, generateJSON, analyzeImage, analyzeImageJSON, runtimeModelId, runtimeProvider, isInitialized, initFailed]
  );

  return (
    <AIContext.Provider value={aiContextValue}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) throw new Error("useAI must be used within AIProvider");
  return context;
}
