// --- useSomaHealth — React hook for SomaDataService consumption ---
//
// Provides reactive health snapshot + readiness score to UI components.
// Wraps SomaDataService with proper lifecycle management (loading, error, refresh).

import { useState, useEffect, useCallback, useRef } from 'react';
import { SomaDataService } from '@/modules/soma/services/soma-data-service';
import type { SomaHealthSnapshot } from '@/modules/soma/types';

export interface UseSomaHealthResult {
  healthSnapshot: SomaHealthSnapshot | null;
  readinessScore: number | null;
  isLoading: boolean;
  error: Error | null;
  refreshHealth: () => void;
}

/**
 * React hook that loads and subscribes to a user's Soma health data.
 *
 * Usage:
 * ```tsx
 * const { healthSnapshot, readinessScore, isLoading } = useSomaHealth(userId);
 * ```
 *
 * @param userId - The user ID to load health data for. If undefined/null, returns defaults.
 * @param encryptionKey - Optional CryptoKey for decrypting health data.
 *   When omitted, only cached (previously-decrypted) data is available.
 */
export function useSomaHealth(
  userId?: string | null,
  encryptionKey?: CryptoKey | null,
): UseSomaHealthResult {
  const [healthSnapshot, setHealthSnapshot] = useState<SomaHealthSnapshot | null>(null);
  const [readinessScore, setReadinessScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Track the current request to avoid stale updates
  const requestIdRef = useRef(0);

  const loadHealth = useCallback(async () => {
    if (!userId) {
      setHealthSnapshot(null);
      setReadinessScore(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const [snapshot, readiness] = await Promise.all([
        SomaDataService.getHealthSnapshot(userId, encryptionKey ?? undefined),
        SomaDataService.getReadinessScore(userId, encryptionKey ?? undefined),
      ]);

      // Guard against stale responses
      if (requestId !== requestIdRef.current) return;

      setHealthSnapshot(snapshot);
      setReadinessScore(readiness.score);
    } catch (e) {
      // Guard against stale responses
      if (requestId !== requestIdRef.current) return;

      const err = e instanceof Error ? e : new Error(String(e));
      console.error('[useSomaHealth] Failed to load health data:', err);
      setError(err);
      setHealthSnapshot(null);
      setReadinessScore(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, encryptionKey]);

  // Load on mount and when userId/encryptionKey changes
  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // Subscribe to real-time updates when encryption key is available
  useEffect(() => {
    if (!userId || !encryptionKey) return;

    const unsubscribe = SomaDataService.subscribeToHealth(
      userId,
      encryptionKey,
      (snapshot) => {
        setHealthSnapshot(snapshot);
        // Refresh readiness score when snapshot changes
        SomaDataService.getReadinessScore(userId, encryptionKey)
          .then((r) => setReadinessScore(r.score))
          .catch((e) => console.error('[useSomaHealth] Failed to refresh readiness:', e));
      },
    );

    return unsubscribe;
  }, [userId, encryptionKey]);

  const refreshHealth = useCallback(() => {
    if (userId) {
      SomaDataService.invalidateCache(userId);
    }
    loadHealth();
  }, [userId, loadHealth]);

  return {
    healthSnapshot,
    readinessScore,
    isLoading,
    error,
    refreshHealth,
  };
}
