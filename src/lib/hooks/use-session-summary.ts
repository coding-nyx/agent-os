/**
 * Background session summary generation — extracted from use-module-ai.ts.
 *
 * Generates a compressed summary of conversation messages older than the
 * history window so the LLM never loses early-session context.  Runs off
 * the critical path (after each assistant turn) so TTFT is unaffected.
 */

import { useCallback, useRef } from 'react';
import type { Message, MessageContent } from '../types';

// ─── Constants (mirrored from use-module-ai.ts) ────────────────────────
const HISTORY_WINDOW = 40;

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => (part as { type: 'text'; text: string }).text)
    .join(' ');
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface SessionSummary {
  summary: string;
  coveredUpTo: number;
}

export interface UseSessionSummaryOptions {
  moduleId: string;
  user: { uid: string } | null;
  isGuest: boolean;
  sendMessage: (
    content: string,
    context: {
      moduleId: string;
      systemPrompt: string;
      memoryContext: never[];
      summary: string;
      history: never[];
    },
  ) => Promise<{ response: { publicText: string } }>;
  threadIdRef: React.MutableRefObject<string | undefined>;
  mountedRef: React.MutableRefObject<boolean>;
}

export interface UseSessionSummaryReturn {
  /** Ref holding the current summary (null until first overflow). */
  sessionSummaryRef: React.MutableRefObject<SessionSummary | null>;
  /** Trigger summary generation if messages exceed HISTORY_WINDOW. */
  refreshSessionSummaryIfNeeded: (currentMessages: Message[]) => Promise<void>;
  /** Reset summary state (e.g. on session/module change). */
  resetSummary: () => void;
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useSessionSummary({
  moduleId,
  user,
  isGuest,
  sendMessage,
  threadIdRef,
  mountedRef,
}: UseSessionSummaryOptions): UseSessionSummaryReturn {
  const sessionSummaryRef = useRef<SessionSummary | null>(null);
  const summaryGeneratingRef = useRef(false);

  const resetSummary = useCallback(() => {
    sessionSummaryRef.current = null;
    summaryGeneratingRef.current = false;
  }, []);

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
          moduleId,
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
  }, [isGuest, user, sendMessage, moduleId, threadIdRef, mountedRef]);

  return {
    sessionSummaryRef,
    refreshSessionSummaryIfNeeded,
    resetSummary,
  };
}
