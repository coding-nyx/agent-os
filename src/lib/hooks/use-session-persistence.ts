/**
 * Owns session hydration, debounced Firestore persistence, cross-tab sync,
 * and beforeunload flush — extracted from use-module-ai.ts.
 *
 * All refs that back the persistence pipeline (saveTimer, writeNonce,
 * remoteSignature, hydratedFromRemote, messagesRef, lastCompactionNotice)
 * live here.  The parent hook (`useModuleAI`) passes down the handful of
 * mutable refs it already owns that persistence also reads at flush time
 * (isProcessingRef, currentAssistantMessageBodyRef, etc.).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Message, ContextPolicy } from '../types';
import type { PersistencePolicy } from './use-module-ai';
import { ModuleMemoryService } from '../services/module-memory-service';

// ─── Types ──────────────────────────────────────────────────────────────

export interface UseSessionPersistenceOptions {
  moduleId: string;
  activeSessionId: string;
  resolvedContextPolicy: ContextPolicy;
  persistencePolicy: PersistencePolicy;
  user: { uid: string } | null;
  isGuest: boolean;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  /** Ref kept in sync with `messages` by the parent */
  isProcessingRef: React.MutableRefObject<boolean>;
  currentAssistantMessageBodyRef: React.MutableRefObject<string>;
  threadIdRef: React.MutableRefObject<string | undefined>;
  sessionStartRef: React.MutableRefObject<string>;
  mountedRef: React.MutableRefObject<boolean>;
}

export interface UseSessionPersistenceReturn {
  isHydrating: boolean;
  /** Immediately flush the current session to Firestore / sessionStorage. */
  flushActiveSession: (forceRemote?: boolean) => void;
  maybeWarnHistoryCompaction: (droppedCount: number) => void;
  maybeWarnSizePressure: (estimatedBytes: number, hardLimitExceeded: boolean) => void;
  /** Cancel any pending debounced save timer (used by clearSession). */
  cancelPendingSave: () => void;
  /**
   * Mutable ref tracking messages — kept in sync via `.current = messages`.
   * Exposed so `clearSession` can zero it out synchronously.
   */
  messagesRef: React.MutableRefObject<Message[]>;
  /** Ref tracking the last remote signature — exposed for reset on clearSession. */
  lastRemoteSignatureRef: React.MutableRefObject<string | null>;
  /**
   * Nonce of the last local flush write. Consolidation writes in handleSendMessage
   * set this directly so the subscription echo-suppression works correctly.
   */
  lastWriteNonceRef: React.MutableRefObject<string | null>;
}

// ─── Hook ───────────────────────────────────────────────────────────────

export function useSessionPersistence({
  moduleId,
  activeSessionId,
  resolvedContextPolicy,
  persistencePolicy,
  user,
  isGuest,
  messages,
  setMessages,
  setError,
  isProcessingRef,
  currentAssistantMessageBodyRef,
  threadIdRef,
  sessionStartRef,
  mountedRef,
}: UseSessionPersistenceOptions): UseSessionPersistenceReturn {
  const [isHydrating, setIsHydrating] = useState(true);

  // ── Owned refs ──────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const lastCompactionNoticeAtRef = useRef(0);
  const lastRemoteSignatureRef = useRef<string | null>(null);
  const hydratedFromRemoteRef = useRef(false);
  const lastWriteNonceRef = useRef<string | null>(null);

  // ── Warning callbacks ───────────────────────────────────────────────

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

  // ── Core flush callback ─────────────────────────────────────────────

  const flushActiveSession = useCallback((forceRemote = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    let currentMessages = [...messagesRef.current];

    // If we are currently processing a stream, include the partial content
    // so it's not lost on page reload/unmount.
    if (isProcessingRef.current && currentAssistantMessageBodyRef.current.trim()) {
      currentMessages = [...currentMessages, {
        role: 'assistant',
        content: currentAssistantMessageBodyRef.current,
        threadId: threadIdRef.current,
      } as Message];
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
      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      lastWriteNonceRef.current = nonce;
      ModuleMemoryService.saveActiveSession(user.uid, {
        sessionId: activeSessionId,
        moduleId,
        startTime: sessionStartRef.current,
        lastMessageAt,
        history: persistableMessages,
        tokenCount: 0,
        isGuestTrial: false,
        contextPolicy: resolvedContextPolicy,
        _writeNonce: nonce,
      })
        .catch((e) => console.error('Failed to save active session:', e));
    }

    // Always persist to sessionStorage as a lightweight fallback
    try {
      sessionStorage.setItem(`ara_session_${moduleId}_${activeSessionId}`, JSON.stringify({
        history: persistableMessages,
        startTime: sessionStartRef.current,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* sessionStorage full or unavailable */ }
  }, [user, isGuest, moduleId, activeSessionId, resolvedContextPolicy, persistencePolicy, isProcessingRef, currentAssistantMessageBodyRef, threadIdRef, sessionStartRef]);

  // ── Hydration: restore session on mount + subscribe for cross-tab sync ──

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    if (persistencePolicy === 'ephemeral') {
      // Ephemeral (impromptu) sessions: sessionStorage only, never Firestore
      try {
        const cached = sessionStorage.getItem(`ara_session_${moduleId}_${activeSessionId}`);
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
        if (!mounted || !mountedRef.current) return;
        // Skip subscription echoes entirely while the agent is actively processing.
        if (isProcessingRef.current) {
          setIsHydrating(false);
          return;
        }
        if (session && session.history?.length > 0) {
          const signature = `${session.lastMessageAt}:${session.history.length}`;
          if (signature !== lastRemoteSignatureRef.current) {
            lastRemoteSignatureRef.current = signature;
            // RC-1 fix: skip echoes of our own writes.
            const isOwnEcho = session._writeNonce != null && session._writeNonce === lastWriteNonceRef.current;
            if (isOwnEcho) {
              setIsHydrating(false);
              return;
            }
            const remoteLen = session.history.length;
            const currentMsgs = messagesRef.current;
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
        const cached = sessionStorage.getItem(`ara_session_${moduleId}_${activeSessionId}`);
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
  }, [user, isGuest, moduleId, activeSessionId, persistencePolicy, setMessages, sessionStartRef, mountedRef, isProcessingRef]);

  // ── Debounced save: persist when messages change ────────────────────

  useEffect(() => {
    if (isHydrating || messages.length === 0) return;
    // Skip echo-save when messages were just hydrated from Firestore
    if (hydratedFromRemoteRef.current) {
      hydratedFromRemoteRef.current = false;
      return;
    }

    // For scout-research, we only save to remote on specific commit actions
    if (persistencePolicy === 'scout-research') {
      try {
        sessionStorage.setItem(`ara_session_${moduleId}_${activeSessionId}`, JSON.stringify({
          history: messages,
          startTime: sessionStartRef.current,
          savedAt: new Date().toISOString(),
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
  }, [isHydrating, messages, flushActiveSession, persistencePolicy, moduleId, activeSessionId, sessionStartRef]);

  // ── Flush pending saves on tab close ────────────────────────────────

  useEffect(() => {
    const handleBeforeUnload = () => flushActiveSession();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushActiveSession]);

  // ── cancelPendingSave — for clearSession ────────────────────────────

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  return {
    isHydrating,
    flushActiveSession,
    maybeWarnHistoryCompaction,
    maybeWarnSizePressure,
    cancelPendingSave,
    messagesRef,
    lastRemoteSignatureRef,
    lastWriteNonceRef,
  };
}
