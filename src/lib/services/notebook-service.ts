import { getAraDataLayer } from '../data-layer/provider';
import { decryptWithKey, encryptWithKey } from '../encryption';
import type { NotebookCell } from '../types';

const COLLECTION = 'notebook_cells';

export async function createNotebookCell(params: Omit<NotebookCell, 'id' | 'createdAt' | 'updatedAt' | 'encryptedData'> & { encryptionKey: CryptoKey }) {
  const dataLayer = getAraDataLayer();
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
  await dataLayer.setDocument(COLLECTION, id, record);
  return record;
}

export async function updateNotebookCell(
  id: string,
  patch: Partial<Omit<NotebookCell, 'id' | 'createdAt'>> & { encryptionKey?: CryptoKey }
) {
  const dataLayer = getAraDataLayer();
  const nextPatch = { ...patch } as Partial<NotebookCell>;
  if (typeof patch.content === 'string' && patch.encryptionKey) {
    const encrypted = await encryptWithKey(patch.content, patch.encryptionKey);
    nextPatch.content = '';
    nextPatch.encryptedData = { ciphertext: encrypted.ciphertext, iv: encrypted.iv };
    delete (nextPatch as { encryptionKey?: CryptoKey }).encryptionKey;
  }
  await dataLayer.updateDocument(COLLECTION, id, { ...nextPatch, updatedAt: new Date().toISOString() });
}

export function subscribeNotebookCells(
  userId: string,
  moduleId: string,
  threadId: string,
  encryptionKey: CryptoKey,
  onUpdate: (cells: NotebookCell[]) => void
) {
  if (!userId || !moduleId || !threadId) return () => {};
  const dataLayer = getAraDataLayer();
  return dataLayer.subscribeToQuery<NotebookCell>(
    {
      collection: COLLECTION,
      where: [
        { field: 'userId', op: '==', value: userId },
        { field: 'moduleId', op: '==', value: moduleId },
        { field: 'threadId', op: '==', value: threadId },
      ],
      orderBy: [{ field: 'order', direction: 'asc' }],
    },
    async (rawCells) => {
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
    }
  );
}
