
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebase, ensureAuthReady } from '../firebase';
import { IVaultStorageService } from './vault-storage-service';

export class FirebaseVaultStorageService implements IVaultStorageService {
  private COLLECTION = 'users';

  async getSalt(userId: string): Promise<string | null> {
    await ensureAuthReady();
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await getDoc(doc(db, this.COLLECTION, userId));
    return snap.exists() ? snap.data().vaultSalt : null;
  }

  async saveSalt(userId: string, salt: string): Promise<void> {
    await ensureAuthReady();
    const { db } = getFirebase();
    if (!db) return;
    const ref = doc(db, this.COLLECTION, userId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { vaultSalt: salt });
    } else {
      await setDoc(ref, { vaultSalt: salt });
    }
  }

  async getCanary(userId: string): Promise<{ ciphertext: string; iv: string } | null> {
    await ensureAuthReady();
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await getDoc(doc(db, this.COLLECTION, userId));
    return snap.exists() ? (snap.data().vaultCanary || null) : null;
  }

  async saveCanary(userId: string, canary: { ciphertext: string; iv: string }): Promise<void> {
    await ensureAuthReady();
    const { db } = getFirebase();
    if (!db) return;
    const ref = doc(db, this.COLLECTION, userId);
    await updateDoc(ref, { vaultCanary: canary });
  }

  async hasVault(userId: string): Promise<boolean> {
    const salt = await this.getSalt(userId);
    return !!salt;
  }
}
