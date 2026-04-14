/**
 * App-facing LLM runtime entrypoint.
 * See docs/architecture/llm-entrypoint-runtime.md for the boot chain,
 * runtime modes, and extension boundaries.
 */
import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from 'react';
import { Message, ConversationContext, MessageContent } from './types';
import { CognitiveAgent } from './engine/CognitiveAgent';
import { EngineConfig, StructuredResponse, StreamChunk } from './engine/types';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';
import { getCredentialStore } from './credential-store-bridge';

function deriveProvider(config: Pick<EngineConfig, 'openrouterKey' | 'grokKey' | 'googleKey' | 'isMockMode'>): 'openrouter' | 'grok' | 'google' | 'mock' {
  if (config.isMockMode) return 'mock';
  if (config.openrouterKey) return 'openrouter';
  if (config.grokKey) return 'grok';
  if (config.googleKey) return 'google';
  return 'mock';
}

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
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
}

export function AIProvider({ children, guestMode, userId, encryptionKey }: AIProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initFailed, setInitFailed] = useState(false);
  const [agent, setAgent] = useState<CognitiveAgent | null>(null);
  const [runtimeModelId, setRuntimeModelId] = useState<string | null>(null);
  const [runtimeProvider, setRuntimeProvider] = useState<'openrouter' | 'grok' | 'google' | 'mock' | null>(null);
  const initRef = useRef(false);
  const reinitRef = useRef(false);
  const lastConfigRef = useRef<{ model: string | null; provider: string | null; guest: boolean; hasCredentialStore: boolean } | null>(null);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
        // Try credential store path when user context is available.
        const credentialStore = getCredentialStore(userId ?? null, encryptionKey ?? null);

        // Legacy key resolution (fallback when credential store unavailable or for env vars).
        // SECURITY: These localStorage reads are a legacy path. Keys stored here are
        // vulnerable to XSS exfiltration. The credential store path above encrypts
        // keys in Firestore and auto-migrates localStorage keys on first read.
        const openrouterKey = resolveOpenRouterKey();
        const grokKey = localStorage.getItem('VITE_GROK_API_KEY') || import.meta.env.VITE_GROK_API_KEY;
        const googleKey = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;
        const preferredProvider = (localStorage.getItem('nexus_debug_provider') as 'openrouter' | 'grok' | 'google' | null) || undefined;
        const safePreferredProvider =
          preferredProvider === 'openrouter' && !openrouterKey ? undefined : preferredProvider;

        const config: EngineConfig = credentialStore
          ? {
              credentialStore,
              preferredModelId: localStorage.getItem('preferred_model') || undefined,
              preferredProvider: safePreferredProvider,
              isMockMode: false,
              freeModelsOnly: guestMode,
            }
          : {
              openrouterKey,
              grokKey,
              googleKey,
              preferredModelId: localStorage.getItem('preferred_model') || undefined,
              preferredProvider: safePreferredProvider,
              isMockMode: !openrouterKey && !grokKey && !googleKey,
              freeModelsOnly: guestMode,
            };

        const newAgent = new CognitiveAgent(config);
        await newAgent.initialize();

        setAgent(newAgent);
        setRuntimeModelId(config.freeModelsOnly ? 'google/gemini-2.0-flash:free' : (config.preferredModelId ?? null));
        setRuntimeProvider(credentialStore ? (safePreferredProvider ?? 'openrouter') : deriveProvider(config));
        setInitFailed(false);
        setIsInitialized(true);
    };

    const timer = setTimeout(() => {
        console.warn("AIProvider: initialization timed out after 8s. Running in degraded mode.");
        setInitFailed(true);
    }, 8000);

    init()
      .catch((e) => {
        console.warn('AIProvider: initialization failed', e);
        setInitFailed(true);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (agent) {
      agent.setFreeModelsOnly(!!guestMode);
      setRuntimeModelId(guestMode ? 'google/gemini-2.0-flash:free' : (localStorage.getItem('preferred_model') || null));
    }
  }, [guestMode, agent]);

  useEffect(() => {
    // Skip while the initial mount effect is still in-flight.
    if (!initRef.current) return;

    const readConfig = () => ({
      model: localStorage.getItem('preferred_model'),
      provider: localStorage.getItem('nexus_debug_provider'),
      guest: !!guestMode,
      hasCredentialStore: !!getCredentialStore(userId ?? null, encryptionKey ?? null),
    });

    // When agent is null (initial init failed or timed out) we still need to
    // attempt initialization with the updated credentials.  The `forceInit`
    // flag skips the deduplication check so we always try at least once.
    const forceInit = !agent;
    if (!forceInit) {
      lastConfigRef.current = readConfig();
    }

    const reinitIfChanged = async (force = false) => {
      const next = readConfig();
      const prev = lastConfigRef.current;
      if (!force && prev && prev.model === next.model && prev.provider === next.provider && prev.guest === next.guest && prev.hasCredentialStore === next.hasCredentialStore) return;
      if (reinitRef.current) return;
      reinitRef.current = true;
      lastConfigRef.current = next;
      try {
        const credentialStore = getCredentialStore(userId ?? null, encryptionKey ?? null);

        const openrouterKey = resolveOpenRouterKey();
        const grokKey = localStorage.getItem('VITE_GROK_API_KEY') || import.meta.env.VITE_GROK_API_KEY;
        const googleKey = localStorage.getItem('VITE_GOOGLE_API_KEY') || import.meta.env.VITE_GOOGLE_API_KEY;
        const preferredProvider = (localStorage.getItem('nexus_debug_provider') as 'openrouter' | 'grok' | 'google' | null) || undefined;
        const safePreferredProvider =
          preferredProvider === 'openrouter' && !openrouterKey ? undefined : preferredProvider;

        const config: EngineConfig = credentialStore
          ? {
              credentialStore,
              preferredModelId: localStorage.getItem('preferred_model') || undefined,
              preferredProvider: safePreferredProvider,
              isMockMode: false,
              freeModelsOnly: !!guestMode,
            }
          : {
              openrouterKey,
              grokKey,
              googleKey,
              preferredModelId: localStorage.getItem('preferred_model') || undefined,
              preferredProvider: safePreferredProvider,
              isMockMode: !openrouterKey && !grokKey && !googleKey,
              freeModelsOnly: !!guestMode,
            };

        const newAgent = new CognitiveAgent(config);
        await newAgent.initialize();
        setAgent(newAgent);
        setRuntimeModelId(config.freeModelsOnly ? 'google/gemini-2.0-flash:free' : (config.preferredModelId ?? null));
        setRuntimeProvider(credentialStore ? (safePreferredProvider ?? 'openrouter') : deriveProvider(config));
        setInitFailed(false);
        setIsInitialized(true);
      } catch (e) {
        console.warn('AIProvider: re-init failed', e);
        setInitFailed(true);
      } finally {
        reinitRef.current = false;
      }
    };

    // If initial init failed and credentials have arrived, retry immediately.
    if (forceInit) {
      void reinitIfChanged(true);
    }

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
  }, [agent, guestMode, userId, encryptionKey]);

  /** Empty StructuredResponse returned when the agent is unavailable (degraded mode). */
  const degradedResponse = useCallback((context: ConversationContext) => ({
    response: {
      fullText: '',
      publicText: '',
      internalThoughts: null,
      actions: [],
      mutations: [],
      isInterrupted: false,
    } satisfies StructuredResponse,
    updatedHistory: context.history,
  }), []);

  const sendMessage = useCallback(async (content: MessageContent, context: ConversationContext, signal?: AbortSignal) => {
      if (!agent) {
        return {
          response: {
            fullText: 'AI assistant is unavailable — add an API key in Profile settings.',
            publicText: 'AI assistant is unavailable — add an API key in Profile settings.',
            internalThoughts: null,
            actions: [],
            mutations: [],
            isInterrupted: false,
          } satisfies StructuredResponse,
          updatedHistory: context.history,
        };
      }
      const result = await agent.chat(content, context, undefined, signal);
      return result;
  }, [agent]);

  const streamMessage = useCallback(async (content: MessageContent, context: ConversationContext, onChunk: (chunk: StreamChunk) => void, signal?: AbortSignal) => {
      if (!agent) {
        const offlineText = 'AI assistant is unavailable — add an API key in Profile settings.';
        onChunk({ delta: offlineText, isThinking: false, isActing: false, currentActionType: null } satisfies StreamChunk);
        return {
          response: {
            fullText: offlineText,
            publicText: offlineText,
            internalThoughts: null,
            actions: [],
            mutations: [],
            isInterrupted: false,
          } satisfies StructuredResponse,
          updatedHistory: context.history,
        };
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
