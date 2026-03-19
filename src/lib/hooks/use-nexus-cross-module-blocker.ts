import { useEffect, useMemo, useRef, useState } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import { HUB_MODULE_ORDER, type ModuleId } from '@/lib/module-manifest';
import type { SpineEvent, SpineEventType } from '@/lib/types';

type PendingMap = Map<ModuleId, number>;

const HANDOFF_TTL_MS = 10 * 60 * 1000; // must match `NexusHandoffService` stale pruning window

function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && (HUB_MODULE_ORDER as readonly string[]).includes(value);
}

function getTargetAsModuleId(event: SpineEvent): ModuleId | null {
  if (!event.target) return null;
  return isModuleId(event.target) ? (event.target as ModuleId) : null;
}

function getSourceAsModuleId(event: SpineEvent): ModuleId | null {
  return isModuleId(event.source) ? (event.source as ModuleId) : null;
}

/**
 * Tracks when Nexus is waiting for another module to respond (delegate/query).
 *
 * The Nexus chat input is disabled while pending targets exist, and cleared when:
 * - the target module emits `VITAL_UPDATED`, OR
 * - the target module returns a `query_result` to Nexus (MODE_DELEGATED → target=orchestrator with reason).
 */
export function useNexusCrossModuleBlocker() {
  const trackedTargets = useMemo(() => new Set<ModuleId>(HUB_MODULE_ORDER), []);
  const pendingMapRef = useRef<PendingMap>(new Map());
  const [pendingTargets, setPendingTargets] = useState<ModuleId[]>([]);

  const syncPendingState = () => {
    setPendingTargets(Array.from(pendingMapRef.current.keys()));
  };

  useEffect(() => {
    // Unit tests sometimes partially mock `Spine` (e.g. only `getRecentEvents`).
    // In that case, we must degrade gracefully instead of crashing.
    if (typeof (Spine as any).on !== 'function') return;

    const addPending = (target: ModuleId) => {
      if (pendingMapRef.current.has(target)) return;
      pendingMapRef.current.set(target, Date.now());
      syncPendingState();
    };

    const removePending = (target: ModuleId) => {
      if (!pendingMapRef.current.has(target)) return;
      pendingMapRef.current.delete(target);
      syncPendingState();
    };

    const clearAll = () => {
      if (pendingMapRef.current.size === 0) return;
      pendingMapRef.current.clear();
      syncPendingState();
    };

    const handleModuleDelegated = (event: SpineEvent) => {
      // Nexus started a delegation: lock until the target finishes.
      if (event.source === 'nexus') {
        const targetId = getTargetAsModuleId(event);
        if (targetId && trackedTargets.has(targetId)) {
          addPending(targetId);
          return;
        }
      }

      // Query results: Nexus is the target, and the source module is responding.
      // useHandoffProcessor emits `MODULE_DELEGATED` with `data.reason === 'query_result'`.
      if (event.target === 'nexus' && event.type === ('MODULE_DELEGATED' as SpineEventType)) {
        const reason = event.data?.reason;
        if (reason === 'query_result') {
          const sourceId = getSourceAsModuleId(event);
          if (sourceId) removePending(sourceId);
          else clearAll();
        }
      }
    };

    const handleVitalUpdated = (event: SpineEvent) => {
      const sourceId = getSourceAsModuleId(event);
      if (sourceId && pendingMapRef.current.has(sourceId)) {
        removePending(sourceId);
      }
    };

    const unsubDelegated = Spine.on('MODULE_DELEGATED', handleModuleDelegated);
    const unsubVital = Spine.on('VITAL_UPDATED', handleVitalUpdated);

    // Safety net: clear stale pending targets so chat never deadlocks.
    const interval = window.setInterval(() => {
      if (pendingMapRef.current.size === 0) return;
      const now = Date.now();
      let changed = false;
      for (const [target, startedAt] of pendingMapRef.current.entries()) {
        if (now - startedAt > HANDOFF_TTL_MS) {
          pendingMapRef.current.delete(target);
          changed = true;
        }
      }
      if (changed) syncPendingState();
    }, 1000);

    return () => {
      try {
        unsubDelegated?.();
        unsubVital?.();
      } catch {
        // ignore unsubscribe errors
      }
      window.clearInterval(interval);
    };
  }, [trackedTargets]);

  return {
    isCrossModuleBusy: pendingTargets.length > 0,
    pendingTargets,
  };
}

