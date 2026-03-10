import { useState, useEffect, useCallback } from 'react';
import { MessageContent } from '../types';

export interface PendingRequestState {
  moduleId: string;
  userMessage: MessageContent;
  timestamp: string;
  status: 'pending' | 'failed';
}

export function usePendingRecovery(moduleId: string) {
  const [pendingRequest, setPendingRequest] = useState<PendingRequestState | null>(null);
  
  const storageKey = `nexus_pending_${moduleId}`;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingRequestState;
        if (parsed.status === 'pending' || parsed.status === 'failed') {
          // Check if it's less than 24 hours old to avoid stale recoveries
          const age = Date.now() - new Date(parsed.timestamp).getTime();
          if (age < 24 * 60 * 60 * 1000) {
            setPendingRequest(parsed);
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse pending request', e);
    }
  }, [moduleId, storageKey]);

  const savePendingRequest = useCallback((userMessage: MessageContent) => {
    const state: PendingRequestState = {
      moduleId,
      userMessage,
      timestamp: new Date().toISOString(),
      status: 'pending'
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

  const markPendingRequestFailed = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingRequestState;
        parsed.status = 'failed';
        localStorage.setItem(storageKey, JSON.stringify(parsed));
        setPendingRequest(parsed);
      }
    } catch (e) {
      console.warn('Failed to mark pending request as failed', e);
    }
  }, [storageKey]);

  return {
    pendingRequest,
    savePendingRequest,
    clearPendingRequest,
    markPendingRequestFailed
  };
}