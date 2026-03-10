import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import type { TherapyIntakeProfile } from '@/lib/types';

export type { TherapyIntakeProfile } from '@/lib/types';

const GUEST_PROFILE_KEY = 'nexus_agnes_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

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

function normalizeAgnesProfile(raw: unknown): TherapyIntakeProfile {
  const base = createEmptyAgnesProfile();
  if (!raw || typeof raw !== 'object') return base;

  const data = raw as Partial<TherapyIntakeProfile>;
  const now = new Date().toISOString();

  return {
    onboardingComplete: data.onboardingComplete === true,
    baseContext: (data.baseContext && typeof data.baseContext === 'object') ? data.baseContext : {},
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now
  };
}

export async function loadAgnesProfile({ userId, encryptionKey }: LoadContext): Promise<TherapyIntakeProfile | null> {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('agnes_profiles', userId);
    if (!data) return null;
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return normalizeAgnesProfile(JSON.parse(decrypted));
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
    const dataLayer = getNexusDataLayer();
    const unsubscribe = dataLayer.subscribeToDocument<{ encryptedData?: string; iv?: string }>(
      'agnes_profiles',
      userId,
      async (data) => {
        if (!data) {
          onUpdate(null);
          return;
        }
        if (!data?.encryptedData || !data?.iv) {
          onUpdate(null);
          return;
        }
        try {
          const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
          onUpdate(normalizeAgnesProfile(JSON.parse(decrypted)));
        } catch (e) {
          console.error('Failed to decrypt agnes profile:', e);
          onUpdate(null);
        }
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
  const normalized = normalizeAgnesProfile({ ...profile, updatedAt: new Date().toISOString() });

  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
    try {
      await dataLayer.setDocument('agnes_profiles', userId, {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: normalized.onboardingComplete,
          lastActive: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[AgnesProfileService] Failed to save agnes profile:', error);
    }
    return;
  }

  saveGuestAgnesProfile(normalized);
}

export function loadGuestAgnesProfile(): TherapyIntakeProfile | null {
  const raw = localStorage.getItem(GUEST_PROFILE_KEY);
  if (!raw) return null;

  try {
    return normalizeAgnesProfile(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to parse guest agnes profile:', e);
    return null;
  }
}

export function saveGuestAgnesProfile(profile: TherapyIntakeProfile) {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(normalizeAgnesProfile(profile)));
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

  const dataLayer = getNexusDataLayer();
  const existing = await dataLayer.getDocument<{ encryptedData?: string }>('agnes_profiles', userId);
  if (existing?.encryptedData) return false;

  await saveAgnesProfile(guestProfile, { userId, encryptionKey });
  clearGuestAgnesProfile();
  return true;
}
