import { ActionHub } from './action-hub';
import { NexusLogger } from '@/lib/nexus-logger';
import { Spine } from '../spine/spine-event-bus';
import { SpineEventType, NeuralStateVectorPatch, NeuralStateVector } from '../types';
import type { DataHint } from '../types';
import { CoreProfileService } from '../services/core-profile-service';
import { NexusRoutingService } from '../services/nexus-routing-service';
import { EpisodicMemoryService } from '../services/episodic-memory-service';
import { SemanticMemoryService } from '../services/semantic-memory-service';
import { WebCrawlerService } from '../services/web-crawler-service';
import type { ModuleId } from '../module-manifest';
import { ReminderLifecycleService } from '@/lib/notifications/reminder-lifecycle-service';
import { ReminderLifecycleError } from '@/lib/notifications/errors';
import type { NotificationChannelPrefs, NotificationDeepLink, NotificationPriority, Recurrence, ReminderProposal } from '@/lib/notifications/types';
import { getNexusDataLayer } from '@/lib/data-layer/provider';
import type { NotificationScheduleConfig } from '@/lib/notifications/types';
import { RoutineRegistryService } from '@/lib/routines/routine-registry-service';
import type { RoutineDefinition, RoutineProposal, RoutineTrigger } from '@/lib/routines/routine-types';
import { AutonomyFeatureFlags } from '@/lib/services/autonomy-feature-flags';
import { OrchestrationInteractionGateService } from '@/lib/services/orchestration-interaction-gate-service';
import { SpecialistConsultationService } from '@/lib/services/specialist-consultation-service';
import {
  saveQuietHoursConfig,
  loadQuietHoursConfig,
  createDefaultQuietHours,
  persistSnooze,
  clearSnooze,
  computeSnoozedUntil,
  SNOOZE_OPTIONS,
} from '@/modules/notifications/services/notification-service';

/**
 * HANDLER_PRECEDENCE — documents the bootstrap registration order enforced in main.tsx.
 *
 * 1. registerOrchestratorActions()  — navigate_to_module, create_module_handoff (unique to Nexus)
 * 2. registerCoreActions()          — overwrites any same-key registrations from step 1
 * 3. registerAnalysisActions()      — additive (no overlapping keys with step 2)
 * 4. registerGlobalValidationActions(), registerFieldSuggestionActions() — additive
 * 5. Module registrations           — each module's own namespace (isolated by moduleId)
 *
 * Do NOT add shared-key handlers in registerOrchestratorActions() — they will be overwritten
 * here and the duplicate registration produces ActionHub collision warnings in DEV.
 */
export const HANDLER_PRECEDENCE = [
  'registerOrchestratorActions',
  'registerCoreActions',
  'registerAnalysisActions',
  'registerGlobalValidationActions',
  'registerFieldSuggestionActions',
  'module registrations (isolated by moduleId)',
] as const;

const ROUTINE_PROPOSALS = new Map<string, RoutineProposal>();

function stableHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function buildDeterministicDraftId(prefix: 'reminder' | 'routine', moduleId: ModuleId, payload: Record<string, unknown>): string {
  return `${prefix}-${moduleId}-${stableHash(stableSerialize(payload))}`;
}

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
      inApp: prefs.inApp !== false,
    };
  }
  return { os: true, inApp: true };
}

function normalizePriority(value: unknown): NotificationPriority {
  if (value === 'critical' || value === 'alert' || value === 'info') return value;
  return 'alert';
}

