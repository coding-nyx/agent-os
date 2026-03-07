import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { BaseContext } from '../types';
import { readDocOnce } from '@/lib/services/firestore-once';

const GUEST_PROFILE_KEY = 'nexus_agnes_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export interface TherapyIntakeProfile {
  onboardingComplete: boolean;
  baseContext: Partial<BaseContext>;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

export function createEmptyAgnesProfile(): TherapyIntakeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    baseContext: {},
    createdAt: now,
    updatedAt: now
  };
}

export async function loadAgnesProfile({ userId, encryptionKey }: LoadContext): Promise<TherapyIntakeProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;

    const snap = await readDocOnce(doc(db, 'agnes_profiles', userId));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return JSON.parse(decrypted) as TherapyIntakeProfile;
    } catch (e) {
      console.error('Failed to decrypt agnes profile:', e);
      return null;
    }
  }

  return loadGuestAgnesProfile();
}

export function subscribeAgnesProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: TherapyIntakeProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'agnes_profiles', userId);
    const unsubscribe = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        const data = snap.data();
        if (!data?.encryptedData || !data?.iv) {
          onUpdate(null);
          return;
        }
        try {
          const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
          onUpdate(JSON.parse(decrypted) as TherapyIntakeProfile);
        } catch (e) {
          console.error('Failed to decrypt agnes profile:', e);
          onUpdate(null);
        }
      },
      (error) => {
        console.warn('Agnes profile subscription delay or missing doc:', error);
        onUpdate(null);
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestAgnesProfile());
  return () => {};
}

export async function saveAgnesProfile(
  profile: TherapyIntakeProfile,
  { userId, encryptionKey }: LoadContext
): Promise<void> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;

    const encrypted = await encryptWithKey(JSON.stringify(profile), encryptionKey);
    try {
      await setDoc(
        doc(db, 'agnes_profiles', userId),
        {
          encryptedData: encrypted.ciphertext,
          iv: encrypted.iv,
          salt: VAULT_SALT_MARKER,
          metadata: {
            onboardingComplete: profile.onboardingComplete,
            lastActive: new Date().toISOString()
          }
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[AgnesProfileService] Failed to save agnes profile:', error);
    }
    return;
  }

  saveGuestAgnesProfile(profile);
}

export function loadGuestAgnesProfile(): TherapyIntakeProfile | null {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TherapyIntakeProfile;
  } catch (e) {
    console.error('Failed to parse guest agnes profile:', e);
    return null;
  }
}

export function saveGuestAgnesProfile(profile: TherapyIntakeProfile) {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
}

export function clearGuestAgnesProfile() {
  localStorage.removeItem(GUEST_PROFILE_KEY);
}

export async function syncGuestAgnesProfileToUser({
  userId,
  encryptionKey
}: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestAgnesProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;

  const snap = await readDocOnce(doc(db, 'agnes_profiles', userId));
  if (snap.exists() && snap.data()?.encryptedData) return false;

  await saveAgnesProfile(guestProfile, { userId, encryptionKey });
  clearGuestAgnesProfile();
  return true;
}
