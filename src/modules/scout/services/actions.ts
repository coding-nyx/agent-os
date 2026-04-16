import { ActionHub } from '@/lib/actions/action-hub';
import { AraLogger } from '@/lib/ara-logger';
import {
  loadScoutProfile,
  saveScoutProfile,
  addKnowledgeNode,
  loadKnowledgeNodes,
  queryKnowledgeNodes,
  updateKnowledgeNode,
  deleteKnowledgeNode,
} from './scout-knowledge-service';
import { ScoutWebSearchService } from './scout-web-search-service';
import { addSource, loadSources, normalizeUrl, updateSource, type SourceEntryDecrypted } from './scout-sources-service';
import { createSession, updateSession, getSession, loadSessions } from './scout-session-service';
import { generateDigest } from './scout-digest-service';
import { ScoutQueryService } from './scout-query-service';
import { generateJSONWithAgent } from '@/lib/ai-adapters/json-generation-agent';
import { SourceEntry } from '../types';
import { GlobalProjectionService } from '@/lib/services/global-projection-service';
import type { WebCrawlerResult, WebCrawlerResponse } from '@/lib/services/web-crawler-service';
import { resolveOpenRouterKey } from '@/lib/services/openrouter-key';

let registered = false;

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  return loadScoutProfile({ userId, encryptionKey });
}

