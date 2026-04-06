/**
 * Main app-layer adapter between module UIs and the LLM runtime boundary.
 * See docs/architecture/llm-entrypoint-runtime.md for the full message flow.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useAI } from '@/cortex-bridge/ai-context';
import { useGlobalSoulActions, useGlobalSoulStore } from '../global-soul-context';
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
import { CommandIntelligenceServiceJs } from '@cortex-logic';

const _kmpCommandParser = new CommandIntelligenceServiceJs();
import { MasterThreadService } from '@/lib/services/master-thread-service';
import { ModuleAIActionExecutionService, type DeferredApproval } from '@/lib/services/module-ai-action-execution-service';
export type { DeferredApproval };
import { NexusActionPlannerService } from '@/lib/services/nexus-action-planner-service';
import { NexusActionDispatchExecutionService } from '@/lib/services/nexus-action-dispatch-execution-service';
import { isOpenRouterAuthError } from '@/lib/services/openrouter-key';

export type PersistencePolicy = 'auto' | 'scout-research' | 'atlas-planning' | 'ledger-financial' | 'manual' | 'ephemeral';

interface UseModuleAIOptions {
  moduleId: string;
  /**
   * Optional base system prompt. When omitted, KMP's PersonaPromptCatalog supplies
   * the persona for the moduleId automatically — module pages should not pass this.
   * Only provide for inline/utility conversations that need an explicit prompt
   * (e.g. NexusOverlay, CollapsibleAIPanel, diagnosis mode).
   */
  systemPrompt?: string;
  encryptionKey?: CryptoKey | null;
  navigateTo?: (path: string) => void;
  sessionId?: string;
  contextPolicy?: ContextPolicy;
  persistencePolicy?: PersistencePolicy;
  onError?: (error: unknown) => void;
  /** Per-module autopilot override. When provided, bypasses the global orchestration store
   *  value for this module's action gate evaluation. Use 5 to auto-execute all mutations
   *  (e.g. Ledger, where the user explicitly directs every financial write). */
  autopilotLevelOverride?: 0 | 1 | 2 | 3 | 4 | 5;
  /**
   * Called at send time to append a dynamic block (e.g. session progress) to the base
   * system prompt. Runs inside handleSendMessage so it always reflects current state
   * without requiring messages as a systemPrompt useMemo dependency.
   */
  getSessionProgressBlock?: () => string | null;
  /**
   * Optional per-module context forwarded to KMP's DefaultPersonaFactory.assemble().
   * Module pages can include typed profile data (e.g. `{ titan_profile: {...} }`)
   * which KMP will deserialize into Kotlin data classes for scoped prompt building.
   * Merged with `{ baseRole }` before being serialized as moduleContextJson.
   */
  moduleContext?: Record<string, unknown>;
}

const MEMORY_SECTION_CHAR_LIMIT = 1800;
const MAX_MESSAGES = 200;

/**
 * Number of most-recent messages sent verbatim to the LLM when a session
 * summary is available for the older portion.
 */
const HISTORY_WINDOW = 40;

/**
 * Fallback window used while a session summary is being generated (first
 * overflow) so the LLM still gets reasonable context before the summary
 * is ready.
 */
const HISTORY_FALLBACK_WINDOW = 80;
const OPENROUTER_AUTH_ERROR_MESSAGE = 'OpenRouter authentication failed (401). Add a valid API key in Settings -> Models.';

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

function toUserFacingAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (isOpenRouterAuthError(message)) {
    return OPENROUTER_AUTH_ERROR_MESSAGE;
  }
  if (/429|rate limit|too many requests/i.test(message)) {
    return 'The neural link is congested. Please try again in a moment.';
  }
  if (/network|fetch|timeout|connection|offline/i.test(message)) {
    return 'Network interruption while contacting the model provider. Please retry.';
  }
  return message || 'The neural tunnel encountered an interference packet.';
}

/**
 * Builds the history slice and optional summary block to pass to streamMessage.
 *
 * - If session length ≤ HISTORY_WINDOW: send everything verbatim.
 * - If a current summary exists covering older messages: send summary block +
 *   last HISTORY_WINDOW messages verbatim.
 * - If no current summary yet (first overflow): send last HISTORY_FALLBACK_WINDOW
 *   while summary generation runs in the background.
 */
