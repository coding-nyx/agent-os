import { collection, doc, onSnapshot, orderBy, query, setDoc, where, updateDoc } from 'firebase/firestore';
import { getFirebase } from '../firebase';
import { decryptWithKey, encryptWithKey } from '../encryption';
import type { NotebookCell } from '../types';

const COLLECTION = 'notebook_cells';

export async function createNotebookCell(params: Omit<NotebookCell, 'id' | 'createdAt' | 'updatedAt' | 'encryptedData'> & { encryptionKey: CryptoKey }) {
  const { db } = getFirebase();
  if (!db) throw new Error('Firebase not initialized');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const encrypted = await encryptWithKey(params.content, params.encryptionKey);
  const record: NotebookCell = {
    ...params,
    content: '',
    encryptedData: {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv
    },
    id,
    createdAt: now,
    updatedAt: now
  };
  await setDoc(doc(db, COLLECTION, id), record);
  return record;
}

export async function updateNotebookCell(
  id: string,
  patch: Partial<Omit<NotebookCell, 'id' | 'createdAt'>> & { encryptionKey?: CryptoKey }
) {
  const { db } = getFirebase();
  if (!db) return;
  const ref = doc(db, COLLECTION, id);
  const nextPatch = { ...patch } as Partial<NotebookCell>;
  if (typeof patch.content === 'string' && patch.encryptionKey) {
    const encrypted = await encryptWithKey(patch.content, patch.encryptionKey);
    nextPatch.content = '';
    nextPatch.encryptedData = { ciphertext: encrypted.ciphertext, iv: encrypted.iv };
    delete (nextPatch as { encryptionKey?: CryptoKey }).encryptionKey;
  }
  await updateDoc(ref, { ...nextPatch, updatedAt: new Date().toISOString() });
}

export function subscribeNotebookCells(
  userId: string,
  moduleId: string,
  threadId: string,
  encryptionKey: CryptoKey,
  onUpdate: (cells: NotebookCell[]) => void
) {
  const { db } = getFirebase();
  if (!db || !userId || !moduleId || !threadId) return () => {};
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('moduleId', '==', moduleId),
    where('threadId', '==', threadId),
    orderBy('order', 'asc')
  );
  return onSnapshot(
    q,
    async (snap) => {
      const rawCells = snap.docs.map((docSnap) => docSnap.data() as NotebookCell);
      const cells = await Promise.all(
        rawCells.map(async (cell) => {
          try {
            const decrypted = await decryptWithKey(cell.encryptedData, encryptionKey);
            return { ...cell, content: decrypted };
          } catch (error) {
            console.error('[NotebookService] Failed to decrypt cell:', error);
            return { ...cell, content: '[Unable to decrypt]' };
          }
        })
      );
      onUpdate(cells);
    },
    (error) => {
      console.error('[NotebookService] Subscription error:', error);
    }
  );
}
