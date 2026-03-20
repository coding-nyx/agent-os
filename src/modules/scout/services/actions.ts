import { ActionHub, ActionContext } from '@/lib/actions/action-hub';
import {
  loadScoutProfile,
  saveScoutProfile,
  createEmptyScoutProfile,
  addKnowledgeNode,
  loadKnowledgeNodes,
} from './scout-knowledge-service';
import { WebCrawlerService } from '@/lib/services/web-crawler-service';
import { addSource, loadSources, normalizeUrl, extractDomain } from './scout-sources-service';
import { createSession, updateSession, getSession, loadSessions } from './scout-session-service';
import { generateDigest } from './scout-digest-service';
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

  ActionHub.registerMultiple('scout', {
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
     * Search the existing knowledge base for past findings.
     */
    query_knowledge: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) return;

      const nodes = await loadKnowledgeNodes({ userId: userId ?? null, encryptionKey });
      const results = nodes.filter(n => 
        n.claim.toLowerCase().includes(query.toLowerCase()) || 
        n.title?.toLowerCase().includes(query.toLowerCase())
      );

      if (results.length > 0) {
        const summary = results.slice(0, 3).map(n => `- **${n.title || 'Claim'}**: ${n.claim} (Confidence: ${Math.round(n.confidence * 100)}%)`).join('\n');
        pushAssistantMessage?.(`I recall some findings related to "${query}" in our knowledge base:\n\n${summary}`);
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
      for (const s of sources) {
        if (typeof s?.url === 'string') {
          const added = await addSource({
            url: s.url,
            title: s.title || 'Untitled Source',
            snippet: s.snippet,
            imageUrl: s.imageUrl,
            favicon: s.favicon,
            discoveredVia: 'search',
            nodeId: s.nodeId
          }, { userId: userId ?? null, encryptionKey });
          if (added) addedSources.push(added as any);
        }
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
     * Synthesize a knowledge node from research findings.
     */
    synthesize_knowledge: async (context) => {
      const { userId, encryptionKey, payload, pushAssistantMessage } = context;
      const claim = typeof payload?.claim === 'string' ? payload.claim : '';
      const confidence = typeof payload?.confidence === 'number' ? payload.confidence : 0.5;
      const evidence = Array.isArray(payload?.evidence) ? payload.evidence : []; // Source IDs
      const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : undefined;

      if (!claim) return;

      const node = await addKnowledgeNode({
        claim,
        confidence,
        evidence,
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
          data: { nodeId: node.id, claim, sessionId },
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
      const { payload, pushAssistantMessage } = context;
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

      try {
        const response = await WebCrawlerService.search(query, { maxResults: 5, includeImages: true });
        
        if (response.results.length === 0) {
          pushAssistantMessage?.(`No results found for "${query}".`);
          return;
        }

        const summary = response.results.slice(0, 3).map((r, i) => `${i + 1}. **${r.title}** - ${r.url}`).join('\n');
        pushAssistantMessage?.(`I found some information:\n\n${summary}\n\n${response.answer || ''}`);
        
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
        type: 'DEEP_RESEARCH_STARTED' as any,
        source: 'scout',
        domain: 'C',
        data: { query },
        cascadeDepth: 0,
        priority: 'info'
      });
      
      pushAssistantMessage?.(`🔬 Initiating deep research protocol for: "${query}"`);
    }
  });
}
