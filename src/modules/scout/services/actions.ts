import { ActionHub, ActionContext } from '@/lib/actions/action-hub';
import {
  ScoutKnowledgeNode,
  ScoutProfile,
  InterestNode,
  loadScoutProfile,
  saveScoutProfile,
  createEmptyScoutProfile
} from './scout-knowledge-service';
import { ScoutWebSearchService, ScoutWebResult } from './scout-web-search-service';
import { generateNewsBriefs, isSearchAvailable } from './scout-news-service';
import { Spine } from '@/lib/spine/spine-event-bus';

let registered = false;

function parseConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function parseScore(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, value));
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
  const profile = await loadScoutProfile({ userId, encryptionKey });
  return profile ?? createEmptyScoutProfile();
}

async function persistProfile(profile: ScoutProfile, context: ActionContext) {
  const { userId, encryptionKey } = context;
  profile.updatedAt = new Date().toISOString();

  // Always save to Firestore for durability, then emit Spine event for real-time UI sync.
  await saveScoutProfile(profile, { userId: userId ?? null, encryptionKey });

  Spine.emit({
    type: 'SCOUT_PROFILE_DRAFT_UPDATED' as any,
    source: 'scout',
    domain: 'system',
    data: profile as unknown as Record<string, unknown>,
    cascadeDepth: 0,
    priority: 'info'
  });
}

