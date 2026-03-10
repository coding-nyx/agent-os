export type NexusDocumentId = string;

export type NexusRecord<T> = T & { id: NexusDocumentId };

export type NexusUnsubscribe = () => void;

export type NexusWhereOperator =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'in'
  | 'not-in'
  | 'array-contains'
  | 'contains';

export interface NexusQueryFilter {
  field: string;
  op: NexusWhereOperator;
  value: unknown;
}

export interface NexusOrderBy {
  field: string;
  direction?: 'asc' | 'desc';
}

export interface NexusQuery {
  collection: string;
  where?: NexusQueryFilter[];
  orderBy?: NexusOrderBy[];
  limit?: number;
}

export type BatchOperationType = 'set' | 'update' | 'delete';

export interface BatchOperation {
  type: BatchOperationType;
  collection: string;
  id: NexusDocumentId;
  data?: unknown; // Used for set/update
}

export type NexusDocumentListener<T> = (document: NexusRecord<T> | null) => void;
export type NexusQueryListener<T> = (documents: NexusRecord<T>[]) => void;

export interface NexusDataLayer {
  getDocument<T>(collection: string, id: NexusDocumentId): Promise<NexusRecord<T> | null>;
  listDocuments<T>(collection: string): Promise<NexusRecord<T>[]>;
  createDocument<T>(
    collection: string,
    data: Omit<NexusRecord<T>, 'id'> & Partial<Pick<NexusRecord<T>, 'id'>>,
  ): Promise<NexusRecord<T>>;
  setDocument<T>(collection: string, id: NexusDocumentId, data: T): Promise<NexusRecord<T>>;
  updateDocument<T>(
    collection: string,
    id: NexusDocumentId,
    updates: Partial<T>,
  ): Promise<NexusRecord<T> | null>;
  deleteDocument(collection: string, id: NexusDocumentId): Promise<void>;
  query<T>(query: NexusQuery): Promise<NexusRecord<T>[]>;
  subscribeToDocument<T>(
    collection: string,
    id: NexusDocumentId,
    listener: NexusDocumentListener<T>,
  ): NexusUnsubscribe;
  subscribeToQuery<T>(query: NexusQuery, listener: NexusQueryListener<T>): NexusUnsubscribe;
  batchWrite(operations: BatchOperation[]): Promise<void>;
}

type AnyListener = NexusDocumentListener<any> | NexusQueryListener<any>;

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

/**
  * Lightweight in-memory implementation of the NexusDataLayer contract.
  * Useful for tests, storybook, and offline-first workflows without Firebase coupling.
  */
export class InMemoryDataProvider implements NexusDataLayer {
  private store = new Map<string, Map<string, NexusRecord<any>>>();
  private docListeners = new Map<string, Set<NexusDocumentListener<any>>>();
  private queryListeners = new Set<{ query: NexusQuery; listener: NexusQueryListener<any> }>();

  constructor(seed?: Record<string, Array<NexusRecord<any>>>) {
    if (seed) {
      for (const [collection, records] of Object.entries(seed)) {
        const map = this.ensureCollection(collection);
        records.forEach((record) => map.set(record.id, cloneValue(record)));
      }
    }
  }

  async getDocument<T>(collection: string, id: NexusDocumentId): Promise<NexusRecord<T> | null> {
    const record = this.ensureCollection(collection).get(id);
    return record ? cloneValue(record) : null;
  }

  async listDocuments<T>(collection: string): Promise<NexusRecord<T>[]> {
    return this.query<T>({ collection });
  }

  async createDocument<T>(
    collection: string,
    data: Omit<NexusRecord<T>, 'id'> & Partial<Pick<NexusRecord<T>, 'id'>>,
  ): Promise<NexusRecord<T>> {
    const id = data.id ?? generateId();
    const record = { ...(data as T), id };
    this.ensureCollection(collection).set(id, cloneValue(record));
    this.emitChanges(collection, id);
    return cloneValue(record);
  }

  async setDocument<T>(
    collection: string,
    id: NexusDocumentId,
    data: T,
  ): Promise<NexusRecord<T>> {
    const record = { ...(data as T), id };
    this.ensureCollection(collection).set(id, cloneValue(record));
    this.emitChanges(collection, id);
    return cloneValue(record);
  }

  async updateDocument<T>(
    collection: string,
    id: NexusDocumentId,
    updates: Partial<T>,
  ): Promise<NexusRecord<T> | null> {
    const current = this.ensureCollection(collection).get(id);
    if (!current) return null;
    const updated = this.applyUpdates(current, updates);
    this.ensureCollection(collection).set(id, cloneValue(updated));
    this.emitChanges(collection, id);
    return cloneValue(updated);
  }

  async deleteDocument(collection: string, id: NexusDocumentId): Promise<void> {
    const collectionMap = this.ensureCollection(collection);
    collectionMap.delete(id);
    this.emitChanges(collection, id);
  }

