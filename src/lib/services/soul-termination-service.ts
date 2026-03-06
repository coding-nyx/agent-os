import { deleteDoc, doc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { getUserDataDeletionTargets } from './user-data-registry';

const LOCAL_STORAGE_PREFIXES = ['agnes_'];
const LOCAL_STORAGE_SUBSTRINGS = ['integrity'];
const SESSION_STORAGE_KEYS = ['agnes_guest_active', 'agnes_vault_session'];

function shouldRemoveLocalStorageKey(key: string): boolean {
  return (
    LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
    LOCAL_STORAGE_SUBSTRINGS.some((substring) => key.includes(substring))
  );
}

export const SoulTerminationService = {
  async purgeUserData(uid: string): Promise<void> {
    if (!uid) return;

    const { db } = getFirebase();
    if (!db) throw new Error('Firebase not initialized');

    const targets = getUserDataDeletionTargets(uid);
    try {
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
