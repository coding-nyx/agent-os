/**
 * in-memory-data-layer.ts
 *
 * A zero-dependency, in-memory implementation of the AraDataLayer contract.
 * Suitable for unit tests, Storybook, offline-first workflows, and CI pipelines
 * that should not touch Firebase.
 *
 * Features
 * ─────────
 * • Full CRUD via in-memory Maps (per-collection)
 * • Real-time listeners (subscribeToDocument / subscribeToQuery) via pub/sub
 * • AraQuery support: where (all operators), orderBy, limit
 * • Dot-notation field paths for filters, ordering, and partial updates
 * • Proper unsubscribe / cleanup
 * • Deep-clone on every read/write so external mutations never corrupt the store
 */

import type {
  BatchOperation,
  AraDataLayer,
  AraDocumentId,
  AraDocumentListener,
  AraOrderBy,
  AraQuery,
  AraQueryFilter,
  AraQueryListener,
  AraRecord,
  AraUnsubscribe,
} from './index';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const cloneValue = <T>(value: T): T => {
  const cloner = (globalThis as { structuredClone?: <U>(value: U) => U }).structuredClone;
  if (typeof cloner === 'function') {
    return cloner(value);
  }
  return JSON.parse(JSON.stringify(value));
};

// ─── InMemoryDataLayer ────────────────────────────────────────────────────────

type AnyDocListener = AraDocumentListener<any>;
type AnyQueryEntry = { query: AraQuery; listener: AraQueryListener<any> };

export class InMemoryDataLayer implements AraDataLayer {
  /** Per-collection document stores: collectionName → (id → record) */
  private store = new Map<string, Map<string, AraRecord<any>>>();

  /** Document listeners keyed by "collection:id" */
  private docListeners = new Map<string, Set<AnyDocListener>>();

  /** Active query subscriptions */
  private queryListeners = new Set<AnyQueryEntry>();

