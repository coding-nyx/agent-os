/**
 * The Silent Audit Trail (Black Box)
 * Implements the offline-first IndexedDB equivalent of the SQLDelight schema 
 * for Level 5 autonomous actions.
 */

export interface AuditTrailEntry {
  id: string;              // Unique Event ID
  timestamp: number;       // When the machine acted
  agent_source: string;    // Which agent triggered the action
  action_summary: string;  // Human-readable summary for Atlas Review
  raw_payload: string;     // The serialized JSON for deep-dive recovery
  soul_snapshot: string;   // The state of the GlobalSoul before the action
}

const DB_NAME = 'nexus_audit_trail';
const STORE_NAME = 'events';
const DB_VERSION = 2;
/** Entries older than this are pruned during writes. */
const ENTRY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Eviction runs at most once per this interval to avoid overhead on every write. */
const EVICTION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

class AuditTrailService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private _lastEvictionMs = 0;
  private _writeBatch: Omit<AuditTrailEntry, 'id' | 'timestamp'>[] = [];
  private _flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Only init if in browser
    if (typeof window !== 'undefined') {
      this.initPromise = this.initDB();
    }
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[AuditTrail] Failed to open IndexedDB');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        } else {
          store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_NAME);
        }
        // Add a timestamp index for efficient cursor-based eviction (v2).
        if (!store.indexNames.contains('by_timestamp')) {
          store.createIndex('by_timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Queue an entry for writing. Writes are flushed in a single IDB
   * transaction after a short debounce (100ms) so that cascade bursts
   * produce one transaction instead of N.
   */
  public async logAction(entry: Omit<AuditTrailEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.initPromise) return;
    this._writeBatch.push(entry);
    if (!this._flushTimer) {
      this._flushTimer = setTimeout(() => {
        void this._flush();
      }, 100);
    }
  }

  private async _flush(): Promise<void> {
    this._flushTimer = null;
    if (this._writeBatch.length === 0) return;
    await this.initPromise;
    if (!this.db) return;

    const entries = this._writeBatch;
    this._writeBatch = [];

    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const entry of entries) {
      const fullEntry: AuditTrailEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      store.add(fullEntry);
    }

    // Opportunistically evict stale entries (at most once per EVICTION_INTERVAL_MS).
    const now = Date.now();
    if (now - this._lastEvictionMs >= EVICTION_INTERVAL_MS) {
      this._lastEvictionMs = now;
      void this._evictStale();
    }
  }

  /**
   * Remove entries older than ENTRY_TTL_MS using the `by_timestamp` index.
   */
  private async _evictStale(): Promise<void> {
    if (!this.db) return;
    try {
      const cutoff = Date.now() - ENTRY_TTL_MS;
      const transaction = this.db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('by_timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const cursorReq = index.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    } catch {
      // Eviction is best-effort; swallow errors.
    }
  }

  public async getRecentEvents(limit: number = 50): Promise<AuditTrailEntry[]> {
    if (!this.initPromise) return [];
    await this.initPromise;
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll(); // IndexedDB cursor would be more efficient for huge sets, but this is fine for a client audit

      request.onsuccess = () => {
        const all = request.result as AuditTrailEntry[];
        // Sort descending by timestamp and slice
        const sorted = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const AuditTrail = new AuditTrailService();
