import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { TrainerProfile } from '../types';

const GUEST_PROFILE_KEY = 'agnes_trainer_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

export async function loadTrainerProfile({ userId, encryptionKey }: LoadContext): Promise<TrainerProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await getDoc(doc(db, 'ai_trainers', userId));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data?.encryptedData || !data?.iv) return null;
    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return JSON.parse(decrypted) as TrainerProfile;
    } catch (e) {
      console.error('Failed to decrypt trainer profile:', e);
      return null;
    }
  }

  return loadGuestTrainerProfile();
}

export async function saveTrainerProfile(
  profile: TrainerProfile,
  { userId, encryptionKey }: LoadContext
): Promise<void> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;
    const encrypted = await encryptWithKey(JSON.stringify(profile), encryptionKey);
    await setDoc(
      doc(db, 'ai_trainers', userId),
      {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: profile.onboardingComplete,
          privacyLevel: profile.privacyLevel,
          lastActive: new Date().toISOString()
        }
      },
      { merge: true }
    );
    return;
  }

  saveGuestTrainerProfile(profile);
}

export async function syncGuestTrainerProfileToUser(
  { userId, encryptionKey }: LoadContext
): Promise<boolean> {
  if (!userId || !encryptionKey) return false;
  const guestProfile = loadGuestTrainerProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;
  const snap = await getDoc(doc(db, 'ai_trainers', userId));
  if (snap.exists() && snap.data()?.encryptedData) {
    return false;
  }

  await saveTrainerProfile(guestProfile, { userId, encryptionKey });
  clearGuestTrainerProfile();
  return true;
}

export function loadGuestTrainerProfile(): TrainerProfile | null {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TrainerProfile;
  } catch (e) {
    console.error('Failed to parse guest trainer profile:', e);
    return null;
  }
}

export function saveGuestTrainerProfile(profile: TrainerProfile) {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
}

export function clearGuestTrainerProfile() {
  localStorage.removeItem(GUEST_PROFILE_KEY);
}

