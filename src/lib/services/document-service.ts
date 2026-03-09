import { collection, doc, deleteDoc, getDocs, onSnapshot, query, setDoc, where, orderBy } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { encryptWithKey } from '../encryption';
import type { DocumentRecord } from '../types';

const COLLECTION = 'documents';

export async function saveDocumentRecord(params: {
  userId: string;
  moduleId: string;
  threadId: string;
  filename: string;
  fileType: DocumentRecord['fileType'];
  pageCount: number | null;
  wordCount: number;
  extractedTitle: string | null;
  notes: string[];
  text: string;
  encryptionKey: CryptoKey;
}): Promise<DocumentRecord> {
  const { db } = getFirebase();
  if (!db) throw new Error('Firebase not initialized');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const encrypted = await encryptWithKey(params.text, params.encryptionKey);

  const record: DocumentRecord = {
    id,
    userId: params.userId,
    moduleId: params.moduleId,
    threadId: params.threadId,
    filename: params.filename,
    fileType: params.fileType,
    pageCount: params.pageCount,
    wordCount: params.wordCount,
    extractedTitle: params.extractedTitle,
    notes: params.notes,
    encryptedData: {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv
    },
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(db, COLLECTION, id), record);
  return record;
}

export function subscribeDocuments(
  userId: string,
  moduleId: string,
  threadId: string,
  onUpdate: (docs: DocumentRecord[]) => void
): () => void {
  const { db } = getFirebase();
  if (!db || !userId || !moduleId || !threadId) return () => {};

  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('moduleId', '==', moduleId),
    where('threadId', '==', threadId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs = snap.docs.map((docSnap) => docSnap.data() as DocumentRecord);
      onUpdate(docs);
    },
    (error) => {
      console.error('[DocumentService] Subscription error:', error);
    }
  );
}

/** Delete all documents for a given user/module/thread (used by diagnosis discard). */
export async function deleteDocumentsByThread(
  userId: string,
  moduleId: string,
  threadId: string,
): Promise<number> {
  const { db } = getFirebase();
  if (!db) return 0;

  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('moduleId', '==', moduleId),
    where('threadId', '==', threadId),
  );

  const snap = await getDocs(q);
  let deleted = 0;
  for (const docSnap of snap.docs) {
    await deleteDoc(doc(db, COLLECTION, docSnap.id));
    deleted++;
  }
  return deleted;
}
