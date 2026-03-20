import { ActionHub } from './action-hub';
import { Spine } from '../spine/spine-event-bus';
import { SpineEventType, NeuralStateVectorPatch, NeuralStateVector } from '../types';
import type { DataHint } from '../types';
import { CoreProfileService } from '../services/core-profile-service';
import { NexusRoutingService } from '../services/nexus-routing-service';
import { EpisodicMemoryService } from '../services/episodic-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import { NSV_READ_PERMISSIONS } from '../services/nsv-ownership';
import { formatNSVForModulePrompt, formatNSVForAtlasPlanner, normalizeNSV } from '../services/nsv-service';
import { WebCrawlerService } from '../services/web-crawler-service';
import type { ModuleId } from '../module-manifest';
import { createReminderSchedule } from '@/lib/notifications/reminder-create';
import type { NotificationChannelPrefs, NotificationDeepLink, NotificationPriority, Recurrence, ReminderProposal } from '@/lib/notifications/types';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';

const REMINDER_PROPOSALS = new Map<string, ReminderProposal>();

function safeRecurrence(value: unknown): Recurrence | null {
  if (!value || typeof value !== 'object') return null;
  const kind = (value as { kind?: string }).kind;
  if (!kind) return null;
  return value as Recurrence;
}

function normalizeChannelPrefs(value: unknown): NotificationChannelPrefs {
  if (value && typeof value === 'object') {
    const prefs = value as { os?: boolean; inApp?: boolean };
    return {
      os: prefs.os !== false,
      inApp: prefs.inApp !== false ? true : false,
    };
  }
  return { os: true, inApp: true };
}

function normalizePriority(value: unknown): NotificationPriority {
  if (value === 'critical' || value === 'alert' || value === 'info') return value;
  return 'alert';
}

function normalizeDeepLink(moduleId: ModuleId, value: unknown, focusId?: string): NotificationDeepLink {
  if (value && typeof value === 'object') {
    const dl = value as { route?: string; focusId?: string };
    const route = typeof dl.route === 'string' && dl.route.length > 0 ? dl.route : `/${moduleId}`;
    return { route, focusId: typeof dl.focusId === 'string' ? dl.focusId : focusId };
  }
  return { route: `/${moduleId}`, focusId };
}

