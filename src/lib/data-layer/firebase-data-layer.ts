import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy as fbOrderBy,
  query as fbQuery,
  updateDoc,
  where as fbWhere,
  setDoc,
  Firestore,
  DocumentSnapshot,
  Query,
} from 'firebase/firestore';
import { getFirebase } from '../firebase';
import {
  NexusDataLayer,
  NexusDocumentId,
  NexusOrderBy,
  NexusQuery,
  NexusQueryFilter,
  NexusRecord,
} from './index';

type FirestoreQuery = Query | ReturnType<typeof collection>;

const mapSnapshot = <T>(snap: DocumentSnapshot): NexusRecord<T> | null => {
  if (!snap.exists()) return null;
  return { ...(snap.data() as T), id: snap.id };
};

const omitId = <T extends Record<string, unknown>>(data: T): Omit<T, 'id'> => {
  const { id: _discard, ...rest } = data;
  return rest as Omit<T, 'id'>;
};

const getFieldValue = (record: Record<string, any>, path: string): unknown => {
  if (path === 'id') return record.id;
  return path.split('.').reduce<unknown>((value, key) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'object') {
      return (value as Record<string, any>)[key];
    }
    return undefined;
  }, record);
};

const isComparable = (value: unknown, target: unknown): value is number | string | Date => {
  const isNumber = typeof value === 'number' && typeof target === 'number';
  const isString = typeof value === 'string' && typeof target === 'string';
  const isDate = value instanceof Date && target instanceof Date;
  return isNumber || isString || isDate;
};

const compareValues = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;

  if (isComparable(a, b)) {
    const left = a instanceof Date ? a.getTime() : (a as number | string);
    const right = b instanceof Date ? b.getTime() : (b as number | string);
    if (left < right) return -1;
    if (left > right) return 1;
  }
  return 0;
};

const compareWithOrder = (
  a: NexusRecord<any>,
  b: NexusRecord<any>,
  orderBy: NexusOrderBy[],
): number => {
  for (const rule of orderBy) {
    const direction = rule.direction === 'desc' ? -1 : 1;
    const av = getFieldValue(a, rule.field);
    const bv = getFieldValue(b, rule.field);

    const comparison = compareValues(av, bv);
    if (comparison !== 0) {
      return comparison * direction;
    }
  }
  return 0;
};

