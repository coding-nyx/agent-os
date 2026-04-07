import { useEffect, useRef, useState } from 'react';
import { Spine } from '@/lib/spine/spine-event-bus';
import type { SpineEvent } from '@/lib/types';

const BLOCKED_SEVERITY = 'block';

function getConflictId(event: SpineEvent): string | null {
  const id = event.data?.conflictId;
  return typeof id === 'string' ? id : null;
}

function getSeverity(event: SpineEvent): string | null {
  const sev = event.data?.severity;
  return typeof sev === 'string' ? sev : null;
}

/**
 * Marks Nexus as "conflict-blocking" while a `severity=block` conflict is active.
 *
 * Conflict events are emitted by `NexusSynthesisService` as Spine events:
 * - `CONFLICT_DETECTED` (data: { conflictId, severity, affectedModules })
 * - `CONFLICT_RESOLVED` (data: { conflictId, resolution })
 */
export function useNexusConflictBlocker() {
  const blockedIdsRef = useRef<Set<string>>(new Set());
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  const sync = () => setBlockedIds(Array.from(blockedIdsRef.current));

  useEffect(() => {
    // Some unit tests partially mock Spine; degrade gracefully if `on` is missing.
    if (typeof (Spine as any).on !== 'function') return;

    const handleDetected = (event: SpineEvent) => {
      const conflictId = getConflictId(event);
      const severity = getSeverity(event);
      if (!conflictId) return;
      if (severity !== BLOCKED_SEVERITY) return;

      blockedIdsRef.current.add(conflictId);
      sync();
    };

    const handleResolved = (event: SpineEvent) => {
      const conflictId = getConflictId(event);
      if (!conflictId) return;

      blockedIdsRef.current.delete(conflictId);
      sync();
    };

    const unsubDetected = Spine.on('CONFLICT_DETECTED', handleDetected as any);
    const unsubResolved = Spine.on('CONFLICT_RESOLVED', handleResolved as any);

    return () => {
      try {
        unsubDetected?.();
        unsubResolved?.();
      } catch {
        // ignore
      }
    };
  }, []);

  return {
    isConflictBlocking: blockedIds.length > 0,
    blockedConflicts: blockedIds,
  };
}