function buildHistoryForStream(
  messages: Message[],
  currentThreadId: string | undefined,
  summary: { summary: string; coveredUpTo: number } | null,
): { historySlice: Message[]; summaryBlock: string | null } {
  const thread = messages.filter((m) => !m.threadId || m.threadId === currentThreadId);

  if (thread.length <= HISTORY_WINDOW) {
    return { historySlice: thread, summaryBlock: null };
  }

  const coveredUpTo = thread.length - HISTORY_WINDOW;
  if (summary && summary.coveredUpTo >= coveredUpTo) {
    return { historySlice: thread.slice(-HISTORY_WINDOW), summaryBlock: summary.summary };
  }

  // No current summary — fallback to a wider verbatim window while it generates
  return { historySlice: thread.slice(-HISTORY_FALLBACK_WINDOW), summaryBlock: null };
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
    | 'Execution escalated for manual recovery'
    | 'Action not permitted for this module',
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
  systemPrompt: baseRole = '',
  encryptionKey,
  navigateTo,
  sessionId,
  contextPolicy,
  persistencePolicy = 'auto',
  onError,
  autopilotLevelOverride,
  getSessionProgressBlock,
  moduleContext,
}: UseModuleAIOptions) {
  const { streamMessage, sendMessage, generateJSON } = useAI();
  const threadIdRef = useRef<string | undefined>(undefined);
  const openRouterAuthBlockedRef = useRef(false);
  const { enhanceContext, enhanceContextForModule } = useGlobalSoulActions();
  // Read globalSoul once for initializing the ref, then keep it updated via
  // Zustand's subscribe (non-hook) API so this hook does NOT trigger a
  // component re-render when global_souls is written to.
  const globalSoul = useGlobalSoulStore.getState().globalSoul;
  const { user, isGuest, profile } = useAuth();
  const globalAutopilotLevel = useOrchestrationStore((state) => state.autopilotLevel);
  const moduleAutopilotOverrides = useOrchestrationStore((state) => state.moduleAutopilotOverrides);
  const autopilotLevel = moduleAutopilotOverrides[moduleId as keyof typeof moduleAutopilotOverrides] ?? globalAutopilotLevel;
  const orchestrationHistoryMode = useOrchestrationStore((state) => state.historyMode);
  const activeThreadId = useOrchestrationStore((state) => state.activeThreadId);
  const setLastTurnRuntime = useOrchestrationStore((state) => state.setLastTurnRuntime);
  const setThreadMessages = useOrchestrationStore((state) => state.setThreadMessages);
  const { debugMode } = useDebugMode();
  const debugModeRef = useRef(debugMode);
  useEffect(() => { debugModeRef.current = debugMode; }, [debugMode]);
  // Keep baseRole (the enriched system prompt) in a ref so that handleSendMessage
  // does not need to list it as a useCallback dep. Without this, every profile update
  // rebuilds the system prompt string → handleSendMessage gets a new reference →
  // NexusChat + ChatInterface rerender → scroll effects fire mid-conversation.
  const baseRoleRef = useRef(baseRole);
  baseRoleRef.current = baseRole;
  // Keep auth profile in a ref so handleSendMessage doesn't recreate when
  // the auth profile object reference changes. Read from ref at call-time.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  // Keep globalSoul in a ref kept live by a Zustand subscribe (non-hook) so that:
  // 1. handleSendMessage never recreates when globalSoul changes (stable ref)
  // 2. The module page does NOT re-render when global_souls is written to
  //    (Zustand subscribe does not trigger React renders)
  const globalSoulRef = useRef(globalSoul);
  useEffect(() => {
    return useGlobalSoulStore.subscribe(
      (state) => { globalSoulRef.current = state.globalSoul; },
    );
  }, []);
  // Keep moduleContext in a ref so handleSendMessage picks up the latest value
  // without triggering re-renders when the module page updates its context.
  const moduleContextRef = useRef(moduleContext);
  moduleContextRef.current = moduleContext;
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

  // Keep resolvedEnhanceContext in a ref so handleSendMessage deps stay stable.
  const resolvedEnhanceContextRef = useRef(resolvedEnhanceContext);
  resolvedEnhanceContextRef.current = resolvedEnhanceContext;

  // Keep getSessionProgressBlock in a ref so handleSendMessage doesn't need it as a dep.
  const getSessionProgressBlockRef = useRef(getSessionProgressBlock);
  getSessionProgressBlockRef.current = getSessionProgressBlock;
  // Stable wrapper that always delegates to the current ref. Passed to sub-hooks
  // (e.g. useConsolidation) so their callbacks don't recreate when globalSoul changes.
  const stableEnhanceContext = useCallback(
    (context: Parameters<typeof resolvedEnhanceContext>[0]) => resolvedEnhanceContextRef.current(context),
    [] // intentionally empty — always reads the live ref
  );

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
  const [disposition, setDisposition] = useState<'reply' | 'consulting' | 'delegating' | 'acting' | null>(null);
  const [consultationTarget, setConsultationTarget] = useState<string | null>(null);
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
  const [pendingApprovals, setPendingApprovals] = useState<DeferredApproval[]>([]);
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const lastRemoteSignatureRef = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  // Tracks whether the last setMessages was from hydration (subscription echo)
  // so the save effect can skip the redundant echo-write.
  const hydratedFromRemoteRef = useRef(false);
  const currentAssistantMessageBodyRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingApprovalsRef = useRef<Map<string, DeferredApproval>>(new Map());
  const mountedRef = useRef(true);
  // Timestamp of the last local flushActiveSession write. Used to suppress
  // subscription echoes — when the listener fires within a short window after
  // our own write, we know it's an echo and skip setMessages().
  const lastLocalWriteTimestampRef = useRef(0);
  // RAF batching: buffer deltas and flush to React state once per animation frame
  const pendingStreamTextRef = useRef('');
  const pendingAIStateRef = useRef<{ isThinking: boolean; isActing: boolean; currentActionType: string | null }>({ isThinking: false, isActing: false, currentActionType: null });
  const streamRafRef = useRef<number>(0);
  const handleSendMessageRef = useRef<((content: MessageContent, onActionParsed?: (actionType: string, payload: Record<string, unknown>) => void, options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent }) => void) | null>(null);
  const recoveryReplayKeyRef = useRef<string | null>(null);

  // Session summary buffer — compressed summary of messages older than
  // HISTORY_WINDOW so the LLM never loses early-session context.
  const sessionSummaryRef = useRef<{ summary: string; coveredUpTo: number } | null>(null);
  const summaryGeneratingRef = useRef(false);

  useEffect(() => {
    setMessages([]);
    setStreamingText('');
    setError(null);
    setIsProcessing(false);
    isProcessingRef.current = false;
    sessionStartRef.current = new Date().toISOString();
    lastRemoteSignatureRef.current = null;
    setLastTurnRuntime(null);
    pendingApprovalsRef.current.clear();
    setPendingApprovals([]);
    sessionSummaryRef.current = null;
    summaryGeneratingRef.current = false;
  }, [activeSessionId, moduleId, setLastTurnRuntime]);

  // C-1: Abort in-flight stream on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isProcessingRef.current) {
        abortControllerRef.current?.abort('unmount');
      }
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

  // Background session summary refresh.
  // Generates a compressed summary of the portion of the conversation that has
  // overflowed the HISTORY_WINDOW.  Called after each assistant turn — runs
  // entirely off the critical path so TTFT is unaffected.
  const refreshSessionSummaryIfNeeded = useCallback(async (currentMessages: Message[]) => {
    if (isGuest || !user) return;
    const thread = currentMessages.filter((m) => !m.threadId || m.threadId === threadIdRef.current);
    if (thread.length <= HISTORY_WINDOW) return;

    const coveredUpTo = thread.length - HISTORY_WINDOW;
    if (sessionSummaryRef.current && sessionSummaryRef.current.coveredUpTo >= coveredUpTo) return;
    if (summaryGeneratingRef.current) return;

    summaryGeneratingRef.current = true;
    try {
      const olderMessages = thread.slice(0, coveredUpTo);
      const transcript = olderMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${contentToText(m.content)}`)
        .join('\n\n');

      const { response } = await sendMessage(
        `Summarize the following conversation excerpt in 4–6 sentences. Preserve all key topics, decisions, emotional context, and any commitments or disclosures made. This summary will be given to an AI to prevent it from contradicting or forgetting earlier context. Do not include any XML tags, action tags, or technical markup — plain prose only.\n\n${transcript}`,
        {
          systemPrompt: 'You are a conversation archivist. Output only the summary — plain prose, no bullet points, no preamble.',
          memoryContext: [],
          summary: '',
          history: [],
        },
      );

      if (mountedRef.current && response.publicText) {
        sessionSummaryRef.current = { summary: response.publicText, coveredUpTo };
      }
    } catch {
      // Non-critical — will retry next turn
    } finally {
      summaryGeneratingRef.current = false;
    }
  }, [isGuest, user, sendMessage]);

  const { consolidateIfNeeded, resetConsolidation } = useConsolidation({
    moduleId,
    userId: user?.uid,
    isGuest: !!isGuest,
    encryptionKey,
    sendMessage,
    enhanceContext: stableEnhanceContext,
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
        // Skip subscription echoes entirely while the agent is actively processing.
        // During agent flow, all message state is managed locally via setMessages —
        // remote echoes can only cause duplicates or state thrashing.
        if (isProcessingRef.current) {
          setIsHydrating(false);
          return;
        }
        if (session && session.history?.length > 0) {
          const signature = `${session.lastMessageAt}:${session.history.length}`;
          if (signature !== lastRemoteSignatureRef.current) {
            lastRemoteSignatureRef.current = signature;
            // RC-1 fix: skip echoes of our own writes. The ChunkedSessionStore
            // subscription fires asynchronously after our flushActiveSession write.
            // If the listener fires within 3s of our last write AND the message
            // count matches, it's almost certainly an echo — skip setMessages()
            // to avoid a mid-conversation rerender.
            const msSinceOwnWrite = Date.now() - lastLocalWriteTimestampRef.current;
            const currentMsgs = messagesRef.current;
            const isLikelyEcho = msSinceOwnWrite < 3000 && session.history.length <= currentMsgs.length;
            if (isLikelyEcho) {
              setIsHydrating(false);
              return;
            }
            const remoteLen = session.history.length;
            const localLen = currentMsgs.length;
            const lastRemoteContent = session.history[remoteLen - 1]?.content;
            const lastLocalContent = currentMsgs[localLen - 1]?.content;
            const hasRealDiff = remoteLen !== localLen || lastRemoteContent !== lastLocalContent;
            if (hasRealDiff) {
              hydratedFromRemoteRef.current = true;
              setMessages(session.history);
              sessionStartRef.current = session.startTime || new Date().toISOString();
            }
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
  const lastCompactionNoticeAtRef = useRef(0);

  const maybeWarnHistoryCompaction = useCallback((droppedCount: number) => {
    if (droppedCount <= 0) return;
    const now = Date.now();
    if (now - lastCompactionNoticeAtRef.current < 30_000) return;
    lastCompactionNoticeAtRef.current = now;
    setError(`Session memory was compacted to stay stable. ${droppedCount} older message${droppedCount === 1 ? '' : 's'} were removed from active context.`);
  }, []);
  const maybeWarnSizePressure = useCallback((estimatedBytes: number, hardLimitExceeded: boolean) => {
    const now = Date.now();
    if (now - lastCompactionNoticeAtRef.current < 30_000) return;
    lastCompactionNoticeAtRef.current = now;
    if (hardLimitExceeded) {
      setError(`Active session reached storage hard limit protection (${Math.round(estimatedBytes / 1024)} KB). Older context was compacted.`);
      return;
    }
    setError(`Active session is nearing storage limit (${Math.round(estimatedBytes / 1024)} KB). Context will be compacted automatically if needed.`);
  }, []);

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

    // Strip ephemeral debug metadata before any persistence — debug signals are display-only
    const persistableMessages = currentMessages.map((msg) => {
      const { debugMeta: _dm, ...rest } = msg as typeof msg & { debugMeta?: unknown };
      return rest as typeof msg;
    });

    const shouldSaveRemote = forceRemote || (persistencePolicy === 'auto' && user && !isGuest);

    if (shouldSaveRemote && user) {
      const lastMessageAt = new Date().toISOString();
      lastRemoteSignatureRef.current = `${lastMessageAt}:${currentMessages.length}`;
      lastLocalWriteTimestampRef.current = Date.now();
      ModuleMemoryService.saveActiveSession(user.uid, {
        sessionId: activeSessionId,
        moduleId,
        startTime: sessionStartRef.current,
        lastMessageAt,
        history: persistableMessages,
        tokenCount: 0,
        isGuestTrial: false,
        contextPolicy: resolvedContextPolicy
      })
        .catch((e) => console.error('Failed to save active session:', e));
    }

    // Always persist to sessionStorage as a lightweight fallback
    try {
      sessionStorage.setItem(`nexus_session_${moduleId}_${activeSessionId}`, JSON.stringify({
        history: persistableMessages,
        startTime: sessionStartRef.current,
        savedAt: new Date().toISOString()
      }));
    } catch { /* sessionStorage full or unavailable */ }
  }, [user, isGuest, moduleId, activeSessionId, resolvedContextPolicy, persistencePolicy, maybeWarnHistoryCompaction, maybeWarnSizePressure]);

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

  // Clear auth circuit-breaker when model/provider/key inputs change.
  useEffect(() => {
    const clearAuthBlock = () => {
      openRouterAuthBlockedRef.current = false;
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === 'nexus_debug_provider' ||
        event.key === 'preferred_model' ||
        event.key === 'VITE_OPENROUTER_API_KEY' ||
        event.key === 'openrouter_api_key' ||
        event.key === 'OPENROUTER_API_KEY'
      ) {
        clearAuthBlock();
      }
    };
    window.addEventListener('nexus_model_changed', clearAuthBlock);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('nexus_model_changed', clearAuthBlock);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleSendMessage = useCallback(
    async (
      content: MessageContent,
      onActionParsed?: (actionType: string, payload: Record<string, unknown>) => void,
      options?: { isRecoveryReplay?: boolean; visibleContent?: MessageContent; threadId?: string; hideUserMessage?: boolean }
    ) => {
      if (isProcessingRef.current) return;
      if (isGuest && quota.isHardLocked) return;
      if (openRouterAuthBlockedRef.current) {
        setError(OPENROUTER_AUTH_ERROR_MESSAGE);
        return;
      }

      threadIdRef.current = options?.threadId;

      // Show user message and processing state IMMEDIATELY
      const userMsg: Message = {
        role: 'user',
        content: options?.visibleContent ?? content,
        hidden: options?.hideUserMessage || undefined,
        timestamp: new Date().toISOString(),
        threadId: options?.threadId,
      };
      // H-2: read current messages from ref so handleSendMessage doesn't need `messages`
      // in its useCallback deps — this keeps handleSendMessage stable across AI responses
      // and prevents ai useMemo from firing on every message update.
      // Snapshot history BEFORE setMessages so buildHistoryForStream always uses the
      // pre-user-message history (messagesRef.current is re-synced on every render so
      // after setMessages triggers a re-render it would contain userMsg, causing the AI
      // to see the user message twice — once in history, once as the content argument).
      const historyBeforeUserMsg = [...messagesRef.current];
      let localHistory = [...messagesRef.current, userMsg].slice(-MAX_MESSAGES);
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
      const nowIso = new Date().toISOString().slice(0, 10);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let parserAuthError: string | null = null;
      const parsedCommand = await (async (): Promise<ParsedCommandEnvelope> => {
        try {
          return await new Promise<ParsedCommandEnvelope>((resolve, reject) => {
            const task = _kmpCommandParser.parseWithLlm(
              semanticContentText,
              moduleId,
              nowIso,
              timezone,
              (prompt, systemPrompt, onComplete, onError) => {
                generateJSON<string>(prompt, { systemPrompt, temperature: 0.1, maxTokens: 600 })
                  .then((result) => onComplete(typeof result === 'string' ? result : JSON.stringify(result)))
                  .catch((e: unknown) => onError(String(e)));
              },
              (envelopeJson) => {
                try { resolve(JSON.parse(envelopeJson) as ParsedCommandEnvelope); }
                catch (e) { reject(e); }
              },
              (err) => reject(new Error(err))
            );
            // Cancel the KMP coroutine if the component unmounts during parsing.
            if (!mountedRef.current) task.cancel();
          });
        } catch (llmParseError) {
          // Keep chat alive if LLM-assisted parsing fails (regex/runtime/provider issues).
          // Use deterministic phase-1 parser as fallback and continue the turn.
          NexusLogger.emit('ai', {
            moduleId,
            label: 'command_parse_fallback',
            detail: llmParseError instanceof Error ? llmParseError.message : String(llmParseError),
          });
          if (isOpenRouterAuthError(llmParseError instanceof Error ? llmParseError.message : String(llmParseError))) {
            openRouterAuthBlockedRef.current = true;
            parserAuthError = OPENROUTER_AUTH_ERROR_MESSAGE;
          }
          try {
            const envelopeJson = _kmpCommandParser.parse(semanticContentText, moduleId, nowIso, timezone);
            return JSON.parse(envelopeJson) as ParsedCommandEnvelope;
          } catch (phase1Error) {
            NexusLogger.emit('ai', {
              moduleId,
              label: 'command_parse_failed',
              detail: phase1Error instanceof Error ? phase1Error.message : String(phase1Error),
            });
            return {
              rawInput: semanticContentText,
              normalizedInput: semanticContentText,
              parserVersion: 'phase1-v1',
              parserMode: 'llm-fallback',
              sourceModuleId: moduleId,
              generatedAt: new Date().toISOString(),
              timezone,
              confidence: 0,
              intents: [],
              temporalReferences: [],
              sharedRouteHints: [],
              mentions: [],
              mentionedModuleIds: [],
              requiresClarification: false,
              ambiguityReasons: [],
            };
          }
        }
      })();
      if (parserAuthError) {
        if (mountedRef.current) setError(parserAuthError);
        markPendingRequestFailed();
        return;
      }
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
      const routingResult = await classifyAndRoute(semanticContentText, messagesRef.current, parsedCommand);
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

      if (messagesRef.current.length === 0) {
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
      const recentHistorySlice = messagesRef.current
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

        const progressBlock = getSessionProgressBlockRef.current?.();
        const baseWithProgress = progressBlock
          ? `${baseRoleRef.current}\n\n${progressBlock}`
          : baseRoleRef.current;

        const finalSystemPrompt = PersonaFactory.generateSystemPrompt({
          moduleId,
          baseRole: baseWithProgress,
          userProfile: profileRef.current,
          globalSoul: globalSoulRef.current,
          moduleContext: moduleContextRef.current
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

        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

        const timeContext = [
          '[CURRENT_TIME]',
          `ISO: ${isoWithOffset}`,
          `Local: ${localTime}`,
          `Timezone: ${timezone}`,
          `Today: ${todayStr}`,
          `Tomorrow: ${tomorrowStr}`,
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
        const { historySlice, summaryBlock } = buildHistoryForStream(
          historyBeforeUserMsg,
          userMsg.threadId,
          sessionSummaryRef.current,
        );

        const systemPromptWithSummary = summaryBlock
          ? `${finalSystemPromptWithTime}\n\n[SESSION HISTORY SUMMARY — earlier in this conversation]\n${summaryBlock}\n[END SUMMARY — the most recent messages follow in history]`
          : finalSystemPromptWithTime;

        const { response } = await streamMessage(
          content,
          resolvedEnhanceContextRef.current({
            systemPrompt: systemPromptWithSummary,
            memoryContext: memoryContextFacts,
            summary: memoryStatus === 'vault_blocked'
              ? `Memory unavailable: vault locked for ${moduleId}.`
              : cappedMemorySummary || `Active session in ${moduleId}${resolvedContextPolicy === 'doc-only' ? ' (doc-only).' : '.'}`,
            parsedCommand,
            history: historySlice.map((message) => ({
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
        if (response.isInterrupted) {
          const interruptedText = pendingStreamTextRef.current.trim();
          if (interruptedText) {
            localHistory = [
              ...localHistory,
              {
                role: 'assistant',
                content: `${interruptedText}\n\n[Link interrupted]`,
                timestamp: new Date().toISOString(),
                threadId: threadIdRef.current,
              } as Message,
            ].slice(-MAX_MESSAGES);
            messagesRef.current = localHistory;
            setMessages(localHistory);
            flushActiveSession();
          } else {
            setError('The neural link was interrupted. Please retry.');
          }
          if (streamRafRef.current) {
            cancelAnimationFrame(streamRafRef.current);
            streamRafRef.current = 0;
          }
          pendingStreamTextRef.current = '';
          setStreamingText('');
          currentAssistantMessageBodyRef.current = '';
          markPendingRequestFailed();
          return;
        }

        // --- Action processing ---
        const silentHistoryBuffers = new Map<string, string[]>();
        const assistantMessageBuffer: Message[] = [];
        const {
          analysisOnlyLabels,
          dispatchedActionTypes,
          escalatedExecutionLabels,
          failedExecutionLabels,
          heldForApprovalLabels,
          highRiskReviewLabels,
          manualReviewLabels,
          schemaBlockedLabels,
          orchestrationMetadata,
          profileDirty,
          soulUpdates,
          executionArtifacts,
          threadArtifacts,
          deferredApprovals,
        } = await ModuleAIActionExecutionService.execute({
          moduleId,
          responseActions: response.actions,
          contentText: semanticContentText,
          parsedCommand,
          allowedActions: ActionHub.getAllowedActions(moduleId),
          autopilotLevel: (autopilotLevelOverride ?? autopilotLevel) as 0 | 1 | 2 | 3 | 4 | 5,
          orchestrationHistoryMode,
          activeThreadId,
          persistencePolicy,
          userId: user?.uid,
          isGuest: !!isGuest,
          encryptionKey,
          navigateTo,
          getBaseNSV: () => (globalSoulRef.current?.crossFunctionalState as Record<string, unknown> | undefined) ?? {},
          sendMessage,
          flushActiveSession,
          onActionParsed,
          onConsultationStarted: (targetModuleId) => {
            setConsultationTarget(targetModuleId);
          },
          onDispositionChange: (newDisposition) => {
            setDisposition(newDisposition);
          },
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
            assistantMessageBuffer.push({
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date().toISOString(),
              threadId: threadIdRef.current,
            } as Message);
          },
        });

        // Store deferred approvals so the UI can surface Approve/Dismiss cards
        if (deferredApprovals.length > 0) {
          for (const item of deferredApprovals) {
            pendingApprovalsRef.current.set(item.executionId, item);
          }
          setPendingApprovals(Array.from(pendingApprovalsRef.current.values()));
        }

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
            turnRuntime.shouldSuppressAssistantMessage || moduleId === 'agnes'
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
                  : schemaBlockedLabels.length > 0
                    ? `Action not permitted for this module: ${Array.from(new Set(schemaBlockedLabels)).join(', ')}.`
                  : analysisOnlyLabels.length > 0
                    ? `Not executed in this session: ${Array.from(new Set(analysisOnlyLabels)).join(', ')}.`
                    : `${response.actions.map((action) => getActionLabel(action.type)).join(', ')}.`;
          finalContent = fallback ? `${fallback}\n\n${response.fullText}` : response.fullText;
        }
        // Execution hold notices are suppressed for Agnes — they are internal
        // orchestration artefacts that have no place in a therapeutic conversation.
        if (moduleId !== 'agnes') {
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
          adjustedPublicText = appendExecutionHoldNotice(adjustedPublicText, schemaBlockedLabels, 'Action not permitted for this module');
        }
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

          // RC-4 fix: build the final history (including any buffered assistant messages
          // from action execution) before the single setMessages call to avoid two
          // rapid re-renders of ChatInterface at stream completion.
          if (assistantMessageBuffer.length > 0) {
            localHistory = [...localHistory, assistantMessage, ...assistantMessageBuffer].slice(-MAX_MESSAGES);
          } else {
            localHistory = [...localHistory, assistantMessage].slice(-MAX_MESSAGES);
          }
          messagesRef.current = localHistory;
          setMessages(localHistory);
        } else if (assistantMessageBuffer.length > 0) {
          // No assistant message (suppressed) but there are buffered messages
          localHistory = [...localHistory, ...assistantMessageBuffer].slice(-MAX_MESSAGES);
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

        // Background: refresh session summary if history has overflowed the window.
        // Runs entirely off the critical path — TTFT is not affected.
        refreshSessionSummaryIfNeeded(localHistory).catch(() => {});
        
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
            })
              .catch((e) => console.error('Failed to save trimmed session:', e));
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          if (streamRafRef.current) {
            cancelAnimationFrame(streamRafRef.current);
            streamRafRef.current = 0;
          }
          if (pendingStreamTextRef.current) {
            localHistory = [...localHistory, { role: 'assistant', content: pendingStreamTextRef.current, timestamp: new Date().toISOString(), threadId: threadIdRef.current } as Message].slice(-MAX_MESSAGES);
            messagesRef.current = localHistory;
            if (mountedRef.current) setMessages(localHistory);
            flushActiveSession();
          }
          return;
        }
        if (streamRafRef.current) {
          cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = 0;
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
        if (isOpenRouterAuthError(e instanceof Error ? e.message : String(e))) {
          openRouterAuthBlockedRef.current = true;
        }
        if (mountedRef.current) setError(toUserFacingAiError(e));
        if (onError) {
          onError(e);
        }
        markPendingRequestFailed();
      } finally {
        if (streamRafRef.current) {
          cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = 0;
        }
        pendingStreamTextRef.current = '';
        currentAssistantMessageBodyRef.current = '';
        if (mountedRef.current) {
          setIsProcessing(false);
          setStreamingText('');
          setAIState({ isThinking: false, isActing: false, currentActionType: null });
          setDisposition(null);
          setConsultationTarget(null);
        }
        isProcessingRef.current = false;
      }
    },
    [
      // messages intentionally omitted — read from messagesRef.current at call-time
      // so handleSendMessage stays stable across AI responses (prevents ai useMemo
      // from firing on every message update → prevents dashboard re-renders).
      // profile intentionally omitted — read from profileRef.current at call-time
      // so handleSendMessage stays stable when agent actions update the module profile.
      isGuest,
      quota.isHardLocked,
      moduleId,
      user,
      autopilotLevel,
      orchestrationHistoryMode,
      activeThreadId,
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
      maybeWarnHistoryCompaction,
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
        resolvedEnhanceContextRef.current({
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
  }, [messages, sendMessage]);

  const approveAction = useCallback(async (executionId: string) => {
    const pending = pendingApprovalsRef.current.get(executionId);
    if (!pending) return;
    pendingApprovalsRef.current.delete(executionId);
    setPendingApprovals(Array.from(pendingApprovalsRef.current.values()));

    const executed = await ActionHub.execute(moduleId, pending.actionType, {
      userId: user?.uid,
      isGuest: !!isGuest,
      moduleId,
      payload: pending.payload,
      encryptionKey,
      navigateTo,
      getLatestNSV: () => (globalSoulRef.current?.crossFunctionalState as Record<string, unknown> | undefined) ?? {},
      emitSpineEvent: (type, data, options) => Spine.emit({
        type,
        source: moduleId,
        domain: (options?.domain ?? 'system') as import('@/lib/types').SpineDomain,
        target: options?.target,
        data,
        cascadeDepth: 0,
        priority: options?.priority ?? 'info',
      }),
      updateGlobalSoul: async (patch) => {
        if (user && !isGuest) {
          await GlobalProjectionService.updateCrossFunctionalState(user.uid, patch);
        }
      },
      delegateToModule: () => {},
      markProfileDirty: () => {
        if (user && !isGuest) {
          Spine.emit({ type: 'MODULE_PROFILE_UPDATED', source: moduleId, domain: 'system', data: { moduleId }, cascadeDepth: 0, priority: 'info' });
        }
      },
    });

    if (executed && user && !isGuest) {
      Spine.emit({ type: 'MODULE_PROFILE_UPDATED', source: moduleId, domain: 'system', data: { moduleId, approvedAction: pending.actionType }, cascadeDepth: 0, priority: 'info' });
    }
  }, [moduleId, user, isGuest, encryptionKey, navigateTo]);

  const dismissAction = useCallback((executionId: string) => {
    pendingApprovalsRef.current.delete(executionId);
    setPendingApprovals(Array.from(pendingApprovalsRef.current.values()));
  }, []);

  return useMemo(() => ({
    messages,
    setMessages,
    isProcessing,
    aiState,
    disposition,
    consultationTarget,
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
    pendingApprovals,
    approveAction,
    dismissAction,
  }), [
    messages, setMessages, isProcessing, aiState, disposition, consultationTarget,
    isHydrating, streamingText, error, quota, lastParsedCommand, routingSuggestion,
    setRoutingSuggestion, handleSendMessage, prewarmMemory, clearSession, summarizeSession,
    pendingRequest, clearPendingRequest, pendingApprovals, approveAction, dismissAction,
  ]);
}