const matchesFilter = (record: NexusRecord<any>, filter: NexusQueryFilter): boolean => {
  const value = getFieldValue(record, filter.field);
  const target = filter.value;

  switch (filter.op) {
    case '==':
      return value === target;
    case '!=':
      return value !== target;
    case '<':
      return isComparable(value, target) ? compareValues(value, target) < 0 : false;
    case '<=':
      return isComparable(value, target) ? compareValues(value, target) <= 0 : false;
    case '>':
      return isComparable(value, target) ? compareValues(value, target) > 0 : false;
    case '>=':
      return isComparable(value, target) ? compareValues(value, target) >= 0 : false;
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
};

const applyClientQuery = <T>(
  documents: NexusRecord<T>[],
  query: NexusQuery,
): NexusRecord<T>[] => {
  let results = documents;

  if (query.where?.length) {
    results = results.filter((record) => query.where!.every((f) => matchesFilter(record, f)));
  }

  if (query.orderBy?.length) {
    results = results.slice().sort((a, b) => compareWithOrder(a, b, query.orderBy!));
  }

  if (typeof query.limit === 'number') {
    results = results.slice(0, query.limit);
  }

  return results;
};

const buildQueryRef = (
  db: Firestore,
  query: NexusQuery,
): { ref: FirestoreQuery; requiresClientFilter: boolean } => {
  let ref: FirestoreQuery = collection(db, query.collection);
  let requiresClientFilter = false;

  (query.where ?? []).forEach((filter) => {
    if (filter.op === 'contains') {
      requiresClientFilter = true;
      return;
    }
    ref = fbQuery(ref, fbWhere(filter.field, filter.op as any, filter.value));
  });

  (query.orderBy ?? []).forEach((order) => {
    ref = fbQuery(ref, fbOrderBy(order.field, order.direction));
  });

  if (typeof query.limit === 'number') {
    ref = fbQuery(ref, fbLimit(query.limit));
  }

  return { ref, requiresClientFilter };
};

export class FirebaseDataLayer implements NexusDataLayer {
  constructor(private db: Firestore) {}

  private map<T>(snap: DocumentSnapshot): NexusRecord<T> | null {
    return mapSnapshot<T>(snap);
  }

  async getDocument<T>(collectionName: string, id: NexusDocumentId): Promise<NexusRecord<T> | null> {
    const snap = await getDoc(doc(this.db, collectionName, id));
    return this.map<T>(snap);
  }

  async listDocuments<T>(collectionName: string): Promise<NexusRecord<T>[]> {
    const snap = await getDocs(collection(this.db, collectionName));
    return snap.docs.map((d) => this.map<T>(d)!).filter(Boolean);
  }

  async createDocument<T>(
    collectionName: string,
    data: Omit<NexusRecord<T>, 'id'> & Partial<Pick<NexusRecord<T>, 'id'>>,
  ): Promise<NexusRecord<T>> {
    const { id, ...payload } = data;
    if (id) {
      const ref = doc(this.db, collectionName, id);
      await setDoc(ref, payload);
      return { ...(payload as T), id };
    }
    const ref = await addDoc(collection(this.db, collectionName), payload);
    return { ...(payload as T), id: ref.id };
  }

  async setDocument<T>(
    collectionName: string,
    id: NexusDocumentId,
    data: T,
  ): Promise<NexusRecord<T>> {
    const payload = omitId((data || {}) as Record<string, unknown>);
    await setDoc(doc(this.db, collectionName, id), payload);
    return { ...(payload as T), id };
  }

  async updateDocument<T>(
    collectionName: string,
    id: NexusDocumentId,
    updates: Partial<T>,
  ): Promise<NexusRecord<T> | null> {
    const ref = doc(this.db, collectionName, id);
    const payload = omitId((updates || {}) as Record<string, unknown>);
    try {
      await updateDoc(ref, payload as Record<string, unknown>);
    } catch (err) {
      // If the document doesn't exist, mirror InMemory behavior and return null
      const existing = await getDoc(ref);
      if (!existing.exists()) return null;
      throw err;
    }
    const snap = await getDoc(ref);
    return this.map<T>(snap);
  }

  async deleteDocument(collectionName: string, id: NexusDocumentId): Promise<void> {
    await deleteDoc(doc(this.db, collectionName, id));
  }

  async query<T>(query: NexusQuery): Promise<NexusRecord<T>[]> {
    const { ref, requiresClientFilter } = buildQueryRef(this.db, query);
    const snap = await getDocs(ref);
    const docs = snap.docs.map((d) => this.map<T>(d)).filter(Boolean) as NexusRecord<T>[];
    if (requiresClientFilter) {
      return applyClientQuery(docs, query);
    }
    return docs;
  }

  subscribeToDocument<T>(
    collectionName: string,
    id: NexusDocumentId,
    listener: (document: NexusRecord<T> | null) => void,
  ): () => void {
    const ref = doc(this.db, collectionName, id);
    return onSnapshot(
      ref,
      (snap) => listener(this.map<T>(snap)),
      (error) => {
        console.error(`[FirebaseDataLayer] Document subscription error for ${collectionName}/${id}:`, error);
        listener(null);
      },
    );
  }

  subscribeToQuery<T>(
    query: NexusQuery,
    listener: (documents: NexusRecord<T>[]) => void,
  ): () => void {
    const { ref, requiresClientFilter } = buildQueryRef(this.db, query);
    return onSnapshot(
      ref,
      (snapshot) => {
        let docs = snapshot.docs.map((d) => this.map<T>(d)).filter(Boolean) as NexusRecord<T>[];
        if (requiresClientFilter) {
          docs = applyClientQuery(docs, query);
        }
        listener(docs);
      },
      (error) => {
        console.error('[FirebaseDataLayer] Query subscription error:', error);
        listener([]);
      },
    );
  }
}

export function createFirebaseDataLayer(): NexusDataLayer | null {
  try {
    const { db } = getFirebase();
    if (!db) return null;
    return new FirebaseDataLayer(db);
  } catch (error) {
    console.warn('[FirebaseDataLayer] Initialization failed, falling back to in-memory adapter:', error);
    return null;
  }
}
