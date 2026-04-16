/**
 * NsvSnapshotService
 *
 * Persists a flattened NSV snapshot to localStorage (keyed per user) so the
 * trend-arrow hook can compare the current NSV against the state from the
 * previous session.  Snapshots expire after 24 hours.
 */

const SNAPSHOT_KEY_PREFIX = 'ara_nsv_snapshot_';
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface NsvSnapshot {
  timestamp: number;
  /** Flat dot-notation map, e.g. { 'biological.sleepQuality': 7.5 } */
  values: Record<string, number | undefined>;
}

/**
 * Flatten a nested NSV object into dot-notation numeric keys.
 * Non-numeric and null values are omitted.
 *
 * e.g. { biological: { sleepQuality: 8 } } → { 'biological.sleepQuality': 8 }
 */
export function flattenNsv(nsv: Record<string, unknown>): Record<string, number | undefined> {
  const flat: Record<string, number | undefined> = {};
  for (const [domain, vals] of Object.entries(nsv)) {
    if (vals !== null && typeof vals === 'object' && !Array.isArray(vals)) {
      for (const [key, val] of Object.entries(vals as Record<string, unknown>)) {
        if (typeof val === 'number') {
          flat[`${domain}.${key}`] = val;
        }
      }
    }
  }
  return flat;
}

export const NsvSnapshotService = {
  /**
   * Persist the current NSV for a given user.  Silently swallows storage
   * quota errors so the app continues normally if localStorage is full.
   */
  save(userId: string, nsv: Record<string, unknown>): void {
    const snapshot: NsvSnapshot = {
      timestamp: Date.now(),
      values: flattenNsv(nsv),
    };
    try {
      localStorage.setItem(
        `${SNAPSHOT_KEY_PREFIX}${userId}`,
        JSON.stringify(snapshot),
      );
    } catch {
      // Storage quota exceeded — non-fatal, trends will show 'unknown'
    }
  },

  /**
   * Load the stored snapshot for a user.  Returns null if none exists or if
   * the snapshot is older than SNAPSHOT_TTL_MS.
   */
  load(userId: string): NsvSnapshot | null {
    try {
      const raw = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${userId}`);
      if (!raw) return null;
      const snapshot = JSON.parse(raw) as NsvSnapshot;
      if (Date.now() - snapshot.timestamp > SNAPSHOT_TTL_MS) {
        localStorage.removeItem(`${SNAPSHOT_KEY_PREFIX}${userId}`);
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  },
} as const;
