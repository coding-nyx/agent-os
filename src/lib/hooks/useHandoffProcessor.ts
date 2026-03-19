import { useRef, useEffect, useCallback } from 'react';
import type { Message, MessageContent } from '../types';
import type { ConversationContext } from '@/lib/ai-adapters/engine-types';
import type { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { NexusHandoffService } from '../services/nexus-handoff-service';
import { NexusRoutingService } from '../services/nexus-routing-service';
import { Spine } from '../spine/spine-event-bus';

function trimToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 12)).trim()}...`;
}

export interface RoutingResult {
  shouldDelegate: boolean;
  target?: string;
  reason?: string;
  confidence?: number;
}

interface UseHandoffProcessorOptions {
  moduleId: string;
  isHydrating: boolean;
  messagesCount: number;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Ref to the parent's handleSendMessage — set after definition to avoid circular deps */
  onSendMessageRef: React.MutableRefObject<((content: import('@/lib/types').MessageContent) => void) | null>;
  sendMessage: (
    content: MessageContent,
    context: ConversationContext,
    signal?: AbortSignal
  ) => Promise<{ response: StructuredResponse; updatedHistory: Message[] }>;
  mountedRef: React.RefObject<boolean>;
}

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

export function useHandoffProcessor({
  moduleId,
  isHydrating,
  messagesCount,
  setMessages,
  onSendMessageRef,
  sendMessage,
  mountedRef
}: UseHandoffProcessorOptions) {
  const handoffProcessedRef = useRef(false);
  const pendingQueryRef = useRef<{ origin: string; issuedAt: string } | null>(null);
  const skipRoutingRef = useRef(false);

  // Reset handoff flag when module changes
  useEffect(() => {
    handoffProcessedRef.current = false;
  }, [moduleId]);

  /**
   * Run the routing-intent classifier and determine whether the message
   * should be delegated to a different module.
   */
  const classifyAndRoute = useCallback(async (
    content: string,
    recentMessages: Message[]
  ): Promise<RoutingResult> => {
    // Specialized modules handle their own routing; skip the LLM classifier entirely
    if (moduleId === 'nexus' || moduleId === 'scout') return { shouldDelegate: false };

    if (skipRoutingRef.current) {
      skipRoutingRef.current = false;
      return { shouldDelegate: false };
    }

    // 1. FAST PATH: Keyword-based classification
    const fastDecision = NexusRoutingService.classifyIntent(content);
    if (fastDecision.target !== 'nexus' && fastDecision.target !== moduleId && fastDecision.confidence >= 0.7) {
      return {
        shouldDelegate: true,
        target: fastDecision.target,
        reason: fastDecision.reason,
        confidence: fastDecision.confidence
      };
    }

    // No actionable routing signal — skip LLM call entirely.
    // If fast path defaulted to orchestrator (no keywords) or matched the current module,
    // the answer is always shouldDelegate: false. Avoid a costly 10s LLM timeout.
    if (fastDecision.target === 'nexus' || fastDecision.target === moduleId) {
      return { shouldDelegate: false };
    }

    // 2. SLOW PATH: LLM-based classification with relaxed timeout
    // Reached only when fast path found a different module but confidence < 0.7.
    try {
      const routingAbort = new AbortController();
      const { response: routeResp } = await Promise.race([
        sendMessage(content, {
          systemPrompt: 'You are a routing intent classifier. Return ONLY a single <action> tag.',
          memoryContext: [],
          summary: 'Classifying intent.',
          history: recentMessages.slice(-3)
        }, routingAbort.signal),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            routingAbort.abort('timeout');
            reject(new Error('Routing classification timeout'));
          }, 10000) // Increased to 10s for better resilience
        )
      ]);

      // M-1: guard post-unmount state update
      if (!mountedRef.current) return { shouldDelegate: false };

      const routeHint = routeResp.actions.find((a) => a.type === 'delegate_to_module')?.payload as
        { target?: string; confidence?: number; reason?: string } | undefined;
      const shouldDelegate =
        routeHint?.target &&
        routeHint.target !== moduleId &&
        (routeHint.confidence || 0) >= 0.62;

      if (shouldDelegate) {
        return {
          shouldDelegate: true,
          target: routeHint.target,
          reason: routeHint.reason,
          confidence: routeHint.confidence
        };
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.warn('Nexus routing gate failed or timed out, continuing in current module.', e);
      }
    }

    return { shouldDelegate: false };
  }, [moduleId, sendMessage, mountedRef]);

  /** Persist a delegation handoff and emit a spine event. */
  const storeDelegation = useCallback((
    target: string,
    content: MessageContent,
    reason?: string,
    confidence?: number
  ) => {
    const contentText = contentToText(content);
    NexusHandoffService.store({
      moduleId: target,
      type: 'delegate',
      content: contentText,
      reason,
      sourceModuleId: moduleId,
      createdAt: new Date().toISOString()
    });

    Spine.emit({
      type: 'MODULE_DELEGATED',
      source: moduleId,
      target,
      domain: 'system',
      data: { content: contentText, confidence, reason },
      cascadeDepth: 0,
      priority: 'info'
    });
  }, [moduleId]);

  /** If a pending cross-module query exists, emit the response back. */
  const handlePendingQueryResult = useCallback((visibleAssistantText: string) => {
    if (!visibleAssistantText || !pendingQueryRef.current) return;

    const queryContext = pendingQueryRef.current;
    pendingQueryRef.current = null;
    const origin = queryContext.origin || 'nexus';

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
      data: { content: visibleAssistantText, reason: 'query_result' },
      cascadeDepth: 0,
      priority: 'info'
    });
  }, [moduleId]);

  // Consume and process incoming handoffs on mount / when hydration completes
  useEffect(() => {
    if (handoffProcessedRef.current) return;
    if (isHydrating || messagesCount > 0) return;

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
          onSendMessageRef.current?.(handoff.content);
        });
      }
      return;
    }

    if (handoff.type === 'query' && handoff.content) {
      setMessages((prev) => (prev.length === 0 ? [{ role: 'assistant', content: handoffNote }] : prev));
      pendingQueryRef.current = {
        origin: handoff.sourceModuleId || 'nexus',
        issuedAt: handoff.createdAt
      };
      queueMicrotask(() => {
        skipRoutingRef.current = true;
        onSendMessageRef.current?.(handoff.content);
      });
    }

    if (handoff.type === 'query_result' && handoff.content) {
      const sourceLabel = handoff.sourceModuleId ? ` from ${handoff.sourceModuleId}` : '';
      const note = `Nexus query result${sourceLabel}: ${handoff.content}`;
      setMessages((prev) =>
        prev.length === 0
          ? [{ role: 'assistant', content: note }]
          : [...prev, { role: 'assistant', content: note }]
      );
    }
  }, [isHydrating, messagesCount, moduleId, setMessages, onSendMessageRef]);

  return {
    classifyAndRoute,
    storeDelegation,
    handlePendingQueryResult
  };
}
