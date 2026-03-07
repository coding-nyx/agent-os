import { deleteDoc, doc, collection, getDocs, writeBatch } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { getUserDataDeletionTargets } from './user-data-registry';

const LOCAL_STORAGE_PREFIXES = ['nexus_', 'agnes_'];
const LOCAL_STORAGE_SUBSTRINGS = ['integrity'];
const SESSION_STORAGE_KEYS = ['nexus_guest_active', 'nexus_vault_session'];

/** Known subcollections keyed by parent collection name. */
const KNOWN_SUBCOLLECTIONS: Record<string, string[]> = {
  semantic_memory: ['facts'],
  spine_events: ['events'],
  users: ['modules'],
};

function shouldRemoveLocalStorageKey(key: string): boolean {
  return (
    LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    LOCAL_STORAGE_SUBSTRINGS.some((substring) => key.includes(substring))
  );
}

async function deleteSubcollection(db: Firestore, parentPath: string, subcollectionName: string): Promise<void> {
  const subcollRef = collection(db, parentPath, subcollectionName);
  const snapshot = await getDocs(subcollRef);
  if (snapshot.empty) return;

  // Firestore batches support up to 500 operations
  const BATCH_SIZE = 500;
  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export const SoulTerminationService = {
  async purgeUserData(uid: string): Promise<void> {
    if (!uid) return;

    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');

    const targets = getUserDataDeletionTargets(uid);
    try {
      // 1. Delete known subcollections first (Firestore does NOT cascade-delete)
      for (const target of targets) {
        const subcollections = KNOWN_SUBCOLLECTIONS[target.collection];
        if (subcollections) {
          const parentPath = `${target.collection}/${target.documentId}`;
          await Promise.all(
            subcollections.map((sub) => deleteSubcollection(db, parentPath, sub))
          );
        }
      }

      // 2. Delete the parent documents
      await Promise.all(
        targets.map((target) => deleteDoc(doc(db, target.collection, target.documentId)))
      );
    } catch (error) {
      console.error('[SoulTerminationService] Failed to purge user data:', error);
      throw error;
    }
  },

  clearLocalArtifacts(): void {
    if (typeof window === 'undefined') return;

    SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));

    Object.keys(localStorage).forEach((key) => {
      if (shouldRemoveLocalStorageKey(key)) {
        localStorage.removeItem(key);
      }
    });
  },

  async terminateSoul(uid: string): Promise<void> {
    await this.purgeUserData(uid);
    this.clearLocalArtifacts();
  }
};
