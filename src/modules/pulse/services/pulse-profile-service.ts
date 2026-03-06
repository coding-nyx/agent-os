import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebase } from '@/lib/firebase';
import { readDocOnce } from '@/lib/services/firestore-once';

const GUEST_PULSE_KEY = 'agnes_pulse_profile_guest';

export interface InterestNode {
  id: string;
  topic: string;
  score: number;
  trend: 'rising' | 'steady' | 'cooling';
  lastSeenAt: string;
}

export interface PulseNewsBrief {
  topic: string;
  summary: string;
  source?: string;
  updatedAt: string;
}

export interface PulseProfile {
  onboardingComplete: boolean;
  interests: InterestNode[];
  trendBriefs: string[];
  newsBriefs: PulseNewsBrief[];
  newsUpdatedAt?: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
};

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizePulseProfile(raw: unknown): PulseProfile {
  const now = new Date().toISOString();
  const base = createEmptyPulseProfile();
  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, any>;

  return {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    interests: Array.isArray(candidate.interests)
      ? candidate.interests.map((entry: any, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `interest_${index}`,
          topic: typeof entry?.topic === 'string' ? entry.topic : `Topic ${index + 1}`,
          score: clampScore(entry?.score),
          trend:
            entry?.trend === 'rising' || entry?.trend === 'cooling'
              ? entry.trend
              : 'steady',
          lastSeenAt: typeof entry?.lastSeenAt === 'string' ? entry.lastSeenAt : now
        }))
      : [],
    trendBriefs: Array.isArray(candidate.trendBriefs)
      ? candidate.trendBriefs.filter((entry): entry is string => typeof entry === 'string')
      : [],
    newsBriefs: Array.isArray(candidate.newsBriefs)
      ? candidate.newsBriefs
          .map((entry: any) => ({
            topic: typeof entry?.topic === 'string' ? entry.topic : 'Topic',
            summary: typeof entry?.summary === 'string' ? entry.summary : '',
            source: typeof entry?.source === 'string' ? entry.source : undefined,
            updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now
          }))
          .filter((entry: PulseNewsBrief) => entry.summary)
      : [],
    newsUpdatedAt: typeof candidate.newsUpdatedAt === 'string' ? candidate.newsUpdatedAt : undefined,
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };
}

export function createEmptyPulseProfile(): PulseProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    interests: [],
    trendBriefs: [],
    newsBriefs: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadPulseProfile({ userId }: LoadContext): Promise<PulseProfile | null> {
  if (userId) {
    const { db } = getFirebase();
    if (!db) return null;
    const snap = await readDocOnce(doc(db, 'pulse_profiles', userId));
    if (!snap.exists()) return null;
    return normalizePulseProfile(snap.data());
  }

  return loadGuestPulseProfile();
}

export function subscribePulseProfile(
  { userId }: LoadContext,
  onUpdate: (profile: PulseProfile | null) => void
): () => void {
  if (userId) {
    const { db } = getFirebase();
    if (!db) return () => {};

    const ref = doc(db, 'pulse_profiles', userId);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
          return;
        }
        onUpdate(normalizePulseProfile(snap.data()));
      },
      (error) => {
        console.error('Pulse profile subscription error:', error);
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestPulseProfile());
  return () => {};
}

export async function savePulseProfile(profile: PulseProfile, { userId }: LoadContext): Promise<void> {
  const normalized = normalizePulseProfile(profile);

  if (userId) {
    const { db } = getFirebase();
    if (!db) return;
    try {
      await setDoc(
        doc(db, 'pulse_profiles', userId),
        {
          ...normalized,
          metadata: {
            onboardingComplete: normalized.onboardingComplete,
            interestCount: normalized.interests.length,
            lastActive: new Date().toISOString()
          }
        },
        { merge: true }
      );
    } catch (error) {
      console.error('[PulseProfileService] Failed to save pulse profile:', error);
    }
    return;
  }

  saveGuestPulseProfile(normalized);
}

export async function syncGuestPulseProfileToUser({ userId }: LoadContext): Promise<boolean> {
  if (!userId) return false;

  const guestProfile = loadGuestPulseProfile();
  if (!guestProfile) return false;

  const { db } = getFirebase();
  if (!db) return false;
  const snap = await readDocOnce(doc(db, 'pulse_profiles', userId));
  if (snap.exists()) return false;

  await savePulseProfile(guestProfile, { userId });
  clearGuestPulseProfile();
  return true;
}

export function loadGuestPulseProfile(): PulseProfile | null {
  const raw = localStorage.getItem(GUEST_PULSE_KEY);
  if (!raw) return null;
  try {
    return normalizePulseProfile(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to parse guest pulse profile:', error);
    return null;
  }
}

export function saveGuestPulseProfile(profile: PulseProfile): void {
  localStorage.setItem(GUEST_PULSE_KEY, JSON.stringify(normalizePulseProfile(profile)));
}

export function clearGuestPulseProfile(): void {
  localStorage.removeItem(GUEST_PULSE_KEY);
}
