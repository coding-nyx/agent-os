import { useRef, useCallback } from 'react';
import type { Message } from '../types';
import type { ConversationContext } from '@/llm-engine/types';
import type { StructuredResponse } from '@/llm-engine/engine/types';
import { MemoryManager } from '@/llm-engine/engine/MemoryManager';
import { MemoryOrchestrator } from '../services/memory-orchestrator';
import { ModuleMemoryService } from '../services/module-memory-service';

// ~60% of 128k window using real token counts
const CONSOLIDATION_TOKEN_LIMIT = 40000;
// Must be >= MemoryManager.CONTEXT_WINDOW_SIZE * 2 (currently 30)
// to avoid trimming messages the engine still considers "active"
const CONSOLIDATION_KEEP_COUNT = 30;

export interface ConsolidationResult {
  trimmedHistory: Message[];
  lastMessageAt: string;
}

interface UseConsolidationOptions {
  moduleId: string;
  userId: string | undefined;
  isGuest: boolean;
  encryptionKey?: CryptoKey | null;
  sendMessage: (
    content: string,
    context: ConversationContext,
    signal?: AbortSignal
  ) => Promise<{ response: StructuredResponse; updatedHistory: Message[] }>;
  enhanceContext: (context: ConversationContext) => ConversationContext;
  mountedRef: React.RefObject<boolean>;
}

export function useConsolidation({
  moduleId,
  userId,
  isGuest,
  encryptionKey,
  sendMessage,
  enhanceContext,
  mountedRef
}: UseConsolidationOptions) {
  const consolidationRef = useRef(false);
  const consolidationRetryRef = useRef(0);

  /**
   * Checks whether consolidation is needed and, if so, summarises old
   * messages, commits the session snapshot to episodic memory, and returns
   * the trimmed history.  The caller is responsible for updating local
   * state and the active-session document (to keep signature ordering).
   */
  const consolidateIfNeeded = useCallback(async (
    localHistory: Message[],
    sessionStartTime: string
  ): Promise<ConsolidationResult | null> => {
    if (!userId || isGuest) return null;

    const tokenEstimate = MemoryManager.countTokens(
      localHistory.map((m) => m.content).join(' ')
    );
    if (
      tokenEstimate < CONSOLIDATION_TOKEN_LIMIT ||
      consolidationRef.current ||
      consolidationRetryRef.current >= 3
    ) {
      return null;
    }

    consolidationRef.current = true;
    try {
      // H-6: only send messages that are about to be pushed out of the window
      const toConsolidate = MemoryManager.getMessagesForConsolidation(localHistory);
      if (toConsolidate.length === 0) return null;

      const { response: consolidation } = await sendMessage(
        'Summarize the session. Format EXACTLY:\nSUMMARY: <2-3 sentences>\nINSIGHTS:\n- <insight 1>\n- <insight 2>\n- <insight 3>',
        enhanceContext({
          systemPrompt: 'You are a memory consolidation agent. Be concise and factual.',
          memoryContext: [],
          summary: 'Consolidating session memory.',
          history: toConsolidate
        })
      );

      // M-1: guard post-unmount
      if (!mountedRef.current) return null;

      const parsed = MemoryOrchestrator.parseInsightLines(consolidation.fullText);
      const summary = parsed.summary || 'Session consolidated.';
      const keyInsights = parsed.insights;

      const existing = await ModuleMemoryService.getEnvelope(userId, moduleId, encryptionKey);
      if (!existing) {
        await ModuleMemoryService.initializeEnvelope(userId, moduleId);
      }

      await ModuleMemoryService.commitSession(
        userId,
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
          history: localHistory
        }),
        { encryptionKey }
      );

      const trimmed = localHistory.slice(-CONSOLIDATION_KEEP_COUNT);
      const lastMessageAt = new Date().toISOString();

      // Active-session save after trimming: the caller must set the
      // remote signature *before* this fire-and-forget completes, so it
      // is left to the caller to save the active session document.
      return { trimmedHistory: trimmed, lastMessageAt };
    } catch (e) {
      console.error('Failed to consolidate session:', e);
      consolidationRetryRef.current += 1;
      return null;
    } finally {
      consolidationRef.current = false;
    }
  }, [moduleId, userId, isGuest, encryptionKey, sendMessage, enhanceContext, mountedRef]);

  const resetConsolidation = useCallback(() => {
    consolidationRetryRef.current = 0;
  }, []);

  return { consolidateIfNeeded, resetConsolidation };
}
