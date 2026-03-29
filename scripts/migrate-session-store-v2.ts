#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  deleteDoc,
  writeBatch,
  query as fbQuery,
  where as fbWhere,
  orderBy as fbOrderBy,
  limit as fbLimit,
} from 'firebase/firestore';
import type { BatchOperation, NexusDataLayer, NexusDocumentId, NexusQuery, NexusRecord } from '@/lib/data-layer';
import type { ActiveSessionState } from '@/lib/types';
import { ChunkedSessionStore } from '@/lib/storage/adapters/chunked-session-store';

interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export function loadDotEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function buildFirebaseConfig(): FirebaseWebConfig {
  const apiKey = process.env.VITE_FIREBASE_API_KEY?.trim() ?? '';
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '';
  const appId = process.env.VITE_FIREBASE_APP_ID?.trim() ?? '';

  if (!apiKey || !projectId || !appId) {
    throw new Error('Missing Firebase env vars. Ensure .env.local has VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.');
  }

  return {
    apiKey,
    projectId,
    appId,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  };
}

class FirestoreScriptDataLayer implements NexusDataLayer {
  constructor(private readonly db: ReturnType<typeof getFirestore>) {}

  async getDocument<T>(collectionName: string, id: NexusDocumentId): Promise<NexusRecord<T> | null> {
    const snap = await getDoc(doc(this.db, collectionName, id));
    if (!snap.exists()) return null;
    return { ...(snap.data() as T), id };
  }

  async listDocuments<T>(collectionName: string): Promise<NexusRecord<T>[]> {
    const snap = await getDocs(collection(this.db, collectionName));
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
  }

  async createDocument<T>(
    _collection: string,
    _data: Omit<NexusRecord<T>, 'id'> & Partial<Pick<NexusRecord<T>, 'id'>>,
  ): Promise<NexusRecord<T>> {
    throw new Error('Not implemented for migration script');
  }

  async setDocument<T>(collectionName: string, id: NexusDocumentId, data: T): Promise<NexusRecord<T>> {
    const payload = { ...(data as Record<string, unknown>) };
    delete (payload as { id?: unknown }).id;
    await setDoc(doc(this.db, collectionName, id), payload);
    return { ...(payload as T), id };
  }

  async updateDocument<T>(
    _collection: string,
    _id: NexusDocumentId,
    _updates: Partial<T>,
  ): Promise<NexusRecord<T> | null> {
    throw new Error('Not implemented for migration script');
  }

  async deleteDocument(collectionName: string, id: NexusDocumentId): Promise<void> {
    await deleteDoc(doc(this.db, collectionName, id));
  }

