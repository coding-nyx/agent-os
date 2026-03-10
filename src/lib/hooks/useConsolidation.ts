import { useRef, useCallback } from 'react';
import type { Message } from '../types';
import type { ConversationContext } from '@/lib/ai-adapters/engine-types';
import type { StructuredResponse } from '@/lib/ai-adapters/engine-types';
import { MemoryManager } from '@/lib/ai-adapters/memory-manager';
import { MemoryOrchestrator } from '../services/memory-orchestrator';
import { ModuleMemoryService } from '../services/module-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import { MODULE_MANIFEST } from '../module-manifest';

export interface ConsolidationResult {
  trimmedHistory: Message[];
  lastMessageAt: string;
  metadata: {
    trigger: 'token' | 'window';
    tokenEstimate: number;
    keptCount: number;
    originalLength: number;
  };
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

  const consolidateIfNeeded = useCallback(async (
    localHistory: Message[],
    sessionStartTime: string
  ): Promise<ConsolidationResult | null> => {
    if (!userId || isGuest) return null;

    const securityPolicy = MODULE_MANIFEST[moduleId as keyof typeof MODULE_MANIFEST]?.securityPolicy;
    const requiresVault = securityPolicy ? (securityPolicy.mandatory || securityPolicy.defaultLocked) : false;

    // Hard guard: do not consolidate vault-scoped data without an encryption key.
    if (requiresVault && !encryptionKey) {
      console.warn('Consolidation skipped: missing encryption key for protected module.');
      return null;
    }

    const tokenEstimate = localHistory.reduce((sum, msg) => sum + MemoryManager.getMessageTokens(msg), 0);
    const tokenThreshold = MemoryManager.getConsolidationTokenThreshold();
    const needsByToken = tokenEstimate >= tokenThreshold;
    const needsByWindow = localHistory.length > MemoryManager.getConsolidationKeepCount();

    if (
      (!needsByToken && !needsByWindow) ||
      consolidationRef.current ||
      consolidationRetryRef.current >= 3
    ) {
      return null;
    }

    consolidationRef.current = true;
    try {
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

      if (!mountedRef.current) return null;

      const parsed = MemoryOrchestrator.parseInsightLines(consolidation.fullText);
      const summary = parsed.summary || 'Session consolidated.';
      const keyInsights = parsed.insights;

      const existing = await ModuleMemoryService.getEnvelope(userId, moduleId, encryptionKey);
      if (!existing) {
        await ModuleMemoryService.initializeEnvelope(userId, moduleId, encryptionKey);
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
        { encryptionKey, facts: keyInsights }
      );

      // Emit semantic facts (best-effort; non-blocking)
      if (keyInsights.length > 0) {
        keyInsights.forEach((fact) => {
          SemanticMemoryService.upsertFact(userId, {
            moduleId,
            fact,
            confidence: 0.72
          });
        });
      }

      const keepCount = MemoryManager.getConsolidationKeepCount();
      const trimmed = localHistory.slice(-keepCount);
      const lastMessageAt = new Date().toISOString();
      const consolidationTrigger = needsByToken ? 'token' : 'window';

      return {
        trimmedHistory: trimmed,
        lastMessageAt,
        metadata: {
          trigger: consolidationTrigger,
          tokenEstimate,
          keptCount: keepCount,
          originalLength: localHistory.length
        }
      };
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
