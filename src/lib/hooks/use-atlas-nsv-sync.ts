/**
 * useAtlasNSVSync
 *
 * Verifies Atlas NSV writes are received by GlobalProjectionService.
 * Performs a round-trip check after each write and re-emits on discrepancy.
 *
 * Usage: call `verifyNSVWrite(fields, expectedValues)` after `updateGlobalSoul`.
 */

import { useCallback, useRef } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { NeuralStateVectorPatch } from '@/lib/types';

export interface NSVVerificationResult {
  verified: boolean;
  discrepancies: string[];
  attemptedAt: string;
}

export interface UseAtlasNSVSyncReturn {
  /**
   * Verify that the provided NSV patch values are reflected in the
   * current global soul state. Reads the GlobalProjection and compares.
   *
   * @param expectedPatch - The NSV patch that was written
   * @param getCurrentNSV - Callback that returns the current NSV (from context)
   * @param retryCount - How many times to retry on discrepancy (default: 1)
   */
  verifyNSVWrite: (
    expectedPatch: NeuralStateVectorPatch,
    getCurrentNSV: () => Record<string, unknown> | null | undefined,
    retryCount?: number
  ) => Promise<NSVVerificationResult>;
}

export function useAtlasNSVSync(): UseAtlasNSVSyncReturn {
  const pendingVerifications = useRef<Set<string>>(new Set());

  const verifyNSVWrite = useCallback(async (
    expectedPatch: NeuralStateVectorPatch,
    getCurrentNSV: () => Record<string, unknown> | null | undefined,
    retryCount = 1
  ): Promise<NSVVerificationResult> => {
    const attemptedAt = new Date().toISOString();
    const discrepancies: string[] = [];

    // Wait a tick for the write to propagate
    await new Promise(resolve => setTimeout(resolve, 200));

    const currentNSV = getCurrentNSV();
    if (!currentNSV) {
      return { verified: false, discrepancies: ['NSV unavailable'], attemptedAt };
    }

    // Check cognitive domain fields Atlas writes
    const cogPatch = expectedPatch.cognitive;
    if (cogPatch) {
      const currentCog = currentNSV.cognitive as Record<string, unknown> | undefined;
      for (const [key, expectedVal] of Object.entries(cogPatch)) {
        if (expectedVal === undefined) continue;
        const actualVal = currentCog?.[key];
        if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
          if (Math.abs(expectedVal - actualVal) > 0.5) {
            discrepancies.push(`cognitive.${key}: expected ${expectedVal}, got ${actualVal}`);
          }
        }
      }
    }

    // Check planning domain fields
    const planPatch = expectedPatch.planning;
    if (planPatch) {
      const currentPlan = currentNSV.planning as Record<string, unknown> | undefined;
      for (const [key, expectedVal] of Object.entries(planPatch)) {
        if (expectedVal === undefined) continue;
        const actualVal = currentPlan?.[key];
        if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
          if (Math.abs(expectedVal - actualVal) > 0.5) {
            discrepancies.push(`planning.${key}: expected ${expectedVal}, got ${actualVal}`);
          }
        }
      }
    }

    if (discrepancies.length > 0 && retryCount > 0) {
      // Re-emit an NSV calibration request so the system can re-sync
      const verificationId = crypto.randomUUID();
      if (!pendingVerifications.current.has(verificationId)) {
        pendingVerifications.current.add(verificationId);
        Spine.emit({
          type: 'NSV_CALIBRATION_REQUEST',
          source: 'use-atlas-nsv-sync',
          domain: 'C',
          priority: 'info',
          target: 'atlas',
          data: {
            discrepancies,
            expectedPatch,
            reason: 'round_trip_verification_failed',
            verificationId,
          },
        });
        // Wait for potential re-sync then retry once
        await new Promise(resolve => setTimeout(resolve, 500));
        pendingVerifications.current.delete(verificationId);
        return verifyNSVWrite(expectedPatch, getCurrentNSV, retryCount - 1);
      }
    }

    return {
      verified: discrepancies.length === 0,
      discrepancies,
      attemptedAt,
    };
  }, []);

  return { verifyNSVWrite };
}
