/**
 * Main app-layer adapter between module UIs and the LLM runtime boundary.
 * See docs/architecture/llm-entrypoint-runtime.md for the full message flow.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAI } from '@/llm-engine/ai-context';
import { useGlobalSoul } from '../global-soul-context';
import { useAuth } from '../auth-context';
import { Message, MessageContent, GuestQuota, ContextPolicy, NeuralStateVectorPatch } from '../types';
import { GuestQuotaService } from '../services/guest-quota-service';
import { ModuleMemoryService } from '../services/module-memory-service';
import { PersonaFactory } from '@/lib/ai-adapters/persona-factory';
import { GlobalProjectionService } from '../services/global-projection-service';
import { Spine } from '../spine/spine-event-bus';
import { ActionHub } from '../actions/action-hub';
import { getActionLabel } from '../actions/action-labels';
import { useMemoryIntegration, MemoryContext } from './useMemoryIntegration';
import { useConsolidation } from './useConsolidation';
import { useHandoffProcessor } from './useHandoffProcessor';
import { usePendingRecovery } from './use-pending-recovery';
import { MODULE_MANIFEST } from '../module-manifest';
import { NexusLogger } from '@/lib/nexus-logger';
import { useDebugMode } from '@/lib/hooks/use-debug-mode';
import { parseDocumentUploadMessage, summarizeDocumentUploadMessage } from '@/lib/services/document-upload-message';
import { useOrchestrationStore } from '@/lib/stores/orchestration-store';
import { OrchestrationHistoryService } from '@/lib/services/orchestration-history-service';
import { OrchestrationInteractionGateService } from '@/lib/services/orchestration-interaction-gate-service';
import { OrchestrationActionGateService } from '@/lib/services/orchestration-action-gate-service';
import { OrchestrationPersistenceService } from '@/lib/services/orchestration-persistence-service';
import { OrchestrationRuntimeService } from '@/lib/services/orchestration-runtime-service';
import type { ParsedCommandEnvelope } from '@/lib/contracts/command-intelligence';
import { CommandIntelligenceService } from '@/lib/services/command-intelligence-service';
import { MasterThreadService } from '@/lib/services/master-thread-service';
import { ModuleAIActionExecutionService } from '@/lib/services/module-ai-action-execution-service';
import { NexusActionPlannerService } from '@/lib/services/nexus-action-planner-service';
import { NexusActionDispatchExecutionService } from '@/lib/services/nexus-action-dispatch-execution-service';

export type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

interface UseModuleAIOptions {
  moduleId: string;
  systemPrompt: string;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
  sessionId?: string;
  contextPolicy?: ContextPolicy;
  persistencePolicy?: PersistencePolicy;
  onError?: (error: unknown) => void;
}

const MEMORY_SECTION_CHAR_LIMIT = 1800;
const MAX_MESSAGES = 200;

function trimToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 12)).trim()}...`;
}

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') {
    const upload = parseDocumentUploadMessage(content);
    if (upload) return summarizeDocumentUploadMessage(upload);
    return content;
  }
  return content
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join(' ');
}

function normalizeContentForAI(content: MessageContent): MessageContent {
  if (typeof content === 'string') {
    const upload = parseDocumentUploadMessage(content);
    if (upload) return summarizeDocumentUploadMessage(upload);
    return content;
  }
  return content;
}

function mergeSoulPatch(target: NeuralStateVectorPatch, patch: NeuralStateVectorPatch) {
  for (const key of Object.keys(patch)) {
    const patchKey = key as keyof NeuralStateVectorPatch;
    if (typeof patch[patchKey] === 'object' && patch[patchKey] !== null) {
      (target as Record<string, unknown>)[key] = {
        ...((target as Record<string, unknown>)[key] as Record<string, unknown> | undefined),
        ...(patch[patchKey] as Record<string, unknown>),
      };
    } else {
      (target as Record<string, unknown>)[key] = patch[patchKey];
    }
  }
}

function rewriteReminderClaim(text: string): { text: string; didRewrite: boolean } {
  if (!text) return { text, didRewrite: false };
  const patterns: Array<[RegExp, string]> = [
    [/\b(i'?(?:ve|ll)\s+)?scheduled\b/gi, 'proposed'],
    [/\b(i'?(?:ve|ll)\s+)?set\b(?=\s+(?:a\s+)?reminder\b)/gi, 'proposed'],
    [/\b(i'?(?:ve|ll)\s+)?created\b(?=\s+(?:a\s+)?reminder\b)/gi, 'proposed'],
    [/\b(i'?(?:ve|ll)\s+)?added\b(?=\s+(?:a\s+)?reminder\b)/gi, 'proposed'],
    [/\b(?:your|the)\s+reminder\s+(?:has been|is|was)\s+(?:scheduled|set|created|added)\b/gi, 'your reminder has been proposed'],
  ];

  let next = text;
  let didRewrite = false;
  for (const [regex, replacement] of patterns) {
    if (regex.test(next)) {
      next = next.replace(regex, replacement);
      didRewrite = true;
    }
  }

  return { text: next, didRewrite };
}

function extractRelativeMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  const match = lower.match(/\b(?:in\s+)?(\d{1,3})\s*(?:mins?|minutes?)\s*(?:from\s+now)?\b/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  if (Number.isNaN(minutes) || minutes <= 0 || minutes > 24 * 60) return null;
  return minutes;
}

function buildRelativeReminderOverride(text: string): { dueAt: string; recurrence: { kind: 'once'; dueAt: string; timezone: string }; timezone: string } | null {
  const minutes = extractRelativeMinutes(text);
  if (!minutes) return null;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  return { dueAt, recurrence: { kind: 'once', dueAt, timezone }, timezone };
}

function buildPendingContextHash(moduleId: string, contextPolicy: ContextPolicy, content: MessageContent): string {
  const text = NexusActionPlannerService.getSemanticInput(contentToText(content)).trim().slice(0, 512);
  return `${moduleId}:${contextPolicy}:${text}`;
}

function appendExecutionHoldNotice(
  text: string,
  labels: string[],
  prefix:
    | 'Manual review required before execution'
    | 'Pending approval before execution'
    | 'High-risk action requires approval'
    | 'Not executed in this session'
    | 'Execution failed and needs review'
    | 'Execution escalated for manual recovery',
): string {
  if (labels.length === 0) return text;
  const uniqueLabels = Array.from(new Set(labels));
  const notice = `${prefix}: ${uniqueLabels.join(', ')}.`;
  if (!text) return notice;
  if (text.includes(notice)) return text;
  return `${text}\n\n${notice}`;
}

export function useModuleAI({
  moduleId,
  systemPrompt: baseRole,
  encryptionKey,
  navigateTo,
  sessionId,
  contextPolicy,
  persistencePolicy = 'auto',
  onError
}: UseModuleAIOptions) {
  const { streamMessage, sendMessage, generateJSON } = useAI();
  const threadIdRef = useRef<string | undefined>(undefined);
  const { enhanceContext, enhanceContextForModule, globalSoul } = useGlobalSoul();  const { user, isGuest, profile } = useAuth();
  const autopilotLevel = useOrchestrationStore((state) => state.autopilotLevel);
  const orchestrationHistoryMode = useOrchestrationStore((state) => state.historyMode);
  const activeThreadId = useOrchestrationStore((state) => state.activeThreadId);
  const setLastTurnRuntime = useOrchestrationStore((state) => state.setLastTurnRuntime);
  const setThreadMessages = useOrchestrationStore((state) => state.setThreadMessages);
  const { debugMode } = useDebugMode();
  const debugModeRef = useRef(debugMode);
  useEffect(() => { debugModeRef.current = debugMode; }, [debugMode]);
  const activeSessionId = sessionId ?? 'current';
  const resolvedContextPolicy: ContextPolicy = contextPolicy ?? 'base-context';

  // Resolve which context enhancer to use:
  // - orchestrator (Nexus) gets full NSV via enhanceContext
  // - all other modules get filtered NSV via enhanceContextForModule
  const resolvedEnhanceContext = useCallback((context: Parameters<typeof enhanceContext>[0]) => {
    if (resolvedContextPolicy === 'doc-only') return context;
    if (moduleId === 'nexus') {
      return enhanceContext(context);
    }
    return enhanceContextForModule(context, moduleId as import('@/lib/module-manifest').ModuleId);
  }, [moduleId, enhanceContext, enhanceContextForModule, resolvedContextPolicy]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiState, setAIState] = useState<{
    isThinking: boolean;
    isActing: boolean;
    currentActionType: string | null;
  }>({
    isThinking: false,
    isActing: false,
    currentActionType: null
  });
  const [isHydrating, setIsHydrating] = useState(true);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastParsedCommand, setLastParsedCommand] = useState<ParsedCommandEnvelope | null>(null);
  const [quota, setQuota] = useState<GuestQuota>(GuestQuotaService.getQuota());
  const reminderClaimGuardRef = useRef(false);
  const [routingSuggestion, setRoutingSuggestion] = useState<{
    target: import('@/lib/module-manifest').ModuleId;
    reason?: string;
    confidence?: number;
  } | null>(null);
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const lastRemoteSignatureRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  // Tracks whether the last setMessages was from hydration (subscription echo)
  // so the save effect can skip the redundant echo-write.
  const hydratedFromRemoteRef = useRef(false);
  const currentAssistantMessageBodyRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // RAF batching: buffer deltas and flush to React state once per animation frame
  const pendingStreamTextRef = useRef('');
  const pendingAIStateRef = useRef<{ isThinking: boolean; isActing: boolean; currentActionType: string | null }>({ isThinking: false, isActing: false, currentActionType: null });
  const streamRafRef = useRef<number>(0);
  const handleSendMessageRef = useRef<((content: MessageContent, onActionParsed?: (actionType: string, payload: Record<string, unknown>) => void, options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent }) => void) | null>(null);
  const recoveryReplayKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setStreamingText('');
    setError(null);
    setIsProcessing(false);
    isProcessingRef.current = false;
    sessionStartRef.current = new Date().toISOString();
    lastRemoteSignatureRef.current = null;
    setLastTurnRuntime(null);
  }, [activeSessionId, moduleId, setLastTurnRuntime]);

  // C-1: Abort in-flight stream on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort('unmount');
      if (streamRafRef.current) {
        cancelAnimationFrame(streamRafRef.current);
        streamRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    Spine.setUser(user?.uid ?? null);
  }, [user?.uid]);

  // --- Sub-hooks ---

  const { retrieveMemoryContext } = useMemoryIntegration({
    moduleId,
    userId: user?.uid,
    isGuest: !!isGuest,
    encryptionKey
  });

  // Pre-warmed memory: fetched eagerly on session start so the first user
  // message doesn't have to wait for a network round-trip.
  const prewarmedMemoryRef = useRef<MemoryContext | null>(null);

  const prewarmMemory = useCallback((seedQuery: string) => {
    if (resolvedContextPolicy === 'doc-only' || isGuest || !user) return;
    prewarmedMemoryRef.current = null;
    retrieveMemoryContext(seedQuery).then((ctx) => {
      prewarmedMemoryRef.current = ctx;
    }).catch(() => { /* non-critical — handleSendMessage will fetch on miss */ });
  }, [resolvedContextPolicy, isGuest, user, retrieveMemoryContext]);

  const { consolidateIfNeeded, resetConsolidation } = useConsolidation({
    moduleId,
    userId: user?.uid,
    isGuest: !!isGuest,
    encryptionKey,
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

  const {
    pendingRequest,
    savePendingRequest,
    clearPendingRequest,
    markPendingRequestFailed,
    markPendingRequestBlocked,
    markPendingRequestPending
  } = usePendingRecovery(moduleId);

  // Hydrate active session on mount + subscribe for cross-tab sync
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    if (persistencePolicy === 'ephemeral') {
      // Ephemeral (impromptu) sessions: sessionStorage only, never Firestore
      try {
        const cached = sessionStorage.getItem(`nexus_session_${moduleId}_${activeSessionId}`);
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          if (parsed?.history?.length > 0) {
            setMessages(parsed.history);
            sessionStartRef.current = parsed.startTime || new Date().toISOString();
          }
        }
      } catch { /* ignore parse errors */ }
      setIsHydrating(false);
    } else if (user && !isGuest) {
      unsubscribe = ModuleMemoryService.subscribeActiveSession(user.uid, moduleId, activeSessionId, (session) => {
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
      // Guest: try restoring from sessionStorage
      try {
        const cached = sessionStorage.getItem(`nexus_session_${moduleId}_${activeSessionId}`);
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
  }, [user, isGuest, moduleId, activeSessionId, persistencePolicy]);

  // Save active session to Firestore with debounce; guest sessions to sessionStorage
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const flushActiveSession = useCallback((forceRemote = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    let currentMessages = [...messagesRef.current];

    // If we are currently processing a stream, include the partial content
    // so it's not lost on page reload/unmount.
    if (isProcessingRef.current && currentAssistantMessageBodyRef.current.trim()) {
        currentMessages = [...currentMessages, { role: 'assistant', content: currentAssistantMessageBodyRef.current, threadId: threadIdRef.current } as Message];
    }

    if (currentMessages.length === 0) return;

    const shouldSaveRemote = forceRemote || (persistencePolicy === 'auto' && user && !isGuest);

    if (shouldSaveRemote && user) {
      const lastMessageAt = new Date().toISOString();
      lastRemoteSignatureRef.current = `${lastMessageAt}:${currentMessages.length}`;
      ModuleMemoryService.saveActiveSession(user.uid, {
        sessionId: activeSessionId,
        moduleId,
        startTime: sessionStartRef.current,
        lastMessageAt,
        history: currentMessages,
        tokenCount: 0,
        isGuestTrial: false,
        contextPolicy: resolvedContextPolicy
      }).catch((e) => console.error('Failed to save active session:', e));
    }

    // Always persist to sessionStorage as a lightweight fallback
    try {
      sessionStorage.setItem(`nexus_session_${moduleId}_${activeSessionId}`, JSON.stringify({
        history: currentMessages,
        startTime: sessionStartRef.current,
        savedAt: new Date().toISOString()
      }));
    } catch { /* sessionStorage full or unavailable */ }
  }, [user, isGuest, moduleId, activeSessionId, resolvedContextPolicy, persistencePolicy]);

  useEffect(() => {
    if (isHydrating || messages.length === 0) return;
    // Skip echo-save when messages were just hydrated from Firestore — writing
    // the same data back is a no-op that wastes a write and triggers the
    // onSnapshot callback unnecessarily.
    if (hydratedFromRemoteRef.current) {
      hydratedFromRemoteRef.current = false;
      return;
    }
    
    // For scout-research, we only save to remote on specific commit actions, but we keep local storage updated
    if (persistencePolicy === 'scout-research') {
       try {
        sessionStorage.setItem(`nexus_session_${moduleId}_${activeSessionId}`, JSON.stringify({
          history: messages,
          startTime: sessionStartRef.current,
          savedAt: new Date().toISOString()
        }));
      } catch { /* ignore */ }
      return;
    }

    saveTimerRef.current = setTimeout(() => flushActiveSession(), 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      // s18-005: flush on SPA unmount so last turns aren't lost on navigation
      flushActiveSession();
    };
  }, [isHydrating, messages, flushActiveSession, persistencePolicy, moduleId, activeSessionId]);

  // Flush pending saves on tab close
  useEffect(() => {
    const handleBeforeUnload = () => flushActiveSession();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushActiveSession]);

  const handleSendMessage = useCallback(
    async (
      content: MessageContent,
      onActionParsed?: (actionType: string, payload: Record<string, unknown>) => void,
      options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string }
    ) => {
      if (isProcessingRef.current) return;
      if (isGuest && quota.isHardLocked) return;

      threadIdRef.current = options?.threadId;

      // Show user message and processing state IMMEDIATELY
      const userMsg: Message = {
        role: 'user',
        content: options?.visibleContent ?? content,
        timestamp: new Date().toISOString(),
        threadId: options?.threadId,
      };
      // H-2: maintain local history to avoid stale-closure issues with setMessages updater
      let localHistory = [...messages, userMsg].slice(-MAX_MESSAGES);
      setMessages(localHistory);
      setIsProcessing(true);
      isProcessingRef.current = true;
      setError(null);
      setStreamingText('');

      const contentText = contentToText(content);
      const executionPacket = typeof contentText === 'string'
        ? NexusActionPlannerService.extractExecutionPacket(contentText)
        : null;
      const semanticContentText = NexusActionPlannerService.getSemanticInput(contentText);
      const parsedCommand = await CommandIntelligenceService.parseWithLLM(semanticContentText, {
        sourceModuleId: moduleId,
        generateJSON,
      });
      setLastParsedCommand(parsedCommand);
      if (debugModeRef.current) {
        NexusLogger.emit('ai', {
          moduleId,
          label: 'command_parse',
          detail: {
            parserVersion: parsedCommand.parserVersion,
            confidence: parsedCommand.confidence,
            intentTypes: parsedCommand.intents.map((intent) => intent.intentType),
            rawInput: parsedCommand.rawInput,
          },
        });
      }

      NexusLogger.emit('ai', {
        moduleId,
        label: 'send',
        detail: typeof content === 'string' ? content.slice(0, 200) : '[multipart]',
      });

      // --- Routing classification (delegated to useHandoffProcessor) ---
      const routingResult = await classifyAndRoute(semanticContentText, messages, parsedCommand);
      if (!mountedRef.current) return;

      if (routingResult.shouldDelegate) {
        const targetModuleId = routingResult.target as import('@/lib/module-manifest').ModuleId;
        const targetRoute = MODULE_MANIFEST[targetModuleId]?.route;
        const routingDecision = OrchestrationInteractionGateService.evaluate({
          autopilotLevel,
          candidate: {
            kind: 'routing',
            sourceModuleId: moduleId,
            targetModuleId,
            confidence: routingResult.confidence,
            canAutoDispatch: Boolean(targetRoute && navigateTo),
          },
        });

        if (routingDecision.mode === 'silent_delegate') {
          if (targetRoute && navigateTo) {
            navigateTo(targetRoute);
          } else {
            setRoutingSuggestion({
              target: targetModuleId,
              reason: routingResult.reason,
              confidence: routingResult.confidence,
            });
            setTimeout(() => setRoutingSuggestion(null), 10000);
          }
        } else {
          setRoutingSuggestion({
            target: targetModuleId,
            reason: routingResult.reason,
            confidence: routingResult.confidence,
          });
          // Auto-dismiss after 10 seconds
          setTimeout(() => setRoutingSuggestion(null), 10000);
        }
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

      if (!options?.isRecoveryReplay) {
        const contextHash = buildPendingContextHash(moduleId, resolvedContextPolicy, content);
        savePendingRequest(content, contextHash);
      }

      if (isGuest) {
        setQuota(GuestQuotaService.incrementTurn());
      }

      try {
        if (
          executionPacket &&
          !isGuest &&
          NexusActionDispatchExecutionService.canExecutePacketDeterministically(executionPacket)
        ) {
          let canExecuteFastPath = true;
          for (const node of executionPacket.nodes) {
            const gate = OrchestrationActionGateService.evaluate({
              moduleId,
              actionType: node.actionType,
              payload: (node.payload as Record<string, unknown>) ?? {},
              autopilotLevel,
              historyMode: orchestrationHistoryMode,
              isGuest,
              activeThreadId,
              persistencePolicy,
            });
            if (!gate.shouldDispatch) {
              canExecuteFastPath = false;
              break;
            }
          }

          if (canExecuteFastPath) {
            const deterministicSoulUpdates: NeuralStateVectorPatch = {};
            const results = await NexusActionDispatchExecutionService.executePacket(executionPacket, {
            userId: user?.uid,
            isGuest: false,
            encryptionKey,
            persistencePolicy,
            updateGlobalSoul: async (patch) => {
              mergeSoulPatch(deterministicSoulUpdates, patch as NeuralStateVectorPatch);
            },
          });

          if (user && Object.keys(deterministicSoulUpdates).length > 0) {
            await GlobalProjectionService.updateCrossFunctionalState(user.uid, deterministicSoulUpdates);
            Spine.emit({
              type: 'VITAL_UPDATED',
              source: moduleId,
              domain: 'system',
              data: deterministicSoulUpdates,
              cascadeDepth: 0,
              priority: 'alert',
            });
          }

          const executedCount = results.filter((result) => result.status === 'executed').length;
          if (executedCount > 0 && persistencePolicy !== 'ephemeral') {
            Spine.emit({
              type: 'MODULE_PROFILE_UPDATED',
              source: moduleId,
              domain: 'system',
              data: { moduleId, actionCount: executedCount },
              cascadeDepth: 0,
              priority: 'info',
            });
          }

          if (activeThreadId) {
            const existingThreadMessages = useOrchestrationStore.getState().threadMessagesByThreadId[activeThreadId] ?? [];
            const executionArtifacts = NexusActionDispatchExecutionService.buildExecutionArtifacts(
              executionPacket,
              results,
              new Date().toISOString(),
            );
            const artifactMessages = MasterThreadService.projectExecutionArtifacts(activeThreadId, executionArtifacts);
            const mergedThreadMessages = MasterThreadService.mergeMessages(
              activeThreadId,
              existingThreadMessages,
              artifactMessages,
              new Date().toISOString(),
            );
            setThreadMessages(activeThreadId, mergedThreadMessages);
          }

          const assistantMessage: Message = {
            role: 'assistant',
            content: NexusActionDispatchExecutionService.buildExecutionSummary(executionPacket, results),
            timestamp: new Date().toISOString(),
            threadId: threadIdRef.current,
          };
          localHistory = [...localHistory, assistantMessage].slice(-MAX_MESSAGES);
          messagesRef.current = localHistory;
          setMessages(localHistory);
          flushActiveSession?.();
          clearPendingRequest();
          return;
        }
      }

      // --- Memory retrieval — use pre-warmed cache on first message, then fetch fresh ---
      const recentHistorySlice = messages
          .slice(-3)
          .map((msg) => `${msg.role}: ${contentToText(msg.content)}`)
          .join('\n');
        const memoryQuery = `${semanticContentText}\n${recentHistorySlice}`;

        let memoryResult: MemoryContext;
        if (resolvedContextPolicy === 'doc-only') {
          memoryResult = { recalledSessionsSummary: '', recalledFactsSummary: '' };
        } else if (prewarmedMemoryRef.current) {
          memoryResult = prewarmedMemoryRef.current;
          prewarmedMemoryRef.current = null; // consume once
        } else {
          memoryResult = await retrieveMemoryContext(memoryQuery);
        }
        const { recalledSessionsSummary, recalledFactsSummary, status: memoryStatus } = memoryResult;

        const finalSystemPrompt = PersonaFactory.generateSystemPrompt({
          moduleId,
          baseRole,
          userProfile: profile,
          globalSoul: globalSoul
        });
        const now = new Date();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const localTime = now.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: timezone,
        });
        const offsetMinutes = -now.getTimezoneOffset();
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, '0');
        const offsetMins = String(Math.abs(offsetMinutes) % 60).padStart(2, '0');
        const isoWithOffset = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}${offsetSign}${offsetHours}:${offsetMins}`;
        const timeContext = [
          '[CURRENT_TIME]',
          `ISO: ${isoWithOffset}`,
          `Local: ${localTime}`,
          `Timezone: ${timezone}`,
        ].join('\n');
        const finalSystemPromptWithTime = `${finalSystemPrompt}\n\n${timeContext}`;

        const memorySummarySections = [
          `[MODULE]: ${moduleId}`,
          recalledSessionsSummary ? `[RELEVANT PAST SESSIONS]\n${recalledSessionsSummary}` : '',
          recalledFactsSummary ? `[STABLE FACTS]\n${recalledFactsSummary}` : ''
        ]
          .filter(Boolean)
          .join('\n\n');

        const cappedMemorySummary = trimToCharLimit(memorySummarySections, MEMORY_SECTION_CHAR_LIMIT);
        const memoryContextFacts = recalledFactsSummary
          ? recalledFactsSummary.split('\n').filter(Boolean)
          : [];

        // C-1: create AbortController for this stream
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const sendStartTime = Date.now();
        const { response } = await streamMessage(
          content,
          resolvedEnhanceContext({
            systemPrompt: finalSystemPromptWithTime,
            memoryContext: memoryContextFacts,
            summary: memoryStatus === 'vault_blocked'
              ? `Memory unavailable: vault locked for ${moduleId}.`
              : cappedMemorySummary || `Active session in ${moduleId}${resolvedContextPolicy === 'doc-only' ? ' (doc-only).' : '.'}`,
            parsedCommand,
            history: messages
              .filter((m) => !m.threadId || m.threadId === userMsg.threadId)
              .map((message) => ({
                ...message,
                content: normalizeContentForAI(message.content),
              })) // history before user message — CognitiveAgent adds user msg
          }),
          (chunk) => {
            // Update refs synchronously on every chunk (for post-stream processing)
            pendingStreamTextRef.current += chunk.delta;
            currentAssistantMessageBodyRef.current = pendingStreamTextRef.current;
            pendingAIStateRef.current = {
              isThinking: chunk.isThinking,
              isActing: chunk.isActing,
              currentActionType: chunk.currentActionType
            };
            // RAF-batch: only flush to React state once per animation frame
            if (!streamRafRef.current) {
              streamRafRef.current = requestAnimationFrame(() => {
                streamRafRef.current = 0;
                setStreamingText(pendingStreamTextRef.current);
                setAIState({ ...pendingAIStateRef.current });
              });
            }
          },
          controller.signal
        );
        abortControllerRef.current = null;

        // M-1: guard post-unmount state update
        if (!mountedRef.current) return;

        // --- Action processing ---
        const silentHistoryBuffers = new Map<string, string[]>();
        const {
          analysisOnlyLabels,
          dispatchedActionTypes,
          escalatedExecutionLabels,
          failedExecutionLabels,
          heldForApprovalLabels,
          highRiskReviewLabels,
          manualReviewLabels,
          orchestrationMetadata,
          profileDirty,
          soulUpdates,
          executionArtifacts,
          threadArtifacts,
        } = await ModuleAIActionExecutionService.execute({
          moduleId,
          responseActions: response.actions,
          contentText: semanticContentText,
          parsedCommand,
          allowedActions: ActionHub.getAllowedActions(moduleId),
          autopilotLevel,
          orchestrationHistoryMode,
          activeThreadId,
          persistencePolicy,
          userId: user?.uid,
          isGuest: !!isGuest,
          encryptionKey,
          navigateTo,
          getBaseNSV: () => (globalSoul?.crossFunctionalState as Record<string, unknown> | undefined) ?? {},
          sendMessage,
          flushActiveSession,
          onActionParsed,
          adjustRelativeReminderPayload: (payload) => {
            const adjustedPayload = { ...payload };
              const override = buildRelativeReminderOverride(semanticContentText);
            if (override) {
              adjustedPayload.dueAt = override.dueAt;
              adjustedPayload.recurrence = override.recurrence;
              adjustedPayload.timezone = override.timezone;
            }
            return adjustedPayload;
          },
          recordAssistantContent: (assistantContent, metadata) => {
            if (!assistantContent.trim()) return;
            const messageChannel = OrchestrationHistoryService.getAssistantMessageChannel(metadata);
            if (messageChannel === 'silent_history') {
              const existingMessages = silentHistoryBuffers.get(metadata.execution.id) ?? [];
              silentHistoryBuffers.set(metadata.execution.id, [...existingMessages, assistantContent]);
              return;
            }
            localHistory = [...localHistory, {
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
              threadId: threadIdRef.current,
            } as Message].slice(-MAX_MESSAGES);
            messagesRef.current = localHistory;
            setMessages(localHistory);
          },
        });

        // CRITICAL FIX: Persist NSV updates BEFORE emitting MODULE_PROFILE_UPDATED
        // This ensures profile refresh happens with stable NSV state, preventing stale reads
        const shouldUpdateGlobalSoul = persistencePolicy !== 'scout-research' && persistencePolicy !== 'ephemeral' && user && !isGuest && Object.keys(soulUpdates).length > 0;

        if (shouldUpdateGlobalSoul && user) {
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

        // Only emit MODULE_PROFILE_UPDATED when an action handler explicitly marked the
        // profile as dirty. NSV-only actions (e.g. update_emotional_resilience) propagate
        // through VITAL_UPDATED and the GlobalSoul Firestore subscription instead.
        if (profileDirty && persistencePolicy !== 'ephemeral') {
          Spine.emit({
            type: 'MODULE_PROFILE_UPDATED',
            source: moduleId,
            domain: 'system',
            data: { moduleId, actionCount: dispatchedActionTypes.length },
            cascadeDepth: 0,
            priority: 'info'
          });
        }

        // M-1: guard post-unmount
        if (!mountedRef.current) return;

        const visibleAssistantText = response.publicText.trim();
        let finalContent = response.fullText;
        let adjustedPublicText = visibleAssistantText;
        const turnRuntime = OrchestrationRuntimeService.buildTurnSummary({
          moduleId,
          autopilotLevel,
          historyMode: orchestrationHistoryMode,
          activeThreadId,
          decisions: orchestrationMetadata,
        });
        setLastTurnRuntime(turnRuntime);

        if (activeThreadId && (threadArtifacts.length > 0 || executionArtifacts.length > 0)) {
          const existingThreadMessages = useOrchestrationStore.getState().threadMessagesByThreadId[activeThreadId] ?? [];
          const artifactMessages = [
            ...MasterThreadService.projectConsultationArtifacts(activeThreadId, threadArtifacts),
            ...MasterThreadService.projectExecutionArtifacts(activeThreadId, executionArtifacts),
          ];
          const mergedThreadMessages = MasterThreadService.mergeMessages(
            activeThreadId,
            existingThreadMessages,
            artifactMessages,
            new Date().toISOString(),
          );
          setThreadMessages(activeThreadId, mergedThreadMessages);
        }

        if (user && !isGuest) {
          try {
            await OrchestrationPersistenceService.persistRuntimeArtifacts(user.uid, {
              moduleId,
              decisions: orchestrationMetadata,
              runtimeSummary: turnRuntime,
              threadId: activeThreadId,
            });
          } catch (error) {
            console.error('[useModuleAI] Failed to persist orchestration runtime artifacts:', error);
          }

          const silentHistoryEntries = orchestrationMetadata
            .map((metadata) =>
              OrchestrationHistoryService.buildSilentHistoryEntry({
                moduleId,
                metadata,
                suppressedMessages: silentHistoryBuffers.get(metadata.execution.id) ?? [],
              }),
            )
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

          if (silentHistoryEntries.length > 0) {
            try {
              await OrchestrationHistoryService.persistSilentHistory(user.uid, silentHistoryEntries);
            } catch (error) {
              console.error('[useModuleAI] Failed to persist silent orchestration history:', error);
            }
          }
        }

        NexusLogger.emit('ai', {
          moduleId,
          label: 'receive',
          detail: {
            publicTextLength: visibleAssistantText.length,
            actionsCount: response.actions.length,
            latencyMs: Date.now() - sendStartTime,
          },
        });

        // --- Defensive reminder-claim rewrite ---
        if (response.actions.length === 0 && adjustedPublicText) {
          const rewritten = rewriteReminderClaim(adjustedPublicText);
          if (rewritten.didRewrite) {
            adjustedPublicText = rewritten.text;
            if (!/confirm to schedule/i.test(adjustedPublicText)) {
              adjustedPublicText = `${adjustedPublicText} Confirm to schedule.`;
            }
            if (!reminderClaimGuardRef.current) {
              reminderClaimGuardRef.current = true;
              NexusLogger.warn('ReminderGuard', 'Reminder claim rewritten: no action tags emitted.', {
                moduleId,
                original: visibleAssistantText.slice(0, 200),
                rewritten: adjustedPublicText.slice(0, 200),
              });
            }
          }
        }
        
        // --- Silent Action Fallback ---
        // If the AI performed actions but left the public response empty, generate a confirmation label
        // and prepend it to the content so it renders as the public text.
        if (!adjustedPublicText && response.actions.length > 0) {
          const fallback =
            turnRuntime.shouldSuppressAssistantMessage
              ? ''
              : dispatchedActionTypes.length > 0
                ? `${dispatchedActionTypes.map((type) => getActionLabel(type)).join(', ')}.`
                : manualReviewLabels.length > 0
                  ? `Manual review required before execution: ${Array.from(new Set(manualReviewLabels)).join(', ')}.`
                  : highRiskReviewLabels.length > 0
                    ? `High-risk action requires approval: ${Array.from(new Set(highRiskReviewLabels)).join(', ')}.`
                : heldForApprovalLabels.length > 0
                  ? `Pending approval before execution: ${Array.from(new Set(heldForApprovalLabels)).join(', ')}.`
                  : escalatedExecutionLabels.length > 0
                    ? `Execution escalated for manual recovery: ${Array.from(new Set(escalatedExecutionLabels)).join(', ')}.`
                    : failedExecutionLabels.length > 0
                      ? `Execution failed and needs review: ${Array.from(new Set(failedExecutionLabels)).join(', ')}.`
                  : analysisOnlyLabels.length > 0
                    ? `Not executed in this session: ${Array.from(new Set(analysisOnlyLabels)).join(', ')}.`
                    : `${response.actions.map((action) => getActionLabel(action.type)).join(', ')}.`;
          finalContent = fallback ? `${fallback}\n\n${response.fullText}` : response.fullText;
        }
        adjustedPublicText = appendExecutionHoldNotice(
          adjustedPublicText,
          manualReviewLabels,
          'Manual review required before execution',
        );
        adjustedPublicText = appendExecutionHoldNotice(
          adjustedPublicText,
          highRiskReviewLabels,
          'High-risk action requires approval',
        );
        adjustedPublicText = appendExecutionHoldNotice(adjustedPublicText, heldForApprovalLabels, 'Pending approval before execution');
        adjustedPublicText = appendExecutionHoldNotice(
          adjustedPublicText,
          escalatedExecutionLabels,
          'Execution escalated for manual recovery',
        );
        adjustedPublicText = appendExecutionHoldNotice(
          adjustedPublicText,
          failedExecutionLabels,
          'Execution failed and needs review',
        );
        adjustedPublicText = appendExecutionHoldNotice(adjustedPublicText, analysisOnlyLabels, 'Not executed in this session');
        // If we rewrote the public text, reflect it in the final content shown to the user.
        if (adjustedPublicText && adjustedPublicText !== visibleAssistantText) {
          if (visibleAssistantText && finalContent.includes(visibleAssistantText)) {
            finalContent = finalContent.replace(visibleAssistantText, adjustedPublicText);
          } else {
            finalContent = adjustedPublicText + (response.fullText ? `\n\n${response.fullText}` : '');
          }
        }

        // H-2: update localHistory directly instead of relying on setMessages updater
        // We store the FULL text (including tags) so Action Chips and Internal Thoughts persist.
        const shouldSuppressAssistantMessage = turnRuntime.shouldSuppressAssistantMessage && !adjustedPublicText;
        if (finalContent && !shouldSuppressAssistantMessage) {
          const assistantMessage: Message = {
            role: 'assistant',
            content: finalContent,
            timestamp: new Date().toISOString(),
            threadId: userMsg.threadId,
          };

          // Populate debugMeta when debug mode is active
          if (debugModeRef.current) {
            const spineEventsSlice = NexusLogger.getRecentSpineEvents()
              .filter((e) => e.timestamp >= sendStartTime)
              .map((e) => e.eventType);
            assistantMessage.debugMeta = {
              actionTagsExtracted: response.actions.map((a) => ({ type: a.type, payload: a.payload })),
              actionTagsDispatched: dispatchedActionTypes,
              actionsExecuted: dispatchedActionTypes,
              spineEvents: spineEventsSlice,
            };
          }

          localHistory = [...localHistory, assistantMessage].slice(-MAX_MESSAGES);
          messagesRef.current = localHistory;
          setMessages(localHistory);
        }

        // Cancel any pending RAF flush and reset streaming buffers
        if (streamRafRef.current) {
          cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = 0;
        }
        pendingStreamTextRef.current = '';

        setStreamingText('');
        currentAssistantMessageBodyRef.current = '';

        // Flush immediately after completion
        if (localHistory.length > 0) {
           flushActiveSession();
        }
        
        clearPendingRequest();

        // --- Pending query result (delegated to useHandoffProcessor) ---
        handlePendingQueryResult(adjustedPublicText);

        // --- Consolidation (delegated to useConsolidation) ---
        if (visibleAssistantText && user && !isGuest && persistencePolicy === 'auto') {
          const consolidationResult = await consolidateIfNeeded(localHistory, sessionStartRef.current);
          if (consolidationResult) {
            const { trimmedHistory, lastMessageAt, metadata } = consolidationResult;
            setMessages(trimmedHistory);
            messagesRef.current = trimmedHistory;
            if (saveTimerRef.current) {
              clearTimeout(saveTimerRef.current);
              saveTimerRef.current = null;
            }
            lastRemoteSignatureRef.current = `${metadata.trigger}:${lastMessageAt}:${trimmedHistory.length}`;
            ModuleMemoryService.saveActiveSession(user.uid, {
              sessionId: activeSessionId,
              moduleId,
              startTime: sessionStartRef.current,
              lastMessageAt,
              history: trimmedHistory,
              tokenCount: 0,
              isGuestTrial: false,
              contextPolicy: resolvedContextPolicy
            }).catch((e) => console.error('Failed to save trimmed session:', e));
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          if (pendingStreamTextRef.current) {
            localHistory = [...localHistory, { role: 'assistant', content: pendingStreamTextRef.current, timestamp: new Date().toISOString(), threadId: threadIdRef.current } as Message].slice(-MAX_MESSAGES);
            messagesRef.current = localHistory;
            if (mountedRef.current) setMessages(localHistory);
            flushActiveSession();
          }
          return;
        }
        console.error(`Module ${moduleId} AI link failure:`, e);
        
        if (pendingStreamTextRef.current) {
          localHistory = [...localHistory, { role: 'assistant', content: pendingStreamTextRef.current + '\n\n[Link interrupted]', timestamp: new Date().toISOString(), threadId: threadIdRef.current } as Message].slice(-MAX_MESSAGES);
          messagesRef.current = localHistory;
          if (mountedRef.current) setMessages(localHistory);
          flushActiveSession();
        }
        
        // Emit critical failure event so the notification system can alert the user
        Spine.emit({
          type: 'AI_LINK_FAILURE',
          source: moduleId,
          domain: 'system',
          data: { 
            moduleId, 
            errorMessage: e instanceof Error ? e.message : String(e),
            timestamp: new Date().toISOString()
          },
          cascadeDepth: 0,
          priority: 'critical'
        });

        NexusLogger.emit('ai', {
          moduleId,
          label: 'error',
          detail: e instanceof Error ? e.message : String(e),
        });
        if (mountedRef.current) {
          setError('The neural tunnel encountered an interference packet.');
        }
        if (onError) {
          onError(e);
        }
        markPendingRequestFailed();
      } finally {
        if (mountedRef.current) {
          setIsProcessing(false);
          setAIState({ isThinking: false, isActing: false, currentActionType: null });
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
      autopilotLevel,
      orchestrationHistoryMode,
      activeThreadId,
      globalSoul,
      sendMessage,
      streamMessage,
      classifyAndRoute,
      storeDelegation,
      retrieveMemoryContext,
      handlePendingQueryResult,
      consolidateIfNeeded,
      activeSessionId,
      resolvedContextPolicy,
      persistencePolicy,
      flushActiveSession,
      savePendingRequest,
      setLastTurnRuntime,
      onError
    ]
  );

  // Keep ref in sync for handoff processor effect
  handleSendMessageRef.current = handleSendMessage;

  useEffect(() => {
    if (!pendingRequest || isHydrating || isProcessingRef.current || !handleSendMessageRef.current) return;
    if (pendingRequest.status !== 'pending') return;

    const replayKey = `${pendingRequest.timestamp}:${pendingRequest.attempts}`;
    if (replayKey === recoveryReplayKeyRef.current) return;

    const securityPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = securityPolicy ? (securityPolicy.mandatory || securityPolicy.defaultLocked) : false;

    if (requiresVault && !encryptionKey) {
      markPendingRequestBlocked();
      setError('Pending request is blocked: unlock vault to recover.');
      recoveryReplayKeyRef.current = replayKey;
      return;
    }

    const expectedHash = buildPendingContextHash(moduleId, resolvedContextPolicy, pendingRequest.userMessage);
    if (pendingRequest.contextHash && pendingRequest.contextHash !== expectedHash) {
      markPendingRequestFailed(true);
      setError('Pending request context changed and cannot be auto-recovered safely.');
      recoveryReplayKeyRef.current = replayKey;
      return;
    }

    markPendingRequestPending();
    recoveryReplayKeyRef.current = replayKey;
    handleSendMessageRef.current(pendingRequest.userMessage, undefined, { isRecoveryReplay: true });
  }, [
    pendingRequest,
    isHydrating,
    moduleId,
    encryptionKey,
    resolvedContextPolicy,
    markPendingRequestBlocked,
    markPendingRequestFailed,
    markPendingRequestPending
  ]);

  useEffect(() => {
    if (!pendingRequest || pendingRequest.status !== 'blocked') return;
    const securityPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = securityPolicy ? (securityPolicy.mandatory || securityPolicy.defaultLocked) : false;
    if (!requiresVault || encryptionKey) {
      markPendingRequestPending();
    }
  }, [pendingRequest, moduleId, encryptionKey, markPendingRequestPending]);

  const clearSession = useCallback(async () => {
    // Cancel any pending debounced save so it cannot race with clearActiveSession
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    messagesRef.current = [];
    setMessages([]);
    sessionStartRef.current = new Date().toISOString();
    resetConsolidation();  // M-6: reset retry counter on clear
    try { sessionStorage.removeItem(`nexus_session_${moduleId}_${activeSessionId}`); } catch { /* ignore */ }
    if (user && !isGuest) {
      await ModuleMemoryService.clearActiveSession(user.uid, moduleId, activeSessionId);
      Spine.emit({
        type: 'SESSION_ENDED',
        source: moduleId,
        domain: 'system',
        data: { moduleId },
        cascadeDepth: 0,
        priority: 'info'
      });
    }
  }, [user, isGuest, moduleId, resetConsolidation, activeSessionId]);

  const summarizeSession = useCallback(async (): Promise<string> => {
    if (messages.length < 3) return 'Session was too brief for full synthesis.';
    try {
      const { response } = await sendMessage(
        'Summarize this session in 2 supportive sentences focusing on key takeaways or health indicators. Do not include any XML tags, action tags, or technical markup — plain prose only.',
        resolvedEnhanceContext({
          systemPrompt: 'You are an analytical supervisor. Respond with plain prose only — no XML, no action tags, no angle brackets.',
          memoryContext: [],
          summary: 'Summarizing.',
          history: messages
        })
      );
      // Strip any leaked action/detail XML tags from the summary
      const clean = response.publicText
        .replace(/<action[^>]*>[\s\S]*?<\/action>/gi, '')
        .replace(/<detail[^>]*>[\s\S]*?<\/detail>/gi, '')
        .replace(/<thought[^>]*>[\s\S]*?<\/thought>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      return clean || 'Session completed.';
    } catch (e) {
      return 'Session completed and data synchronized.';
    }
  }, [messages, sendMessage, resolvedEnhanceContext]);

  return useMemo(() => ({
    messages,
    setMessages,
    isProcessing,
    aiState,
    isHydrating,
    streamingText,
    error,
    quota,
    lastParsedCommand,
    routingSuggestion,
    setRoutingSuggestion,
    handleSendMessage,
    prewarmMemory,
    clearSession,
    summarizeSession,
    pendingRequest,
    clearPendingRequest,
  }), [
    messages, setMessages, isProcessing, aiState, isHydrating, streamingText,
    error, quota, lastParsedCommand, routingSuggestion, setRoutingSuggestion, handleSendMessage,
    prewarmMemory, clearSession, summarizeSession, pendingRequest, clearPendingRequest,
  ]);
}
