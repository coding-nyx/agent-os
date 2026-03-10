import { getNexusDataLayer } from '@/lib/data-layer/provider';
import { decryptWithKey, encryptWithKey } from '@/lib/encryption';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';

const GUEST_SCOUT_KEY = 'nexus_scout_profile_guest';
const VAULT_SALT_MARKER = 'vault_salt_used';

export interface ScoutKnowledgeNode {
  id: string;
  title: string;
  claim: string;
  confidence: number;
  source?: string;
  sources?: string[];
  evidence?: string[];
  searchCompleted?: boolean;
  status: 'pending' | 'verified' | 'contested';
  updatedAt: string;
}

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

export interface ScoutProfile {
  onboardingComplete: boolean;
  researchFocus: string[];
  knowledgeNodes: ScoutKnowledgeNode[];
  interests: InterestNode[];
  trendBriefs: string[];
  newsBriefs: PulseNewsBrief[];
  newsUpdatedAt?: string;
  verificationQueue: Array<{
    id: string;
    claim: string;
    status: 'pending' | 'verified' | 'contested';
    reason?: string;
  }>;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

type LoadContext = {
  userId?: string | null;
  encryptionKey?: CryptoKey | null;
};

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function normalizeScoutProfile(raw: unknown): ScoutProfile {
  const now = new Date().toISOString();
  const base = createEmptyScoutProfile();
  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, unknown>;

  return {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    researchFocus: normalizeStringArray(candidate.researchFocus),
    knowledgeNodes: Array.isArray(candidate.knowledgeNodes)
      ? candidate.knowledgeNodes.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `node_${index}`,
          title: typeof entry?.title === 'string' ? entry.title : `Node ${index + 1}`,
          claim: typeof entry?.claim === 'string' ? entry.claim : '',
          confidence: clampConfidence(entry?.confidence),
          source: typeof entry?.source === 'string' ? entry.source : undefined,
          sources: Array.isArray(entry?.sources) ? normalizeStringArray(entry.sources) : undefined,
          evidence: Array.isArray(entry?.evidence) ? normalizeStringArray(entry.evidence) : undefined,
          searchCompleted: entry?.searchCompleted === true ? true : undefined,
          status:
            entry?.status === 'verified' || entry?.status === 'contested'
              ? entry.status
              : 'pending',
          updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now
        }))
      : [],
    interests: Array.isArray(candidate.interests)
      ? candidate.interests.map((entry: Record<string, unknown>, index: number) => ({
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
          .map((entry: Record<string, unknown>) => ({
            topic: typeof entry?.topic === 'string' ? entry.topic : 'Topic',
            summary: typeof entry?.summary === 'string' ? entry.summary : '',
            source: typeof entry?.source === 'string' ? entry.source : undefined,
            updatedAt: typeof entry?.updatedAt === 'string' ? entry.updatedAt : now
          }))
          .filter((entry: PulseNewsBrief) => entry.summary)
      : [],
    newsUpdatedAt: typeof candidate.newsUpdatedAt === 'string' ? candidate.newsUpdatedAt : undefined,
    verificationQueue: Array.isArray(candidate.verificationQueue)
      ? candidate.verificationQueue.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `verify_${index}`,
          claim: typeof entry?.claim === 'string' ? entry.claim : '',
          status:
            entry?.status === 'verified' || entry?.status === 'contested'
              ? entry.status
              : 'pending',
          reason: typeof entry?.reason === 'string' ? entry.reason : undefined
        }))
      : [],
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };
}

export function createEmptyScoutProfile(): ScoutProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: true,
    researchFocus: [],
    knowledgeNodes: [],
    interests: [],
    trendBriefs: [],
    newsBriefs: [],
    verificationQueue: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

export async function loadScoutProfile({ userId, encryptionKey }: LoadContext): Promise<ScoutProfile | null> {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const data = await dataLayer.getDocument<{ encryptedData?: string; iv?: string }>('scout_knowledge', userId);
    if (!data) return null;
    if (!data?.encryptedData || !data?.iv) return null;

    try {
      const decrypted = await decryptWithKey({ ciphertext: data.encryptedData, iv: data.iv }, encryptionKey);
      return normalizeScoutProfile(JSON.parse(decrypted));
    } catch (error) {
      console.error('Failed to decrypt scout profile:', error);
      return null;
    }
  }

  return loadGuestScoutProfile();
}

export function subscribeScoutProfile(
  { userId, encryptionKey }: LoadContext,
  onUpdate: (profile: ScoutProfile | null) => void
): () => void {
  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const unsubscribe = dataLayer.subscribeToDocument<{ encryptedData?: string; iv?: string }>(
      'scout_knowledge',
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
          onUpdate(normalizeScoutProfile(JSON.parse(decrypted)));
        } catch (error) {
          console.error('Failed to decrypt scout profile:', error);
          onUpdate(null);
        }
      }
    );
    return unsubscribe;
  }

  onUpdate(loadGuestScoutProfile());
  return () => {};
}

export async function saveScoutProfile(profile: ScoutProfile, { userId, encryptionKey }: LoadContext): Promise<void> {
  const normalized = normalizeScoutProfile(profile);

  if (userId && encryptionKey) {
    const dataLayer = getNexusDataLayer();
    const encrypted = await encryptWithKey(JSON.stringify(normalized), encryptionKey);
    try {
      await dataLayer.setDocument('scout_knowledge', userId, {
        encryptedData: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: VAULT_SALT_MARKER,
        metadata: {
          onboardingComplete: normalized.onboardingComplete,
          nodes: normalized.knowledgeNodes.length,
          queue: normalized.verificationQueue.length,
          lastActive: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[ScoutKnowledgeService] Failed to save scout profile:', error);
    }
    try {
      const activeNodes = normalized.knowledgeNodes.filter(n => n.status === 'pending').length;
      const queueDepth = normalized.verificationQueue.filter(q => q.status === 'pending').length;
      const researchLoad = Math.min(1, (activeNodes + queueDepth) / 20);
      await GlobalProjectionService.updateCrossFunctionalState(userId, {
        cognitive: { researchLoad }
      });
    } catch (error) {
      console.error('[ScoutKnowledgeService] Failed to update cross-functional state:', error);
    }
    return;
  }

  saveGuestScoutProfile(normalized);
}

export async function syncGuestScoutProfileToUser({ userId, encryptionKey }: LoadContext): Promise<boolean> {
  if (!userId || !encryptionKey) return false;

  const guestProfile = loadGuestScoutProfile();
  if (!guestProfile) return false;

  const dataLayer = getNexusDataLayer();
  const existing = await dataLayer.getDocument<{ encryptedData?: string }>('scout_knowledge', userId);
  if (existing?.encryptedData) return false;

  await saveScoutProfile(guestProfile, { userId, encryptionKey });
  clearGuestScoutProfile();
  return true;
}

export function loadGuestScoutProfile(): ScoutProfile | null {
  const raw = localStorage.getItem(GUEST_SCOUT_KEY);
  if (!raw) return null;
  try {
    return normalizeScoutProfile(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to parse guest scout profile:', error);
    return null;
  }
}

export function saveGuestScoutProfile(profile: ScoutProfile): void {
  localStorage.setItem(GUEST_SCOUT_KEY, JSON.stringify(normalizeScoutProfile(profile)));
}

export function clearGuestScoutProfile(): void {
  localStorage.removeItem(GUEST_SCOUT_KEY);
}
