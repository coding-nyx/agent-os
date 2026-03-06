import { ActionHub } from '@/lib/actions/action-hub';
import {
  ScoutKnowledgeNode,
  ScoutProfile,
  loadScoutProfile,
  saveScoutProfile
} from './scout-knowledge-service';
import { ScoutWebSearchService, ScoutWebResult } from './scout-web-search-service';

let registered = false;

function parseConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

const REPUTABLE_DOMAINS = new Set([
  'cdc.gov',
  'nih.gov',
  'who.int',
  'nasa.gov',
  'nature.com',
  'sciencedirect.com',
  'reuters.com',
  'apnews.com',
  'bbc.com'
]);

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function isReputableDomain(domain: string): boolean {
  if (!domain) return false;
  return domain.endsWith('.gov') || domain.endsWith('.edu') || domain.endsWith('.int') || REPUTABLE_DOMAINS.has(domain);
}

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadScoutProfile({ userId, encryptionKey });
}

async function persistProfile(profile: ScoutProfile, userId?: string | null, encryptionKey?: CryptoKey | null) {
  profile.updatedAt = new Date().toISOString();
  await saveScoutProfile(profile, { userId, encryptionKey });
}

async function triggerWebSearch(
  query: string,
  entryId: string,
  baseProfile: ScoutProfile,
  userId?: string | null,
  encryptionKey?: CryptoKey | null
) {
  const response = await ScoutWebSearchService.search(query, { maxResults: 6 });
  const results: ScoutWebResult[] = Array.isArray(response?.results) ? response.results : [];
  const reputable = results.filter((result) => isReputableDomain(extractDomain(result.url)));
  const sources = (reputable.length > 0 ? reputable : results).map((result) => result.url).slice(0, 4);
  const evidence = results.map((result) => result.content || result.title).filter(Boolean).slice(0, 6);
  const confidence = reputable.length > 0 ? 0.8 : results.length > 0 ? 0.65 : 0.45;
  const status: ScoutKnowledgeNode['status'] = results.length > 0 ? 'verified' : 'contested';

  const resultNodes: ScoutKnowledgeNode[] = results.map((result, index) => ({
    id: `web_${Date.now()}_${index}`,
    title: result.title || `Result ${index + 1}`,
    claim: query,
    confidence,
    source: result.url,
    sources: [result.url],
    evidence: result.content ? [result.content] : undefined,
    status,
    updatedAt: new Date().toISOString()
  }));

  const updatedKnowledge = baseProfile.knowledgeNodes.map((node) =>
    node.claim === query
      ? {
          ...node,
          status,
          confidence,
          source: sources[0],
          sources,
          evidence,
          updatedAt: new Date().toISOString()
        }
      : node
  );

  const nextQueue: ScoutProfile['verificationQueue'] = baseProfile.verificationQueue.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          status: status as ScoutProfile['verificationQueue'][number]['status'],
          reason: 'web_search_completed'
        }
      : entry
  );

  const next: ScoutProfile = {
    ...baseProfile,
    knowledgeNodes: [...resultNodes, ...updatedKnowledge].slice(0, 250),
    verificationQueue: nextQueue,
    updatedAt: new Date().toISOString()
  };

  await persistProfile(next, userId, encryptionKey);
}

export function registerScoutActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('scout', {
    add_knowledge_node: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const node: ScoutKnowledgeNode = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        title: typeof payload?.title === 'string' ? payload.title : 'Knowledge Node',
        claim: typeof payload?.claim === 'string' ? payload.claim : '',
        confidence: parseConfidence(payload?.confidence),
        source: typeof payload?.source === 'string' ? payload.source : undefined,
        status:
          payload?.status === 'verified' || payload?.status === 'contested'
            ? payload.status
            : 'pending',
        updatedAt: new Date().toISOString()
      };

      const next: ScoutProfile = {
        ...profile,
        knowledgeNodes: [node, ...profile.knowledgeNodes].slice(0, 250),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    },

    verify_claim: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const claim: string = typeof payload?.claim === 'string' ? payload.claim : '';
      const entryId = typeof payload?.id === 'string' ? payload.id : crypto.randomUUID();
      const entry: ScoutProfile['verificationQueue'][number] = {
        id: entryId,
        claim,
        status: 'pending',
        reason: typeof payload?.reason === 'string' ? payload.reason : 'verification_requested'
      };

      const next: ScoutProfile = {
        ...profile,
        verificationQueue: [entry, ...profile.verificationQueue].slice(0, 200),
        knowledgeNodes: claim
          ? profile.knowledgeNodes.map((node) =>
              node.claim === claim
                ? {
                    ...node,
                    status: 'pending',
                    updatedAt: new Date().toISOString()
                  }
                : node
            )
          : profile.knowledgeNodes,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);

      if (claim) {
        await triggerWebSearch(claim, entryId, next, userId ?? null, encryptionKey ?? null);
      }
    },

    search_web: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const claim: string =
        typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.claim === 'string'
          ? payload.claim
          : '';
      if (!claim) return;

      const entry: ScoutProfile['verificationQueue'][number] = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        claim,
        status: 'pending',
        reason: 'web_search_requested'
      };

      const next: ScoutProfile = {
        ...profile,
        verificationQueue: [entry, ...profile.verificationQueue].slice(0, 200),
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
      await triggerWebSearch(claim, entry.id, next, userId ?? null, encryptionKey ?? null);
    },

    update_research_graph: async ({ userId, encryptionKey, payload }) => {
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const next: ScoutProfile = {
        ...profile,
        researchFocus: Array.isArray(payload?.focus)
          ? payload.focus.filter((item: unknown) => typeof item === 'string')
          : profile.researchFocus,
        summary: typeof payload?.summary === 'string' ? payload.summary : profile.summary,
        verificationQueue: Array.isArray(payload?.queue)
          ? payload.queue
              .map((entry: any, index: number) => ({
                id: typeof entry?.id === 'string' ? entry.id : `queue_${Date.now()}_${index}`,
                claim: typeof entry?.claim === 'string' ? entry.claim : '',
                status: entry?.status === 'verified' || entry?.status === 'contested' ? entry.status : 'pending',
                reason: typeof entry?.reason === 'string' ? entry.reason : undefined
              }))
              .slice(0, 200)
          : profile.verificationQueue,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, userId ?? null, encryptionKey ?? null);
    }
  });
}