async function triggerWebSearch(
  query: string,
  entryId: string,
  baseProfile: ScoutProfile,
  context: ActionContext
) {
  const { userId, encryptionKey, pushAssistantMessage } = context;
  try {
    const response = await ScoutWebSearchService.search(query, { maxResults: 6 });
    const results: ScoutWebResult[] = Array.isArray(response?.results) ? response.results : [];
    const reputable = results.filter((result) => isReputableDomain(extractDomain(result.url)));
    const sources = (reputable.length > 0 ? reputable : results).map((result) => result.url).slice(0, 4);
    const evidence = results.map((result) => result.content || result.title).filter(Boolean).slice(0, 6);
    const confidence = reputable.length > 0 ? 0.8 : results.length > 0 ? 0.65 : 0.45;

    const resultNodes: ScoutKnowledgeNode[] = results.map((result, index) => ({
      id: `web_${Date.now()}_${index}`,
      title: result.title || `Result ${index + 1}`,
      claim: query,
      confidence,
      source: result.url,
      sources: [result.url],
      evidence: result.content ? [result.content] : undefined,
      searchCompleted: true,
      status: (isReputableDomain(extractDomain(result.url)) ? 'verified' : 'pending') as 'verified' | 'pending',
      updatedAt: new Date().toISOString()
    }));

    // Re-load fresh profile after network call to avoid clobbering concurrent writes
    const freshProfile = await loadProfile(userId, encryptionKey) ?? baseProfile;

    const updatedKnowledge = freshProfile.knowledgeNodes.map((node) =>
      node.claim === query
        ? {
            ...node,
            status: (confidence >= 0.6 ? 'verified' : 'pending') as 'verified' | 'pending',
            confidence,
            source: sources[0],
            sources,
            evidence,
            searchCompleted: true,
            updatedAt: new Date().toISOString()
          }
        : node
    );

    const nextQueue: ScoutProfile['verificationQueue'] = freshProfile.verificationQueue.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            status: 'verified' as const,
            reason: 'web_search_completed'
          }
        : entry
    );

    const next: ScoutProfile = {
      ...freshProfile,
      knowledgeNodes: [...resultNodes, ...updatedKnowledge].slice(0, 250),
      verificationQueue: nextQueue,
      updatedAt: new Date().toISOString()
    };

    await persistProfile(next, context);

    if (pushAssistantMessage) {
      if (results.length === 0) {
        pushAssistantMessage(`Search completed for "${query}" but returned no results.`);
      } else {
        const topResults = results.slice(0, 3);
        const summary = topResults
          .map((r, i) => `${i + 1}. **${r.title || 'Result'}** — ${r.url}`)
          .join('\n');
        pushAssistantMessage(`Search found ${results.length} result${results.length === 1 ? '' : 's'} for "${query}":\n\n${summary}`);
      }
    }
  } catch (error) {
    console.error('[Scout] Web search failed:', error);

    // Re-load fresh profile to avoid clobbering concurrent changes made after the search started.
    const failedProfile = await loadProfile(userId, encryptionKey) ?? baseProfile;

    const failedQueue: ScoutProfile['verificationQueue'] = failedProfile.verificationQueue.map((entry) =>
      entry.id === entryId
        ? { ...entry, status: 'contested' as const, reason: 'search_failed' }
        : entry
    );

    const fallback: ScoutProfile = {
      ...failedProfile,
      verificationQueue: failedQueue,
      updatedAt: new Date().toISOString()
    };

    await persistProfile(fallback, context);

    if (pushAssistantMessage) {
      const message = error instanceof Error && error.message.includes('No Scout search backend configured')
        ? 'Search backend is not configured. Please check your environment settings.'
        : `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      pushAssistantMessage(`⚠️ ${message}`);
    }
  }
}

export function registerScoutActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerMultiple('scout', {
    add_knowledge_node: async (context) => {
      const { userId, encryptionKey, payload } = context;
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

      await persistProfile(next, context);
    },

    verify_claim: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
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

      await persistProfile(next, context);

      if (claim) {
        if (!isSearchAvailable()) {
          pushAssistantMessage?.(
            `⚠️ Claim queued for verification but no search backend is configured. Set \`VITE_TAVILY_API_KEY\` to enable automatic verification.`
          );
          return;
        }
        await triggerWebSearch(claim, entryId, next, context);
      }
    },

    search_web: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;

      if (!isSearchAvailable()) {
        pushAssistantMessage?.(
          '⚠️ No search backend is configured. Set `VITE_TAVILY_API_KEY` in your environment to enable web search.'
        );
        return;
      }

      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) {
        pushAssistantMessage?.('⚠️ Unable to load research profile. Please try again.');
        return;
      }

      const claim: string =
        typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.claim === 'string'
          ? payload.claim
          : '';
      if (!claim) {
        console.warn('[Scout] search_web received empty query payload:', payload);
        return;
      }

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

      await persistProfile(next, context);
      await triggerWebSearch(claim, entry.id, next, context);
    },

    search: async (context) => {
      // Alias for search_web in case the LLM drops the _web suffix
      await ActionHub.execute('scout', 'search_web', context);
    },

    commit_research: async (context) => {
      const { userId, encryptionKey, pushAssistantMessage } = context;
      // Each action already persists to Firestore. This action confirms the vault is current
      // and optionally triggers a fresh save of the current in-memory profile state.
      const current = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!current) {
        pushAssistantMessage?.('⚠️ No research profile found to commit.');
        return;
      }
      // Re-save to ensure the latest state is flushed (handles any edge case from rapid actions).
      await saveScoutProfile(current, { userId: userId ?? null, encryptionKey });
      pushAssistantMessage?.('✅ Research session synchronized with the neural vault.');
    },

    update_research_graph: async (context) => {
      const { userId, encryptionKey, payload } = context;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const next: ScoutProfile = {
        ...profile,
        researchFocus: Array.isArray(payload?.focus)
          ? payload.focus.filter((item: Record<string, unknown>) => typeof item === 'string')
          : profile.researchFocus,
        summary: typeof payload?.summary === 'string' ? payload.summary : profile.summary,
        verificationQueue: Array.isArray(payload?.queue)
          ? payload.queue
              .map((entry: Record<string, unknown>, index: number) => ({
                id: typeof entry?.id === 'string' ? entry.id : `queue_${Date.now()}_${index}`,
                claim: typeof entry?.claim === 'string' ? entry.claim : '',
                status: entry?.status === 'verified' || entry?.status === 'contested' ? entry.status as 'verified' | 'contested' : 'pending' as const,
                reason: typeof entry?.reason === 'string' ? entry.reason : undefined
              }))
              .slice(0, 200)
          : profile.verificationQueue,
        updatedAt: new Date().toISOString()
      };

      await persistProfile(next, context);
    },

    // Handler key matches persona action type: update_research_interests
    // (Previously registered as update_interest_map — renamed for consistency)
    update_research_interests: async (context) => {
      const { userId, encryptionKey, payload } = context;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      const next: ScoutProfile = { ...profile };

      // Accept both 'threads' (persona format) and legacy 'interests' array
      const rawItems: unknown[] | null =
        Array.isArray(payload?.threads) ? payload.threads :
        Array.isArray(payload?.interests) ? payload.interests :
        null;

      if (rawItems !== null) {
        const mapped: InterestNode[] = rawItems.map((entry: unknown, index: number) => {
          const e = entry as Record<string, unknown>;
          // Persona sends: { id, title, relevanceScore, momentum }
          // Legacy sends:  { id, topic, score, trend }
          const topic =
            typeof e?.title === 'string' ? e.title :
            typeof e?.topic === 'string' ? e.topic :
            `Topic ${index + 1}`;
          const score =
            typeof e?.relevanceScore === 'number' ? parseScore(e.relevanceScore) :
            parseScore(e?.score);
          const rawTrend = e?.momentum ?? e?.trend;
          const trend: InterestNode['trend'] =
            rawTrend === 'rising' || rawTrend === 'cooling' ? rawTrend : 'steady';
          return {
            id: typeof e?.id === 'string' ? e.id : `interest_${Date.now()}_${index}`,
            topic,
            score,
            trend,
            lastSeenAt: new Date().toISOString()
          };
        });
        next.interests = mapped;
      }

      if (typeof payload?.summary === 'string') {
        next.summary = payload.summary;
      }

      await persistProfile(next, context);
    },

    // Backward-compat alias so any existing stored sessions still work
    update_interest_map: async (context) => {
      await ActionHub.execute('scout', 'update_research_interests', context);
    },

    // Handler key matches persona action type: track_research_thread
    // (Previously registered as track_topic — renamed for consistency)
    track_research_thread: async (context) => {
      const { userId, encryptionKey, payload } = context;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      // Persona sends: { id, title, relevanceScore, momentum, summary, claimCount, lastActiveDate }
      // Legacy sends:  { id, topic, score, trend }
      const topic =
        typeof payload?.title === 'string' ? payload.title :
        typeof payload?.topic === 'string' ? payload.topic :
        'Topic';
      const score =
        typeof payload?.relevanceScore === 'number' ? parseScore(payload.relevanceScore) :
        parseScore(payload?.score);
      const rawTrend = payload?.momentum ?? payload?.trend;
      const trend: InterestNode['trend'] =
        rawTrend === 'rising' || rawTrend === 'cooling' ? rawTrend : 'steady';

      const node: InterestNode = {
        id: typeof payload?.id === 'string' ? payload.id : crypto.randomUUID(),
        topic,
        score,
        trend,
        lastSeenAt: new Date().toISOString()
      };

      const next: ScoutProfile = {
        ...profile,
        interests: [node, ...profile.interests.filter((item) => item.topic !== node.topic)].slice(0, 120)
      };

      await persistProfile(next, context);
    },

    // Backward-compat alias
    track_topic: async (context) => {
      await ActionHub.execute('scout', 'track_research_thread', context);
    },

    synthesize_research_trends: async (context) => {
      const { userId, encryptionKey, payload } = context;
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;

      if (Array.isArray(payload?.briefs)) {
        const next: ScoutProfile = {
          ...profile,
          trendBriefs: payload.briefs.filter((entry: Record<string, unknown>) => typeof entry === 'string').slice(0, 20)
        };
        await persistProfile(next, context);
        return;
      }

      if (profile.interests.length === 0) return;
      const topics = profile.interests.map(i => i.topic);
      const briefs = await generateNewsBriefs(topics, { maxTopics: 5 });
      const now = new Date().toISOString();
      const next: ScoutProfile = {
        ...profile,
        newsBriefs: briefs,
        newsUpdatedAt: now,
        updatedAt: now
      };
      await persistProfile(next, context);
    }
  });
}
