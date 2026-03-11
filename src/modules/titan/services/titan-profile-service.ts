import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { TitanProfile } from '@/lib/types';

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
  const data = raw as Partial<TitanProfile>;
  const now = new Date().toISOString();
  const toStringArray = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
  return {
    onboardingComplete: data.onboardingComplete === true,
    privacyLevel: data.privacyLevel === 'complete' ? 'complete' : 'basic',
    trackingLevel: data.trackingLevel === 'indepth' ? 'indepth' : 'standard',
    nutrition: data.nutrition && typeof data.nutrition === 'object' ? (data.nutrition as TitanProfile['nutrition']) : base.nutrition,
    activity: data.activity && typeof data.activity === 'object' ? (data.activity as TitanProfile['activity']) : base.activity,
    history: data.history && typeof data.history === 'object' ? (data.history as TitanProfile['history']) : base.history,
    summary: typeof data.summary === 'string' ? data.summary : '',
    routines: Array.isArray(data.routines) ? (data.routines as TitanProfile['routines']) : base.routines,
    sleepLog: Array.isArray(data.sleepLog) ? (data.sleepLog as NonNullable<TitanProfile['sleepLog']>).slice(0, 730) : base.sleepLog,
    cycles: Array.isArray(data.cycles) ? (data.cycles as TitanProfile['cycles']) : base.cycles,
    workoutSessions: Array.isArray(data.workoutSessions) ? (data.workoutSessions as NonNullable<TitanProfile['workoutSessions']>).slice(0, 500) : base.workoutSessions,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
    traits: Array.isArray(data.traits) ? data.traits.filter((entry): entry is string => typeof entry === 'string') : base.traits,
    // Ensure medical arrays are safe and bounded
    knownConditions: toStringArray(data.knownConditions),
    medications: toStringArray(data.medications),
    allergies: toStringArray(data.allergies),
    biomarkers: Array.isArray(data.biomarkers) ? (data.biomarkers as TitanProfile['biomarkers']).slice(0, 200) : base.biomarkers,
    labSummaries: Array.isArray(data.labSummaries) ? (data.labSummaries as TitanProfile['labSummaries']).slice(0, 50) : base.labSummaries,
    clearances: Array.isArray(data.clearances) ? (data.clearances as TitanProfile['clearances']).slice(0, 100) : base.clearances,
    medicalImageAnalyses: Array.isArray(data.medicalImageAnalyses) ? (data.medicalImageAnalyses as TitanProfile['medicalImageAnalyses']).slice(0, 100) : base.medicalImageAnalyses,
    medicalSummary: typeof (data as Record<string, unknown>).medicalSummary === 'string' ? (data as Record<string, unknown>).medicalSummary as string : '',
    medicalOnboardingComplete: data.medicalOnboardingComplete === true,
    personalRecords: data.personalRecords && typeof data.personalRecords === 'object' ? (data.personalRecords as TitanProfile['personalRecords']) : {},
    directWriteMode: data.directWriteMode === true,
  };
}

export async function loadTitanProfile({ userId, encryptionKey }: LoadContext): Promise<TitanProfile | null> {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('titan_profiles', userId);
    if (!data) return null;
    if (!data.encryptedData || !data.iv) return null;
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
    const dataLayer = getNexusDataLayer();
    const unsubscribe = dataLayer.subscribeToDocument<{ encryptedData?: string; iv?: string }>(
      'titan_profiles',
      userId,
      async (data) => {
        if (!data) {
          onUpdate(null);
          return;
        }
        if (!data.encryptedData || !data.iv) {
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
  const normalized = normalizeTitanProfile({ ...profile, updatedAt: new Date().toISOString() });

  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
    try {
      await dataLayer.setDocument('titan_profiles', userId, {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: normalized.onboardingComplete,
          privacyLevel: normalized.privacyLevel,
          lastActive: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[TitanProfileService] Failed to save titan profile:', error);
    }
    return;
  }

  saveGuestTitanProfile(normalized);
}

export async function syncGuestTitanProfileToUser(
  { userId, encryptionKey }: LoadContext
): Promise<boolean> {
  if (!userId || !encryptionKey) return false;
  const guestProfile = loadGuestTitanProfile();
  if (!guestProfile) return false;

  const dataLayer = getNexusDataLayer();
  const existing = await dataLayer.getDocument<{ encryptedData?: string }>('titan_profiles', userId);
  if (existing?.encryptedData) {
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