  /**
   * Optionally seed the store with pre-existing data.
   *
   * @example
   *   new InMemoryDataLayer({ profiles: [{ id: 'u1', name: 'Ada' }] })
   */
  constructor(seed?: Record<string, Array<AraRecord<any>>>) {
    if (seed) {
      for (const [collection, records] of Object.entries(seed)) {
        const map = this.ensureCollection(collection);
        for (const record of records) {
          map.set(record.id, cloneValue(record));
        }
      }
    }
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  async getDocument<T>(collection: string, id: AraDocumentId): Promise<AraRecord<T> | null> {
    const record = this.ensureCollection(collection).get(id);
    return record ? cloneValue(record) : null;
  }

  async listDocuments<T>(collection: string, options?: { limit?: number }): Promise<AraRecord<T>[]> {
    const cap = options?.limit ?? 100;
    return this.query<T>({ collection, ...(cap > 0 ? { limit: cap } : {}) });
  }

  async query<T>(araQuery: AraQuery): Promise<AraRecord<T>[]> {
    const { collection, where, orderBy, limit } = araQuery;
    let records = Array.from(this.ensureCollection(collection).values());

    if (where?.length) {
      records = records.filter((r) => where.every((f) => this.matchesFilter(r, f)));
    }

    if (orderBy?.length) {
      records = records.slice().sort((a, b) => this.compareWithOrder(a, b, orderBy));
    }

    if (typeof limit === 'number') {
      records = records.slice(0, limit);
    }

    return cloneValue(records) as AraRecord<T>[];
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  async createDocument<T>(
    collection: string,
    data: Omit<AraRecord<T>, 'id'> & Partial<Pick<AraRecord<T>, 'id'>>,
  ): Promise<AraRecord<T>> {
    const id = (data as { id?: string }).id ?? generateId();
    const record: AraRecord<T> = { ...(data as T), id };
    this.ensureCollection(collection).set(id, cloneValue(record));
    this.emitChanges(collection, id);
    return cloneValue(record);
  }

  async setDocument<T>(
    collection: string,
    id: AraDocumentId,
    data: T,
  ): Promise<AraRecord<T>> {
    const record: AraRecord<T> = { ...(data as T), id };
    this.ensureCollection(collection).set(id, cloneValue(record));
    this.emitChanges(collection, id);
    return cloneValue(record);
  }

  async updateDocument<T>(
    collection: string,
    id: AraDocumentId,
    updates: Partial<T>,
  ): Promise<AraRecord<T> | null> {
    const current = this.ensureCollection(collection).get(id);
    if (!current) return null;
    const updated = this.applyUpdates<T>(current as AraRecord<T>, updates);
    this.ensureCollection(collection).set(id, cloneValue(updated));
    this.emitChanges(collection, id);
    return cloneValue(updated);
  }

  async deleteDocument(collection: string, id: AraDocumentId): Promise<void> {
    this.ensureCollection(collection).delete(id);
    this.emitChanges(collection, id);
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    for (const op of operations) {
      const { type, collection, id, data } = op;
      if (type === 'set') {
        const record = { ...(data as any), id };
        this.ensureCollection(collection).set(id, cloneValue(record));
        this.emitChanges(collection, id);
      } else if (type === 'update') {
        const current = this.ensureCollection(collection).get(id);
        if (current) {
          const updated = this.applyUpdates(current, data as any);
          this.ensureCollection(collection).set(id, cloneValue(updated));
          this.emitChanges(collection, id);
        }
      } else if (type === 'delete') {
        this.ensureCollection(collection).delete(id);
        this.emitChanges(collection, id);
      }
    }
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────

  subscribeToDocument<T>(
    collection: string,
    id: AraDocumentId,
    listener: AraDocumentListener<T>,
  ): AraUnsubscribe {
    const key = this.docKey(collection, id);
    if (!this.docListeners.has(key)) {
      this.docListeners.set(key, new Set());
    }
    const listeners = this.docListeners.get(key)!;
    listeners.add(listener as AnyDocListener);

    // Emit current state immediately (synchronous, mirroring Firestore behaviour)
    const snapshot = this.ensureCollection(collection).get(id) ?? null;
    listener(cloneValue(snapshot) as AraRecord<T> | null);

    return () => {
      listeners.delete(listener as AnyDocListener);
      if (listeners.size === 0) this.docListeners.delete(key);
    };
  }

  subscribeToQuery<T>(
    araQuery: AraQuery,
    listener: AraQueryListener<T>,
  ): AraUnsubscribe {
    const entry: AnyQueryEntry = { query: araQuery, listener: listener as AraQueryListener<any> };
    this.queryListeners.add(entry);

    // Emit current state asynchronously (mirrors Firestore one-tick delay)
    this.query<T>(araQuery).then((snapshot) => listener(snapshot));

    return () => {
      this.queryListeners.delete(entry);
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private ensureCollection(collection: string): Map<string, AraRecord<any>> {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map());
    }
    return this.store.get(collection)!;
  }

  private docKey(collection: string, id: AraDocumentId): string {
    return `${collection}:${id}`;
  }

  private emitChanges(collection: string, id: AraDocumentId): void {
    this.emitDocumentChange(collection, id);
    this.emitQueryChanges(collection);
  }

  private emitDocumentChange(collection: string, id: AraDocumentId): void {
    const key = this.docKey(collection, id);
    const listeners = this.docListeners.get(key);
    if (!listeners || listeners.size === 0) return;
    const snapshot = this.ensureCollection(collection).get(id) ?? null;
    const value = cloneValue(snapshot);
    for (const listener of Array.from(listeners)) {
      listener(value);
    }
  }

  private emitQueryChanges(collection: string): void {
    if (!this.queryListeners.size) return;
    for (const entry of Array.from(this.queryListeners)) {
      if (entry.query.collection !== collection) continue;
      // query() is synchronous in practice; the Promise resolves on the next microtask
      this.query(entry.query).then((result) => entry.listener(cloneValue(result)));
    }
  }

  // ── Filter / sort helpers ───────────────────────────────────────────────────

  private matchesFilter(record: AraRecord<any>, filter: AraQueryFilter): boolean {
    const value = this.getFieldValue(record, filter.field);
    const target = filter.value;

    switch (filter.op) {
      case '==':
        return value === target;
      case '!=':
        return value !== target;
      case '<':
        return this.isComparable(value, target) ? this.compareValues(value, target) < 0 : false;
      case '<=':
        return this.isComparable(value, target) ? this.compareValues(value, target) <= 0 : false;
      case '>':
        return this.isComparable(value, target) ? this.compareValues(value, target) > 0 : false;
      case '>=':
        return this.isComparable(value, target) ? this.compareValues(value, target) >= 0 : false;
      case 'array-contains':
        return Array.isArray(value) && value.some((item) => item === target);
      case 'in':
        return Array.isArray(target) ? target.includes(value) : false;
      case 'not-in':
        return Array.isArray(target) ? !target.includes(value) : false;
      case 'contains':
        return typeof value === 'string' && typeof target === 'string'
          ? value.includes(target)
          : false;
      default: {
        // Exhaustive check — TypeScript will warn if a new operator is added to the union
        const _exhaustive: never = filter.op;
        console.warn(`[InMemoryDataLayer] Unknown filter operator: ${_exhaustive}`);
        return false;
      }
    }
  }

  private compareWithOrder(
    a: AraRecord<any>,
    b: AraRecord<any>,
    orderBy: AraOrderBy[],
  ): number {
    for (const rule of orderBy) {
      const direction = rule.direction === 'desc' ? -1 : 1;
      const av = this.getFieldValue(a, rule.field);
      const bv = this.getFieldValue(b, rule.field);
      const cmp = this.compareValues(av, bv);
      if (cmp !== 0) return cmp * direction;
    }
    return 0;
  }

  private compareValues(a: unknown, b: unknown): number {
    if (a === b) return 0;
    if (a === undefined || a === null) return 1;
    if (b === undefined || b === null) return -1;
    if (this.isComparable(a, b)) {
      const left = a instanceof Date ? a.getTime() : (a as number | string);
      const right = b instanceof Date ? b.getTime() : (b as number | string);
      if (left < right) return -1;
      if (left > right) return 1;
    }
    return 0;
  }

  private isComparable(value: unknown, target: unknown): value is number | string | Date {
    return (
      (typeof value === 'number' && typeof target === 'number') ||
      (typeof value === 'string' && typeof target === 'string') ||
      (value instanceof Date && target instanceof Date)
    );
  }

  private getFieldValue(record: Record<string, any>, path: string): unknown {
    if (path === 'id') return record.id;
    return path.split('.').reduce<unknown>((cursor, key) => {
      if (cursor === undefined || cursor === null) return undefined;
      if (typeof cursor === 'object') return (cursor as Record<string, any>)[key];
      return undefined;
    }, record);
  }

  // ── Update helpers ──────────────────────────────────────────────────────────

  private applyUpdates<T>(current: AraRecord<T>, updates: Partial<T>): AraRecord<T> {
    const next = cloneValue(current);
    for (const [path, value] of Object.entries(updates as Record<string, unknown>)) {
      this.setFieldValue(next as Record<string, unknown>, path, value);
    }
    // Prevent accidental id overwrites
    (next as AraRecord<T>).id = current.id;
    return next as AraRecord<T>;
  }

  private setFieldValue(
    target: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const segments = path.split('.');
    if (segments.length === 1) {
      target[path] = value;
      return;
    }
    let cursor: Record<string, unknown> = target;
    for (let i = 0; i < segments.length - 1; i++) {
      const key = segments[i];
      const existing = cursor[key];
      if (typeof existing !== 'object' || existing === null) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = value;
  }
}
