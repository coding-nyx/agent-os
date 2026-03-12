/**
 * useNsvTrends
 *
 * Computes a per-domain TrendDirection by comparing the current NSV against
 * the snapshot saved from the previous session.
 *
 * - Loads the previous snapshot once on mount.
 * - Saves a new snapshot 5 s after the last NSV change (debounced) so rapid
 *   updates don't thrash localStorage.
 * - Returns 'unknown' for any domain that lacks sufficient history or data.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { NsvSnapshotService, flattenNsv, type NsvSnapshot } from '@/lib/services/nsv-snapshot-service';
import type { TrendDirection } from '@/core/components/TrendArrow';

// ---------------------------------------------------------------------------
// Domain → NSV metric paths that indicate "health" for that domain.
// These must exactly match the dot-notation paths in NeuralStateVector.
// ---------------------------------------------------------------------------
const DOMAIN_KEYS: Record<string, string[]> = {
  biological: [
    'biological.recoveryScore',
    'biological.sleepQuality',
    'biological.cnsFatigue',   // inverted — high fatigue is bad
  ],
  cognitive: [
    'cognitive.energyBudget',
    'cognitive.focusScore',
    'cognitive.activeLoad',    // inverted — high load is bad
  ],
  emotional: [
    'emotional.emotionalResilience',
    'emotional.stressLoad',    // inverted — high stress is bad
  ],
  resource: [
    'resource.resonanceROI',
    'resource.financialFriction', // inverted — high friction is bad
  ],
};

/** Keys where a LOWER value is better (trend sign is flipped). */
const INVERT_KEYS = new Set<string>([
  'biological.cnsFatigue',
  'cognitive.activeLoad',
  'emotional.stressLoad',
  'resource.financialFriction',
]);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Compute the trend direction for a single metric.
 *
 * @param current  - current metric value
 * @param previous - previous (snapshot) metric value
 * @param inverted - true when a lower value is considered "better"
 */
function computeMetricTrend(
  current: number,
  previous: number,
  inverted: boolean,
): TrendDirection {
  const delta = current - previous;
  const effectiveDelta = inverted ? -delta : delta;
  if (Math.abs(effectiveDelta) < 0.5) return 'stable';
  return effectiveDelta > 0 ? 'up' : 'down';
}

/**
 * Aggregate a list of per-metric trends for a domain into a single direction.
 * Majority vote: whichever of 'up' / 'down' has more votes wins; ties → 'stable'.
 */
function aggregateTrends(deltas: TrendDirection[]): TrendDirection {
  if (deltas.length === 0) return 'unknown';
  const ups = deltas.filter((d) => d === 'up').length;
  const downs = deltas.filter((d) => d === 'down').length;
  if (ups > downs) return 'up';
  if (downs > ups) return 'down';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 5_000;

/**
 * Returns a stable mapping of domain → TrendDirection, updated whenever the
 * NSV changes.  Internally persists snapshots to localStorage so trends
 * survive page refreshes within a 24-hour window.
 */
export function useNsvTrends(): Record<string, TrendDirection> {
  const { user } = useAuth();
  const { globalSoul } = useGlobalSoul();

  const nsv = globalSoul?.crossFunctionalState ?? null;

  // Snapshot loaded from localStorage on first mount for this user.
  const snapshotRef = useRef<NsvSnapshot | null>(null);
  const hasLoadedRef = useRef(false);

  // Load the previous snapshot exactly once, keyed by user uid.
  useEffect(() => {
    if (!user?.uid || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    snapshotRef.current = NsvSnapshotService.load(user.uid);
  }, [user?.uid]);

  // Debounced save: persist the NSV snapshot 5 s after the last change.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.uid || !nsv) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      NsvSnapshotService.save(user.uid!, nsv as unknown as Record<string, unknown>);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [nsv, user?.uid]);

  // Recompute trends whenever NSV changes (snapshot ref is stable between renders).
  return useMemo((): Record<string, TrendDirection> => {
    const defaultResult = Object.fromEntries(
      Object.keys(DOMAIN_KEYS).map((d) => [d, 'unknown' as TrendDirection]),
    );

    if (!nsv || !snapshotRef.current) return defaultResult;

    const prev = snapshotRef.current.values;
    const curr = flattenNsv(nsv as unknown as Record<string, unknown>);

    const trends: Record<string, TrendDirection> = {};
    for (const [domain, keys] of Object.entries(DOMAIN_KEYS)) {
      const metricTrends: TrendDirection[] = [];
      for (const key of keys) {
        const c = curr[key];
        const p = prev[key];
        if (typeof c === 'number' && typeof p === 'number') {
          metricTrends.push(computeMetricTrend(c, p, INVERT_KEYS.has(key)));
        }
      }
      trends[domain] = aggregateTrends(metricTrends);
    }

    return trends;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nsv]); // snapshotRef is a ref — intentionally not in deps
}
