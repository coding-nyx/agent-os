// --- Soma Profile Service (Sovereign Data Layer — Path C+ Phase 1) ---
//
// Owns the `soma_profiles` Firestore collection with full E2EE.
// Mirrors the patterns established in titan-profile-service.ts.

import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { readDocOnce } from '@/lib/services/firestore-once';
import type { SomaProfile } from '@/lib/types';

const COLLECTION = 'soma_profiles';
const VAULT_SALT_MARKER = 'vault_salt_used';

type SomaLoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

/**
 * Returns a blank SomaProfile with safe defaults.
 */
export function createEmptySomaProfile(userId: string): SomaProfile {
  const now = new Date().toISOString();
  return {
    id: userId,
    userId,
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances: [],
    medicalImageAnalyses: [],
    medicalSummary: '',
    medicalOnboardingComplete: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Normalises raw (decrypted) JSON into a fully-populated SomaProfile.
 * Ensures every array field is safe and bounded to prevent runaway storage.
 */
export function normalizeSomaProfile(userId: string, raw: unknown): SomaProfile {
  const base = createEmptySomaProfile(userId);
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<SomaProfile>;
  const now = new Date().toISOString();

  return {
    id: userId,
    userId,
    knownConditions: Array.isArray(data.knownConditions) ? data.knownConditions.filter((entry): entry is string => typeof entry === 'string') : [],
    medications: Array.isArray(data.medications) ? data.medications.filter((entry): entry is string => typeof entry === 'string') : [],
    allergies: Array.isArray(data.allergies) ? data.allergies.filter((entry): entry is string => typeof entry === 'string') : [],
    biomarkers: Array.isArray(data.biomarkers)
      ? (data.biomarkers as SomaProfile['biomarkers']).slice(0, 200)
      : [],
    labSummaries: Array.isArray(data.labSummaries)
      ? (data.labSummaries as SomaProfile['labSummaries']).slice(0, 50)
      : [],
    clearances: Array.isArray(data.clearances)
      ? (data.clearances as SomaProfile['clearances']).slice(0, 100)
      : [],
    medicalImageAnalyses: Array.isArray(data.medicalImageAnalyses)
      ? (data.medicalImageAnalyses as SomaProfile['medicalImageAnalyses']).slice(0, 100)
      : [],
    medicalSummary: typeof (data as Record<string, unknown>).medicalSummary === 'string'
      ? (data as Record<string, unknown>).medicalSummary as string
      : '',
    medicalOnboardingComplete: data.medicalOnboardingComplete === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
  };
}

/**
 * Placeholder for guest sync logic.
 */
export async function syncGuestSomaProfileToUser({ userId, encryptionKey }: { userId: string; encryptionKey: CryptoKey }): Promise<boolean> {
    if (!userId || !encryptionKey) return true;
    return true;
}

/**
 * Loads and decrypts a SomaProfile from Firestore.
 * Returns `null` when the document doesn't exist or decryption fails.
 */
export async function loadSomaProfile(
  { userId, encryptionKey }: SomaLoadContext,
): Promise<SomaProfile | null> {
  if (!userId || !encryptionKey) return null;

  const { db } = getFirebase();
  if (!db) return null;

  const snap = await readDocOnce(doc(db, COLLECTION, userId));
  if (!snap.exists()) return null;

  const data = snap.data();
  if (!data?.encryptedData || !data?.iv) return null;

  try {
    const decrypted = await decryptWithKey(
      { ciphertext: data.encryptedData as string, iv: data.iv as string },
      encryptionKey,
    );
    return normalizeSomaProfile(userId, JSON.parse(decrypted));
  } catch (e) {
    console.error('[SomaProfileService] Failed to decrypt soma profile:', e);
    return null;
  }
}

/**
 * Encrypts and persists a SomaProfile to Firestore.
 * Uses merge semantics so metadata can coexist with the encrypted blob.
 */
export async function saveSomaProfile(
  profile: SomaProfile,
  { userId, encryptionKey }: SomaLoadContext,
): Promise<void> {
  if (!userId || !encryptionKey) return;

  const { db } = getFirebase();
  if (!db) return;

  const normalized = normalizeSomaProfile(userId, { ...profile, updatedAt: new Date().toISOString() });

  const serialised = JSON.stringify(normalized);

  const encrypted = await encryptWithKey(serialised, encryptionKey);

  try {
    await setDoc(
      doc(db, COLLECTION, userId),
      {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          medicalOnboardingComplete: Boolean(profile.medicalOnboardingComplete),
          lastActive: new Date().toISOString(),
        },
      },
      { merge: true },
    );
  } catch (error) {
    console.error('[SomaProfileService] Failed to save soma profile:', error);
  }
}

/**
 * Subscribes to real-time SomaProfile updates (mirrors subscribeTitanProfile pattern).
 * Returns an unsubscribe function.
 */
export function subscribeSomaProfile(
  { userId, encryptionKey }: SomaLoadContext,
  onUpdate: (profile: SomaProfile | null) => void,
): () => void {
  if (!userId || !encryptionKey) {
    onUpdate(null);
    return () => {};
  }

  const { db } = getFirebase();
  if (!db) return () => {};

  const ref = doc(db, COLLECTION, userId);
  return onSnapshot(
    ref,
    async (snap) => {
      if (!snap.exists()) { onUpdate(null); return; }
      const data = snap.data();
      if (!data?.encryptedData || !data?.iv) { onUpdate(null); return; }
      try {
        const decrypted = await decryptWithKey(
          { ciphertext: data.encryptedData as string, iv: data.iv as string },
          encryptionKey,
        );
        onUpdate(normalizeSomaProfile(userId, JSON.parse(decrypted)));
      } catch (e) {
        console.error('[SomaProfileService] Failed to decrypt soma profile:', e);
        onUpdate(null);
      }
    },
    (error) => {
      console.warn('[SomaProfileService] Subscription error:', error);
      onUpdate(null);
    },
  );
}
