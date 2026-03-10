import { getNexusDataLayer } from '../data-layer/provider';
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
  const dataLayer = getNexusDataLayer();

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

  await dataLayer.setDocument(COLLECTION, id, record);
  return record;
}

export function subscribeDocuments(
  userId: string,
  moduleId: string,
  threadId: string,
  onUpdate: (docs: DocumentRecord[]) => void
): () => void {
  if (!userId || !moduleId || !threadId) return () => {};
  const dataLayer = getNexusDataLayer();
  return dataLayer.subscribeToQuery<DocumentRecord>(
    {
      collection: COLLECTION,
      where: [
        { field: 'userId', op: '==', value: userId },
        { field: 'moduleId', op: '==', value: moduleId },
        { field: 'threadId', op: '==', value: threadId },
      ],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    },
    onUpdate
  );
}

/** Delete all documents for a given user/module/thread (used by diagnosis discard). */
export async function deleteDocumentsByThread(
  userId: string,
  moduleId: string,
  threadId: string,
): Promise<number> {
  const dataLayer = getNexusDataLayer();
  const matches = await dataLayer.query<DocumentRecord>({
    collection: COLLECTION,
    where: [
      { field: 'userId', op: '==', value: userId },
      { field: 'moduleId', op: '==', value: moduleId },
      { field: 'threadId', op: '==', value: threadId },
    ]
  });
  let deleted = 0;
  for (const match of matches) {
    await dataLayer.deleteDocument(COLLECTION, match.id);
    deleted++;
  }
  return deleted;
}