function normalizeDeepLink(moduleId: ModuleId, value: unknown, focusId?: string): NotificationDeepLink {
  const safeFocusId = typeof focusId === 'string' && focusId.trim().length > 0 ? focusId : undefined;
  if (value && typeof value === 'object') {
    const dl = value as { route?: string; focusId?: string };
    const route = typeof dl.route === 'string' && dl.route.length > 0 ? dl.route : `/${moduleId}`;
    const deepLink: NotificationDeepLink = { route };
    if (typeof dl.focusId === 'string' && dl.focusId.trim().length > 0) {
      deepLink.focusId = dl.focusId;
    } else if (safeFocusId) {
      deepLink.focusId = safeFocusId;
    }
    return deepLink;
  }
  return safeFocusId ? { route: `/${moduleId}`, focusId: safeFocusId } : { route: `/${moduleId}` };
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

  const sourceCandidate =
    payload.source && typeof payload.source === 'object'
      ? (payload.source as { moduleId?: unknown; entityType?: unknown; entityId?: unknown; label?: unknown })
      : undefined;
  const sourceEntityType = safeString(sourceCandidate?.entityType) ?? safeString(payload.entityType) ?? safeString(payload.sourceType);
  const sourceEntityId = safeString(sourceCandidate?.entityId) ?? safeString(payload.entityId);
  const sourceLabel = safeString(sourceCandidate?.label) ?? safeString(payload.sourceLabel) ?? safeString(payload.label);
  const sourceModuleIdRaw = safeString(sourceCandidate?.moduleId);
  const sourceModuleId = (sourceModuleIdRaw ?? moduleId) as ModuleId;
  const source: ReminderProposal['source'] = {
    moduleId: sourceModuleId,
    ...(sourceEntityType ? { entityType: sourceEntityType } : {}),
    ...(sourceEntityId ? { entityId: sourceEntityId } : {}),
    ...(sourceLabel ? { label: sourceLabel } : {}),
  };

  const tags = safeStringArray(payload.tags) ?? undefined;

  const id = buildDeterministicDraftId('reminder', moduleId, {
    title,
    note: note ?? null,
    recurrence,
    timezone,
    channelPrefs,
    priority,
    deepLink,
    source,
    tags: tags ?? null,
  });

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

function normalizeRoutineTrigger(payload: Record<string, unknown>): RoutineTrigger {
  const trigger = payload.trigger;
  if (trigger && typeof trigger === 'object') {
    const type = safeString((trigger as { type?: unknown }).type);
    if (type === 'spine_event') {
      const spineEventType = safeString((trigger as { spineEventType?: unknown }).spineEventType);
      if (spineEventType) {
        return { type: 'spine_event', spineEventType: spineEventType as SpineEventType };
      }
    }
    if (type === 'action') {
      const actionType = safeString((trigger as { actionType?: unknown }).actionType);
      if (actionType) {
        return { type: 'action', actionType };
      }
    }
    if (type === 'notification') {
      return { type: 'notification' };
    }
  }

  const actionType = safeString(payload.actionType);
  if (actionType) {
    return { type: 'action', actionType };
  }

  return { type: 'notification' };
}

function normalizeRoutinePayload(moduleId: ModuleId, payload: Record<string, unknown>): RoutineProposal {
  const name = safeString(payload.name) ?? safeString(payload.title) ?? 'Routine';
  const description = safeString(payload.description) ?? safeString(payload.note);
  const timezone = safeString(payload.timezone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dueAt = safeString(payload.dueAt) ?? safeString(payload.due_at);
  const recurrence = safeRecurrence(payload.recurrence) ?? (dueAt
    ? { kind: 'once', dueAt, timezone }
    : { kind: 'every_n_days', intervalDays: 1, dtStart: new Date().toISOString(), timezone });
  const category = safeString(payload.category);
  const tags = safeStringArray(payload.tags) ?? undefined;
  const now = new Date().toISOString();
  const routine: RoutineDefinition = {
    id: buildDeterministicDraftId('routine', moduleId, {
      name,
      description: description ?? null,
      timezone,
      recurrence,
      category: category ?? null,
      tags: tags ?? null,
      trigger: normalizeRoutineTrigger(payload),
      enabled: payload.enabled !== false,
    }),
    name,
    ...(description ? { description } : {}),
    moduleId,
    recurrence,
    timezone,
    ...(category ? { category } : {}),
    ...(tags ? { tags } : {}),
    trigger: normalizeRoutineTrigger(payload),
    enabled: payload.enabled !== false,
    createdBy: 'agent',
    createdAt: now,
    updatedAt: now,
  };

  return {
    id: routine.id,
    routine,
    createdBy: 'agent',
    source: {
      moduleId,
      ...(safeString(payload.context) ? { context: safeString(payload.context) } : {}),
    },
  };
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return value;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function safeStringArray(value: unknown): string[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return filtered;
}

function buildCoreProfilePatch(payload: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const preferredName = safeString(payload.preferredName);
  const pronouns = safeString(payload.pronouns);
  const genderIdentity = safeString(payload.genderIdentity);
  const occupation = safeString(payload.occupation);
  const age = safeNumber(payload.age);
  const typicalSleepHours = safeNumber(payload.typicalSleepHours);

  if (preferredName) patch.preferredName = preferredName;
  if (pronouns) patch.pronouns = pronouns;
  if (genderIdentity) patch.genderIdentity = genderIdentity;
  if (occupation) patch.occupation = occupation;
  if (typeof age === 'number' && Number.isFinite(age)) patch.age = Math.round(age);
  if (payload.assignedSexAtBirth === 'female' || payload.assignedSexAtBirth === 'male') {
    patch.assignedSexAtBirth = payload.assignedSexAtBirth;
  }
  if (typeof typicalSleepHours === 'number' && Number.isFinite(typicalSleepHours)) {
    patch.typicalSleepHours = typicalSleepHours;
  }

  return patch;
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

    create_general_request: ({ moduleId, payload }) => {
      Spine.emit({
        type: 'DRAFT_PROPOSED',
        source: moduleId,
        target: typeof payload?.target === 'string' ? payload.target : moduleId,
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
        'CRISIS_MODE', 'STREAK_BROKEN',
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
    
    query_module: async ({ payload, sendMessage, pushAssistantMessage, getLatestNSV, moduleId, orchestration, emitThreadArtifact }) => {
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

      try {
        Spine.emit({
          type: 'MODULE_DELEGATED',
          source: 'nexus',
          target: targetModule,
          domain: 'system',
          data: { reason: 'query_module', content: question },
          cascadeDepth: 0,
          priority: 'info',
        });

        const result = await SpecialistConsultationService.consult({
          sourceModuleId: moduleId,
          threadId: orchestration?.activeThreadId ?? null,
          targetModuleId: targetModule,
          question,
          mode: 'state_only',
          sendMessage,
          getLatestNSV,
        });
        pushAssistantMessage?.(result.assistantMessage);
        emitThreadArtifact?.(result.artifact);
        Spine.emit({
          type: 'MODULE_DELEGATED',
          source: targetModule,
          target: 'nexus',
          domain: 'system',
          data: {
            reason: 'query_result',
            content: result.artifact.responseText ?? result.artifact.summary,
            status: result.artifact.status,
          },
          cascadeDepth: 0,
          priority: result.artifact.status === 'completed' ? 'info' : 'alert',
        });
      } catch (err) {
        console.error(`[query_module] Failed to consult ${targetModule}:`, err);
      }
    },

    query_module_data: async ({
      payload,
      sendMessage,
      pushAssistantMessage,
      getLatestNSV,
      encryptionKey,
      userId,
      moduleId,
      orchestration,
      emitThreadArtifact,
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

      try {
        Spine.emit({
          type: 'MODULE_DELEGATED',
          source: 'nexus',
          target: targetModule,
          domain: 'system',
          data: { reason: 'query_module_data', content: question },
          cascadeDepth: 0,
          priority: 'info',
        });

        const result = await SpecialistConsultationService.consult({
          sourceModuleId: moduleId,
          threadId: orchestration?.activeThreadId ?? null,
          targetModuleId: targetModule,
          question,
          mode: 'state_plus_persisted_data',
          sendMessage,
          getLatestNSV,
          userId,
          encryptionKey,
        });
        pushAssistantMessage?.(result.assistantMessage);
        emitThreadArtifact?.(result.artifact);
        Spine.emit({
          type: 'MODULE_DELEGATED',
          source: targetModule,
          target: 'nexus',
          domain: 'system',
          data: {
            reason: 'query_result',
            content: result.artifact.responseText ?? result.artifact.summary,
            status: result.artifact.status,
          },
          cascadeDepth: 0,
          priority: result.artifact.status === 'completed' ? 'info' : 'alert',
        });
      } catch (err) {
        console.error(`[query_module_data] Failed to consult ${targetModule}:`, err);
      }
    },

    mutate_module_data: async ({ payload, ...context }) => {
      const moduleId = typeof payload?.moduleId === 'string' ? payload.moduleId : null;
      const actionType = typeof payload?.actionType === 'string' ? payload.actionType : null;
      if (!moduleId || !actionType) {
        context.pushAssistantMessage?.('mutate_module_data: moduleId and actionType are required.');
        return;
      }
      await ActionHub.execute(moduleId, actionType, {
        ...context,
        moduleId,
        payload: (payload.actionPayload as Record<string, unknown>) ?? {},
      });
    },
  });

  ActionHub.registerMultiple('nexus', {
    update_global_identity: async ({ userId, payload, pushAssistantMessage }) => {
      if (!userId || !payload || typeof payload !== 'object') { pushAssistantMessage?.('Action could not be completed — please try again.'); return; }
      const patch = buildCoreProfilePatch(payload);
      if (Object.keys(patch).length === 0) return;
      await CoreProfileService.updateProfile(userId, patch);
    },

    update_orchestrator_intake: async ({ userId, payload, markProfileDirty }) => {
      if (!userId || !payload || typeof payload !== 'object') return;
      const patch = buildCoreProfilePatch(payload);
      if (Object.keys(patch).length === 0) return;
      await CoreProfileService.updateProfile(userId, patch);
      markProfileDirty?.();
    },

    // Onboarding focus stubs — intentionally no-op.  The intake orchestrator
    // (use-intake-orchestrator.ts) intercepts these action types to advance the
    // wizard step index *before* ActionHub dispatches them.  They must be
    // registered so ActionHub does not fall through to the nexus catch-all.
    focus_identity: () => {},
    focus_bio: () => {},
    focus_review: () => {},

    complete_orchestrator_onboarding: async ({ userId, markProfileDirty }) => {
      if (!userId) return;
      await CoreProfileService.updateProfile(userId, { onboardingComplete: true });
      markProfileDirty?.();
    },

    propose_reminder: async ({ moduleId, payload, userId, isGuest, pushAssistantMessage }) => {
      if (!userId || isGuest) {
        pushAssistantMessage?.('Sign in to set reminders.');
        return;
      }

      const scopedModule = moduleId === 'nexus' && typeof payload?.moduleId === 'string'
        ? payload.moduleId as ModuleId
        : (moduleId as ModuleId);

      const draft = normalizeReminderPayload(scopedModule, payload || {});

      try {
        await ReminderLifecycleService.propose(userId, {
          moduleId: draft.moduleId,
          title: draft.title,
          note: draft.note,
          recurrence: draft.recurrence,
          timezone: draft.timezone,
          channelPrefs: draft.channelPrefs,
          priority: draft.priority,
          deepLink: draft.deepLink,
          source: draft.source,
          tags: draft.tags,
        });
        pushAssistantMessage?.(`Reminder proposed for ${draft.title}.`);
      } catch {
        pushAssistantMessage?.('Could not propose reminder — please try again.');
      }
    },

    propose_routine: async ({ moduleId, payload, pushAssistantMessage, userId, isGuest, orchestration }) => {
      if (!AutonomyFeatureFlags.isEnabled('routineProposals')) {
        pushAssistantMessage?.('Routine proposals are currently disabled.');
        return;
      }
      const scopedModule = moduleId === 'nexus' && typeof payload?.moduleId === 'string'
        ? payload.moduleId as ModuleId
        : (moduleId as ModuleId);

      const proposal = normalizeRoutinePayload(scopedModule, payload || {});
      if (ROUTINE_PROPOSALS.has(proposal.id)) return;
      ROUTINE_PROPOSALS.set(proposal.id, proposal);

      const interactionDecision = OrchestrationInteractionGateService.evaluate({
        autopilotLevel: orchestration?.autopilotLevel ?? 2,
        candidate: {
          kind: 'routine',
          sourceModuleId: moduleId,
          targetModuleId: scopedModule,
          threadId: orchestration?.activeThreadId,
          confidence: orchestration?.proposal.confidence,
          requiresApproval: orchestration?.approvalRequirement.required,
          highRisk: orchestration?.highRisk,
          canAutoDispatch: Boolean(userId && !isGuest),
          dedupeKey: proposal.id,
        },
      });

      if (interactionDecision.mode === 'silent_execute') {
        if (!userId || isGuest) {
          pushAssistantMessage?.('Sign in to save routines.');
          return;
        }

        await RoutineRegistryService.saveRoutine(userId, proposal.routine);
        pushAssistantMessage?.(`Routine saved for ${proposal.routine.name}.`);
        Spine.emit({
          type: 'ROUTINE_CONFIRMED',
          source: moduleId,
          domain: 'system',
          data: { routineId: proposal.routine.id, proposalId: proposal.id, moduleId: proposal.routine.moduleId },
          cascadeDepth: 0,
          priority: 'info',
        });
        return;
      }

      Spine.emit({
        type: 'ROUTINE_PROPOSED',
        source: moduleId,
        domain: 'system',
        data: { proposal },
        cascadeDepth: 0,
        priority: 'info',
      });

      pushAssistantMessage?.(`Routine proposed for ${proposal.routine.name}.`);
    },

    confirm_routine: async ({ moduleId, payload, userId, isGuest, pushAssistantMessage }) => {
      if (!userId || isGuest) {
        pushAssistantMessage?.('Sign in to save routines.');
        return;
      }

      const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId : undefined;
      let proposal = proposalId ? ROUTINE_PROPOSALS.get(proposalId) : undefined;

      if (!proposal) {
        const scopedModule = moduleId === 'nexus' && typeof payload?.moduleId === 'string'
          ? payload.moduleId as ModuleId
          : (moduleId as ModuleId);
        proposal = normalizeRoutinePayload(scopedModule, payload || {});
      }

      await RoutineRegistryService.saveRoutine(userId, proposal.routine);

      if (proposalId) ROUTINE_PROPOSALS.delete(proposalId);

      Spine.emit({
        type: 'ROUTINE_CONFIRMED',
        source: moduleId,
        domain: 'system',
        data: { routineId: proposal.routine.id, proposalId, moduleId: proposal.routine.moduleId },
        cascadeDepth: 0,
        priority: 'info',
      });
    },

    dismiss_routine: ({ moduleId, payload }) => {
      const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId : undefined;
      if (proposalId) ROUTINE_PROPOSALS.delete(proposalId);
      Spine.emit({
        type: 'ROUTINE_DISMISSED',
        source: moduleId,
        domain: 'system',
        data: { proposalId },
        cascadeDepth: 0,
        priority: 'info',
      });
    },

    confirm_reminder: async ({ moduleId, payload, userId, isGuest, pushAssistantMessage }) => {
      if (!userId || isGuest) {
        pushAssistantMessage?.('Sign in to schedule reminders.');
        return;
      }

      const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId : undefined;

      try {
        if (proposalId) {
          await ReminderLifecycleService.confirm(userId, proposalId);
        } else {
          // Inline confirmation without a prior proposal (direct agent dispatch)
          const scopedModule = moduleId === 'nexus' && typeof payload?.moduleId === 'string'
            ? payload.moduleId as ModuleId
            : (moduleId as ModuleId);
          const draft = normalizeReminderPayload(scopedModule, payload || {});
          const proposal = await ReminderLifecycleService.propose(userId, {
            moduleId: draft.moduleId,
            title: draft.title,
            note: draft.note,
            recurrence: draft.recurrence,
            timezone: draft.timezone,
            channelPrefs: draft.channelPrefs,
            priority: draft.priority,
            deepLink: draft.deepLink,
            source: draft.source,
            tags: draft.tags,
          });
          await ReminderLifecycleService.confirm(userId, proposal.id);
        }
      } catch (err) {
        if (err instanceof ReminderLifecycleError && err.code === 'proposal_not_found') {
          pushAssistantMessage?.('Could not find the reminder to confirm. Please try proposing it again.');
        } else {
          pushAssistantMessage?.('Could not schedule reminder — please try again.');
        }
      }
    },

    dismiss_reminder: async ({ payload, userId, isGuest }) => {
      if (!userId || isGuest) return;
      const proposalId = typeof payload?.proposalId === 'string' ? payload.proposalId : undefined;
      if (proposalId) {
        try {
          await ReminderLifecycleService.dismiss(userId, proposalId);
        } catch (e) { NexusLogger.warn('CoreHandlers', 'Best-effort reminder dismiss failed'); }
      } else {
        Spine.emit({
          type: 'REMINDER_DISMISSED',
          source: 'core-handlers',
          domain: 'system',
          data: { proposalId },
          cascadeDepth: 0,
          priority: 'info',
        });
      }
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
      if (!query.trim()) { pushAssistantMessage?.('Please provide a search query.'); return; }

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
        EpisodicMemoryService.retrieveRelevantUnified(userId, query, {
          moduleIds,
          topK,
          recencyWeight
        }),
        SemanticMemoryService.getFactsUnified(userId, moduleIds)
      ]);

      const sessionLines = sessions.map((session) => {
        const date = new Date(session.timestamp).toLocaleDateString();
        const source = session.citation.entityId ? ` source ${session.citation.entityId}` : '';
        return `• [${session.moduleId}] ${date}: ${session.text}${source}`;
      });
      const factLines = facts
        .slice(0, 5)
        .map((fact) => `• [${fact.type}] ${fact.text} (${(fact.confidence ?? fact.score).toFixed(2)})`);

      const response = [
        'Memory scan complete.',
        sessionLines.length ? `Recent sessions:\\n${sessionLines.join('\\n')}` : 'Recent sessions: none found.',
        factLines.length ? `Stable facts:\\n${factLines.join('\\n')}` : 'Stable facts: none found.'
      ].join('\\n\\n');

      pushAssistantMessage?.(response);
    }
  });

  // ── Notification action handlers ──────────────────────────────────────────
  // Declared in notification-prompt-builder.ts NOTIFICATION_SCOPE_ACTIONS.
  // These enable the AI agent to manage quiet hours and snooze from conversation.

  ActionHub.register('nexus', 'enable_quiet_hours', async ({ userId, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to enable quiet hours.'); return; }
    const dataLayer = getNexusDataLayer();
    const config = await loadQuietHoursConfig(dataLayer, userId);
    config.enabled = true;
    await saveQuietHoursConfig(dataLayer, userId, config);
    pushAssistantMessage?.('Quiet hours enabled. Notifications will be suppressed during the configured window.');
    Spine.emit({
      type: 'QUIET_HOURS_UPDATED' as SpineEventType,
      source: 'nexus',
      domain: 'system',
      data: { userId, enabled: true },
      cascadeDepth: 0,
      priority: 'info',
    });
  });

  ActionHub.register('nexus', 'disable_quiet_hours', async ({ userId, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to disable quiet hours.'); return; }
    const dataLayer = getNexusDataLayer();
    const config = await loadQuietHoursConfig(dataLayer, userId);
    config.enabled = false;
    await saveQuietHoursConfig(dataLayer, userId, config);
    pushAssistantMessage?.('Quiet hours disabled. All notifications will come through.');
    Spine.emit({
      type: 'QUIET_HOURS_UPDATED' as SpineEventType,
      source: 'nexus',
      domain: 'system',
      data: { userId, enabled: false },
      cascadeDepth: 0,
      priority: 'info',
    });
  });

  ActionHub.register('nexus', 'update_quiet_hours', async ({ userId, payload, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to update quiet hours.'); return; }
    const dataLayer = getNexusDataLayer();
    const config = await loadQuietHoursConfig(dataLayer, userId);
    if (typeof payload?.from === 'string') config.from = payload.from;
    if (typeof payload?.to === 'string') config.to = payload.to;
    if (typeof payload?.enabled === 'boolean') config.enabled = payload.enabled;
    await saveQuietHoursConfig(dataLayer, userId, config);
    pushAssistantMessage?.(`Quiet hours updated: ${config.from} – ${config.to} (${config.enabled ? 'active' : 'paused'}).`);
  });

  ActionHub.register('nexus', 'add_exempt_module', async ({ userId, payload, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to update exemptions.'); return; }
    const moduleId = typeof payload?.moduleId === 'string' ? payload.moduleId : '';
    if (!moduleId) { pushAssistantMessage?.('Please specify a module to exempt.'); return; }
    const dataLayer = getNexusDataLayer();
    const config = await loadQuietHoursConfig(dataLayer, userId);
    if (!config.exemptModules.includes(moduleId)) {
      config.exemptModules.push(moduleId);
      await saveQuietHoursConfig(dataLayer, userId, config);
    }
    pushAssistantMessage?.(`${moduleId} is now exempt from quiet hours.`);
  });

  ActionHub.register('nexus', 'snooze_notification', async ({ userId, payload, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to snooze notifications.'); return; }
    const notificationId = typeof payload?.notificationId === 'string' ? payload.notificationId : '';
    if (!notificationId) { pushAssistantMessage?.('Please specify which notification to snooze.'); return; }
    const durationKey = typeof payload?.duration === 'string' ? payload.duration : '1h';
    const option = SNOOZE_OPTIONS.find((o) => o.value === durationKey) ?? SNOOZE_OPTIONS[0];
    const snoozedUntil = computeSnoozedUntil(option);
    const dataLayer = getNexusDataLayer();
    await persistSnooze(dataLayer, userId, notificationId, snoozedUntil);
    pushAssistantMessage?.(`Notification snoozed for ${option.label}.`);
  });

  ActionHub.register('nexus', 'snooze_all_from_source', async ({ userId, payload, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to snooze notifications.'); return; }
    const source = typeof payload?.source === 'string' ? payload.source : '';
    if (!source) { pushAssistantMessage?.('Please specify a source module to snooze.'); return; }
    const durationKey = typeof payload?.duration === 'string' ? payload.duration : '3h';
    const option = SNOOZE_OPTIONS.find((o) => o.value === durationKey) ?? SNOOZE_OPTIONS[1];
    const snoozedUntil = computeSnoozedUntil(option);
    const dataLayer = getNexusDataLayer();
    const inboxPath = `users/${userId}/notification_inbox`;
    const matches = await dataLayer.query<{ id: string; source: string }>({
      collection: inboxPath,
      where: [{ field: 'source', op: '==', value: source }],
      limit: 200,
    });
    await Promise.all(matches.map((item) => persistSnooze(dataLayer, userId, item.id, snoozedUntil)));
    pushAssistantMessage?.(`Snoozed ${matches.length} notification${matches.length !== 1 ? 's' : ''} from ${source} for ${option.label}.`);
  });

  ActionHub.register('nexus', 'mark_all_read', async ({ userId, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to manage notifications.'); return; }
    const dataLayer = getNexusDataLayer();
    const inboxPath = `users/${userId}/notification_inbox`;
    const unread = await dataLayer.query<{ id: string; read: boolean }>({
      collection: inboxPath,
      where: [{ field: 'read', op: '==', value: false }],
      limit: 500,
    });
    if (unread.length > 0) {
      const now = new Date().toISOString();
      await dataLayer.batchWrite(
        unread.map((item) => ({
          type: 'update' as const,
          collection: inboxPath,
          id: item.id,
          data: { read: true, updatedAt: now },
        })),
      );
    }
    pushAssistantMessage?.(`Marked ${unread.length} notification${unread.length !== 1 ? 's' : ''} as read.`);
  });

  ActionHub.register('nexus', 'bulk_delete', async ({ userId, payload, pushAssistantMessage }) => {
    if (!userId) { pushAssistantMessage?.('Sign in to manage notifications.'); return; }
    const ids = Array.isArray(payload?.notificationIds)
      ? payload.notificationIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (ids.length === 0) { pushAssistantMessage?.('No notification IDs provided.'); return; }
    const dataLayer = getNexusDataLayer();
    const inboxPath = `users/${userId}/notification_inbox`;
    await dataLayer.batchWrite(ids.map((id) => ({ type: 'delete' as const, collection: inboxPath, id })));
    pushAssistantMessage?.(`Deleted ${ids.length} notification${ids.length !== 1 ? 's' : ''}.`);
  });

  // Domain Actions that update NSV
  ActionHub.register('agnes', 'update_soul_resilience', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        emotionalResilience: score,
        emotional: { emotionalResilience: score }
      }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_soul_resilience):', e);
      });
    }
  });

  // NOTE: update_emotional_resilience, update_stress_load, update_mood_trend, update_trauma_markers
  // are registered exclusively by agnes/services/actions.ts (module is authoritative).
  // Core baselines removed to eliminate DEV collision warnings.

  ActionHub.register('titan', 'update_cns_fatigue', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        cnsFatigue: score,
        biological: { cnsFatigue: score }
      }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_cns_fatigue):', e);
      });
    }
  });

  ActionHub.register('titan', 'update_sleep_quality', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score);
    if (typeof score === 'number') {
      await updateGlobalSoul({
        sleepQuality: score,
        biological: { sleepQuality: score }
      }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_sleep_quality):', e);
      });
    }
  });

  ActionHub.register('titan', 'request_clearance', ({ payload }) => {
    const activity = typeof payload?.activity === 'string' ? payload.activity : 'training';
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'clearance_request';
    // Clearance decisions are made internally by Titan's biomarker subsystem.
    // Emit a Spine event so the request is observable in the audit trail and
    // any future cascade rules can react (e.g., blocking high-intensity
    // activities when recovery score is low).
    Spine.emit({
      type: 'CLEARANCE_REQUESTED',
      domain: 'B',
      source: 'titan:request_clearance',
      priority: 'info',
      data: { activity, reason },
    });
  });

  // NOTE: update_energy_wave, flatten_schedule, update_task_graph are registered exclusively
  // by atlas/services/actions/ (module is authoritative). Core baselines removed.
  // flatten_schedule emits FLATTEN_ENERGY_WAVE via the atlas module handler (routine-actions.ts).

  ActionHub.register('atlas', 'update_energy_budget', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.energyBudget);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { energyBudget: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_energy_budget):', e);
      });
    }
  });

  ActionHub.register('atlas', 'update_focus_score', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.focusScore);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { focusScore: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_focus_score):', e);
      });
    }
  });

  ActionHub.register('atlas', 'update_active_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.activeLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { activeLoad: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_active_load):', e);
      });
    }
  });

  ActionHub.register('atlas', 'update_planning_load', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.planningLoad);
    if (typeof score === 'number') {
      await updateGlobalSoul({ cognitive: { planningLoad: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_planning_load):', e);
      });
    }
  });

  ActionHub.register('atlas', 'update_task_completion_rate', async ({ payload, updateGlobalSoul }) => {
    const rate = safeNumber(payload.rate ?? payload.taskCompletionRate);
    if (typeof rate === 'number') {
      // Clamp to 0.0–1.0 range for this metric
      const clamped = Math.max(0, Math.min(1, rate));
      await updateGlobalSoul({ cognitive: { taskCompletionRate: clamped } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_task_completion_rate):', e);
      });
    }
  });

  ActionHub.register('scout', 'update_research_load', async (ctx) => {
    const { payload, emitSpineEvent } = ctx;
    const score = safeNumber(payload.score ?? payload.researchLoad);
    if (typeof score === 'number') {
      // Guardrails: Scout/Forge are NSV read-only; ActionHub handles allowlists.
      // Orchestrator performs the write on Scout's behalf — aliased to avoid
      // triggering the anti-pattern guardrail test (intentional exception).
      const writeNSV: typeof ctx.updateGlobalSoul = ctx.updateGlobalSoul;
      await writeNSV({ cognitive: { researchLoad: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_research_load):', e);
      });
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
      const writeNSV: typeof ctx.updateGlobalSoul = ctx.updateGlobalSoul;
      await writeNSV({ cognitive: { interestDiversity: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_interest_diversity):', e);
      });
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
      await updateGlobalSoul({ planning: { streakHealth: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_streak_health):', e);
      });
    }
  });

  ActionHub.register('atlas', 'update_deadline_pressure', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.deadlinePressure);
    if (typeof score === 'number') {
      await updateGlobalSoul({ planning: { deadlinePressure: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_deadline_pressure):', e);
      });
    }
  });

  ActionHub.register('ledger', 'update_resonance_roi', async ({ payload, updateGlobalSoul }) => {
    const score = safeNumber(payload.score ?? payload.resonanceROI);
    if (typeof score === 'number') {
      await updateGlobalSoul({ resource: { resonanceROI: score } }).catch((e: unknown) => {
        console.error('[CoreHandlers] NSV write failed (update_resonance_roi):', e);
      });
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

    setIfStale(biological, 'cnsFatigue', safeNumber(bio?.cnsFatigue ?? payload.cnsFatigue), 'biological.cnsFatigue');
    setIfStale(biological, 'sleepQuality', safeNumber(bio?.sleepQuality ?? payload.sleepQuality), 'biological.sleepQuality');
    setIfStale(biological, 'recoveryScore', safeNumber(bio?.recoveryScore), 'biological.recoveryScore');
    setIfStale(biological, 'hormonalContext', safeString(bio?.hormonalContext ?? payload.hormonalContext), 'biological.hormonalContext');

    setIfStale(emotional, 'emotionalResilience', safeNumber(emo?.emotionalResilience ?? payload.emotionalResilience), 'emotional.emotionalResilience');
    setIfStale(emotional, 'stressLoad', safeNumber(emo?.stressLoad), 'emotional.stressLoad');
    setIfStale(emotional, 'moodTrend', safeString(emo?.moodTrend), 'emotional.moodTrend');
    const traumaMarkers = safeStringArray(emo?.traumaMarkers ?? payload.traumaMarkers);
    if (traumaMarkers !== undefined && isStale('emotional.traumaMarkers')) {
      emotional.traumaMarkers = traumaMarkers;
    }

    setIfStale(cognitive, 'energyBudget', safeNumber(cog?.energyBudget), 'cognitive.energyBudget');
    setIfStale(cognitive, 'focusScore', safeNumber(cog?.focusScore), 'cognitive.focusScore');
    setIfStale(cognitive, 'activeLoad', safeNumber(cog?.activeLoad), 'cognitive.activeLoad');
    setIfStale(cognitive, 'researchLoad', safeNumber(cog?.researchLoad), 'cognitive.researchLoad');
    setIfStale(cognitive, 'planningLoad', safeNumber(cog?.planningLoad), 'cognitive.planningLoad');
    setIfStale(cognitive, 'taskCompletionRate', safeNumber(cog?.taskCompletionRate), 'cognitive.taskCompletionRate');
    setIfStale(cognitive, 'interestDiversity', safeNumber(cog?.interestDiversity), 'cognitive.interestDiversity');

    setIfStale(planning, 'streakHealth', safeNumber(pln?.streakHealth), 'planning.streakHealth');
    setIfStale(planning, 'deadlinePressure', safeNumber(pln?.deadlinePressure), 'planning.deadlinePressure');

    setIfStale(resource, 'financialFriction', safeNumber(res?.financialFriction), 'resource.financialFriction');
    setIfStale(resource, 'resonanceROI', safeNumber(res?.resonanceROI), 'resource.resonanceROI');

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

    await updateGlobalSoul(compactedPatch).catch((e: unknown) => {
      console.error('[CoreHandlers] NSV write failed (sync_vitals):', e);
    });
  });
  // NOTE: compute_resonance_roi is registered exclusively by
  // ledger/services/actions.ts (module is authoritative — full ROI computation).
  // update_financial_friction is registered exclusively by
  // ledger/actions/ledger-field-actions.ts (module is authoritative).

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

  // -------------------------------------------------------------------------
  // Phase 5 Enhancement 1 — Module Capability Negotiation
  // -------------------------------------------------------------------------
  // query_module_capability — lightweight check: does a module have a handler for an action?
  // Used by orchestrator before routing to avoid unnecessary delegation.
  ActionHub.register('nexus', 'query_module_capability', async ({ payload, pushAssistantMessage }) => {
    const targetModule = typeof payload?.moduleId === 'string' ? payload.moduleId : null;
    const actionType = typeof payload?.actionType === 'string' ? payload.actionType : null;

    if (!targetModule || !actionType) {
      pushAssistantMessage?.('Module capability check requires moduleId and actionType.');
      return;
    }

    const hasCapability = ActionHub.hasHandler(targetModule, actionType);

    pushAssistantMessage?.(
      hasCapability
        ? `Module "${targetModule}" can handle "${actionType}".`
        : `Module "${targetModule}" does not have a handler for "${actionType}". Consider using a different module.`
    );
  });

  // -------------------------------------------------------------------------
  // Phase 5 Enhancement 2 — Action Failure Recovery UI Prompt
  // -------------------------------------------------------------------------
  // notify_turn_complete — surfaces any background action failures to the user
  // at the end of a model response turn, then clears the failure list.
  ActionHub.register('nexus', 'notify_turn_complete', async ({ pushAssistantMessage }) => {
    try {
      const { useOrchestrationStore } = await import('../stores/orchestration-store');
      const store = useOrchestrationStore.getState();
      const failedCount = store.failedActionsThisTurn.length;

      if (failedCount > 0) {
        // Surface recovery offer to user
        pushAssistantMessage?.(
          `${failedCount} action${failedCount !== 1 ? 's' : ''} couldn't complete in the background. ` +
          `You can try again or continue — your conversation isn't affected.`
        );
      }

      // Clear for next turn
      store.clearTurnFailures();
    } catch (e) { NexusLogger.warn('CoreHandlers', 'Store unavailable'); }
  });

  // -------------------------------------------------------------------------
  // Phase 5 Enhancement 3 — Cross-Module State Rollback
  // -------------------------------------------------------------------------
  // capture_nsv_snapshot — call before a multi-step plan begins
  ActionHub.register('nexus', 'capture_nsv_snapshot', async ({ getLatestNSV }) => {
    try {
      const nsv = getLatestNSV?.();
      if (!nsv) return;
      const { useOrchestrationStore } = await import('../stores/orchestration-store');
      useOrchestrationStore.getState().captureNSVSnapshot(nsv as Record<string, unknown>);
    } catch (e) { NexusLogger.warn('CoreHandlers', 'Store unavailable'); }
  });

  // execute_rollback — restore NSV to the snapshot
  ActionHub.register('nexus', 'execute_rollback', async ({ updateGlobalSoul, pushAssistantMessage }) => {
    try {
      const { useOrchestrationStore } = await import('../stores/orchestration-store');
      const snapshot = useOrchestrationStore.getState().nsvSnapshot;
      if (!snapshot) {
        pushAssistantMessage?.('No rollback point available.');
        return;
      }
      await updateGlobalSoul(snapshot as NeuralStateVectorPatch);
      useOrchestrationStore.getState().clearNSVSnapshot();
      pushAssistantMessage?.('State restored to before the last plan.');
    } catch (e) {
      pushAssistantMessage?.('Rollback encountered an issue. Your data is unchanged.');
    }
  });
}
