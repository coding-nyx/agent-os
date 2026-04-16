import { useState, useEffect, useCallback } from 'react';
import { MessageContent } from '../types';

export interface PendingRequestState {
  moduleId: string;
  userMessage: MessageContent;
  timestamp: string;
  status: 'pending' | 'failed' | 'blocked';
  attempts: number;
  contextHash?: string;
}

const MAX_RECOVERY_ATTEMPTS = 3;

export function usePendingRecovery(moduleId: string) {
  const [pendingRequest, setPendingRequest] = useState<PendingRequestState | null>(null);
  
  const storageKey = `ara_pending_${moduleId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingRequestState;
        if (parsed.status === 'pending' || parsed.status === 'failed' || parsed.status === 'blocked') {
          const normalized: PendingRequestState = {
            ...parsed,
            attempts: typeof parsed.attempts === 'number' ? parsed.attempts : 0
          };
          // Check if it's less than 24 hours old to avoid stale recoveries
          const age = Date.now() - new Date(normalized.timestamp).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            setPendingRequest(normalized);
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse pending request', e);
    }
  }, [moduleId, storageKey]);

  const savePendingRequest = useCallback((userMessage: MessageContent, contextHash?: string) => {
    const state: PendingRequestState = {
      moduleId,
      userMessage,
      timestamp: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      contextHash
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save pending request', e);
    }
  }, [moduleId, storageKey]);

  const clearPendingRequest = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setPendingRequest(null);
    } catch (e) {
      console.warn('Failed to clear pending request', e);
    }
  }, [storageKey]);

  const markPendingRequestFailed = useCallback((forceFailed = false) => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingRequestState;
        const attempts = (parsed.attempts || 0) + 1;
        const next: PendingRequestState = {
          ...parsed,
          attempts,
          status: forceFailed || attempts >= MAX_RECOVERY_ATTEMPTS ? 'failed' : 'pending'
        };
        localStorage.setItem(storageKey, JSON.stringify(next));
        setPendingRequest(next);
      }
    } catch (e) {
      console.warn('Failed to mark pending request as failed', e);
    }
  }, [storageKey]);

  const markPendingRequestBlocked = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingRequestState;
        const next: PendingRequestState = { ...parsed, status: 'blocked' };
        localStorage.setItem(storageKey, JSON.stringify(next));
        setPendingRequest(next);
      }
    } catch (e) {
      console.warn('Failed to mark pending request as blocked', e);
    }
  }, [storageKey]);

  const markPendingRequestPending = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingRequestState;
        const next: PendingRequestState = { ...parsed, status: 'pending' };
        localStorage.setItem(storageKey, JSON.stringify(next));
        setPendingRequest(next);
      }
    } catch (e) {
      console.warn('Failed to mark pending request as pending', e);
    }
  }, [storageKey]);

  return {
    pendingRequest,
    savePendingRequest,
    clearPendingRequest,
    markPendingRequestFailed,
    markPendingRequestBlocked,
    markPendingRequestPending
  };
}
