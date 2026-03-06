import { useState, useCallback, useEffect, useRef } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '../global-soul-context';
import { useAuth } from '../auth-context';
import { Message, GuestQuota, GlobalProjection, ModuleMemoryEnvelope, SemanticFact, NeuralStateVectorPatch } from '../types';
import { GuestQuotaService } from '../services/guest-quota-service';
import { ModuleMemoryService } from '../services/module-memory-service';
import { PersonaFactory } from '@/llm-engine/persona-factory';
import { sanitizeJsonPayload, stripInternalTags, stripProviderControlTokens } from '@/llm-engine/sanitize';
import { GlobalProjectionService } from '../services/global-projection-service';
import { EpisodicMemoryService } from '../services/episodic-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import { Spine } from '../spine/spine-event-bus';
import { NexusRoutingService } from '../services/nexus-routing-service';
import { NexusHandoffService } from '../services/nexus-handoff-service';
import { ActionHub } from '../actions/action-hub';
import { getUncalibratedOwnedMetrics } from '../services/nsv-ownership';

interface UseModuleAIOptions {
  moduleId: string;
  systemPrompt: string;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
}

type ParsedAction = {
  type: string;
  payload: any;
};

function parseToolCallPayload(rawJson: string): ParsedAction | null {
  try {
    const parsed = JSON.parse(sanitizeJsonPayload(rawJson)) as { name?: string; arguments?: any };
    if (!parsed?.name || typeof parsed.name !== 'string') return null;

    let payload = parsed.arguments ?? {};
    if (typeof payload === 'string') {
      payload = JSON.parse(sanitizeJsonPayload(payload));
    }
    if (!payload || typeof payload !== 'object') payload = {};

    return {
      type: parsed.name,
      payload
    };
  } catch (e) {
    console.error('Failed to parse <tool_call> payload:', e);
    return null;
  }
}

import { MemoryOrchestrator } from '../services/memory-orchestrator';

const CONSOLIDATION_TOKEN_LIMIT = 3200;
const CONSOLIDATION_KEEP_COUNT = 12;
const MEMORY_SECTION_CHAR_LIMIT = 1800;
const MAX_MESSAGES = 200;

function estimateTokenCount(history: Message[]): number {
  const totalChars = history.reduce((sum, msg) => sum + msg.content.length, 0);
  return Math.ceil(totalChars / 4);
}

function trimToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 12)).trim()}...`;
}

export function useModuleAI({ moduleId, systemPrompt: baseRole, encryptionKey, navigateTo }: UseModuleAIOptions) {
  const { streamMessage, sendMessage } = useAI();
  const { enhanceContext, globalSoul, refreshGlobalSoul } = useGlobalSoul();
  const { user, isGuest, profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<GuestQuota>(GuestQuotaService.getQuota());
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const consolidationRef = useRef(false);
  const episodicEnvelopeRef = useRef<Record<string, ModuleMemoryEnvelope | null>>({});
  const episodicReadyRef = useRef<Record<string, boolean>>({});
  const semanticFactsRef = useRef<SemanticFact[]>([]);
  const semanticReadyRef = useRef(false);
  const lastRemoteSignatureRef = useRef<string | null>(null);
  const handoffProcessedRef = useRef(false);
  const pendingQueryRef = useRef<{ origin: string; issuedAt: string } | null>(null);
  const skipRoutingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const currentAssistantMessageBodyRef = useRef('');

  useEffect(() => {
    Spine.setUser(user?.uid ?? null);
  }, [user?.uid]);

  useEffect(() => {
    handoffProcessedRef.current = false;
  }, [moduleId]);

  useEffect(() => {
    if (!user || isGuest) {
      episodicEnvelopeRef.current = {};
      episodicReadyRef.current = {};
      semanticFactsRef.current = [];
      semanticReadyRef.current = false;
      return;
    }

    const moduleIds = Array.from(new Set([moduleId, 'orchestrator']));
    const unsubs = moduleIds.map((id) =>
      ModuleMemoryService.subscribeEnvelope(user.uid, id, (envelope) => {
        episodicEnvelopeRef.current[id] = envelope;
        episodicReadyRef.current[id] = true;
      })
    );

    const semanticUnsub = SemanticMemoryService.subscribeFacts(user.uid, (facts) => {
      semanticFactsRef.current = facts;
      semanticReadyRef.current = true;
    });

    return () => {
      unsubs.forEach((unsub) => unsub());
      semanticUnsub();
    };
  }, [user?.uid, isGuest, moduleId]);

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
            setMessages(session.history);
            sessionStartRef.current = session.startTime || new Date().toISOString();
          }
        }
        setIsHydrating(false);
      });
    } else {
      // Guest/impromptu: try restoring from sessionStorage
      try {
        const cached = sessionStorage.getItem(`agnes_session_${moduleId}`);
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
      sessionStorage.setItem(`agnes_session_${moduleId}`, JSON.stringify({
        history: currentMessages,
        startTime: sessionStartRef.current,
        savedAt: new Date().toISOString()
      }));
    } catch { /* sessionStorage full or unavailable */ }
  }, [user, isGuest, moduleId]);

  useEffect(() => {
    if (isHydrating || messages.length === 0) return;
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

  useEffect(() => {
    return () => {
      episodicEnvelopeRef.current = {};
      episodicReadyRef.current = {};
      semanticFactsRef.current = [];
      semanticReadyRef.current = false;
      consolidationRef.current = false;
    };
  }, []);

  const handleSendMessage = useCallback(
    async (content: string, onActionParsed?: (actionType: string, payload: any) => void) => {
      if (isProcessingRef.current) return;
      if (isGuest && quota.isHardLocked) return;

      // Show user message and processing state IMMEDIATELY
      const userMsg: Message = { role: 'user', content };
      setMessages((prev) => [...prev, userMsg].slice(-MAX_MESSAGES));
      setIsProcessing(true);
      isProcessingRef.current = true;
      setError(null);
      setStreamingText('');

      if (moduleId !== 'orchestrator' && !skipRoutingRef.current) {
        try {
          const { response: routeResp } = await Promise.race([
            sendMessage(content, {
              systemPrompt: "You are a routing intent classifier. Return ONLY a single <action> tag.",
              memoryContext: [],
              summary: "Classifying intent.",
              history: messages
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Routing classification timeout')), 5000))
          ]);
          
          const routeHint = routeResp.actions.find(a => a.type === 'delegate_to_module')?.payload;
          const shouldDelegate =
            routeHint?.target &&
            routeHint.target !== moduleId &&
            (routeHint.confidence || 0) >= 0.62;

          if (shouldDelegate) {
            NexusHandoffService.store({
              moduleId: routeHint.target,
              type: 'delegate',
              content,
              reason: routeHint.reason,
              sourceModuleId: moduleId,
              createdAt: new Date().toISOString()
            });

            Spine.emit({
              type: 'MODULE_DELEGATED',
              source: moduleId,
              target: routeHint.target,
              domain: 'system',
              data: {
                content,
                confidence: routeHint.confidence,
                reason: routeHint.reason
              },
              cascadeDepth: 0,
              priority: 'info'
            });

            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `Routing this request to ${routeHint.target}. Open the module to continue.`
              }
            ]);
            isProcessingRef.current = false;
            setIsProcessing(false);
            return;
          }
        } catch (e) {
          console.warn('Nexus routing gate failed, continuing in current module.', e);
        }
      }
      if (skipRoutingRef.current) {
        skipRoutingRef.current = false;
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
        const recentHistorySlice = messages.slice(-3).map((msg) => `${msg.role}: ${msg.content}`).join('\n');
        const memoryQuery = `${content}\n${recentHistorySlice}`;

        let recalledSessionsSummary = '';
        let recalledFactsSummary = '';

        if (user && !isGuest) {
          const relevantModuleIds = Array.from(new Set([moduleId, 'orchestrator']));
          const cachedEnvelopes = relevantModuleIds
            .map((id) => episodicEnvelopeRef.current[id])
            .filter((env): env is ModuleMemoryEnvelope => Boolean(env));
          const episodicReady = relevantModuleIds.every((id) => episodicReadyRef.current[id]);

          const result = await MemoryOrchestrator.retrieveContext(
            user.uid,
            moduleId,
            memoryQuery,
            cachedEnvelopes,
            episodicReady,
            semanticReadyRef.current,
            semanticFactsRef.current
          );

          recalledSessionsSummary = result.recalledSessionsSummary;
          recalledFactsSummary = result.recalledFactsSummary;
        }

        const uncalibrated = globalSoul
          ? getUncalibratedOwnedMetrics(globalSoul.crossFunctionalState, moduleId as any)
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

        const { response } = await streamMessage(
          content,
          enhanceContext({
            systemPrompt: finalSystemPrompt,
            memoryContext: [],
            summary: cappedMemorySummary || `Active session in ${moduleId}.`,
            history: messages
          }),
          (chunk) => {
            setStreamingText((prev) => {
              const next = prev + chunk;
              currentAssistantMessageBodyRef.current = next;
              return next;
            });
          }
        );

        const allowedActions = ActionHub.getAllowedActions(moduleId);
        const soulUpdates: NeuralStateVectorPatch = {};

        const updateGlobalSoul = async (patch: any) => {
            for (const key of Object.keys(patch)) {
                if (typeof patch[key] === 'object' && patch[key] !== null) {
                    (soulUpdates as any)[key] = { ...((soulUpdates as any)[key] || {}), ...patch[key] };
                } else {
                    (soulUpdates as any)[key] = patch[key];
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
              // Merge current global soul with any local soulUpdates from this turn
              const baseNSV = globalSoul?.crossFunctionalState || {};
              return { ...baseNSV, ...soulUpdates };
            },
            pushAssistantMessage: (content: string) => {
              if (!content.trim()) return;
              setMessages((prev) => [...prev, { role: 'assistant', content } as Message].slice(-MAX_MESSAGES));
            },
            sendMessage,
            emitSpineEvent: (type: string, data: any) => Spine.emit({ 
              type: type as any, 
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
          await refreshGlobalSoul();

          Spine.emit({
            type: 'VITAL_UPDATED',
            source: moduleId,
            domain: 'system',
            data: soulUpdates,
            cascadeDepth: 0,
            priority: 'alert'
          });
        }

        const visibleAssistantText = response.publicText.trim();
        let nextHistory: Message[] | null = null;
        if (visibleAssistantText) {
          setMessages((prev) => {
            const updated = [...prev, { role: 'assistant', content: response.publicText } as Message].slice(-MAX_MESSAGES);
            // Update ref immediately so beforeunload/flush captures this
            messagesRef.current = updated;
            nextHistory = updated;
            return updated;
          });
        }

        setStreamingText('');
        currentAssistantMessageBodyRef.current = '';

        // Flush immediately after completion so the assistant message is persisted
        // even if the user reloads before the 1500ms debounce fires
        const historyToSave = nextHistory as Message[] | null;
        if (historyToSave && historyToSave.length > 0) {
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          if (user && !isGuest) {
            const lastMessageAt = new Date().toISOString();
            lastRemoteSignatureRef.current = `${lastMessageAt}:${historyToSave.length}`;
            ModuleMemoryService.saveActiveSession(user.uid, {
              sessionId: 'current',
              moduleId,
              startTime: sessionStartRef.current,
              lastMessageAt,
              history: historyToSave,
              tokenCount: 0,
              isGuestTrial: false
            }).catch((e) => console.error('Failed to save completed message:', e));
          }
          try {
            sessionStorage.setItem(`agnes_session_${moduleId}`, JSON.stringify({
              history: historyToSave,
              startTime: sessionStartRef.current,
              savedAt: new Date().toISOString()
            }));
          } catch { /* sessionStorage full or unavailable */ }
        }

        if (visibleAssistantText && pendingQueryRef.current) {
          const queryContext = pendingQueryRef.current;
          pendingQueryRef.current = null;
          const origin = queryContext.origin || 'orchestrator';
          NexusHandoffService.store({
            moduleId: origin,
            type: 'query_result',
            content: trimToCharLimit(visibleAssistantText, 1200),
            reason: 'query_result',
            sourceModuleId: moduleId,
            createdAt: new Date().toISOString()
          });
          Spine.emit({
            type: 'MODULE_DELEGATED',
            source: moduleId,
            target: origin,
            domain: 'system',
            data: {
              content: visibleAssistantText,
              reason: 'query_result'
            },
            cascadeDepth: 0,
            priority: 'info'
          });
        }

        if (nextHistory && user && !isGuest) {
          const tokenEstimate = estimateTokenCount(nextHistory);
          if (tokenEstimate >= CONSOLIDATION_TOKEN_LIMIT && !consolidationRef.current) {
            consolidationRef.current = true;
            try {
              const { response: consolidation } = await sendMessage(
                'Summarize the session. Format EXACTLY:\nSUMMARY: <2-3 sentences>\nINSIGHTS:\n- <insight 1>\n- <insight 2>\n- <insight 3>',
                enhanceContext({
                  systemPrompt: 'You are a memory consolidation agent. Be concise and factual.',
                  memoryContext: [],
                  summary: 'Consolidating session memory.',
                  history: nextHistory
                })
              );

              const parsed = MemoryOrchestrator.parseInsightLines(consolidation.fullText);
              const summary = parsed.summary || 'Session consolidated.';
              const keyInsights = parsed.insights;

              const existing = await ModuleMemoryService.getEnvelope(user.uid, moduleId);
              if (!existing) {
                await ModuleMemoryService.initializeEnvelope(user.uid, moduleId);
              }

              await ModuleMemoryService.commitSession(
                user.uid,
                moduleId,
                {
                  id: `${moduleId}_auto_${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  summary,
                  keyInsights,
                  sentiment: 0,
                  tokenUsage: tokenEstimate
                },
                JSON.stringify({
                  moduleId,
                  consolidatedAt: new Date().toISOString(),
                  history: nextHistory
                })
              );

              // Trim only after snapshot is confirmed saved
              setMessages((prev) => {
                const trimmed = prev.slice(-CONSOLIDATION_KEEP_COUNT);
                // Immediately persist trimmed state to prevent stale active session
                const lastMessageAt = new Date().toISOString();
                lastRemoteSignatureRef.current = `${lastMessageAt}:${trimmed.length}`;
                ModuleMemoryService.saveActiveSession(user.uid, {
                  sessionId: 'current',
                  moduleId,
                  startTime: sessionStartRef.current,
                  lastMessageAt,
                  history: trimmed,
                  tokenCount: 0,
                  isGuestTrial: false
                }).catch((e) => console.error('Failed to save trimmed session:', e));
                return trimmed;
              });
            } catch (e) {
              console.error('Failed to consolidate session:', e);
            } finally {
              consolidationRef.current = false;
            }
          }
        }
      } catch (e: any) {
        console.error(`Module ${moduleId} AI link failure:`, e);
        setError('The neural tunnel encountered an interference packet.');
      } finally {
        setIsProcessing(false);
        isProcessingRef.current = false;
      }
    },
    [
      messages,
      isGuest,
      quota.isHardLocked,
      baseRole,
      enhanceContext,
      moduleId,
      user,
      profile,
      globalSoul,
      sendMessage,
      streamMessage,
      refreshGlobalSoul
    ]
  );

  useEffect(() => {
    if (handoffProcessedRef.current) return;
    if (isHydrating || messages.length > 0) return;

    const handoff = NexusHandoffService.consume(moduleId);
    if (!handoff) {
      handoffProcessedRef.current = true;
      return;
    }

    handoffProcessedRef.current = true;
    const handoffNote = handoff.content
      ? `Nexus handoff: ${handoff.content}`
      : 'Nexus handoff received.';

    if (handoff.type === 'delegate') {
      setMessages((prev) => (prev.length === 0 ? [{ role: 'assistant', content: handoffNote }] : prev));
      if (handoff.content) {
        queueMicrotask(() => {
          skipRoutingRef.current = true;
          handleSendMessage(handoff.content);
        });
      }
      return;
    }

    if (handoff.type === 'query' && handoff.content) {
      setMessages((prev) => (prev.length === 0 ? [{ role: 'assistant', content: handoffNote }] : prev));
      pendingQueryRef.current = {
        origin: handoff.sourceModuleId || 'orchestrator',
        issuedAt: handoff.createdAt
      };
      queueMicrotask(() => {
        skipRoutingRef.current = true;
        handleSendMessage(handoff.content);
      });
    }

    if (handoff.type === 'query_result' && handoff.content) {
      const sourceLabel = handoff.sourceModuleId ? ` from ${handoff.sourceModuleId}` : '';
      const note = `Nexus query result${sourceLabel}: ${handoff.content}`;
      setMessages((prev) => (prev.length === 0 ? [{ role: 'assistant', content: note }] : [...prev, { role: 'assistant', content: note }]));
    }
  }, [isHydrating, messages.length, moduleId, handleSendMessage]);

  const clearSession = useCallback(async () => {
    setMessages([]);
    sessionStartRef.current = new Date().toISOString();
    try { sessionStorage.removeItem(`agnes_session_${moduleId}`); } catch { /* ignore */ }
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
  }, [user, isGuest, moduleId]);

  const summarizeSession = useCallback(async (): Promise<string> => {
    if (messages.length < 3) return 'Session was too brief for full synthesis.';
    try {
      const { response } = await sendMessage(
        'Summarize this session in 2 supportive sentences focusing on key takeaways or health indicators.',
        enhanceContext({
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
  }, [messages, sendMessage, enhanceContext]);

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
