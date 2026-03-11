/**
 * useCrossModuleHintListener — S10-008
 *
 * Subscribes to CONTEXT_HINT_DETECTED Spine events, verifies each hint
 * against the stored profile, and exposes an activeHint for the
 * DataSyncToast to render.
 *
 * Design principles:
 *  - Single responsibility: event subscription + dedup + state management only.
 *  - All side-effect logic (verification, ActionHub dispatch) is delegated.
 *  - Hint deduplication by targetModule+field prevents stacking identical hints.
 */

import { useCallback, useRef, useState } from 'react';
import { useSpineEvent } from '@/lib/spine/spine-event-bus';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ActionHub } from '@/lib/actions/action-hub';
import { useAuth } from '@/lib/auth-context';
import { verifyHintAgainstProfile, incrementHintCount } from '@/lib/services/context-inference-service';
import type { DataHint, HintVerificationResult } from '@/lib/types';
import type { ActionContext } from '@/lib/actions/action-hub';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface CrossModuleHintListenerResult {
  activeHint: HintVerificationResult | null;
  dismissHint: () => void;
  confirmHint: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Listens for CONTEXT_HINT_DETECTED events on the Spine, verifies them
 * against Firestore, and returns the active discrepant hint (if any) along
 * with confirm / dismiss callbacks.
 */
export function useCrossModuleHintListener(): CrossModuleHintListenerResult {
  const { user } = useAuth();
  const [activeHint, setActiveHint] = useState<HintVerificationResult | null>(null);

  // Track which hint keys are already queued/displayed to prevent duplicates.
  const pendingKeys = useRef(new Set<string>());

  // Stable dedup key derived from the hint payload.
  const hintKey = (hint: DataHint) => `${hint.targetModule}::${hint.field}`;

  // -------------------------------------------------------------------------
  // Spine subscription
  // -------------------------------------------------------------------------
  useSpineEvent('CONTEXT_HINT_DETECTED', async (event) => {
    const hint = (event.data as unknown) as DataHint | undefined;
    if (!hint || typeof hint !== 'object') return;

    // Guard: require a live, authenticated session.
    const userId = user?.uid;
    if (!userId) return;

    const key = hintKey(hint);

    // Deduplication: skip if already processing or displaying this hint.
    if (pendingKeys.current.has(key)) return;
    pendingKeys.current.add(key);

    try {
      const result = await verifyHintAgainstProfile(hint, userId);

      if (result.isDiscrepant) {
        setActiveHint(result);
      }
    } catch {
      // Verification errors are non-critical — silently discard.
    } finally {
      pendingKeys.current.delete(key);
    }
  });

  // -------------------------------------------------------------------------
  // Dismiss
  // -------------------------------------------------------------------------
  const dismissHint = useCallback(() => {
    if (!activeHint) return;

    const { hint } = activeHint;

    Spine.publish({
      type: 'CONTEXT_HINT_DISMISSED',
      source: hint.sourceModule,
      domain: 'C',
      priority: 'info',
      data: hint as unknown as Record<string, unknown>,
    });

    incrementHintCount(hint.targetModule);
    setActiveHint(null);
  }, [activeHint]);

  // -------------------------------------------------------------------------
  // Confirm
  // -------------------------------------------------------------------------
  const confirmHint = useCallback(() => {
    if (!activeHint) return;

    const { hint, confirmActionType } = activeHint;

    if (confirmActionType) {
      // Build a minimal ActionContext for the dispatch.
      const ctx: ActionContext = {
        userId: user?.uid,
        isGuest: !user?.uid,
        moduleId: hint.targetModule,
        payload: {
          field: hint.field,
          value: hint.inferredValue,
        },
        emitSpineEvent: (type, data) => {
          Spine.publish({
            type,
            source: hint.targetModule,
            domain: 'C',
            priority: 'info',
            data,
          });
        },
        updateGlobalSoul: async () => {
          /* no-op for hint confirmations — module action handles NSV */
        },
        delegateToModule: () => {
          /* no-op */
        },
      };

      // Fire and forget — errors must not block the UI update.
      ActionHub.execute(hint.targetModule, confirmActionType, ctx).catch(() => {
        /* silent */
      });
    }

    Spine.publish({
      type: 'CONTEXT_HINT_CONFIRMED',
      source: hint.sourceModule,
      domain: 'C',
      priority: 'info',
      data: hint as unknown as Record<string, unknown>,
    });

    incrementHintCount(hint.targetModule);
    setActiveHint(null);
  }, [activeHint, user?.uid]);

  return { activeHint, dismissHint, confirmHint };
}