  async query<T>(query: NexusQuery): Promise<NexusRecord<T>[]> {
    const { collection, where, orderBy, limit } = query;
    let records = Array.from(this.ensureCollection(collection).values());

    if (where?.length) {
      records = records.filter((record) => where.every((f) => this.matches(record, f)));
    }

    if (orderBy?.length) {
      records = records.slice().sort((a, b) => this.compareWithOrder(a, b, orderBy));
    }

    if (typeof limit === 'number') {
      records = records.slice(0, limit);
    }

    return cloneValue(records);
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

  subscribeToDocument<T>(
    collection: string,
    id: NexusDocumentId,
    listener: NexusDocumentListener<T>,
  ): NexusUnsubscribe {
    const key = this.buildDocKey(collection, id);
    const listeners = this.docListeners.get(key) ?? new Set<NexusDocumentListener<T>>();
    listeners.add(listener as NexusDocumentListener<any>);
    this.docListeners.set(key, listeners as Set<NexusDocumentListener<any>>);

    listener(cloneValue(this.ensureCollection(collection).get(id) ?? null));

    return () => this.teardownListener(key, listener);
  }

  subscribeToQuery<T>(query: NexusQuery, listener: NexusQueryListener<T>): NexusUnsubscribe {
    const entry = { query, listener: listener as NexusQueryListener<any> };
    this.queryListeners.add(entry);
    this.query<T>(query).then((snapshot) => listener(cloneValue(snapshot)));

    return () => {
      this.queryListeners.delete(entry);
    };
  }

  private ensureCollection(collection: string): Map<string, NexusRecord<any>> {
    if (!this.store.has(collection)) {
      this.store.set(collection, new Map());
    }
    return this.store.get(collection)!;
  }

  private emitChanges(collection: string, id: NexusDocumentId) {
    this.emitDocument(collection, id);
    this.emitQueries(collection);
  }

  private emitDocument(collection: string, id: NexusDocumentId) {
    const key = this.buildDocKey(collection, id);
    const listeners = this.docListeners.get(key);
    if (!listeners || listeners.size === 0) return;
    const snapshot = this.ensureCollection(collection).get(id) ?? null;
    listeners.forEach((listener) => listener(cloneValue(snapshot)));
  }

  private emitQueries(collection: string) {
    if (!this.queryListeners.size) return;
    for (const entry of Array.from(this.queryListeners)) {
      if (entry.query.collection !== collection) continue;
      const snapshot = this.query(entry.query);
      // Snapshot is a promise but executes synchronously; avoid awaiting to preserve signature.
      snapshot.then((result) => entry.listener(cloneValue(result)));
    }
  }

  private buildDocKey(collection: string, id: NexusDocumentId): string {
    return `${collection}:${id}`;
  }

  private teardownListener(key: string, listener: AnyListener) {
    const docSet = this.docListeners.get(key);
    if (docSet) {
      docSet.delete(listener as NexusDocumentListener<any>);
      if (docSet.size === 0) this.docListeners.delete(key);
    }
  }

  private matches(record: NexusRecord<any>, filter: NexusQueryFilter): boolean {
    const value = this.getFieldValue(record, filter.field);
    const target = filter.value;

    switch (filter.op) {
      case '==':
        return value === target;
      case '!=':
        return value !== target;
      case '<':
        if (this.isComparable(value, target)) {
          return this.compareValues(value, target) < 0;
        }
        return false;
      case '<=':
        if (this.isComparable(value, target)) {
          return this.compareValues(value, target) <= 0;
        }
        return false;
      case '>':
        if (this.isComparable(value, target)) {
          return this.compareValues(value, target) > 0;
        }
        return false;
      case '>=':
        if (this.isComparable(value, target)) {
          return this.compareValues(value, target) >= 0;
        }
        return false;
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
      default:
        return false;
    }
  }

  private compareWithOrder(
    a: NexusRecord<any>,
    b: NexusRecord<any>,
    orderBy: NexusOrderBy[],
  ): number {
    for (const rule of orderBy) {
      const direction = rule.direction === 'desc' ? -1 : 1;
      const av = this.getFieldValue(a, rule.field);
      const bv = this.getFieldValue(b, rule.field);

      const comparison = this.compareValues(av, bv);
      if (comparison !== 0) {
        return comparison * direction;
      }
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
    const isNumber = typeof value === 'number' && typeof target === 'number';
    const isString = typeof value === 'string' && typeof target === 'string';
    const isDate = value instanceof Date && target instanceof Date;
    return isNumber || isString || isDate;
  }

  private getFieldValue(record: Record<string, any>, path: string): unknown {
    if (path === 'id') return record.id;
    return path.split('.').reduce<unknown>((value, key) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === 'object') {
        return (value as Record<string, any>)[key];
      }
      return undefined;
    }, record);
  }

  private applyUpdates<T>(record: NexusRecord<T>, updates: Partial<T>): NexusRecord<T> {
    const next = cloneValue(record);
    Object.entries(updates as Record<string, unknown>).forEach(([path, value]) => {
      this.setFieldValue(next as Record<string, unknown>, path, value);
    });
    (next as NexusRecord<T>).id = record.id;
    return next as NexusRecord<T>;
  }

  private setFieldValue(target: Record<string, unknown>, path: string, value: unknown) {
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