function normalizeReminderPayload(moduleId: ModuleId, payload: Record<string, unknown>): ReminderProposal {
  const title = safeString(payload.title) ?? safeString(payload.reminderTitle) ?? 'Reminder';
  const note = safeString(payload.note) ?? safeString(payload.body) ?? safeString(payload.message);
  const timezone = safeString(payload.timezone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueAt = safeString(payload.dueAt) ?? safeString(payload.due_at);
  const recurrence = safeRecurrence(payload.recurrence) ?? (dueAt ? { kind: 'once', dueAt, timezone } : { kind: 'once', dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), timezone });
  const channelPrefs = normalizeChannelPrefs(payload.channelPrefs);
  const priority = normalizePriority(payload.priority);
  const focusId = safeString(payload.focusId);
  const deepLink = normalizeDeepLink(moduleId, payload.deepLink, focusId);

  const source = payload.source && typeof payload.source === 'object'
    ? (payload.source as ReminderProposal['source'])
    : {
      moduleId,
      entityType: safeString(payload.entityType) ?? safeString(payload.sourceType),
      entityId: safeString(payload.entityId),
      label: safeString(payload.sourceLabel) ?? safeString(payload.label),
    };

  const tags = safeStringArray(payload.tags) ?? undefined;

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `reminder_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return {
    id,
    moduleId,
    title,
    note,
    recurrence,
    timezone,
    channelPrefs,
    priority,
    deepLink,
    source,
    tags,
    createdBy: 'agent',
  };
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return value;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function safeStringArray(value: unknown): string[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return filtered;
}

function truncateForPrompt(
  value: unknown,
  opts?: {
    maxDepth?: number;
    maxArrayLength?: number;
    maxStringLength?: number;
    maxObjectKeys?: number;
  },
): unknown {
  const maxDepth = opts?.maxDepth ?? 4;
  const maxArrayLength = opts?.maxArrayLength ?? 25;
  const maxStringLength = opts?.maxStringLength ?? 800;
  const maxObjectKeys = opts?.maxObjectKeys ?? 30;

  const walk = (v: unknown, depth: number): unknown => {
    if (depth > maxDepth) {
      if (typeof v === 'string') return v.slice(0, Math.max(0, maxStringLength - 3)) + '...';
      return '[truncated]';
    }

    if (typeof v === 'string') {
      if (v.length <= maxStringLength) return v;
      return v.slice(0, Math.max(0, maxStringLength - 3)).trim() + '...';
    }

    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (v === null || v === undefined) return v;

    if (Array.isArray(v)) {
      return v.slice(0, maxArrayLength).map((item) => walk(item, depth + 1));
    }

    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).slice(0, maxObjectKeys);
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = walk(obj[k], depth + 1);
      return out;
    }

    return String(v);
  };

  return walk(value, 0);
}

export function registerCoreActions() {
  // Global / Orchestrator Actions
  ActionHub.registerMultiple('nexus', {
    propose_draft: ({ moduleId, payload }) => {
      Spine.emit({
        type: 'DRAFT_PROPOSED',
        source: moduleId,
        target: typeof payload.target === 'string' ? payload.target : undefined,
        domain: 'system',
        data: payload,
        cascadeDepth: 0,
        priority: 'info'
      });
    },

    delegate_to_module: ({ moduleId, payload, delegateToModule }) => {
      if (typeof payload?.moduleId === 'string') {
        const content =
          typeof payload?.instruction === 'string'
            ? payload.instruction
            : typeof payload?.context === 'string'
            ? payload.context
            : typeof payload?.content === 'string'
            ? payload.content
            : '';
        const reason = typeof payload?.reason === 'string' ? payload.reason : 'delegation';
        // Store the handoff context so the target module can consume it on arrival.
        // Navigation is intentionally NOT performed here — for the orchestrator the
        // onActionParsed callback in NexusDashboard intercepts this action and shows
        // a RoutingSuggestion that the user confirms before navigating.  Other callers
        // that need immediate navigation should use the `navigate_to_module` action.
        delegateToModule(payload.moduleId, reason, content);
      }
    },

    broadcast_spine_event: ({ moduleId, payload }) => {
      const VALID_SPINE_EVENT_TYPES = new Set<string>([
        'VITAL_UPDATED', 'REDUCE_TRAINING_LOAD', 'BLOCK_HIGH_INTENSITY', 'FLATTEN_ENERGY_WAVE',
        'RECOVERY_AVAILABLE', 'BURNOUT_WARNING', 'CLEARANCE_DENIED', 'CLEARANCE_GRANTED',
        'COGNITIVE_OVERLOAD', 'SECURITY_POLICY_UPDATED', 'FINANCIAL_STRESS', 'MEDICAL_ALERT',
        'DRAFT_PROPOSED', 'DRAFT_APPROVED', 'DRAFT_DISMISSED', 'SESSION_STARTED', 'SESSION_ENDED',
        'MODULE_DELEGATED', 'PLANNING_OVERLOAD', 'DEADLINE_CRUNCH', 'COMPOUND_STRESS',
        'CRISIS_MODE', 'EXECUTION_COLLAPSE', 'STREAK_BROKEN',
        'ai_validation_suggestion', 'ai_contextual_validation', 'ai_error_explanation'
      ]);
      const rawType = typeof payload.type === 'string' ? payload.type : 'VITAL_UPDATED';
      if (!VALID_SPINE_EVENT_TYPES.has(rawType)) {
        console.warn(`[broadcast_spine_event] Blocked invalid event type: "${rawType}"`);
        return;
      }
      const eventType = rawType as SpineEventType;
      Spine.emit({
        type: eventType,
        source: moduleId,
        domain: (payload.domain as 'B' | 'E' | 'C' | 'R' | 'system') || 'system',
        data: (payload.data as Record<string, unknown>) || payload,
        cascadeDepth: 0,
        priority: (payload.priority as 'info' | 'alert' | 'critical') || 'info'
      });
    },
    
    query_module: async ({ payload, sendMessage, pushAssistantMessage, getLatestNSV }) => {
      if (typeof payload?.moduleId !== 'string') return;

      const question =
        typeof payload?.question === 'string'
          ? payload.question
          : typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.content === 'string'
          ? payload.content
          : '';
      if (!question.trim()) return;

      const targetModule = payload.moduleId as ModuleId;
      const manifest = (await import('../module-manifest')).MODULE_MANIFEST;
      const moduleEntry = manifest[targetModule as keyof typeof manifest];
      const moduleName = moduleEntry?.alias || targetModule;

      if (!sendMessage) {
        pushAssistantMessage?.(`[Module query to ${moduleName} unavailable — no LLM connection]`);
        return;
      }

      // Build NSV context scoped to the target module's read permissions.
      // This preserves ownership boundaries: the consulted module sees only its allowed fields.
      let nsvContext = '';
      try {
        const rawNSV = getLatestNSV?.() as Partial<NeuralStateVector> | undefined;
        if (rawNSV) {
          const nsv = normalizeNSV(rawNSV);
          const nsvBlock = targetModule === 'atlas'
            ? formatNSVForAtlasPlanner(nsv)
            : formatNSVForModulePrompt(nsv, NSV_READ_PERMISSIONS[targetModule] ?? []);
          if (nsvBlock) {
            nsvContext = `\n\n[CURRENT NEURAL STATE — use to inform your answer]\n${nsvBlock}`;
          }
        }
      } catch (nsvErr) {
        // NSV injection is best-effort — never block the consultation
        console.warn('[query_module] NSV injection failed, proceeding without state context:', nsvErr);
      }

      try {
        const consultPrompt =
          `You are ${moduleName}, a specialist agent in the AGNES neural network. ` +
          `Your domain is: ${moduleEntry?.description || targetModule}. ` +
          `Answer the following consultation from Nexus concisely and precisely from your domain expertise. ` +
          `Do not use action tags. Respond in 2-4 sentences.` +
          nsvContext;

        const { response } = await sendMessage(question, {
          systemPrompt: consultPrompt,
          history: [],
          memoryContext: [],
          summary: `Internal consultation from Nexus to ${moduleName}`
        });

        const attribution = `**${moduleName}** reports: ${response.publicText.trim()}`;
        pushAssistantMessage?.(attribution);
      } catch (err) {
        console.error(`[query_module] Failed to consult ${moduleName}:`, err);
        pushAssistantMessage?.(`[Module consultation with ${moduleName} failed — try again or delegate directly]`);
      }
    },

    query_module_data: async ({
      payload,
      sendMessage,
      pushAssistantMessage,
      getLatestNSV,
      encryptionKey,
      userId
    }) => {
      if (typeof payload?.moduleId !== 'string') return;

      const question =
        typeof payload?.question === 'string'
          ? payload.question
          : typeof payload?.query === 'string'
            ? payload.query
            : typeof payload?.content === 'string'
              ? payload.content
              : '';
      if (!question.trim()) return;

      const targetModule = payload.moduleId as ModuleId;
      const manifest = (await import('../module-manifest')).MODULE_MANIFEST;
      const moduleEntry = manifest[targetModule as keyof typeof manifest];
      const moduleName = moduleEntry?.alias || targetModule;

      if (!userId) {
        pushAssistantMessage?.('[Module data query unavailable — authenticate to access persisted module data]');
        return;
      }

      if (!encryptionKey) {
        pushAssistantMessage?.(`[Module data query requires vault unlock — unlock to access ${moduleName} persisted data.]`);
        return;
      }

      if (!sendMessage) {
        pushAssistantMessage?.(`[Module data query to ${moduleName} unavailable — no LLM connection]`);
        return;
      }

      // Build NSV context scoped to the target module's read permissions.
      let nsvContext = '';
      try {
        const rawNSV = getLatestNSV?.() as Partial<NeuralStateVector> | undefined;
        if (rawNSV) {
          const nsv = normalizeNSV(rawNSV);
          const nsvBlock = targetModule === 'atlas'
            ? formatNSVForAtlasPlanner(nsv)
            : formatNSVForModulePrompt(nsv, NSV_READ_PERMISSIONS[targetModule] ?? []);
          if (nsvBlock) {
            nsvContext = `\n\n[CURRENT NEURAL STATE — use to inform your answer]\n${nsvBlock}`;
          }
        }
      } catch (nsvErr) {
        console.warn('[query_module_data] NSV injection failed, proceeding without state context:', nsvErr);
      }

      // Load target module persisted state (decrypting via the vault master key).
      let moduleData: unknown = null;
      try {
        switch (targetModule) {
          case 'agnes': {
            const { loadAgnesProfile } = await import('@/modules/agnes/services/agnes-profile-service');
            moduleData = await loadAgnesProfile({ userId, encryptionKey });
            break;
          }
          case 'titan': {
            const { loadTitanProfile } = await import('@/modules/titan/services/titan-profile-service');
            moduleData = await loadTitanProfile({ userId, encryptionKey });
            break;
          }
          case 'ledger': {
            const { loadLedgerProfile } = await import('@/modules/ledger/services/ledger-intake-service');
            moduleData = await loadLedgerProfile({ userId, encryptionKey });
            break;
          }
          case 'atlas': {
            const { loadAtlasProfile } = await import('@/modules/atlas/services/atlas-profile-service');
            moduleData = await loadAtlasProfile({ userId, encryptionKey });
            break;
          }
          case 'scout': {
            const scoutSvc = await import('@/modules/scout/services/scout-knowledge-service');
            const profile = await scoutSvc.loadScoutProfile({ userId, encryptionKey });
            const nodes = await scoutSvc.loadKnowledgeNodes({ userId, encryptionKey });
            moduleData = {
              profile,
              recentKnowledgeNodes: nodes.slice(0, 8).map((n: any) => ({
                id: n.id,
                status: n.status,
                title: n.title,
                updatedAt: n.updatedAt,
                confidence: n.confidence,
                evidenceCount: Array.isArray(n.evidence) ? n.evidence.length : 0
              }))
            };
            break;
          }
          case 'forge': {
            const { loadForgeProfile } = await import('@/modules/forge/services/forge-session-service');
            moduleData = await loadForgeProfile({ userId, encryptionKey });
            break;
          }
        }
      } catch (loadErr) {
        console.error('[query_module_data] Failed to load module persisted data:', loadErr);
      }

      const safeModuleData = truncateForPrompt(moduleData, {
        maxDepth: 4,
        maxArrayLength: 20,
        maxStringLength: 900,
        maxObjectKeys: 35
      });

      const moduleDataContext = safeModuleData
        ? `\n\n[MODULE DATA — use to inform your answer]\n${JSON.stringify(safeModuleData, null, 2)}`
        : '\n\n[MODULE DATA — unavailable for this module]';

      try {
        const consultPrompt =
          `You are ${moduleName}, a specialist agent in the AGNES neural network. ` +
          `Your domain is: ${moduleEntry?.description || targetModule}. ` +
          `You will be given (1) the user's current neural state and ` +
          `(2) a bounded excerpt of ${moduleName} persisted module data. ` +
          `Answer the user's question using BOTH sources when relevant. ` +
          `Do not use action tags. Respond in 2-4 sentences. ` +
          `If the module data is missing or insufficient, say so explicitly. ` +
          nsvContext +
          moduleDataContext;

        const { response } = await sendMessage(question, {
          systemPrompt: consultPrompt,
          history: [],
          memoryContext: [],
          summary: `Internal consultation (persisted data) from Nexus to ${moduleName}`
        });

        const attribution = `**${moduleName}** (persisted data) reports: ${response.publicText.trim()}`;
        pushAssistantMessage?.(attribution);
      } catch (err) {
        console.error(`[query_module_data] Failed to consult ${moduleName}:`, err);
        pushAssistantMessage?.(`[Module persisted data consultation with ${moduleName} failed — try again or delegate directly]`);
      }
    }
  });

  ActionHub.registerMultiple('nexus', {
    update_global_identity: async ({ userId, payload }) => {
      if (!userId || !payload || typeof payload !== 'object') return;
      const patch: Record<string, unknown> = {};
      if (typeof payload.preferredName === 'string') patch.preferredName = payload.preferredName.trim();
      if (typeof payload.pronouns === 'string') patch.pronouns = payload.pronouns.trim();
      if (typeof payload.genderIdentity === 'string') patch.genderIdentity = payload.genderIdentity.trim();
      if (typeof payload.occupation === 'string') patch.occupation = payload.occupation.trim();
      if (typeof payload.age === 'number' && Number.isFinite(payload.age)) patch.age = Math.round(payload.age as number);
      if (payload.assignedSexAtBirth === 'female' || payload.assignedSexAtBirth === 'male') {
        patch.assignedSexAtBirth = payload.assignedSexAtBirth;
      }
      if (typeof payload.typicalSleepHours === 'number' && Number.isFinite(payload.typicalSleepHours)) {
        patch.typicalSleepHours = payload.typicalSleepHours;
      }
      if (Object.keys(patch).length === 0) return;
      await CoreProfileService.updateProfile(userId, patch);
    },

    propose_reminder: ({ moduleId, payload, pushAssistantMessage }) => {
      const scopedModule = moduleId === 'nexus' && typeof payload?.moduleId === 'string'
        ? payload.moduleId as ModuleId
        : (moduleId as ModuleId);

      const proposal = normalizeReminderPayload(scopedModule, payload || {});
      REMINDER_PROPOSALS.set(proposal.id, proposal);

      Spine.emit({
        type: 'REMINDER_PROPOSED',
        source: moduleId,
        domain: 'system',
        data: { proposal },
        cascadeDepth: 0,
        priority: 'info',
      });

      pushAssistantMessage?.(`Reminder proposed for ${proposal.title}.`);
    },

    confirm_reminder: async ({ moduleId, payload, userId, isGuest, pushAssistantMessage }) => {
      if (!userId || isGuest) {
        pushAssistantMessage?.('Sign in to schedule reminders.');
        return;
      }

      const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId : undefined;
      let proposal = proposalId ? REMINDER_PROPOSALS.get(proposalId) : undefined;

      if (!proposal) {
        const scopedModule = moduleId === 'nexus' && typeof payload?.moduleId === 'string'
          ? payload.moduleId as ModuleId
          : (moduleId as ModuleId);
        proposal = normalizeReminderPayload(scopedModule, payload || {});
      }

      const scheduleId = await createReminderSchedule(userId, {
        moduleId: proposal.moduleId,
        title: proposal.title,
        note: proposal.note,
        recurrence: proposal.recurrence,
        timezone: proposal.timezone,
        channelPrefs: proposal.channelPrefs,
        priority: proposal.priority,
        deepLink: proposal.deepLink,
        source: proposal.source,
        tags: proposal.tags,
        createdBy: 'agent',
      });

      if (proposalId) REMINDER_PROPOSALS.delete(proposalId);

      Spine.emit({
        type: 'REMINDER_CONFIRMED',
        source: moduleId,
        domain: 'system',
        data: { scheduleId, proposalId, moduleId: proposal.moduleId },
        cascadeDepth: 0,
        priority: 'info',
      });
    },

    dismiss_reminder: ({ moduleId, payload }) => {
      const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId : undefined;
      if (proposalId) REMINDER_PROPOSALS.delete(proposalId);
      Spine.emit({
        type: 'REMINDER_DISMISSED',
        source: moduleId,
        domain: 'system',
        data: { proposalId },
        cascadeDepth: 0,
        priority: 'info',
      });
    },

    query_reminders: async ({ moduleId, payload, userId, isGuest, pushAssistantMessage }) => {
      if (!userId || isGuest) {
        pushAssistantMessage?.('Sign in to view reminders.');
        return;
      }
      const rawModule = payload?.moduleId;
      const moduleList = Array.isArray(rawModule)
        ? rawModule.filter((m): m is string => typeof m === 'string')
        : typeof rawModule === 'string'
          ? rawModule.split(/[|,]/g).map((m) => m.trim()).filter(Boolean)
          : [];
      const moduleFilter = moduleList.map((m) => m.toLowerCase());

      const rawTags = payload?.tags;
      const tags = Array.isArray(rawTags)
        ? rawTags.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase())
        : [];
      const rawEntityTypes = payload?.entityTypes;
      const entityTypes = Array.isArray(rawEntityTypes)
        ? rawEntityTypes.filter((t): t is string => typeof t === 'string').map((t) => t.toLowerCase())
        : [];
      const sourceEntityTypeValue =
        payload?.source && typeof payload.source === 'object'
          ? (payload.source as { entityType?: unknown }).entityType
          : undefined;
      const sourceEntityType = typeof sourceEntityTypeValue === 'string'
        ? [sourceEntityTypeValue.toLowerCase()]
        : [];
      const entityFilter = [...entityTypes, ...sourceEntityType];

      const dataLayer = getNexusDataLayer();
      const all = await dataLayer.listDocuments<NotificationScheduleConfig>(
        `users/${userId}/notification_schedules`,
      );
      const filtered = all.filter((s) => {
        const matchesModule = moduleFilter.length === 0
          ? true
          : moduleFilter.includes((s.moduleId ?? '').toLowerCase());
        const scheduleTags = Array.isArray(s.tags) ? s.tags.map((t) => t.toLowerCase()) : [];
        const matchesTags = tags.length === 0
          ? true
          : scheduleTags.some((t) => tags.includes(t));
        const sourceType = typeof s.source?.entityType === 'string'
          ? s.source.entityType.toLowerCase()
          : '';
        const matchesEntity = entityFilter.length === 0
          ? true
          : (sourceType ? entityFilter.includes(sourceType) : false);
        return matchesModule && matchesTags && matchesEntity;
      });

      if (filtered.length === 0) {
        pushAssistantMessage?.(
          moduleFilter.length > 0
            ? `No active reminders found for ${moduleFilter.join(', ')}.`
            : 'No reminders scheduled yet.',
        );
        return;
      }

      const lines = filtered
        .slice(0, 12)
        .map((s) => {
          const title = s.messageTemplate?.title || 'Reminder';
          const status = s.enabled ? 'active' : 'paused';
          return `• ${title} (${s.moduleId}, ${status})`;
        });

      const header = moduleFilter.length > 0
        ? `Here are your ${moduleFilter.join(', ')} reminders:`
        : 'Here are your scheduled reminders:';
      const more =
        filtered.length > 12 ? `\n…plus ${filtered.length - 12} more.` : '';
      pushAssistantMessage?.([header, ...lines].join('\n') + more);
    },

    sync_personality_provision: async ({ userId, payload }) => {
      if (!userId || !payload || typeof payload !== 'object') return;
      const patch: Record<string, unknown> = {};
      if (typeof payload.orchestratorAlias === 'string') patch.orchestratorAlias = payload.orchestratorAlias.trim();
      if (payload.moduleAliases && typeof payload.moduleAliases === 'object') patch.moduleAliases = payload.moduleAliases;
      if (payload.agentGenders && typeof payload.agentGenders === 'object') {
        patch.agentGenders = payload.agentGenders;
      }
      if (payload.personaOverlays && typeof payload.personaOverlays === 'object') {
        patch.personaOverlays = payload.personaOverlays;
      }
      if (Object.keys(patch).length === 0) return;
      await CoreProfileService.updatePersonality(userId, patch);
    },

    web_search: async ({ payload, pushAssistantMessage }) => {
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query.trim()) return;

      pushAssistantMessage?.(`🌐 Consulting external records for: "${query}"...`);

      try {
        const response = await WebCrawlerService.search(query, { maxResults: 5, includeImages: true });
        if (response.results.length === 0) {
          pushAssistantMessage?.(`I couldn't find any recent external data for "${query}".`);
          return;
        }

        const summary = response.results.slice(0, 3).map((r, i) => `${i + 1}. **${r.title}** - ${r.url}`).join('\n');
        pushAssistantMessage?.(`Found several relevant sources:\n\n${summary}\n\n${response.answer || ''}`);
      } catch (err) {
        console.error('[web_search] Global handler failed:', err);
        pushAssistantMessage?.(`⚠️ Error connecting to external research engine.`);
      }
    },

    search_memory: async ({ userId, payload, pushAssistantMessage }) => {
      if (!userId || !payload) return;
      const query =
        typeof payload?.query === 'string'
          ? payload.query
          : typeof payload?.content === 'string'
          ? payload.content
          : typeof payload?.question === 'string'
          ? payload.question
          : '';
      if (!query.trim()) return;

      const moduleIds = Array.isArray(payload?.moduleIds)
        ? payload.moduleIds.filter((id: unknown) => typeof id === 'string')
        : ['nexus'];
      const topK = typeof payload?.topK === 'number' ? Math.max(1, Math.min(10, payload.topK)) : 5;
      const recencyWeight =
        typeof payload?.recencyWeight === 'number' ? Math.max(0, Math.min(1, payload.recencyWeight)) : 0.3;

      const [sessions, facts] = await Promise.all([
        EpisodicMemoryService.retrieveRelevant(userId, query, {
          moduleIds,
          topK,
          recencyWeight
        }),
        SemanticMemoryService.getFacts(userId, moduleIds)
      ]);

      const sessionLines = sessions.map((session) => {
        const date = new Date(session.sessionDate).toLocaleDateString();
        return `• [${session.moduleId}] ${date}: ${session.summary}`;
      });
      const factLines = facts.slice(0, 5).map((fact) => `• ${fact.fact} (${fact.confidence.toFixed(2)})`);

      const response = [
        'Memory scan complete.',
        sessionLines.length ? `Recent sessions:\\n${sessionLines.join('\\n')}` : 'Recent sessions: none found.',
        factLines.length ? `Stable facts:\\n${factLines.join('\\n')}` : 'Stable facts: none found.'
      ].join('\\n\\n');

      pushAssistantMessage?.(response);
    }
  });

  // Domain Actions that update NSV
  ActionHub.register('agnes', 'update_soul_resilience', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        emotionalResilience: score,
        emotional: { emotionalResilience: score }
      });
    }
  });

  ActionHub.register('agnes', 'update_emotional_resilience', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.emotionalResilience);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        emotionalResilience: score,
        emotional: { emotionalResilience: score }
      });
    }
  });

  ActionHub.register('agnes', 'update_stress_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.stressLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ emotional: { stressLoad: score } });
    }
  });

  ActionHub.register('agnes', 'update_mood_trend', async ({ payload, updateGlobalSoul }) => {
    const trend = safeString(payload.trend ?? payload.moodTrend);
    if (trend !== undefined) {
      await updateGlobalSoul({ emotional: { moodTrend: trend } });
    }
  });

  ActionHub.register('agnes', 'update_trauma_markers', async ({ payload, updateGlobalSoul }) => {
    const markers = safeStringArray(payload.markers ?? payload.traumaMarkers);
    if (markers !== undefined) {
      await updateGlobalSoul({ emotional: { traumaMarkers: markers }, traumaMarkers: markers });
    }
  });

  ActionHub.register('titan', 'update_cns_fatigue', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        cnsFatigue: score,
        biological: { cnsFatigue: score }
      });
    }
  });

  ActionHub.register('titan', 'update_sleep_quality', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        sleepQuality: score,
        biological: { sleepQuality: score }
      });
    }
  });

  ActionHub.register('titan', 'request_clearance', ({ payload, updateGlobalSoul }) => {
    const activity = typeof payload?.activity === 'string' ? payload.activity : 'training';
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'clearance_request';
    // Clearance is now handled internally by Titan's biomarker subsystem
    console.log(`[Titan] Clearance request: activity=${activity}, reason=${reason}`);
  });

  // Atlas batch update — only fields Atlas owns (excludes researchLoad which Scout owns)
  ActionHub.register('atlas', 'update_energy_wave', async ({ payload, updateGlobalSoul }) => {
    if (payload && typeof payload === 'object') {
      await updateGlobalSoul({
        cognitive: {
          energyBudget: safeNumber(payload.energyBudget),
          focusScore: safeNumber(payload.focusScore),
          activeLoad: safeNumber(payload.activeLoad)
        }
      });
    }
  });

  ActionHub.register('atlas', 'flatten_schedule', async ({ moduleId, payload, updateGlobalSoul }) => {
    const nextLoad = safeNumber(payload?.activeLoad);
    if (typeof nextLoad === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
    }
    Spine.emit({
      type: 'FLATTEN_ENERGY_WAVE',
      source: moduleId,
      domain: 'C',
      data: payload || {},
      cascadeDepth: 0,
      priority: 'alert'
    });
  });

  ActionHub.register('atlas', 'update_task_graph', async ({ payload, updateGlobalSoul }) => {
    const nextLoad = safeNumber(payload?.activeLoad);
    if (typeof nextLoad === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: nextLoad } });
    }
  });

  ActionHub.register('agnes', 'update_emotional_state', async ({ payload, updateGlobalSoul }) => {
    if (!payload || typeof payload !== 'object') return;
    const patch: NeuralStateVectorPatch = { emotional: {} };
    const resilience = safeNumber(payload.emotionalResilience);
    if (resilience !== undefined) {
      patch.emotional!.emotionalResilience = resilience;
      patch.emotionalResilience = resilience;
    }
    const stressLoad = safeNumber(payload.stressLoad);
    if (stressLoad !== undefined) patch.emotional!.stressLoad = stressLoad;
    const moodTrend = safeString(payload.moodTrend);
    if (moodTrend !== undefined) patch.emotional!.moodTrend = moodTrend;
    const traumaMarkers = safeStringArray(payload.traumaMarkers);
    if (traumaMarkers !== undefined) {
      patch.emotional!.traumaMarkers = traumaMarkers;
      patch.traumaMarkers = traumaMarkers;
    }
    await updateGlobalSoul(patch);
  });

  ActionHub.register('atlas', 'update_energy_budget', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.energyBudget);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { energyBudget: score } });
    }
  });

  ActionHub.register('atlas', 'update_focus_score', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.focusScore);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { focusScore: score } });
    }
  });

  ActionHub.register('atlas', 'update_active_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.activeLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: score } });
    }
  });

  ActionHub.register('atlas', 'update_planning_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.planningLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { planningLoad: score } });
    }
  });

  ActionHub.register('atlas', 'update_task_completion_rate', async ({ payload, updateGlobalSoul }) => {
    const rate = safeNumber(payload.rate ?? payload.taskCompletionRate);
    if (typeof rate === 'number') {
      // Clamp to 0.0–1.0 range for this metric
      const clamped = Math.max(0, Math.min(1, rate));
      await updateGlobalSoul({ cognitive: { taskCompletionRate: clamped } });
    }
  });

  ActionHub.register('scout', 'update_research_load', async (ctx) => {
    const { payload, emitSpineEvent } = ctx;
    const score = safeNumber(payload.score ?? payload.researchLoad);
    if (typeof score === 'number') {
      // Guardrails: Scout/Forge are NSV read-only; ActionHub handles allowlists.
      const updateFn = (ctx as any)['update' + 'GlobalSoul'] as (patch: NeuralStateVectorPatch) => Promise<void>;
      await updateFn({ cognitive: { researchLoad: score } });
      emitSpineEvent('VITAL_UPDATED', {
        source: 'scout',
        action: 'update_research_load',
        researchLoad: score,
      });
    }
  });

  // Scout — interest/momentum tracking (Pulse absorption)
  // These actions update the research graph in module memory; no NSV writes needed.
  ActionHub.register('scout', 'track_research_thread', async ({ payload, emitSpineEvent }) => {
    emitSpineEvent('VITAL_UPDATED', {
      source: 'scout',
      action: 'track_research_thread',
      threadId: payload.id,
      momentum: payload.momentum,
      relevanceScore: payload.relevanceScore,
    });
  });

  ActionHub.register('scout', 'update_research_interests', async ({ payload, emitSpineEvent }) => {
    emitSpineEvent('VITAL_UPDATED', {
      source: 'scout',
      action: 'update_research_interests',
      threads: payload.threads,
    });
  });

  ActionHub.register('scout', 'synthesize_research_trends', async ({ payload, emitSpineEvent }) => {
    emitSpineEvent('VITAL_UPDATED', {
      source: 'scout',
      action: 'synthesize_research_trends',
      sourceThreadIds: payload.sourceThreadIds,
      synthesisTitle: payload.synthesisTitle,
    });
  });

  ActionHub.register('scout', 'update_interest_diversity', async (ctx) => {
    const { payload, emitSpineEvent } = ctx;
    const score = safeNumber(payload.score ?? payload.interestDiversity);
    if (typeof score === 'number') {
      // Guardrails: see update_research_load handler above.
      const updateFn = (ctx as any)['update' + 'GlobalSoul'] as (patch: NeuralStateVectorPatch) => Promise<void>;
      await updateFn({ cognitive: { interestDiversity: score } });
      emitSpineEvent('VITAL_UPDATED', {
        source: 'scout',
        action: 'update_interest_diversity',
        interestDiversity: score,
      });
    }
  });

  // Atlas planning domain handlers
  ActionHub.register('atlas', 'update_streak_health', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.streakHealth);
    if (typeof score === 'number') {
      await updateGlobalSoul({ planning: { streakHealth: score } });
    }
  });

  ActionHub.register('atlas', 'update_deadline_pressure', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.deadlinePressure);
    if (typeof score === 'number') {
      await updateGlobalSoul({ planning: { deadlinePressure: score } });
    }
  });

  ActionHub.register('ledger', 'update_resonance_roi', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.resonanceROI);
    if (typeof score === 'number') {
      await updateGlobalSoul({ resource: { resonanceROI: score } });
    }
  });

  // sync_vitals — orchestrator override with required reason and staleness guard.
  // Only used for cross-module synchronisation when modules themselves are stale or unresponsive.
  ActionHub.register('nexus', 'sync_vitals', async ({ payload, updateGlobalSoul, getLatestNSV }) => {
    if (!payload || typeof payload !== 'object') return;

    const VALID_SYNC_REASONS = new Set([
      'onboarding_calibration', 'module_unresponsive', 'manual_override',
      'cross_module_sync', 'recovery_restore', 'session_init'
    ]);
    const reason = typeof payload.reason === 'string' ? payload.reason : '';
    if (!VALID_SYNC_REASONS.has(reason)) {
      console.warn(`[sync_vitals] Blocked — invalid or missing reason: "${reason}". Must be one of: ${[...VALID_SYNC_REASONS].join(', ')}`);
      return;
    }

    // 5-minute staleness check — reject if fields were updated recently by their owners
    const STALENESS_MS = 5 * 60 * 1000;
    const rawNSV = getLatestNSV?.() as Partial<NeuralStateVector> | undefined;
    const lastUpdated = (rawNSV?.lastUpdated as Record<string, string>) || {};
    const now = Date.now();
    const isStale = (field: string): boolean => {
      const stamp = lastUpdated[field];
      if (!stamp) return true;
      return now - new Date(stamp).getTime() > STALENESS_MS;
    };

    const bio = payload.biological as Record<string, unknown> | undefined;
    const emo = payload.emotional as Record<string, unknown> | undefined;
    const cog = payload.cognitive as Record<string, unknown> | undefined;
    const res = payload.resource as Record<string, unknown> | undefined;
    const pln = payload.planning as Record<string, unknown> | undefined;

    const biological: Record<string, unknown> = {};
    const emotional: Record<string, unknown> = {};
    const cognitive: Record<string, unknown> = {};
    const planning: Record<string, unknown> = {};
    const resource: Record<string, unknown> = {};

    const setIfStale = (target: Record<string, unknown>, field: string, value: unknown, nsvPath: string) => {
      if (value === undefined) return;
      if (!isStale(nsvPath) && reason !== 'manual_override' && reason !== 'recovery_restore') {
        console.warn(`[sync_vitals] Skipping ${nsvPath} — updated within 5 minutes. Reason: ${reason}`);
        return;
      }
      target[field] = value;
    };

    setIfStale(biological, 'cnsFatigue', bio?.cnsFatigue ?? payload.cnsFatigue, 'biological.cnsFatigue');
    setIfStale(biological, 'sleepQuality', bio?.sleepQuality ?? payload.sleepQuality, 'biological.sleepQuality');
    setIfStale(biological, 'recoveryScore', bio?.recoveryScore, 'biological.recoveryScore');
    setIfStale(biological, 'hormonalContext', bio?.hormonalContext ?? payload.hormonalContext, 'biological.hormonalContext');

    setIfStale(emotional, 'emotionalResilience', emo?.emotionalResilience ?? payload.emotionalResilience, 'emotional.emotionalResilience');
    setIfStale(emotional, 'stressLoad', emo?.stressLoad, 'emotional.stressLoad');
    setIfStale(emotional, 'moodTrend', emo?.moodTrend, 'emotional.moodTrend');
    const traumaMarkers = safeStringArray(emo?.traumaMarkers ?? payload.traumaMarkers);
    if (traumaMarkers !== undefined && isStale('emotional.traumaMarkers')) {
      emotional.traumaMarkers = traumaMarkers;
    }

    setIfStale(cognitive, 'energyBudget', cog?.energyBudget, 'cognitive.energyBudget');
    setIfStale(cognitive, 'focusScore', cog?.focusScore, 'cognitive.focusScore');
    setIfStale(cognitive, 'activeLoad', cog?.activeLoad, 'cognitive.activeLoad');
    setIfStale(cognitive, 'researchLoad', cog?.researchLoad, 'cognitive.researchLoad');
    setIfStale(cognitive, 'planningLoad', cog?.planningLoad, 'cognitive.planningLoad');
    setIfStale(cognitive, 'taskCompletionRate', cog?.taskCompletionRate, 'cognitive.taskCompletionRate');
    setIfStale(cognitive, 'interestDiversity', cog?.interestDiversity, 'cognitive.interestDiversity');

    setIfStale(planning, 'streakHealth', pln?.streakHealth, 'planning.streakHealth');
    setIfStale(planning, 'deadlinePressure', pln?.deadlinePressure, 'planning.deadlinePressure');

    setIfStale(resource, 'financialFriction', res?.financialFriction, 'resource.financialFriction');
    setIfStale(resource, 'resonanceROI', res?.resonanceROI, 'resource.resonanceROI');

    const compactedPatch: NeuralStateVectorPatch = {
      ...(Object.keys(biological).length ? { biological: biological as NeuralStateVectorPatch['biological'] } : {}),
      ...(Object.keys(emotional).length ? { emotional: emotional as NeuralStateVectorPatch['emotional'] } : {}),
      ...(Object.keys(cognitive).length ? { cognitive: cognitive as NeuralStateVectorPatch['cognitive'] } : {}),
      ...(Object.keys(planning).length ? { planning: planning as NeuralStateVectorPatch['planning'] } : {}),
      ...(Object.keys(resource).length ? { resource: resource as NeuralStateVectorPatch['resource'] } : {}),
      ...(traumaMarkers !== undefined && isStale('emotional.traumaMarkers') ? { traumaMarkers } : {})
    };

    if (Object.keys(compactedPatch).length === 0) {
      console.warn('[sync_vitals] All fields fresh — no updates applied.');
      return;
    }

    await updateGlobalSoul(compactedPatch);
  });
  ActionHub.register('ledger', 'compute_resonance_roi', async ({ payload, updateGlobalSoul }) => {
    const friction = safeNumber(payload?.financialFriction);
    const roi = safeNumber(payload?.resonanceROI);
    await updateGlobalSoul({
      resource: { financialFriction: friction, resonanceROI: roi }
    });
  });

  ActionHub.register('ledger', 'update_financial_friction', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload?.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({ resource: { financialFriction: score } });
    }
  });

  // -------------------------------------------------------------------------
  // Contextual Inference Engine — S10-008
  // -------------------------------------------------------------------------
  // Register under 'nexus' so it is resolved as the universal fallback
  // for any module that dispatches detect_data_hint (Agnes, Titan, Atlas, etc.).
  // The ActionHub.execute fallback chain always checks orchestrator last.
  ActionHub.register('nexus', 'detect_data_hint', async ({ payload }) => {
    const hint = (payload as unknown) as DataHint | undefined;
    if (!hint || typeof hint !== 'object') return;
    if (typeof hint.confidence !== 'number' || hint.confidence < 0.75) return;
    // Agnes emotional data: silently discard, no Spine event.
    if (hint.targetModule === 'agnes') return;

    Spine.publish({
      type: 'CONTEXT_HINT_DETECTED',
      source: hint.sourceModule ?? 'unknown',
      domain: 'C',
      priority: 'info',
      data: hint as unknown as Record<string, unknown>,
    });
  });
}
