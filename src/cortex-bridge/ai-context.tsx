/**
 * App-facing LLM runtime entrypoint.
 * See docs/architecture/llm-entrypoint-runtime.md for the boot chain,
 * runtime modes, and extension boundaries.
 */
import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from 'react';
import { Message, ConversationContext, MessageContent } from './types';
import { StructuredResponse, StreamChunk } from './engine/types';
import type { CoreUserProfile } from '@/lib/types';
import { CortexRuntime, CortexRuntimeState } from './cortex-runtime';
import { ARA_EVENTS, ARA_STORAGE_KEYS } from './ara-events';

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
  /** KMP-orchestrated stream — PersonaFactory + NSV injection + memory callback all run in KMP. */
  streamWithMemory: (
    content: MessageContent,
    context: ConversationContext & {
      nsvJson: string;
      moduleContextJson: string;
      longTermSummary?: string;
      userProfile?: Pick<CoreUserProfile, 'preferredName' | 'pronouns'> | null;
      retrieveMemory: (query: string) => Promise<string[]>;
    },
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
  activeProvider: 'openrouter' | 'grok' | 'google' | 'mercury' | 'mock' | null;
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
  // Create runtime once via ref to avoid stale closure issues.
  const runtimeRef = useRef<CortexRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = new CortexRuntime();

  const [runtimeState, setRuntimeState] = useState<CortexRuntimeState>(() => runtimeRef.current!.getState());

  // Subscribe to runtime state changes.
  useEffect(() => {
    return runtimeRef.current!.subscribe(setRuntimeState);
  }, []);

  // Cold boot on mount — runs exactly once.
  useEffect(() => {
    runtimeRef.current!.boot({
      userId: userId ?? null,
      encryptionKey: encryptionKey ?? null,
      guestMode: !!guestMode,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconfigure when credentials or guest mode change.
  useEffect(() => {
    runtimeRef.current!.reconfigure({
      userId: userId ?? null,
      encryptionKey: encryptionKey ?? null,
      guestMode: !!guestMode,
    });
  }, [userId, encryptionKey, guestMode]);

  // Storage events for model/provider changes (cross-tab and same-tab custom event).
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === ARA_STORAGE_KEYS.PREFERRED_MODEL || e.key === ARA_STORAGE_KEYS.DEBUG_PROVIDER) {
        runtimeRef.current!.reconfigure({
          userId: userId ?? null,
          encryptionKey: encryptionKey ?? null,
          guestMode: !!guestMode,
        });
      }
    };
    const custom = () =>
      runtimeRef.current!.reconfigure({
        userId: userId ?? null,
        encryptionKey: encryptionKey ?? null,
        guestMode: !!guestMode,
      });
    const credentialsChanged = () =>
      runtimeRef.current!.forceReinit({
        userId: userId ?? null,
        encryptionKey: encryptionKey ?? null,
        guestMode: !!guestMode,
      });
    window.addEventListener('storage', handler);
    window.addEventListener(ARA_EVENTS.MODEL_CHANGED, custom);
    window.addEventListener(ARA_EVENTS.CREDENTIALS_CHANGED, credentialsChanged);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(ARA_EVENTS.MODEL_CHANGED, custom);
      window.removeEventListener(ARA_EVENTS.CREDENTIALS_CHANGED, credentialsChanged);
    };
  }, [userId, encryptionKey, guestMode]);

  // Keep agent in sync with guestMode — free-models flag must update immediately.
  useEffect(() => {
    const { agent } = runtimeState;
    if (agent) {
      agent.setFreeModelsOnly(!!guestMode);
    }
  }, [guestMode, runtimeState]);

  // ── Convenience shorthand ────────────────────────────────────────────────

  const agent = runtimeState.agent;

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
    return agent.chat(content, context, undefined, signal);
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
    return agent.chat(content, context, safeChunk, signal);
  }, [agent]);

  const streamWithMemory = useCallback(async (
    content: MessageContent,
    context: ConversationContext & {
      nsvJson: string;
      moduleContextJson: string;
      longTermSummary?: string;
      userProfile?: Pick<CoreUserProfile, 'preferredName' | 'pronouns'> | null;
      retrieveMemory: (query: string) => Promise<string[]>;
    },
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ) => {
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
    return agent.chatWithMemory(content, context, safeChunk, signal);
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
      streamWithMemory,
      generateJSON,
      analyzeImage,
      analyzeImageJSON,
      activeModelId: runtimeState.modelId,
      activeProvider: runtimeState.provider,
      isInitialized: runtimeState.isReady,
      initFailed: runtimeState.initFailed,
    }),
    [sendMessage, streamMessage, streamWithMemory, generateJSON, analyzeImage, analyzeImageJSON, runtimeState],
  );

  return (
    <AIContext.Provider value={aiContextValue}>
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) throw new Error('useAI must be used within AIProvider');
  return context;
}
