import { ActionHub, ActionContext } from '@/lib/actions/action-hub';
import {
  loadScoutProfile,
  saveScoutProfile,
  createEmptyScoutProfile,
  addKnowledgeNode,
  loadKnowledgeNodes,
  queryKnowledgeNodes,
  updateKnowledgeNode,
} from './scout-knowledge-service';
import { ScoutWebSearchService } from './scout-web-search-service';
import { addSource, loadSources, normalizeUrl, extractDomain } from './scout-sources-service';
import { createSession, updateSession, getSession, loadSessions } from './scout-session-service';
import { generateDigest } from './scout-digest-service';
import { ScoutQueryService } from './scout-query-service';
import { generateJSONWithAgent } from '@/lib/ai-adapters/json-generation-agent';
import { Spine } from '@/lib/spine/spine-event-bus';
import { ResearchSession, ScoutKnowledgeNode, SourceEntry } from '../types';

let registered = false;

async function loadProfile(userId?: string | null, encryptionKey?: CryptoKey | null) {
  const profile = await loadScoutProfile({ userId, encryptionKey });
  return profile ?? createEmptyScoutProfile();
}

export function registerScoutActions() {
  if (registered) return;
  registered = true;

  ActionHub.registerProvider('scout', {
    capabilities: ['research'],
    latencyTier: 'heavy',
  });

  ActionHub.registerMultiple('scout', {
    create_research_request: async ({ moduleId, payload }) => {
      Spine.emit({
        type: 'DRAFT_PROPOSED',
        source: moduleId,
        target: typeof payload?.target === 'string' ? payload.target : moduleId,
        domain: 'system',
        data: payload,
        cascadeDepth: 0,
        priority: 'info',
      });
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
      const { userId, payload, pushAssistantMessage } = context;
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
        Spine.emit({
          type: 'SESSION_STARTED' as any,
          source: 'scout',
          domain: 'C',
          data: { sessionId: targetSession.id, topic: targetSession.topic },
          cascadeDepth: 0,
          priority: 'info'
        });
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

      // Update interest trends for this query topic
      await updateInterestTrends(query, userId ?? null, encryptionKey ?? null);

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
        pushAssistantMessage?.(`I don't see any specific claims in our local knowledge base regarding "${query}". Shall I search the web?`);
      }
    },

    /**
     * Start a new persistent research session.
     */
    start_session: async (context) => {
      const { userId, payload, pushAssistantMessage } = context;
      const topic = typeof payload?.topic === 'string' ? payload.topic : 'New Research';
      
      const session = await createSession(topic, { userId: userId ?? null });
      if (session) {
        Spine.emit({
          type: 'SESSION_STARTED' as any,
          source: 'scout',
          domain: 'C',
          data: { sessionId: session.id, topic: session.topic },
          cascadeDepth: 0,
          priority: 'info'
        });
        pushAssistantMessage?.(`🔬 Started new research session: "${topic}"`);
      }
    },

    /**
     * Add sources to the library and optionally link to a session/node.
     */
    add_sources: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const sources = Array.isArray(payload?.sources) ? payload.sources : [];
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;

      const addedSources: SourceEntry[] = [];
      const addPromises = new Map<string, Promise<any>>();

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
        if (added) addedSources.push(added as any);
      }

      pushAssistantMessage?.(`📥 Added ${sources.length} sources to your research library.`);
      
      Spine.emit({
        type: 'SOURCE_ADDED' as any,
        source: 'scout',
        domain: 'C',
        data: { count: sources.length, sessionId, sources: addedSources },
        cascadeDepth: 0,
        priority: 'info'
      });
    },

    /**
    /**
     * Synthesize a knowledge node from research findings.
     * Checks for near-duplicate nodes (similarity ≥ 0.82) before creating.
     */
    synthesize_knowledge: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
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

        Spine.emit({
          type: 'KNOWLEDGE_SYNTHESIZED' as any,
          source: 'scout',
          domain: 'C',
          data: { userId, nodeId: node.id, claim, sessionId, node },
          cascadeDepth: 0,
          priority: 'info'
        });

        pushAssistantMessage?.(`💡 Synthesized new finding: "${claim}"`);
      }
    },

    /**
     * Global web search capability (shared with Nexus/Forge).
     */
    web_search: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) return;

      pushAssistantMessage?.(`🌐 Searching the web for: "${query}"...`);

      Spine.emit({
        type: 'RESEARCH_SEARCHING' as any,
        source: 'scout',
        domain: 'C',
        data: { query },
        cascadeDepth: 0,
        priority: 'info'
      });

      // Update interest trends for this query topic
      await updateInterestTrends(query, userId ?? null, encryptionKey ?? null);

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

        Spine.emit({
          type: 'RESEARCH_RESULTS' as any,
          source: 'scout',
          domain: 'C',
          data: { query, results: response.results, answer: response.answer },
          cascadeDepth: 0,
          priority: 'info'
        });

        // Auto-add to sources if in Scout context
        if (context.moduleId === 'scout') {
          try {
            await ActionHub.execute('scout', 'add_sources', {
              ...context,
              payload: {
                sources: response.results.map(r => ({
                  url: r.url,
                  title: r.title,
                  snippet: r.content,
                  imageUrl: response.images?.[0]
                }))
              }
            });
          } catch (sourceError) {
            console.error('Failed to auto-add sources:', sourceError);
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
      const { payload, pushAssistantMessage } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      
      if (!query) {
        pushAssistantMessage?.('Please provide a query for deep research.');
        return;
      }

      // In v2, this opens the specialized DeepResearchPanel via Spine event
      Spine.emit({
        type: 'DEEP_RESEARCH_REQUESTED',
        source: 'scout',
        domain: 'C',
        data: { query },
        cascadeDepth: 0,
        priority: 'info'
      });
      Spine.emit({
        type: 'DEEP_RESEARCH_STARTED',
        source: 'scout',
        domain: 'C',
        data: { query },
        cascadeDepth: 0,
        priority: 'info'
      });
      
      pushAssistantMessage?.(`🔬 Initiating deep research protocol for: "${query}"`);
    },

    /**
     * Handoff a research finding to Atlas for actionable scheduling.
     */
    handoff_to_atlas: async (context) => {
      const { payload, pushAssistantMessage } = context;
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const suggestion = typeof payload?.suggestion === 'string' ? payload.suggestion : '';
      
      if (!claim || !suggestion) {
        pushAssistantMessage?.('Please specify a finding and a concrete suggestion for Atlas.');
        return;
      }

      Spine.emit({
        type: 'HABIT_SUGGESTED' as any,
        source: 'scout',
        domain: 'C',
        data: { 
          title: suggestion, 
          description: `Based on research finding: "${claim}"`,
          origin: 'scout' 
        },
        cascadeDepth: 0,
        priority: 'info'
      });
      
      pushAssistantMessage?.(`📋 I've shared that finding with Atlas. You'll see a suggested task/habit in your timeline to put this research into practice.`);
    },

    /**
     * Handoff a fitness/training research finding to Titan.
     */
    handoff_to_titan: async (context) => {
      const { payload, pushAssistantMessage } = context;
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const suggestion = typeof payload?.suggestion === 'string' ? payload.suggestion : '';
      if (!claim || !suggestion) {
        pushAssistantMessage?.('Please specify a finding and a training suggestion for Titan.');
        return;
      }
      Spine.emit({
        type: 'TITAN_PROPOSAL',
        source: 'scout',
        domain: 'B',
        data: { title: suggestion, description: `Scout finding: "${claim}"`, origin: 'scout' },
        cascadeDepth: 0,
        priority: 'info'
      });
      pushAssistantMessage?.(`💪 Forwarded to Titan. You'll see a training recommendation in your fitness module based on this research.`);
    },

    /**
     * Handoff a financial research finding to Ledger.
     */
    handoff_to_ledger: async (context) => {
      const { payload, pushAssistantMessage } = context;
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const suggestion = typeof payload?.suggestion === 'string' ? payload.suggestion : '';
      if (!claim || !suggestion) {
        pushAssistantMessage?.('Please specify a finding and a financial suggestion for Ledger.');
        return;
      }
      Spine.emit({
        type: 'CONTEXT_HINT_DETECTED',
        source: 'scout',
        domain: 'R',
        data: { hint: suggestion, context: `Research finding: "${claim}"`, moduleId: 'ledger', origin: 'scout' },
        cascadeDepth: 0,
        priority: 'info'
      });
      pushAssistantMessage?.(`💰 Forwarded to Ledger. A financial context hint based on this research will appear in your finance module.`);
    },

    /**
     * Handoff a health/biomarker research finding to Soma.
     */
    handoff_to_soma: async (context) => {
      const { payload, pushAssistantMessage } = context;
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const suggestion = typeof payload?.suggestion === 'string' ? payload.suggestion : '';
      if (!claim || !suggestion) {
        pushAssistantMessage?.('Please specify a finding and a health suggestion for Soma.');
        return;
      }
      Spine.emit({
        type: 'HEALTH_CONTEXT_STALE',
        source: 'scout',
        domain: 'B',
        data: { suggestion, researchFinding: claim, origin: 'scout' },
        cascadeDepth: 0,
        priority: 'alert'
      });
      pushAssistantMessage?.(`🩺 Forwarded to Soma. The health implication from this research will be surfaced in your health module.`);
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
      let targetNodeId = nodeId;
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

        const openrouterKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('VITE_OPENROUTER_API_KEY') : null)
          || (import.meta.env.VITE_OPENROUTER_API_KEY as string);

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
     * Finalize the current research turn and sync the workbench.
     */
    commit_research: async (context) => {
      const { userId, encryptionKey, pushAssistantMessage } = context;
      pushAssistantMessage?.('✅ Research workbench committed. All findings and sources have been saved.');
      Spine.emit({
        type: 'SCOUT_PROFILE_UPDATED',
        source: 'scout',
        domain: 'C',
        data: { userId, committed: true },
        cascadeDepth: 0,
        priority: 'info'
      });
    },

    /**
     * List reminders tied to the Scout module.
     */
    query_reminders: async (context) => {
      const { pushAssistantMessage } = context;
      // Delegate to Nexus reminder system via Spine
      Spine.emit({
        type: 'MODULE_DELEGATED',
        source: 'scout',
        domain: 'C',
        data: { action: 'query_reminders', moduleId: 'scout' },
        cascadeDepth: 0,
        priority: 'info'
      });
      pushAssistantMessage?.('📅 Checking your Scout reminders...');
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

    await saveScoutProfile({ ...profile, interests: updated }, { userId, encryptionKey });
  } catch (err) {
    console.warn('[Scout] Failed to update interest trends:', err);
  }
}
