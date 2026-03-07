import { useState, useCallback, useEffect, useRef } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '../global-soul-context';
import { useAuth } from '../auth-context';
import { Message, GuestQuota, NeuralStateVectorPatch, SpineEventType } from '../types';
import { GuestQuotaService } from '../services/guest-quota-service';
import { ModuleMemoryService } from '../services/module-memory-service';
import { PersonaFactory } from '@/llm-engine/persona-factory';
import { GlobalProjectionService } from '../services/global-projection-service';
import { Spine } from '../spine/spine-event-bus';
import { NexusHandoffService } from '../services/nexus-handoff-service';
import { ActionHub } from '../actions/action-hub';
import { getUncalibratedOwnedMetrics } from '../services/nsv-ownership';
import type { ModuleId } from '../module-manifest';
import { useMemoryIntegration } from './useMemoryIntegration';
import { useConsolidation } from './useConsolidation';
import { useHandoffProcessor } from './useHandoffProcessor';

interface UseModuleAIOptions {
  moduleId: string;
  systemPrompt: string;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
}

const MEMORY_SECTION_CHAR_LIMIT = 1800;
const MAX_MESSAGES = 200;

function trimToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 12)).trim()}...`;
}

export function useModuleAI({ moduleId, systemPrompt: baseRole, encryptionKey, navigateTo }: UseModuleAIOptions) {
  const { streamMessage, sendMessage } = useAI();
  const { enhanceContext, enhanceContextForModule, globalSoul } = useGlobalSoul();
  const { user, isGuest, profile } = useAuth();

  // Resolve which context enhancer to use:
  // - orchestrator (Nexus) gets full NSV via enhanceContext
  // - all other modules get filtered NSV via enhanceContextForModule
  const resolvedEnhanceContext = useCallback((context: Parameters<typeof enhanceContext>[0]) => {
    if (moduleId === 'orchestrator') {
      return enhanceContext(context);
    }
    return enhanceContextForModule(context, moduleId as import('@/lib/module-manifest').ModuleId);
  }, [moduleId, enhanceContext, enhanceContextForModule]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<GuestQuota>(GuestQuotaService.getQuota());
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const lastRemoteSignatureRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  // Tracks whether the last setMessages was from hydration (subscription echo)
  // so the save effect can skip the redundant echo-write.
  const hydratedFromRemoteRef = useRef(false);
  const currentAssistantMessageBodyRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const handleSendMessageRef = useRef<((content: string) => void) | null>(null);

  // C-1: Abort in-flight stream on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    Spine.setUser(user?.uid ?? null);
  }, [user?.uid]);

  // --- Sub-hooks ---

  const { retrieveMemoryContext } = useMemoryIntegration({
    moduleId,
    userId: user?.uid,
    isGuest: !!isGuest
  });

  const { consolidateIfNeeded, resetConsolidation } = useConsolidation({
    moduleId,
    userId: user?.uid,
    isGuest: !!isGuest,
    sendMessage,
    enhanceContext: resolvedEnhanceContext,
    mountedRef
  });

  const { classifyAndRoute, storeDelegation, handlePendingQueryResult } = useHandoffProcessor({
    moduleId,
    isHydrating,
    messagesCount: messages.length,
    setMessages,
    onSendMessageRef: handleSendMessageRef,
    sendMessage,
    mountedRef
  });

  // Hydrate active session on mount + subscribe for cross-tab sync
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    if (user && !isGuest) {
      unsubscribe = ModuleMemoryService.subscribeActiveSession(user.uid, moduleId, (session) => {
        if (!mounted) return;
        if (session && session.history.length > 0) {
          const signature = `${session.lastMessageAt}:${session.history.length}`;
          if (signature !== lastRemoteSignatureRef.current) {
            lastRemoteSignatureRef.current = signature;
            hydratedFromRemoteRef.current = true;
            setMessages(session.history);
            sessionStartRef.current = session.startTime || new Date().toISOString();
          }
        }
        setIsHydrating(false);
      });
    } else {
      // Guest/impromptu: try restoring from sessionStorage
      try {
        const cached = sessionStorage.getItem(`nexus_session_${moduleId}`);
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          if (parsed?.history?.length > 0) {
            setMessages(parsed.history);
            sessionStartRef.current = parsed.startTime || new Date().toISOString();
          }
        }
      } catch { /* ignore parse errors */ }
      setIsHydrating(false);
    }

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user, isGuest, moduleId]);

  // Save active session to Firestore with debounce; guest sessions to sessionStorage
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const flushActiveSession = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    let currentMessages = [...messagesRef.current];

    // If we are currently processing a stream, include the partial content
    // so it's not lost on page reload/unmount.
    if (isProcessingRef.current && currentAssistantMessageBodyRef.current.trim()) {
        currentMessages = [...currentMessages, { role: 'assistant', content: currentAssistantMessageBodyRef.current } as Message];
    }

    if (currentMessages.length === 0) return;

    if (user && !isGuest) {
      const lastMessageAt = new Date().toISOString();
      lastRemoteSignatureRef.current = `${lastMessageAt}:${currentMessages.length}`;
      ModuleMemoryService.saveActiveSession(user.uid, {
        sessionId: 'current',
        moduleId,
        startTime: sessionStartRef.current,
        lastMessageAt,
        history: currentMessages,
        tokenCount: 0,
        isGuestTrial: false
      }).catch((e) => console.error('Failed to save active session:', e));
    }

    // Always persist to sessionStorage as a lightweight fallback
    try {
      sessionStorage.setItem(`nexus_session_${moduleId}`, JSON.stringify({
        history: currentMessages,
        startTime: sessionStartRef.current,
        savedAt: new Date().toISOString()
      }));
    } catch { /* sessionStorage full or unavailable */ }
  }, [user, isGuest, moduleId]);

  useEffect(() => {
    if (isHydrating || messages.length === 0) return;
    // Skip echo-save when messages were just hydrated from Firestore — writing
    // the same data back is a no-op that wastes a write and triggers the
    // onSnapshot callback unnecessarily.
    if (hydratedFromRemoteRef.current) {
      hydratedFromRemoteRef.current = false;
      return;
    }
    saveTimerRef.current = setTimeout(flushActiveSession, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isHydrating, messages, flushActiveSession]);

  // Flush pending saves on tab close
  useEffect(() => {
    const handleBeforeUnload = () => flushActiveSession();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushActiveSession]);

  const handleSendMessage = useCallback(
    async (content: string, onActionParsed?: (actionType: string, payload: Record<string, unknown>) => void) => {
      if (isProcessingRef.current) return;
      if (isGuest && quota.isHardLocked) return;

      // Show user message and processing state IMMEDIATELY
      const userMsg: Message = { role: 'user', content };
      // H-2: maintain local history to avoid stale-closure issues with setMessages updater
      let localHistory = [...messages, userMsg].slice(-MAX_MESSAGES);
      setMessages(localHistory);
      setIsProcessing(true);
      isProcessingRef.current = true;
      setError(null);
      setStreamingText('');

      // --- Routing classification (delegated to useHandoffProcessor) ---
      const routingResult = await classifyAndRoute(content, messages);
      if (!mountedRef.current) return;

      if (routingResult.shouldDelegate) {
        storeDelegation(routingResult.target!, content, routingResult.reason, routingResult.confidence);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Routing this request to ${routingResult.target}. Open the module to continue.` }
        ]);
        isProcessingRef.current = false;
        setIsProcessing(false);
        return;
      }

      if (messages.length === 0) {
        Spine.emit({
          type: 'SESSION_STARTED',
          source: moduleId,
          domain: 'system',
          data: { moduleId },
          cascadeDepth: 0,
          priority: 'info'
        });
      }

      if (isGuest) {
        setQuota(GuestQuotaService.incrementTurn());
      }

      try {
        // --- Memory retrieval (delegated to useMemoryIntegration) ---
        const recentHistorySlice = messages.slice(-3).map((msg) => `${msg.role}: ${msg.content}`).join('\n');
        const memoryQuery = `${content}\n${recentHistorySlice}`;
        const { recalledSessionsSummary, recalledFactsSummary } = await retrieveMemoryContext(memoryQuery);

        const uncalibrated = globalSoul
          ? getUncalibratedOwnedMetrics(globalSoul.crossFunctionalState, moduleId as ModuleId)
          : [];

        const calibrationDirective = uncalibrated.length
          ? `\n[UNCALIBRATED_OWNED_METRICS]\n${uncalibrated.map((metric) => `- ${metric}`).join('\n')}\n` +
            'If any owned metrics are uncalibrated, prioritize asking for the missing values before moving on.'
          : '';

        const finalSystemPrompt = `${PersonaFactory.generateSystemPrompt({
          moduleId,
          baseRole,
          userProfile: profile,
          globalSoul: globalSoul
        })}${calibrationDirective}`;

        const memorySummarySections = [
          `[MODULE]: ${moduleId}`,
          recalledSessionsSummary ? `[RELEVANT PAST SESSIONS]\n${recalledSessionsSummary}` : '',
          recalledFactsSummary ? `[STABLE FACTS]\n${recalledFactsSummary}` : ''
        ]
          .filter(Boolean)
          .join('\n\n');

        const cappedMemorySummary = trimToCharLimit(memorySummarySections, MEMORY_SECTION_CHAR_LIMIT);

        // C-1: create AbortController for this stream
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const { response } = await streamMessage(
          content,
          resolvedEnhanceContext({
            systemPrompt: finalSystemPrompt,
            memoryContext: [],
            summary: cappedMemorySummary || `Active session in ${moduleId}.`,
            history: messages  // history before user message — CognitiveAgent adds user msg
          }),
          (chunk) => {
            setStreamingText((prev) => {
              const next = prev + chunk;
              currentAssistantMessageBodyRef.current = next;
              return next;
            });
          },
          controller.signal
        );
        abortControllerRef.current = null;

        // M-1: guard post-unmount state update
        if (!mountedRef.current) return;

        // --- Action processing ---
        const allowedActions = ActionHub.getAllowedActions(moduleId);
        const soulUpdates: NeuralStateVectorPatch = {};

        const updateGlobalSoul = async (patch: NeuralStateVectorPatch) => {
            for (const key of Object.keys(patch)) {
                const patchKey = key as keyof NeuralStateVectorPatch;
                if (typeof patch[patchKey] === 'object' && patch[patchKey] !== null) {
                    (soulUpdates as Record<string, unknown>)[key] = { ...((soulUpdates as Record<string, unknown>)[key] as Record<string, unknown> || {}), ...(patch[patchKey] as Record<string, unknown>) };
                } else {
                    (soulUpdates as Record<string, unknown>)[key] = patch[patchKey];
                }
            }
        };

        const delegateToModule = (target: string, reason: string, delegationContent: string) => {
             NexusHandoffService.store({
                moduleId: target,
                type: 'delegate',
                content: delegationContent,
                reason,
                sourceModuleId: moduleId,
                createdAt: new Date().toISOString()
            });
            Spine.emit({
                type: 'MODULE_DELEGATED',
                source: moduleId,
                target,
                domain: 'system',
                data: { reason, content: delegationContent },
                cascadeDepth: 0,
                priority: 'info'
            });
        };

        for (const parsedAction of response.actions) {
          const { type, payload } = parsedAction;

          if (!allowedActions.includes(type)) {
            console.warn(`[SchemaGuard] Blocked unauthorized action "${type}" for module "${moduleId}"`);
            continue;
          }

          await ActionHub.execute(moduleId, type, {
            userId: user?.uid,
            isGuest: !!isGuest,
            moduleId,
            payload,
            encryptionKey,
            navigateTo,
            getLatestNSV: () => {
              const baseNSV = globalSoul?.crossFunctionalState || {};
              return { ...baseNSV, ...soulUpdates };
            },
            pushAssistantMessage: (content: string) => {
              if (!content.trim()) return;
              setMessages((prev) => [...prev, { role: 'assistant', content } as Message].slice(-MAX_MESSAGES));
            },
            sendMessage,
            emitSpineEvent: (type: SpineEventType, data: Record<string, unknown>) => Spine.emit({
              type,
              source: moduleId,
              domain: 'system',
              data,
              cascadeDepth: 0,
              priority: 'info'
            }),
            updateGlobalSoul,
            delegateToModule
          });

          if (onActionParsed) onActionParsed(type, payload);
        }

        if (user && !isGuest && Object.keys(soulUpdates).length > 0) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, soulUpdates);

          Spine.emit({
            type: 'VITAL_UPDATED',
            source: moduleId,
            domain: 'system',
            data: soulUpdates,
            cascadeDepth: 0,
            priority: 'alert'
          });
        }

        // M-1: guard post-unmount
        if (!mountedRef.current) return;

        const visibleAssistantText = response.publicText.trim();
        // H-2: update localHistory directly instead of relying on setMessages updater
        if (visibleAssistantText) {
          localHistory = [...localHistory, { role: 'assistant', content: response.publicText } as Message].slice(-MAX_MESSAGES);
          messagesRef.current = localHistory;
          setMessages(localHistory);
        }

        setStreamingText('');
        currentAssistantMessageBodyRef.current = '';

        // Flush immediately after completion
        if (localHistory.length > 0) {
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          if (user && !isGuest) {
            const lastMessageAt = new Date().toISOString();
            lastRemoteSignatureRef.current = `${lastMessageAt}:${localHistory.length}`;
            ModuleMemoryService.saveActiveSession(user.uid, {
              sessionId: 'current',
              moduleId,
              startTime: sessionStartRef.current,
              lastMessageAt,
              history: localHistory,
              tokenCount: 0,
              isGuestTrial: false
            }).catch((e) => console.error('Failed to save completed message:', e));
          }
          try {
            sessionStorage.setItem(`nexus_session_${moduleId}`, JSON.stringify({
              history: localHistory,
              startTime: sessionStartRef.current,
              savedAt: new Date().toISOString()
            }));
          } catch { /* sessionStorage full or unavailable */ }
        }

        // --- Pending query result (delegated to useHandoffProcessor) ---
        handlePendingQueryResult(visibleAssistantText);

        // --- Consolidation (delegated to useConsolidation) ---
        if (visibleAssistantText && user && !isGuest) {
          const consolidationResult = await consolidateIfNeeded(localHistory, sessionStartRef.current);
          if (consolidationResult) {
            setMessages(consolidationResult.trimmedHistory);
            messagesRef.current = consolidationResult.trimmedHistory;
            if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
            lastRemoteSignatureRef.current =
              `${consolidationResult.lastMessageAt}:${consolidationResult.trimmedHistory.length}`;
            ModuleMemoryService.saveActiveSession(user.uid, {
              sessionId: 'current',
              moduleId,
              startTime: sessionStartRef.current,
              lastMessageAt: consolidationResult.lastMessageAt,
              history: consolidationResult.trimmedHistory,
              tokenCount: 0,
              isGuestTrial: false
            }).catch((e) => console.error('Failed to save trimmed session:', e));
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // stream was aborted on unmount — silent
        console.error(`Module ${moduleId} AI link failure:`, e);
        if (mountedRef.current) {
          setError('The neural tunnel encountered an interference packet.');
        }
      } finally {
        if (mountedRef.current) {
          setIsProcessing(false);
        }
        isProcessingRef.current = false;
      }
    },
    [
      messages,
      isGuest,
      quota.isHardLocked,
      baseRole,
      resolvedEnhanceContext,
      moduleId,
      user,
      profile,
      globalSoul,
      sendMessage,
      streamMessage,
      classifyAndRoute,
      storeDelegation,
      retrieveMemoryContext,
      handlePendingQueryResult,
      consolidateIfNeeded
    ]
  );

  // Keep ref in sync for handoff processor effect
  handleSendMessageRef.current = handleSendMessage;

  const clearSession = useCallback(async () => {
    setMessages([]);
    sessionStartRef.current = new Date().toISOString();
    resetConsolidation();  // M-6: reset retry counter on clear
    try { sessionStorage.removeItem(`nexus_session_${moduleId}`); } catch { /* ignore */ }
    if (user && !isGuest) {
      await ModuleMemoryService.clearActiveSession(user.uid, moduleId);
      Spine.emit({
        type: 'SESSION_ENDED',
        source: moduleId,
        domain: 'system',
        data: { moduleId },
        cascadeDepth: 0,
        priority: 'info'
      });
    }
  }, [user, isGuest, moduleId, resetConsolidation]);

  const summarizeSession = useCallback(async (): Promise<string> => {
    if (messages.length < 3) return 'Session was too brief for full synthesis.';
    try {
      const { response } = await sendMessage(
        'Summarize this session in 2 supportive sentences focusing on key takeaways or health indicators.',
        resolvedEnhanceContext({
          systemPrompt: 'You are an analytical supervisor.',
          memoryContext: [],
          summary: 'Summarizing.',
          history: messages
        })
      );
      return response.publicText.trim();
    } catch (e) {
      return 'Session completed and data synchronized.';
    }
  }, [messages, sendMessage, resolvedEnhanceContext]);

  return {
    messages,
    setMessages,
    isProcessing,
    isHydrating,
    streamingText,
    error,
    quota,
    handleSendMessage,
    clearSession,
    summarizeSession
  };
}
