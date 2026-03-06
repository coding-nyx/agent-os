import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { BaseContext } from '../types';
import { readDocOnce } from '@/lib/services/firestore-once';

const GUEST_PROFILE_KEY = 'agnes_therapy_profile_guest';
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

export function createEmptyTherapyProfile(): TherapyIntakeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    baseContext: {},
    createdAt: now,
    updatedAt: now
  };
}

export async function loadTherapyProfile({ userId, encryptionKey }: LoadContext): Promise<TherapyIntakeProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;

    const snap = await readDocOnce(doc(db, 'therapist_profiles', userId));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return JSON.parse(decrypted) as TherapyIntakeProfile;
    } catch (e) {
      console.error('Failed to decrypt therapy profile:', e);
      return null;
    }
  }

  return loadGuestTherapyProfile();
}

export function subscribeTherapyProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: TherapyIntakeProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'therapist_profiles', userId);
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
          console.error('Failed to decrypt therapy profile:', e);
          onUpdate(null);
        }
      },
      (error) => {
        console.error('Therapy profile subscription error:', error);
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestTherapyProfile());
  return () => {};
}

export async function saveTherapyProfile(
  profile: TherapyIntakeProfile,
  { userId, encryptionKey }: LoadContext
): Promise<void> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;

    const encrypted = await encryptWithKey(JSON.stringify(profile), encryptionKey);
    try {
      await setDoc(
        doc(db, 'therapist_profiles', userId),
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
      console.error('[TherapyProfileService] Failed to save therapy profile:', error);
    }
    return;
  }

  saveGuestTherapyProfile(profile);
}

export function loadGuestTherapyProfile(): TherapyIntakeProfile | null {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as TherapyIntakeProfile;
  } catch (e) {
    console.error('Failed to parse guest therapy profile:', e);
    return null;
  }
}

export function saveGuestTherapyProfile(profile: TherapyIntakeProfile) {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
}

export function clearGuestTherapyProfile() {
  localStorage.removeItem(GUEST_PROFILE_KEY);
}

export async function syncGuestTherapyProfileToUser({
  userId,
  encryptionKey
}: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestTherapyProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;

  const snap = await readDocOnce(doc(db, 'therapist_profiles', userId));
  if (snap.exists() && snap.data()?.encryptedData) return false;

  await saveTherapyProfile(guestProfile, { userId, encryptionKey });
  clearGuestTherapyProfile();
  return true;
}