  async query<T>(query: NexusQuery): Promise<NexusRecord<T>[]> {
    let ref = collection(this.db, query.collection);
    let q: ReturnType<typeof fbQuery> = fbQuery(ref);
    for (const filter of query.where ?? []) {
      q = fbQuery(q, fbWhere(filter.field, filter.op as Parameters<typeof fbWhere>[1], filter.value));
    }
    for (const order of query.orderBy ?? []) {
      q = fbQuery(q, fbOrderBy(order.field, order.direction));
    }
    if (typeof query.limit === 'number') {
      q = fbQuery(q, fbLimit(query.limit));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
  }

  subscribeToDocument<T>(
    _collection: string,
    _id: NexusDocumentId,
    _listener: (document: NexusRecord<T> | null) => void,
  ): () => void {
    throw new Error('Not implemented for migration script');
  }

  subscribeToQuery<T>(
    _query: NexusQuery,
    _listener: (documents: NexusRecord<T>[]) => void,
  ): () => void {
    throw new Error('Not implemented for migration script');
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    if (operations.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < operations.length; i += CHUNK) {
      const batch = writeBatch(this.db);
      const slice = operations.slice(i, i + CHUNK);
      for (const op of slice) {
        const ref = doc(this.db, op.collection, op.id);
        if (op.type === 'set') {
          const payload = { ...((op.data ?? {}) as Record<string, unknown>) };
          delete (payload as { id?: unknown }).id;
          batch.set(ref, payload);
        } else if (op.type === 'update') {
          const payload = { ...((op.data ?? {}) as Record<string, unknown>) };
          delete (payload as { id?: unknown }).id;
          batch.update(ref, payload);
        } else {
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
  }
}

interface Args {
  execute: boolean;
  userId?: string;
  verbose: boolean;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const parsed: Args = { execute: false, verbose: false };
  const args = argv;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--execute') parsed.execute = true;
    if (arg === '--verbose') parsed.verbose = true;
    if (arg === '--user') {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed.userId = next;
      }
    }
  }
  return parsed;
}

export function parseDocId(docId: string, fallbackModuleId?: string): { uid: string; moduleId: string; sessionId?: string } | null {
  const parts = docId.split('_');
  if (parts.length < 2) return null;
  const [uid, ...rest] = parts;
  if (!uid || rest.length === 0) return null;

  const moduleId = fallbackModuleId ?? rest[0];
  const sessionId = rest.length > 1 ? rest.slice(1).join('_') : undefined;
  return { uid, moduleId, sessionId };
}

type SkipReason = 'invalid_doc_id' | 'missing_history' | 'missing_start_time' | 'missing_last_message_at';

export async function main(): Promise<void> {
  loadDotEnvLocal();
  const firebaseConfig = buildFirebaseConfig();

  const args = parseArgs();
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const dataLayer = new FirestoreScriptDataLayer(db);
  const sessionStore = new ChunkedSessionStore(dataLayer);

  const docs = await dataLayer.listDocuments<Partial<ActiveSessionState>>('active_sessions');
  const scannedCount = docs.length;
  const legacy = docs.filter((doc) => Array.isArray(doc.history));
  const target = args.userId
    ? legacy.filter((doc) => doc.id.startsWith(`${args.userId}_`))
    : legacy;

  console.log(`Scanned ${scannedCount} active_sessions documents.`);
  console.log(`Found ${target.length} legacy active_sessions documents${args.userId ? ` for user ${args.userId}` : ''}.`);

  let migrated = 0;
  let skipped = 0;
  let failures = 0;
  const skippedByReason: Record<SkipReason, number> = {
    invalid_doc_id: 0,
    missing_history: 0,
    missing_start_time: 0,
    missing_last_message_at: 0,
  };
  const failedDocIds: string[] = [];

  for (const doc of target) {
    const parsed = parseDocId(doc.id, typeof doc.moduleId === 'string' ? doc.moduleId : undefined);
    let skipReason: SkipReason | null = null;
    if (!parsed) skipReason = 'invalid_doc_id';
    else if (!Array.isArray(doc.history)) skipReason = 'missing_history';
    else if (typeof doc.startTime !== 'string') skipReason = 'missing_start_time';
    else if (typeof doc.lastMessageAt !== 'string') skipReason = 'missing_last_message_at';

    if (skipReason) {
      skipped += 1;
      skippedByReason[skipReason] += 1;
      if (args.verbose) {
        console.warn(`[SKIP] ${doc.id} (${skipReason})`);
      }
      continue;
    }

    if (!args.execute) {
      console.log(`[DRY] ${doc.id} -> chunked session format`);
      migrated += 1;
      continue;
    }

    try {
      const session: ActiveSessionState = {
        sessionId: typeof doc.sessionId === 'string' ? doc.sessionId : (parsed.sessionId || 'current'),
        moduleId: parsed.moduleId,
        startTime: doc.startTime,
        lastMessageAt: doc.lastMessageAt,
        history: doc.history,
        tokenCount: typeof doc.tokenCount === 'number' ? doc.tokenCount : 0,
        isGuestTrial: Boolean(doc.isGuestTrial),
        threadTitle: typeof doc.threadTitle === 'string' ? doc.threadTitle : undefined,
        contextPolicy: doc.contextPolicy,
        docIds: Array.isArray(doc.docIds) ? doc.docIds.filter((id): id is string => typeof id === 'string') : undefined,
      };

      const result = await sessionStore.save(
        { uid: parsed.uid, moduleId: parsed.moduleId, sessionId: session.sessionId },
        session,
      );

      migrated += 1;
      console.log(`[OK] ${doc.id} -> compacted=${result.compacted} dropped=${result.droppedCount} bytes=${result.estimatedBytes}`);
    } catch (error) {
      failures += 1;
      failedDocIds.push(doc.id);
      console.error(`[FAIL] ${doc.id}`, error);
    }
  }

  console.log(`\nSummary: scanned=${scannedCount}, legacy=${target.length}, migrated=${migrated}, skipped=${skipped}, failed=${failures}, mode=${args.execute ? 'execute' : 'dry-run'}`);
  if (skipped > 0) {
    console.log(`Skipped by reason: ${JSON.stringify(skippedByReason)}`);
  }
  if (failedDocIds.length > 0) {
    console.log(`Failed doc IDs: ${failedDocIds.join(', ')}`);
  }
  if (!args.execute) {
    console.log('Run with --execute to apply changes.');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    const code = typeof (error as { code?: unknown })?.code === 'string'
      ? String((error as { code?: string }).code)
      : '';
    if (code === 'permission-denied') {
      console.error(
        '[Migration] Firestore permission denied. Run with credentials authorized to read/write active_sessions (or use a privileged environment).',
      );
      process.exit(1);
    }
    console.error('[Migration] Failed:', error);
    process.exit(1);
  });
}
