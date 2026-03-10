import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';

const GUEST_FORGE_KEY = 'nexus_forge_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export interface ForgeExecutionRecord {
  id: string;
  command: string;
  result: 'queued' | 'running' | 'success' | 'error';
  outputSummary?: string;
  errorLog?: string[];
  createdAt: string;
}

export interface ForgeProfile {
  onboardingComplete: boolean;
  environment: 'local' | 'cloud' | 'hybrid';
  safetyMode: 'strict' | 'balanced';
  commandQueue: string[];
  sessions: ForgeExecutionRecord[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function normalizeForgeProfile(raw: unknown): ForgeProfile {
  const now = new Date().toISOString();
  const base = createEmptyForgeProfile();
  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, unknown>;

  return {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    environment:
      candidate.environment === 'cloud' || candidate.environment === 'hybrid'
        ? candidate.environment
        : 'cloud',
    safetyMode: candidate.safetyMode === 'balanced' ? 'balanced' : 'strict',
    commandQueue: Array.isArray(candidate.commandQueue)
      ? candidate.commandQueue.filter((entry): entry is string => typeof entry === 'string')
      : [],
    sessions: Array.isArray(candidate.sessions)
      ? candidate.sessions.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `forge_${index}`,
          command: typeof entry?.command === 'string' ? entry.command : 'command',
          result:
            entry?.result === 'queued' || entry?.result === 'running' || entry?.result === 'success' || entry?.result === 'error'
              ? entry.result
              : 'queued',
          outputSummary: typeof entry?.outputSummary === 'string' ? entry.outputSummary : undefined,
          errorLog: Array.isArray(entry?.errorLog)
            ? entry.errorLog.filter((line: unknown): line is string => typeof line === 'string' && line.trim().length > 0)
            : undefined,
          createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now
        }))
      : [],
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };
}

export function createEmptyForgeProfile(): ForgeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    environment: 'cloud',
    safetyMode: 'strict',
    commandQueue: [],
    sessions: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadForgeProfile({ userId, encryptionKey }: LoadContext): Promise<ForgeProfile | null> {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const record = await dataLayer.getDocument<ForgeProfile & { encryptedData?: string; iv?: string }>('forge_sessions', userId);
    if (!record) return null;

    if (record.encryptedData && record.iv) {
      try {
        const decrypted = await decryptWithKey({ ciphertext: record.encryptedData, iv: record.iv }, encryptionKey);
        return normalizeForgeProfile(JSON.parse(decrypted));
      } catch (error) {
        console.error('Failed to decrypt forge profile:', error);
        return null;
      }
    }

    // Backward compatibility for legacy unencrypted forge documents.
    return normalizeForgeProfile(record);
  }

  return loadGuestForgeProfile();
}

export function subscribeForgeProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: ForgeProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const unsubscribe = dataLayer.subscribeToDocument<ForgeProfile & { encryptedData?: string; iv?: string }>(
      'forge_sessions',
      userId,
      async (record) => {
        if (!record) {
          onUpdate(null);
          return;
        }
        if (record.encryptedData && record.iv) {
          try {
            const decrypted = await decryptWithKey({ ciphertext: record.encryptedData, iv: record.iv }, encryptionKey);
            onUpdate(normalizeForgeProfile(JSON.parse(decrypted)));
          } catch (error) {
            console.error('Failed to decrypt forge profile:', error);
            onUpdate(null);
          }
          return;
        }
        onUpdate(normalizeForgeProfile(record));
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestForgeProfile());
  return () => {};
}

export async function saveForgeProfile(profile: ForgeProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  const normalized = normalizeForgeProfile({ ...profile, updatedAt: new Date().toISOString() });

  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    try {
      const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
      await dataLayer.setDocument('forge_sessions', userId, {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: normalized.onboardingComplete,
          sessions: normalized.sessions.length,
          queueDepth: normalized.commandQueue.length,
          lastActive: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[ForgeSessionService] Failed to save forge profile:', error);
    }
    return;
  }

  saveGuestForgeProfile(normalized);
}

export async function syncGuestForgeProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestForgeProfile();
  if (!guestProfile) return false;

  const dataLayer = getNexusDataLayer();
  const existing = await dataLayer.getDocument<{ encryptedData?: string }>('forge_sessions', userId);
  if (existing) return false;

  await saveForgeProfile(guestProfile, { userId, encryptionKey });
  clearGuestForgeProfile();
  return true;
}

export function loadGuestForgeProfile(): ForgeProfile | null {
  const raw = localStorage.getItem(GUEST_FORGE_KEY);
  if (!raw) return null;
  try {
    return normalizeForgeProfile(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to parse guest forge profile:', error);
    return null;
  }
}

export function saveGuestForgeProfile(profile: ForgeProfile): void {
  localStorage.setItem(GUEST_FORGE_KEY, JSON.stringify(normalizeForgeProfile(profile)));
}

export function clearGuestForgeProfile(): void {
  localStorage.removeItem(GUEST_FORGE_KEY);
}