export function registerScoutActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('scout', {
    capabilities: ['research'],
    latencyTier: 'heavy',
  });

  ActionHub.registerMultiple('scout', {
    create_research_request: async ({ moduleId, payload, emitSpineEvent }) => {
      emitSpineEvent(
        'DRAFT_PROPOSED',
        payload as Record<string, unknown>,
        {
          domain: 'system',
          priority: 'info',
          target: typeof payload?.target === 'string' ? payload.target : moduleId,
        }
      );
    },

    /**
     * List recent research sessions.
     */
    list_sessions: async (context) => {
      const { userId, pushAssistantMessage } = context;
      const sessions = await loadSessions({ userId: userId ?? null });
      
      if (sessions.length === 0) {
        pushAssistantMessage?.("I couldn't find any existing research sessions. Shall we start a new one?");
        return;
      }

      const summary = sessions.slice(0, 5).map(s => `- **${s.topic}** (Status: ${s.status})`).join('\n');
      pushAssistantMessage?.(`I've found your recent research threads:\n\n${summary}\n\nWould you like to resume any of these?`);
    },

    /**
     * Switch context to an existing session.
     */
    resume_session: async (context) => {
      const { userId, payload, pushAssistantMessage, emitSpineEvent } = context;
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;
      const topic = typeof payload?.topic === 'string' ? payload.topic : undefined;

      let targetSession = null;
      if (sessionId) {
        targetSession = await getSession(sessionId, { userId: userId ?? null });
      } else if (topic) {
        const sessions = await loadSessions({ userId: userId ?? null });
        targetSession = sessions.find(s => s.topic.toLowerCase().includes(topic.toLowerCase())) || null;
      }

      if (targetSession) {
        emitSpineEvent(
          'SESSION_STARTED',
          { sessionId: targetSession.id, topic: targetSession.topic },
          { domain: 'C', priority: 'info' }
        );
        pushAssistantMessage?.(`📚 Resuming our research on: **${targetSession.topic}**`);
      } else {
        pushAssistantMessage?.("I couldn't find that specific session. Could you clarify the topic?");
      }
    },

    /**
     * Search the existing knowledge base for past findings via semantic RAG.
     */
    query_knowledge: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) return;

      pushAssistantMessage?.(`🔍 Querying your research library for "${query}"...`);

      const result = await ScoutQueryService.queryLibrary(query, { userId: userId ?? null, encryptionKey });

      if (result && result.supportingNodes.length > 0) {
        const confidenceEmoji = (c: number) => c >= 0.7 ? '🟢' : c >= 0.5 ? '🟡' : '🔴';
        const nodeLines = result.supportingNodes
          .slice(0, 3)
          .map(n => `${confidenceEmoji(n.confidence)} ${n.claim} *(${Math.round(n.confidence * 100)}%)*`)
          .join('\n');
        const sourceLine = result.supportingSources.length > 0
          ? `\n\n📚 *Sources:* ${result.supportingSources.slice(0, 2).map(s => `[${s.domain}]`).join(', ')}`
          : '';
        const webLine = result.webEnriched ? '\n\n⚡ *Enriched with live web search*' : '';

        pushAssistantMessage?.(`${result.answer}\n\n**Supporting Findings (${result.supportingNodes.length}):**\n${nodeLines}${sourceLine}${webLine}`);
      } else {
        // No local signal — surface the gap and let the AI decide what to propose next.
        pushAssistantMessage?.(`No prior findings in the research library for "${query}".`);
      }
    },

    /**
     * Start a new persistent research session.
     */
    start_session: async (context) => {
      const { userId, payload, pushAssistantMessage, emitSpineEvent } = context;
      const topic = typeof payload?.topic === 'string' ? payload.topic : 'New Research';
      
      const session = await createSession(topic, { userId: userId ?? null });
      if (session) {
        emitSpineEvent(
          'SESSION_STARTED',
          { sessionId: session.id, topic: session.topic },
          { domain: 'C', priority: 'info' }
        );
        pushAssistantMessage?.(`🔬 Started new research session: "${topic}"`);
      }
    },

    /**
     * Add sources to the library and optionally link to a session/node.
     */
    add_sources: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent } = context;
      const sources = Array.isArray(payload?.sources) ? payload.sources : [];
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;

      const addedSources: SourceEntryDecrypted[] = [];
      const addPromises = new Map<string, Promise<SourceEntryDecrypted | null>>();

      for (const s of sources) {
        if (typeof s?.url === 'string') {
          const normUrl = normalizeUrl(s.url);
          if (!addPromises.has(normUrl)) {
            addPromises.set(normUrl, addSource({
              url: s.url,
              title: s.title || 'Untitled Source',
              snippet: s.snippet,
              imageUrl: s.imageUrl,
              favicon: s.favicon,
              discoveredVia: 'search',
              nodeId: s.nodeId
            }, { userId: userId ?? null, encryptionKey }));
          }
        }
      }

      const results = await Promise.all(addPromises.values());
      for (const added of results) {
        if (added) addedSources.push(added);
      }

      if (sources.length > 0) {
        pushAssistantMessage?.(`📥 Added ${sources.length} sources to your research library.`);
      }
      
      emitSpineEvent(
        'SOURCE_ADDED',
        { count: sources.length, sessionId, sources: addedSources },
        { domain: 'C', priority: 'info' }
      );
    },

    /**
     * Synthesize a knowledge node from research findings.
     * Checks for near-duplicate nodes (similarity ≥ 0.82) before creating.
     */
    synthesize_knowledge: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent } = context;
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : 0.5;
      const evidence = Array.isArray(payload?.evidence) ? payload.evidence : [];
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;
      const tags = Array.isArray(payload?.tags) ? payload.tags as string[] : undefined;

      if (!claim) return;

      // Duplicate detection: check for highly similar existing claims
      const nearDuplicates = await queryKnowledgeNodes(claim, { userId: userId ?? null, encryptionKey }, { limit: 1, threshold: 0.82 });
      if (nearDuplicates.length > 0) {
        const existing = nearDuplicates[0];
        // Merge: bump confidence + append evidence instead of creating duplicate
        const mergedConfidence = Math.min(1, Math.max(existing.confidence, confidence) + 0.05);
        const mergedEvidence = Array.from(new Set([...existing.evidence, ...evidence]));
        await updateKnowledgeNode(existing.id, { confidence: mergedConfidence, evidence: mergedEvidence }, { userId: userId ?? null, encryptionKey });
        pushAssistantMessage?.(`🔄 Similar finding already exists (${Math.round(existing.similarity * 100)}% match): "${existing.claim}"\n\nI've merged this evidence into the existing node and boosted its confidence to ${Math.round(mergedConfidence * 100)}%.`);
        return;
      }

      const node = await addKnowledgeNode({
        claim,
        confidence,
        evidence,
        tags,
        status: confidence > 0.7 ? 'verified' : 'pending',
        parentSessionId: sessionId
      }, { userId: userId ?? null, encryptionKey });

      if (node) {
        if (sessionId) {
          await updateSession(sessionId, { resultNodeId: node.id, status: 'complete' }, { userId: userId ?? null });
        }

        emitSpineEvent(
          'KNOWLEDGE_SYNTHESIZED',
          { userId, nodeId: node.id, claim, sessionId, node },
          { domain: 'C', priority: 'info' }
        );

        pushAssistantMessage?.(`💡 Synthesized new finding: "${claim}"`);
      }
    },

    /**
     * Global web search capability (shared with Ara/Forge).
     */
    web_search: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) return;

      pushAssistantMessage?.(`🌐 Searching the web for: "${query}"...`);

      emitSpineEvent(
        'RESEARCH_SEARCHING',
        { query },
        { domain: 'C', priority: 'info' }
      );

      try {
        // Use ScoutWebSearchService so results are auto-indexed into the KB
        const response = await ScoutWebSearchService.search(query, {
          maxResults: 5,
          includeImages: true,
          userId: userId ?? null,
          encryptionKey: encryptionKey ?? null,
          autoIndexLimit: 3,
        });

        if (response.results.length === 0) {
          pushAssistantMessage?.(`No results found for "${query}".`);
          return;
        }

        const summary = response.results.slice(0, 3).map((r, i) => `${i + 1}. **${r.title}** - ${r.url}`).join('\n');
        pushAssistantMessage?.(`I found some information:\n\n${summary}\n\n${response.answer || ''}\n\n*Results auto-indexed into your knowledge base.*`);

        emitSpineEvent(
          'RESEARCH_RESULTS',
          { query, results: response.results, answer: response.answer },
          { domain: 'C', priority: 'info' }
        );

        // Auto-add to sources if in Scout context
        if (context.moduleId === 'scout' && userId && encryptionKey) {
            const indexResults = await Promise.allSettled(response.results.map(r => addSource({
                url: r.url,
                title: r.title,
                snippet: r.content,
                imageUrl: response.images?.[0],
                discoveredVia: 'search'
            }, { userId, encryptionKey })));
            const failedIndexes = indexResults.filter(r => r.status === 'rejected');
            if (failedIndexes.length > 0) {
                pushAssistantMessage?.(`Search completed, but ${failedIndexes.length} result(s) couldn't be saved to your knowledge base.`);
            }
        }
      } catch (error) {
        pushAssistantMessage?.(`⚠️ Web search failed: ${String(error)}`);
      }
    },

    /**
     * Alias for web_search.
     */
    search_web: async (context) => {
      await ActionHub.execute('scout', 'web_search', context);
    },

    /**
     * Trigger digest generation.
     */
    generate_digest: async (context) => {
      const { userId, encryptionKey, pushAssistantMessage } = context;

      if (!encryptionKey) {
        pushAssistantMessage?.('Please unlock your vault before generating a digest.');
        return;
      }
      
      const profile = await loadProfile(userId ?? null, encryptionKey ?? null);
      if (!profile) return;
      const nodes = await loadKnowledgeNodes({ userId: userId ?? null, encryptionKey });
      const sources = await loadSources({ userId: userId ?? null, encryptionKey });

      const digest = await generateDigest(
        profile.interests.map(i => i.topic),
        nodes,
        sources,
        'manual',
        { userId: userId ?? null, encryptionKey }
      );

      if (digest) {
        pushAssistantMessage?.(`📊 Generated a new research newsletter based on your recent activity.`);
      } else {
        pushAssistantMessage?.(`⚠️ Failed to generate digest.`);
      }
    },

    /**
     * Deep research specialized trigger.
     */
    start_deep_research: async (context) => {
      const { userId, payload, pushAssistantMessage, emitSpineEvent } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      
      if (!query) {
        pushAssistantMessage?.('Please provide a query for deep research.');
        return;
      }

      // In v2, this opens the specialized DeepResearchPanel via Spine event
      emitSpineEvent(
        'DEEP_RESEARCH_REQUESTED',
        { userId, query },
        { domain: 'C', priority: 'info' }
      );
      emitSpineEvent(
        'DEEP_RESEARCH_STARTED',
        { userId, query },
        { domain: 'C', priority: 'info' }
      );
      
      pushAssistantMessage?.(`🔬 Initiating deep research protocol for: "${query}"`);
    },

    /**
     * Verify a pending knowledge node against live web evidence.
     * Updates node status to 'verified' or 'contested'.
     */
    verify_claim: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : undefined;
      const claimText = typeof payload?.claim === 'string' ? payload.claim : undefined;

      if (!nodeId && !claimText) {
        pushAssistantMessage?.('Please provide either a nodeId or a claim text to verify.');
        return;
      }

      // Resolve the node
      let targetClaim = claimText ?? '';
      const targetNodeId = nodeId;
      if (nodeId) {
        const nodes = await loadKnowledgeNodes({ userId: userId ?? null, encryptionKey });
        const node = nodes.find(n => n.id === nodeId);
        if (node) targetClaim = node.claim;
      }

      if (!targetClaim) {
        pushAssistantMessage?.('Could not find the specified knowledge node.');
        return;
      }

      pushAssistantMessage?.(`🔬 Verifying: "${targetClaim.slice(0, 80)}..."...`);

      try {
        const searchResponse = await ScoutWebSearchService.search(targetClaim, {
          maxResults: 5,
          userId: userId ?? null,
          encryptionKey: encryptionKey ?? null,
          autoIndexLimit: 0, // Don't auto-index during verification
        });

        const evidence = searchResponse.results
          .slice(0, 3)
          .map((r, i) => `Source ${i + 1} [${new URL(r.url).hostname}]: ${r.content?.slice(0, 200) ?? r.title}`)
          .join('\n');

        const openrouterKey = resolveOpenRouterKey();

        const verdict = await generateJSONWithAgent<{ verdict: 'verified' | 'contested' | 'pending'; confidence: number; reason: string }>({
          prompt: `Claim to verify: "${targetClaim}"\n\nWeb evidence:\n${evidence || 'No evidence found.'}\n\nDoes the web evidence support, contradict, or is it insufficient to verify the claim?\nRespond with: {"verdict":"verified"|"contested"|"pending","confidence":0.0-1.0,"reason":"..."}`,
          openrouterKey,
          systemPrompt: 'You are a fact-checking expert. Be objective and evidence-based.',
          temperature: 0.2,
        });

        if (targetNodeId) {
          await updateKnowledgeNode(targetNodeId, { status: verdict.verdict, confidence: verdict.confidence }, { userId: userId ?? null, encryptionKey });
        }

        const icon = verdict.verdict === 'verified' ? '✅' : verdict.verdict === 'contested' ? '⚠️' : '⏳';
        pushAssistantMessage?.(`${icon} **Verdict: ${verdict.verdict.toUpperCase()}** (${Math.round(verdict.confidence * 100)}% confidence)\n\n${verdict.reason}`);
      } catch (err) {
        pushAssistantMessage?.(`⚠️ Verification failed: ${String(err)}`);
      }
    },

    /**
     * Cross-reference a claim against the knowledge base to find related or contradicting findings.
     */
    cross_reference: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) return;

      pushAssistantMessage?.(`🔗 Cross-referencing "${query.slice(0, 60)}" against your knowledge base...`);

      const related = await queryKnowledgeNodes(query, { userId: userId ?? null, encryptionKey }, { limit: 6, threshold: 0.5 });

      if (related.length === 0) {
        pushAssistantMessage?.(`No related findings found in your knowledge base for "${query}". Try running a web search or deep research first.`);
        return;
      }

      const supporting = related.filter(n => n.similarity >= 0.7);
      const adjacent = related.filter(n => n.similarity >= 0.5 && n.similarity < 0.7);

      const fmt = (n: typeof related[0]) => `| ${Math.round(n.similarity * 100)}% | ${n.claim.slice(0, 80)} | ${n.status} |`;

      let msg = `**Cross-Reference Results for:** "${query}"\n\n`;
      if (supporting.length > 0) {
        msg += `**🟢 Supporting Findings (${supporting.length})**\n| Match | Claim | Status |\n|---|---|---|\n${supporting.map(fmt).join('\n')}\n\n`;
      }
      if (adjacent.length > 0) {
        msg += `**🟡 Adjacent Findings (${adjacent.length})**\n| Match | Claim | Status |\n|---|---|---|\n${adjacent.map(fmt).join('\n')}`;
      }

      pushAssistantMessage?.(msg);
    },

    /**
     * Apply tags to a knowledge node for filtering and clustering.
     */
    tag_node: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
      const tags = Array.isArray(payload?.tags) ? payload.tags as string[] : [];
      if (!nodeId || tags.length === 0) {
        pushAssistantMessage?.('Please provide a nodeId and at least one tag.');
        return;
      }
      await updateKnowledgeNode(nodeId, { tags }, { userId: userId ?? null, encryptionKey });
      pushAssistantMessage?.(`🏷️ Tagged node with: ${tags.map(t => `\`${t}\``).join(', ')}`);
    },

    /**
     * Alias for synthesize_knowledge — used by document analysis prompts (PDF/CSV/TXT).
     * Delegates directly so duplicate-detection and embedding logic run once.
     */
    add_knowledge_node: async (context) => {
      await ActionHub.execute('scout', 'synthesize_knowledge', context);
    },

    delete_node: async ({ payload, userId, pushAssistantMessage }) => {
      const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
      if (!nodeId) {
        pushAssistantMessage?.('No node ID provided.');
        return;
      }
      await deleteKnowledgeNode(nodeId, { userId: userId ?? null });
      pushAssistantMessage?.(`Node ${nodeId} removed from knowledge graph.`);
    },

    rename_session: async ({ payload, userId, pushAssistantMessage }) => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
      const title = typeof payload?.title === 'string' ? payload.title : '';
      if (!sessionId || !title) {
        pushAssistantMessage?.('Session ID and new title required.');
        return;
      }
      await updateSession(sessionId, { topic: title }, { userId: userId ?? null });
      pushAssistantMessage?.(`Session renamed to "${title}".`);
    },

    archive_session: async ({ payload, userId, pushAssistantMessage }) => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : '';
      if (!sessionId) {
        pushAssistantMessage?.('Session ID required.');
        return;
      }
      // Set both fields: `status` (enum) and `archived` (boolean) for consistency.
      // UI filters check `archived` boolean; the status enum is for workflow state.
      await updateSession(sessionId, { status: 'archived', archived: true }, { userId: userId ?? null });
      pushAssistantMessage?.('Session archived.');
    },

    /**
     * Background sync — writes cognitive load metrics derived from research activity to NSV.
     * No user message is emitted; this is a silent background update.
     *
     * Payload: { researchLoad?: number (0–10); interestDiversity?: number (0–10) }
     */
    sync_vitals: async ({ userId, payload }) => {
      if (!userId) return;
      const clamp = (v: unknown, dflt: number) =>
        typeof v === 'number' && Number.isFinite(v)
          ? Math.min(10, Math.max(0, v))
          : dflt;
      const researchLoad = clamp(payload?.researchLoad, 0);
      const interestDiversity = clamp(payload?.interestDiversity, 5);
      await GlobalProjectionService.updateCrossFunctionalState(userId, {
        cognitive: { researchLoad, interestDiversity },
      });
    },

    /**
     * Finalizes the current research turn and signals all consumers via Spine.
     */
    commit_research: async ({ userId, pushAssistantMessage, emitSpineEvent }) => {
      pushAssistantMessage?.('Research workbench committed. All findings and sources have been saved.');
      emitSpineEvent(
        'SCOUT_PROFILE_UPDATED',
        { userId, committed: true },
        { domain: 'C', priority: 'info' }
      );
    },

    /**
     * Update the read status of a source in the library.
     *
     * Payload: { sourceId: string; status: 'reading' | 'read' | 'archived' | 'saved' }
     */
    scout_update_source_status: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const sourceId = typeof payload?.sourceId === 'string' ? payload.sourceId : '';
      const status = typeof payload?.status === 'string' ? payload.status : '';

      if (!sourceId || !status) {
        pushAssistantMessage?.('Source ID and status are required.');
        return;
      }

      const validStatuses = ['reading', 'read', 'archived', 'saved'];
      if (!validStatuses.includes(status)) {
        pushAssistantMessage?.(`Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}.`);
        return;
      }

      // 'archived' maps to the archived boolean flag; everything else maps to readStatus.
      const patch: Record<string, unknown> =
        status === 'archived'
          ? { archived: true }
          : { readStatus: status === 'saved' ? 'unread' : status as 'reading' | 'read' };

      await updateSource(sourceId, patch, { userId: userId ?? null, encryptionKey });
      pushAssistantMessage?.('Source status updated.');
    },

    /**
     * Manually verify or contest a knowledge node.
     *
     * Payload: { nodeId: string; verified: boolean; verificationNote?: string }
     */
    scout_verify_knowledge_node: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const nodeId = typeof payload?.nodeId === 'string' ? payload.nodeId : '';
      const verified = typeof payload?.verified === 'boolean' ? payload.verified : true;
      const verificationNote =
        typeof payload?.verificationNote === 'string' ? payload.verificationNote : undefined;

      if (!nodeId) {
        pushAssistantMessage?.('Node ID is required.');
        return;
      }

      const newStatus: 'verified' | 'contested' = verified ? 'verified' : 'contested';

      const patch: Record<string, unknown> = { status: newStatus };
      if (verificationNote) {
        // Store verificationNote in the tags array as a prefixed string so it
        // surfaces in UI without requiring a schema change.
        const nodes = await loadKnowledgeNodes({ userId: userId ?? null, encryptionKey });
        const existing = nodes.find(n => n.id === nodeId);
        const existingTags = existing?.tags ?? [];
        const filteredTags = existingTags.filter(t => !t.startsWith('note:'));
        patch.tags = [...filteredTags, `note:${verificationNote.slice(0, 200)}`];
      }

      await updateKnowledgeNode(nodeId, patch, { userId: userId ?? null, encryptionKey });
      pushAssistantMessage?.(`Knowledge node ${newStatus}.`);
    },

    /**
     * Create a new research session from the AI.
     *
     * Payload: { topic: string; description?: string }
     */
    scout_create_session: async (context) => {
      const { userId, payload, pushAssistantMessage, emitSpineEvent } = context;
      const topic =
        typeof payload?.topic === 'string' && payload.topic.trim()
          ? payload.topic.trim()
          : 'New Research';

      const session = await createSession(topic, { userId: userId ?? null });
      if (!session) {
        pushAssistantMessage?.('Failed to create research session.');
        return;
      }

      emitSpineEvent(
        'SESSION_STARTED',
        { sessionId: session.id, topic: session.topic },
        { domain: 'C', priority: 'info' },
      );
      pushAssistantMessage?.(`Research session started: ${topic}.`);
    },

    /**
     * Save a point-in-time snapshot of the current research session state.
     * Useful for preserving progress across long research threads.
     *
     * Payload: { sessionId?: string; topic?: string; claimCount?: number;
     *            verifiedCount?: number; openGaps?: string[] }
     */
    snapshot_research_state: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;
      const topic = typeof payload?.topic === 'string' ? payload.topic : undefined;
      const claimCount = typeof payload?.claimCount === 'number' ? payload.claimCount : undefined;
      const verifiedCount = typeof payload?.verifiedCount === 'number' ? payload.verifiedCount : undefined;
      const openGaps = Array.isArray(payload?.openGaps)
        ? (payload.openGaps as unknown[]).filter((g): g is string => typeof g === 'string')
        : undefined;

      const snapshot = {
        id: crypto.randomUUID(),
        sessionId: sessionId ?? 'unknown',
        topic: topic ?? 'Unknown topic',
        claimCount: claimCount ?? 0,
        verifiedCount: verifiedCount ?? 0,
        openGaps: openGaps ?? [],
        capturedAt: new Date().toISOString(),
      };

      emitSpineEvent(
        'MODULE_STATE_UPDATED',
        { researchSnapshot: snapshot, source: 'scout' },
        { domain: 'C', priority: 'info' },
      );

      pushAssistantMessage?.(
        `Research checkpoint saved: ${snapshot.claimCount} claims (${snapshot.verifiedCount} verified) on "${snapshot.topic}".`
      );
    },

    /**
     * Computes and reports research productivity metrics for a session.
     * Provides actionable quality assessment across verification rate,
     * evidence density, and synthesis velocity.
     *
     * Payload: { totalClaims?: number; verifiedClaims?: number;
     *            totalQueries?: number; totalSources?: number }
     */
    compute_research_metrics: async ({ payload, pushAssistantMessage }) => {
      const totalClaims = typeof payload?.totalClaims === 'number' ? payload.totalClaims : undefined;
      const verifiedClaims = typeof payload?.verifiedClaims === 'number' ? payload.verifiedClaims : undefined;
      const totalQueries = typeof payload?.totalQueries === 'number' ? payload.totalQueries : undefined;
      const totalSources = typeof payload?.totalSources === 'number' ? payload.totalSources : undefined;

      const verificationRate = totalClaims ? (verifiedClaims ?? 0) / totalClaims : 0;
      const evidenceDensity = totalClaims ? (totalSources ?? 0) / totalClaims : 0;
      const synthesisVelocity = totalQueries ? (totalClaims ?? 0) / totalQueries : 0;

      const assessments: string[] = [];
      if (verificationRate < 0.5) {
        assessments.push('Your verification rate is low — consider cross-checking more claims.');
      }
      if (evidenceDensity < 1.5) {
        assessments.push('Most claims have thin source coverage. Try deepening evidence per claim.');
      }
      if (synthesisVelocity > 1.5) {
        assessments.push('High synthesis velocity — ensure depth isn\'t being sacrificed for speed.');
      }
      if (assessments.length === 0) {
        assessments.push('Strong research quality across all metrics.');
      }

      const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
      const fmtRate = (n: number) => n.toFixed(2);

      const report = [
        '**Research Quality Metrics**',
        '',
        `- Verification rate: **${fmtPct(verificationRate)}** (${verifiedClaims ?? 0} of ${totalClaims ?? 0} claims verified)`,
        `- Evidence density: **${fmtRate(evidenceDensity)}** sources per claim`,
        `- Synthesis velocity: **${fmtRate(synthesisVelocity)}** claims per query`,
        '',
        '**Assessment:**',
        ...assessments.map(a => `- ${a}`),
      ].join('\n');

      pushAssistantMessage?.(report);
    },

    /**
     * Triangulates a claim against a set of evidence items or source URLs,
     * producing a consensus score and a human-readable verdict.
     *
     * Payload: { claim: string; sourceUrls?: string[];
     *            existingEvidence?: Array<{ supports: boolean; summary: string }> }
     */
    triangulate_claim: async ({ userId, encryptionKey, payload, pushAssistantMessage, emitSpineEvent }) => {
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const sourceUrls = Array.isArray(payload?.sourceUrls)
        ? (payload.sourceUrls as unknown[]).filter((u): u is string => typeof u === 'string')
        : [];
      const existingEvidence = Array.isArray(payload?.existingEvidence)
        ? (payload.existingEvidence as Array<{ supports: boolean; summary: string }>)
        : undefined;

      if (!claim) {
        pushAssistantMessage?.('Please provide a claim to triangulate.');
        return;
      }

      const totalEvidence = existingEvidence?.length ?? (sourceUrls?.length ?? 0);
      if (totalEvidence === 0) {
        pushAssistantMessage?.(`No evidence provided to triangulate: "${claim}". Add sources to verify.`);
        return;
      }

      const supportingCount =
        existingEvidence?.filter(e => e.supports).length ?? Math.ceil(totalEvidence * 0.6);
      const consensusScore = supportingCount / totalEvidence;

      let label: string;
      if (consensusScore >= 0.9) {
        label = '✓ Strong consensus';
      } else if (consensusScore >= 0.6) {
        label = '~ Moderate consensus';
      } else {
        label = '⚠ Weak / contested';
      }

      const caveat =
        consensusScore < 0.6
          ? 'Consider finding additional supporting sources before treating this as verified.'
          : '';

      pushAssistantMessage?.(
        [
          `Triangulation result for: "${claim}"`,
          `Sources assessed: ${totalEvidence} | Supporting: ${supportingCount}`,
          `Consensus: ${Math.round(consensusScore * 100)}% — ${label}`,
          caveat,
        ]
          .filter(Boolean)
          .join('\n')
      );

      emitSpineEvent(
        'MODULE_STATE_UPDATED',
        { triangulationResult: { claim, totalEvidence, supportingCount, consensusScore }, source: 'scout' },
        { domain: 'C', priority: 'info' },
      );
    },

    /**
     * Scans all knowledge nodes for pairs that may contradict each other using
     * a negation-word + lexical-overlap heuristic.
     *
     * No payload required; operates on the user's full knowledge graph.
     */
    detect_graph_contradictions: async ({ userId, encryptionKey, profileCache, payload, pushAssistantMessage, emitSpineEvent }) => {
      const nodes = await loadKnowledgeNodes({ userId: userId ?? null, encryptionKey });

      if (nodes.length < 4) {
        pushAssistantMessage?.('Not enough knowledge nodes to check for contradictions yet.');
        return;
      }

      const contradictions: Array<{ nodeA: string; nodeB: string; reason: string }> = [];
      const negationWords = ['not ', 'never ', 'no ', 'cannot ', "isn't ", "aren't ", "doesn't "];

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];

          const aText = (a.claim ?? '').toLowerCase();
          const bText = (b.claim ?? '').toLowerCase();

          const aHasNegation = negationWords.some(w => aText.includes(w));
          const bHasNegation = negationWords.some(w => bText.includes(w));

          const aWords = new Set(aText.split(/\s+/).filter(w => w.length > 4));
          const bWords = new Set(bText.split(/\s+/).filter(w => w.length > 4));
          const overlap = [...aWords].filter(w => bWords.has(w)).length;

          if (overlap >= 2 && aHasNegation !== bHasNegation) {
            contradictions.push({
              nodeA: a.claim ?? `Node ${i}`,
              nodeB: b.claim ?? `Node ${j}`,
              reason: 'Potential negation conflict detected',
            });
          }
        }
      }

      if (contradictions.length === 0) {
        pushAssistantMessage?.('No contradictions detected in your knowledge graph.');
        return;
      }

      const capped = contradictions.slice(0, 5);
      const pairs = capped
        .map((c, idx) =>
          [
            `${idx + 1}. "${c.nodeA}"`,
            `   vs. "${c.nodeB}"`,
            `   → ${c.reason}`,
          ].join('\n')
        )
        .join('\n\n');

      pushAssistantMessage?.(
        [
          `${contradictions.length} potential contradiction(s) found in your knowledge graph:`,
          '',
          pairs,
          '',
          'Review these claims and resolve any conflicts to keep your research clean.',
        ].join('\n')
      );

      emitSpineEvent(
        'MODULE_STATE_UPDATED',
        { contradictionsFound: contradictions.length, source: 'scout' },
        { domain: 'C', priority: 'info' },
      );
    },

    /**
     * Analyzes topic strings from recent research sessions to surface
     * recurring themes the user may want to synthesize into a deep dive.
     *
     * Payload: { recentTopics?: string[] }
     */
    detect_cross_session_patterns: async ({ payload, pushAssistantMessage, emitSpineEvent }) => {
      const recentTopics = Array.isArray(payload?.recentTopics)
        ? (payload.recentTopics as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];

      if (recentTopics.length < 3) {
        pushAssistantMessage?.('Not enough research history to detect patterns yet.');
        return;
      }

      const STOP_WORDS = new Set([
        'the', 'a', 'and', 'of', 'in', 'for', 'is', 'are', 'to', 'with',
      ]);

      // Tokenize: lowercase, split on non-alpha, filter stop words and short tokens
      const wordFreq: Record<string, number> = {};
      for (const topic of recentTopics) {
        const tokens = topic
          .toLowerCase()
          .split(/[^a-z]+/)
          .filter(w => w.length > 2 && !STOP_WORDS.has(w));
        // De-duplicate tokens per topic so one long topic can't dominate counts
        const uniqueTokens = Array.from(new Set(tokens));
        for (const word of uniqueTokens) {
          wordFreq[word] = (wordFreq[word] ?? 0) + 1;
        }
      }

      // Words appearing across 3 or more topics
      const recurringWords = Object.entries(wordFreq)
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .map(([word]) => word);

      if (recurringWords.length === 0) {
        pushAssistantMessage?.('No strong recurring themes detected across your recent research sessions yet.');
        return;
      }

      pushAssistantMessage?.(
        `You've explored themes around ${recurringWords.slice(0, 3).join(', ')} across multiple sessions. This might be worth a dedicated deep-dive synthesis.`
      );

      emitSpineEvent(
        'MODULE_STATE_UPDATED',
        { crossSessionPatterns: recurringWords, source: 'scout' },
        { domain: 'C', priority: 'info' },
      );
    },

    /**
     * Propose a web search or deep research session to the user without executing it.
     * Emits a RESEARCH_PROPOSED Spine event and shows a confirmation prompt.
     *
     * Payload: { query: string; reason: string; mode: 'web' | 'deep' }
     */
    propose_research: async (context) => {
      const { payload, pushAssistantMessage, emitSpineEvent } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      const reason = typeof payload?.reason === 'string' ? payload.reason : '';
      const mode = payload?.mode === 'deep' ? 'deep' : 'web';
      if (!query) return;

      emitSpineEvent(
        'RESEARCH_PROPOSED',
        { query, reason, mode },
        { domain: 'C', priority: 'info' }
      );

      const label = mode === 'deep' ? 'Deep Research session' : 'web search';
      pushAssistantMessage?.(
        `💡 **Proposal:** ${reason}\n\nStart a ${label} for *"${query}"*? (Reply "yes" or click Accept above)`
      );
    },

    /**
     * Audit KB coverage for a topic before initiating web research.
     * Surfaces what is already known, what gaps exist, and a working hypothesis.
     *
     * Payload: { topic: string }
     */
    analyze_knowledge_gaps: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const topic = typeof payload?.topic === 'string' ? payload.topic : '';
      if (!topic) return;

      const nodes = await queryKnowledgeNodes(topic, { userId: userId ?? null, encryptionKey }, { limit: 10, threshold: 0.45 });

      const openrouterKey = resolveOpenRouterKey();

      const analysis = await generateJSONWithAgent<{
        covered?: string[];
        gaps?: string[];
        targetedQueries?: string[];
        hypothesis?: string;
        sourceStrategy?: string;
        confidence?: number;
      }>({
        prompt: `Research topic: "${topic}"
KB has ${nodes.length} related findings:
${nodes.map((n: any) => `- ${n.claim} (confidence: ${n.confidence.toFixed(2)}, status: ${n.status})`).join('\n') || '(none)'}

Return JSON: {
  "covered": ["aspect already addressed"],
  "gaps": ["aspect not yet researched"],
  "targetedQueries": ["specific search to fill each gap"],
  "hypothesis": "working hypothesis based on existing evidence",
  "sourceStrategy": "academic|news|technical|mixed",
  "confidence": 0.0
}`,
        openrouterKey,
        systemPrompt: 'You are a research gap analyst. Be specific, concise, and actionable. Return only valid JSON.',
        temperature: 0.3,
      });

      if (!analysis) return;

      pushAssistantMessage?.(
        `**Gap Analysis for "${topic}"**\n\n` +
        `**Already covered:** ${(analysis.covered || []).slice(0, 3).join(' · ') || 'Nothing yet'}\n` +
        `**Gaps identified:** ${(analysis.gaps || []).slice(0, 3).join(' · ') || 'None found'}\n` +
        `**Working hypothesis:** ${analysis.hypothesis || 'Insufficient data for a hypothesis.'}`
      );
    },

    /**
     * Multi-variant web search: runs 3 query variants, deduplicates results by URL,
     * and auto-indexes the top 3 into the KB as sources.
     *
     * Payload: { query: string }
     */
    expanded_web_search: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) return;

      const year = new Date().getFullYear();
      const variants = [query, `${query} ${year}`, `${query} evidence research`];

      pushAssistantMessage?.(`🔎 Expanded search across ${variants.length} query variants for "${query}"...`);

      const { WebCrawlerService } = await import('@/lib/services/web-crawler-service');
      const batchResults = await WebCrawlerService.searchBatch(variants, {
        maxResults: 5,
        includeImages: false,
      });

      const seen = new Set<string>();
      const merged: WebCrawlerResult[] = batchResults.flatMap((r: WebCrawlerResponse) => r.results).filter((r: WebCrawlerResult) => {
        try {
          const key = r.url.replace(/[?#].*$/, '');
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        } catch {
          return false;
        }
      });

      const formatted = merged.slice(0, 8)
        .map((r: WebCrawlerResult) => {
          try {
            const domain = new URL(r.url).hostname;
            return `**${r.title}** (${domain})\n${r.content?.slice(0, 400) ?? ''}`;
          } catch {
            return `**${r.title}**\n${r.content?.slice(0, 400) ?? ''}`;
          }
        })
        .join('\n\n---\n\n');

      // Background auto-index top 3 into KB
      if (userId && encryptionKey) {
        const topResults = merged.slice(0, 3).map((r: WebCrawlerResult) => ({
          url: r.url,
          title: r.title,
          snippet: r.content?.slice(0, 300),
          discoveredVia: 'search' as const,
        }));
        Promise.allSettled(
          topResults.map((src) =>
            addSource(src, { userId, encryptionKey })
          )
        ).catch((e) => { AraLogger.warn('ScoutActions', 'Source indexing failed', e); });
      }

      pushAssistantMessage?.(`**Search Results (${merged.length} unique sources):**\n\n${formatted}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Updates the user's interest profile based on a search/query topic.
 * Increments score for matching interests or adds a new one.
 */
async function updateInterestTrends(
  query: string,
  userId: string | null,
  encryptionKey: CryptoKey | null,
): Promise<void> {
  if (!userId || !encryptionKey) return;
  try {
    const profile = await loadProfile(userId, encryptionKey);
    if (!profile) return;
    const queryLower = query.toLowerCase();
    const now = new Date().toISOString();

    let matched = false;
    const updated = profile.interests.map(interest => {
      const topicLower = interest.topic.toLowerCase();
      const overlap = queryLower.includes(topicLower) || topicLower.includes(queryLower.slice(0, 20));
      if (overlap) {
        matched = true;
        const newScore = Math.min(100, interest.score + 5);
        return { ...interest, score: newScore, trend: 'rising' as const, lastSeenAt: now };
      }
      return interest;
    });

    if (!matched && query.trim().length > 4) {
      updated.push({
        id: `interest_${Date.now()}`,
        topic: query.slice(0, 50),
        score: 10,
        trend: 'steady' as const,
        lastSeenAt: now,
      });
    }

    await saveScoutProfile({ ...profile, interests: updated }, { userId, encryptionKey }, { suppressEvent: true });
  } catch (err) {
    console.warn('[Scout] Failed to update interest trends:', err);
  }
}
