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
const DB_VERSION = 1;

class AuditTrailService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  public async logAction(entry: Omit<AuditTrailEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.initPromise) return; // Server-side or unsupported
    await this.initPromise;
    if (!this.db) return;

    const fullEntry: AuditTrailEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(fullEntry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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
