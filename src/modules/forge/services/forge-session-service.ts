import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { readDocOnce } from '@/lib/services/firestore-once';

const GUEST_FORGE_KEY = 'agnes_forge_profile_guest';

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
  const candidate = raw as Record<string, any>;

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
      ? candidate.sessions.map((entry: any, index: number) => ({
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
    const { db } = getFirebase();
    if (!db) return null;

    const snap = await readDocOnce(doc(db, 'forge_sessions', userId));
    if (!snap.exists()) return null;
    return normalizeForgeProfile(snap.data());
  }

  return loadGuestForgeProfile();
}

export function subscribeForgeProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: ForgeProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'forge_sessions', userId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        onUpdate(normalizeForgeProfile(snap.data()));
      },
      (error) => {
        console.error('Forge profile subscription error:', error);
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestForgeProfile());
  return () => {};
}

export async function saveForgeProfile(profile: ForgeProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  const normalized = normalizeForgeProfile(profile);

  if (userId && encryptionKey) {
    const { db } = getFirebase();
    if (!db) return;
    try {
      await setDoc(
        doc(db, 'forge_sessions', userId),
        {
          ...normalized,
          metadata: {
            onboardingComplete: normalized.onboardingComplete,
            sessions: normalized.sessions.length,
            queueDepth: normalized.commandQueue.length,
            lastActive: new Date().toISOString()
          }
        },
        { merge: true }
      );
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

  const { db } = getFirebase();
  if (!db) return false;
  const snap = await readDocOnce(doc(db, 'forge_sessions', userId));
  if (snap.exists()) return false;

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
