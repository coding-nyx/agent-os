import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { readDocOnce } from '@/lib/services/firestore-once';

const GUEST_SOMA_KEY = 'agnes_soma_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export interface BiomarkerRecord {
  id: string;
  name: string;
  value: number | string;
  unit?: string;
  source?: string;
  recordedAt: string;
}

export interface ClearanceRecord {
  id: string;
  activity: string;
  status: 'granted' | 'denied' | 'conditional';
  reason: string;
  issuedAt: string;
}

export interface SomaProfile {
  onboardingComplete: boolean;
  knownConditions: string[];
  medications: string[];
  allergies: string[];
  biomarkers: BiomarkerRecord[];
  labSummaries: Array<{
    id: string;
    panel: string;
    findings: string[];
    flags: string[];
    recordedAt: string;
  }>;
  clearances: ClearanceRecord[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function normalizeProfile(raw: unknown): SomaProfile {
  const now = new Date().toISOString();
  const base = createEmptySomaProfile();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Record<string, unknown>;

  return {
    ...base,
    onboardingComplete: data.onboardingComplete === true,
    knownConditions: toStringArray(data.knownConditions),
    medications: toStringArray(data.medications),
    allergies: toStringArray(data.allergies),
    biomarkers: Array.isArray(data.biomarkers)
      ? data.biomarkers.map((_raw: Record<string, unknown>, index: number) => { const entry = _raw as Record<string, unknown> | null; return ({
          id: typeof entry?.id === 'string' ? entry.id : `bio_${index}`,
          name: typeof entry?.name === 'string' ? entry.name : 'biomarker',
          value: typeof entry?.value === 'number' || typeof entry?.value === 'string' ? entry.value : '',
          unit: typeof entry?.unit === 'string' ? entry.unit : undefined,
          source: typeof entry?.source === 'string' ? entry.source : undefined,
          recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt as string : now
        }); })
      : [],
    labSummaries: Array.isArray(data.labSummaries)
      ? data.labSummaries.map((_raw: Record<string, unknown>, index: number) => { const entry = _raw as Record<string, unknown> | null; return ({
          id: typeof entry?.id === 'string' ? entry.id : `lab_${index}`,
          panel: typeof entry?.panel === 'string' ? entry.panel : 'lab panel',
          findings: toStringArray(entry?.findings),
          flags: toStringArray(entry?.flags),
          recordedAt: typeof entry?.recordedAt === 'string' ? entry.recordedAt as string : now
        }); })
      : [],
    clearances: Array.isArray(data.clearances)
      ? data.clearances.map((_raw: Record<string, unknown>, index: number) => { const entry = _raw as Record<string, unknown> | null; return ({
          id: typeof entry?.id === 'string' ? entry.id : `clr_${index}`,
          activity: typeof entry?.activity === 'string' ? entry.activity : 'activity',
          status:
            entry?.status === 'granted' || entry?.status === 'denied' || entry?.status === 'conditional'
              ? entry.status
              : 'conditional',
          reason: typeof entry?.reason === 'string' ? entry.reason : 'No reason provided.',
          issuedAt: typeof entry?.issuedAt === 'string' ? entry.issuedAt as string : now
        }); })
      : [],
    summary: typeof data.summary === 'string' ? data.summary : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now
  };
}

export function createEmptySomaProfile(): SomaProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    knownConditions: [],
    medications: [],
    allergies: [],
    biomarkers: [],
    labSummaries: [],
    clearances: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadSomaProfile({ userId, encryptionKey }: LoadContext): Promise<SomaProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;

    const snap = await readDocOnce(doc(db, 'soma_profiles', userId));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return normalizeProfile(JSON.parse(decrypted));
    } catch (error) {
      console.error('Failed to decrypt soma profile:', error);
      return null;
    }
  }

  return loadGuestSomaProfile();
}

export function subscribeSomaProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: SomaProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'soma_profiles', userId);
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
          onUpdate(normalizeProfile(JSON.parse(decrypted)));
        } catch (error) {
          console.error('Failed to decrypt soma profile:', error);
          onUpdate(null);
        }
      },
      (error) => {
        console.error('Soma profile subscription error:', error);
      }
    );

    return unsubscribe;
  }

  onUpdate(loadGuestSomaProfile());
  return () => {};
}

export async function saveSomaProfile(profile: SomaProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  const normalized = normalizeProfile(profile);

  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;

    const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
    try {
      await setDoc(
        doc(db, 'soma_profiles', userId),
        {
          encryptedData: encrypted.ciphertext,
          iv: encrypted.iv,
          salt: VAULT_SALT_MARKER,
          metadata: {
            onboardingComplete: normalized.onboardingComplete,
            lastActive: new Date().toISOString()
          }
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[SomaProfileService] Failed to save soma profile:', error);
    }
    return;
  }

  saveGuestSomaProfile(normalized);
}

export async function syncGuestSomaProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestSomaProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;

  const snap = await readDocOnce(doc(db, 'soma_profiles', userId));
  if (snap.exists() && snap.data()?.encryptedData) return false;

  await saveSomaProfile(guestProfile, { userId, encryptionKey });
  clearGuestSomaProfile();
  return true;
}

export function loadGuestSomaProfile(): SomaProfile | null {
  const raw = localStorage.getItem(GUEST_SOMA_KEY);
  if (!raw) return null;
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to parse guest soma profile:', error);
    return null;
  }
}

export function saveGuestSomaProfile(profile: SomaProfile): void {
  localStorage.setItem(GUEST_SOMA_KEY, JSON.stringify(normalizeProfile(profile)));
}

export function clearGuestSomaProfile(): void {
  localStorage.removeItem(GUEST_SOMA_KEY);
}
