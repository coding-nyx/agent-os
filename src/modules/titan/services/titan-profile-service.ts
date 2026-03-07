import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { TitanProfile } from '@/lib/types';
import { readDocOnce } from '@/lib/services/firestore-once';

const GUEST_PROFILE_KEY = 'nexus_titan_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

export function createEmptyTitanProfile(): TitanProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    privacyLevel: 'basic',
    trackingLevel: 'standard',
    nutrition: { supplements: [] },
    activity: {},
    history: {},
    summary: '',
    routines: [],
    createdAt: now,
    updatedAt: now,
    // Medical fields (absorbed from Soma)
    medicalOnboardingComplete: false,
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances: [],
    medicalImageAnalyses: [],
    medicalSummary: '',
  };
}

export function normalizeTitanProfile(raw: unknown): TitanProfile {
  const base = createEmptyTitanProfile();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Record<string, unknown>;

  return {
    ...base,
    ...(data as Partial<TitanProfile>),
    // Ensure medical arrays are safe and bounded
    knownConditions: Array.isArray(data.knownConditions) ? data.knownConditions as string[] : [],
    medications: Array.isArray(data.medications) ? data.medications as string[] : [],
    allergies: Array.isArray(data.allergies) ? data.allergies as string[] : [],
    biomarkers: Array.isArray(data.biomarkers) ? (data.biomarkers as TitanProfile['biomarkers']).slice(0, 200) : [],
    labSummaries: Array.isArray(data.labSummaries) ? (data.labSummaries as TitanProfile['labSummaries']).slice(0, 50) : [],
    clearances: Array.isArray(data.clearances) ? (data.clearances as TitanProfile['clearances']).slice(0, 100) : [],
    medicalImageAnalyses: Array.isArray(data.medicalImageAnalyses) ? (data.medicalImageAnalyses as TitanProfile['medicalImageAnalyses']).slice(0, 100) : [],
    medicalSummary: typeof data.medicalSummary === 'string' ? data.medicalSummary : '',
    medicalOnboardingComplete: Boolean(data.medicalOnboardingComplete),
  };
}

/**
 * One-time migration: reads soma_profiles and merges medical data into titan profile.
 * No-op if titan already has biomarkers or medical onboarding complete.
 */
export async function migrateSomaDataToTitan(
  titanProfile: TitanProfile,
  context: { userId?: string | null; encryptionKey?: CryptoKey | null }
): Promise<TitanProfile> {
  if (titanProfile.biomarkers?.length > 0 || titanProfile.medicalOnboardingComplete) {
    return titanProfile;
  }

  const { userId, encryptionKey } = context;
  if (!userId || !encryptionKey) return titanProfile;

  const { db } = getFirebase();
  if (!db) return titanProfile;

  try {
    const snap = await readDocOnce(doc(db, 'soma_profiles', userId));
    if (!snap.exists()) return titanProfile;

    const raw = snap.data();
    if (!raw?.encryptedData || !raw?.iv) return titanProfile;

    const decrypted = await decryptWithKey({ ciphertext: raw.encryptedData, iv: raw.iv }, encryptionKey);
    const somaData = JSON.parse(decrypted) as Record<string, unknown>;

    return {
      ...titanProfile,
      medicalOnboardingComplete: Boolean(somaData.onboardingComplete),
      knownConditions: Array.isArray(somaData.knownConditions) ? somaData.knownConditions as string[] : titanProfile.knownConditions,
      medications: Array.isArray(somaData.medications) ? somaData.medications as string[] : titanProfile.medications,
      allergies: Array.isArray(somaData.allergies) ? somaData.allergies as string[] : titanProfile.allergies,
      biomarkers: Array.isArray(somaData.biomarkers) ? (somaData.biomarkers as TitanProfile['biomarkers']).slice(0, 200) : titanProfile.biomarkers,
      labSummaries: Array.isArray(somaData.labSummaries) ? (somaData.labSummaries as TitanProfile['labSummaries']).slice(0, 50) : titanProfile.labSummaries,
      clearances: Array.isArray(somaData.clearances) ? (somaData.clearances as TitanProfile['clearances']).slice(0, 100) : titanProfile.clearances,
      medicalImageAnalyses: Array.isArray(somaData.medicalImageAnalyses) ? (somaData.medicalImageAnalyses as TitanProfile['medicalImageAnalyses']).slice(0, 100) : titanProfile.medicalImageAnalyses,
      medicalSummary: typeof somaData.summary === 'string' ? somaData.summary : titanProfile.medicalSummary ?? '',
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[TitanProfileService] Soma migration failed (non-fatal):', e);
    return titanProfile;
  }
}

export async function loadTitanProfile({ userId, encryptionKey }: LoadContext): Promise<TitanProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await readDocOnce(doc(db, 'titan_profiles', userId));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data?.encryptedData || !data?.iv) return null;
    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return normalizeTitanProfile(JSON.parse(decrypted));
    } catch (e) {
      console.error('Failed to decrypt titan profile:', e);
      return null;
    }
  }

  return loadGuestTitanProfile();
}

export function subscribeTitanProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: TitanProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'titan_profiles', userId);
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
          onUpdate(normalizeTitanProfile(JSON.parse(decrypted)));
        } catch (e) {
          console.error('Failed to decrypt titan profile:', e);
          onUpdate(null);
        }
      },
      (error) => {
        console.warn('Titan profile subscription delay or missing doc:', error);
        onUpdate(null);
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestTitanProfile());
  return () => {};
}

export async function saveTitanProfile(
  profile: TitanProfile,
  { userId, encryptionKey }: LoadContext
): Promise<void> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;
    const encrypted = await encryptWithKey(JSON.stringify(profile), encryptionKey);
    try {
      await setDoc(
        doc(db, 'titan_profiles', userId),
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
    } catch (error) {
      console.error('[TitanProfileService] Failed to save titan profile:', error);
    }
    return;
  }

  saveGuestTitanProfile(profile);
}

export async function syncGuestTitanProfileToUser(
  { userId, encryptionKey }: LoadContext
): Promise<boolean> {
  if (!userId || !encryptionKey) return false;
  const guestProfile = loadGuestTitanProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;
  const snap = await readDocOnce(doc(db, 'titan_profiles', userId));
  if (snap.exists() && snap.data()?.encryptedData) {
    return false;
  }

  await saveTitanProfile(guestProfile, { userId, encryptionKey });
  clearGuestTitanProfile();
  return true;
}

export function loadGuestTitanProfile(): TitanProfile | null {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY);
  if (!raw) return null;
  try {
    return normalizeTitanProfile(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to parse guest titan profile:', e);
    return null;
  }
}

export function saveGuestTitanProfile(profile: TitanProfile) {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
}

export function clearGuestTitanProfile() {
  localStorage.removeItem(GUEST_PROFILE_KEY);
}
