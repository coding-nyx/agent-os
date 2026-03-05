import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';

const GUEST_LEDGER_KEY = 'agnes_ledger_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export interface LedgerIntakeProfile {
  onboardingComplete: boolean;
  primaryConcerns: string[];
  medications: string[];
  contraindications: string[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

export function createEmptyLedgerProfile(): LedgerIntakeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    primaryConcerns: [],
    medications: [],
    contraindications: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadLedgerProfile({ userId, encryptionKey }: LoadContext): Promise<LedgerIntakeProfile | null> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return null;

    const snap = await getDoc(doc(db, 'ai_ledgers', userId));
    if (!snap.exists()) return null;

    const data = snap.data();
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return JSON.parse(decrypted) as LedgerIntakeProfile;
    } catch (e) {
      console.error('Failed to decrypt ledger profile:', e);
      return null;
    }
  }

  return loadGuestLedgerProfile();
}

export async function saveLedgerProfile(profile: LedgerIntakeProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;

    const encrypted = await encryptWithKey(JSON.stringify(profile), encryptionKey);
    await setDoc(
      doc(db, 'ai_ledgers', userId),
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
    return;
  }

  saveGuestLedgerProfile(profile);
}

export async function syncGuestLedgerProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestLedgerProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;

  const snap = await getDoc(doc(db, 'ai_ledgers', userId));
  if (snap.exists() && snap.data()?.encryptedData) {
    return false;
  }

  await saveLedgerProfile(guestProfile, { userId, encryptionKey });
  clearGuestLedgerProfile();
  return true;
}

export function loadGuestLedgerProfile(): LedgerIntakeProfile | null {
  const raw = localStorage.getItem(GUEST_LEDGER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LedgerIntakeProfile;
  } catch (e) {
    console.error('Failed to parse guest ledger profile:', e);
    return null;
  }
}

export function saveGuestLedgerProfile(profile: LedgerIntakeProfile) {
  localStorage.setItem(GUEST_LEDGER_KEY, JSON.stringify(profile));
}

export function clearGuestLedgerProfile() {
  localStorage.removeItem(GUEST_LEDGER_KEY);
}
