import type { ParsedCommandEnvelope, ParsedCommandIntent } from '@/lib/contracts/command-intelligence';
import type { NexusActionPlan, NexusActionPlanExecutionPacket, NexusActionPlanNode } from '@/lib/contracts/nexus-action-plan';
import type { ModuleId } from '@/lib/module-manifest';
import type { ThreadPlanningSuggestionDraft } from '@/lib/stores/orchestration-store';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { FLOW_REGISTRY } from '@/lib/flow-registry/registry';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';
import { OrchestrationRolloutService } from './orchestration-rollout-service';
import { NexusActionDispatchService } from './nexus-action-dispatch-service';

interface BuildActionPlanInput {
  threadId: string;
  parsedCommand: ParsedCommandEnvelope | null;
  conversationDepth: number;
}

interface BuildActionPlanAnalysis {
  plan: NexusActionPlan | null;
  attempted: boolean;
}

const ACTION_PLAN_START_MARKER = '[NEXUS_ACTION_PLAN]';
const ACTION_PLAN_END_MARKER = '[/NEXUS_ACTION_PLAN]';

/**
 * Intent types where Scout's knowledge base can meaningfully enrich the response.
 * When any of these intents appear, Scout is added as a supporting module.
 */
const KNOWLEDGE_ADJACENT_INTENTS = new Set([
  'create_workout_plan',
  'create_medical_review',
  'create_financial_plan_request',
  'create_research_request',
  'create_general_request',
  'fitness',
  'medical',
  'research',
]);

const DRAFT_ACTION_TYPES = new Set([
  'create_emotional_support_session',
  'create_workout_plan',
  'create_medical_review',
  'create_financial_plan_request',
  'create_research_request',
  'create_technical_task',
  'create_general_request',
]);

function sentenceCase(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function toDateTimeString(dateText?: string, timeText?: string): string | undefined {
  if (!dateText && !timeText) return undefined;
  if (dateText && timeText) return `${dateText}T${timeText}:00`;
  if (dateText) return dateText;
  return undefined;
}

function buildDraftPayload(intent: ParsedCommandIntent, targetModuleId: ModuleId): Record<string, unknown> {
  return {
    title: `Draft: ${sentenceCase(intent.intentType.replace(/_/g, ' '))}`,
    summary: intent.rawSegment,
    target: targetModuleId,
    intentType: intent.intentType,
    rawSegment: intent.rawSegment,
    entities: intent.entities,
    temporal: intent.temporal,
  };
}

function summarizeTemporal(intent: ParsedCommandIntent): string {
  const date = intent.entities.dateText;
  const time = intent.entities.timeText;
  if (date && time) return `${date} at ${time}`;
  if (date) return date;
  if (time) return time;
  return 'current context';
}

export function serializeExecutionPacket(
  packet: NexusActionPlanExecutionPacket,
  options?: {
    instruction?: string;
    footer?: string;
  },
): string {
  return [
    options?.instruction ?? `Coordinate the following action plan for the user's request: "${packet.rawInput}"`,
    '',
    ACTION_PLAN_START_MARKER,
    JSON.stringify(packet, null, 2),
    ACTION_PLAN_END_MARKER,
    ...(options?.footer ? ['', options.footer] : []),
  ].join('\n');
}

function buildPrompt(plan: NexusActionPlan): string {
  const executionPacket: NexusActionPlanExecutionPacket = {
    type: 'nexus_action_plan',
    version: 1,
    planId: plan.id,
    sourceThreadId: plan.sourceThreadId,
    title: plan.title,
    summary: plan.summary,
    rawInput: plan.parsedCommand.rawInput,
    primaryTargetModuleId: plan.primaryTargetModuleId,
    supportingTargetModuleIds: plan.supportingTargetModuleIds,
    requiresApproval: plan.requiresApproval,
    nodes: plan.nodes.map((node) => ({
      id: node.id,
      intentId: node.intentId,
      intentType: node.intentType,
      label: node.label,
      summary: node.summary,
      targetModuleId: node.targetModuleId,
      supportingModuleIds: node.supportingModuleIds,
      actionType: node.actionType,
      mutatesState: node.mutatesState,
      canRunInParallel: node.canRunInParallel,
      dependsOn: node.dependsOn,
      payload: node.payload,
    })),
    dispatchPlan: NexusActionDispatchService.resolvePlan(plan),
  };
  const stepLines = plan.nodes.map((node, index) => {
    const support = node.supportingModuleIds.length > 0
      ? ` Support from ${node.supportingModuleIds.join(', ')}.`
      : '';
    return `${index + 1}. ${node.label}: ${node.summary}.${support}`;
  });

  return [
    `Create and coordinate the following action plan for the user request: "${plan.parsedCommand.rawInput}"`,
    '',
    `Primary target: ${plan.primaryTargetModuleId}`,
    `Approval required: ${plan.requiresApproval ? 'yes' : 'no'}`,
    '',
    'Ordered steps:',
    ...stepLines,
    '',
    serializeExecutionPacket(executionPacket),
    '',
    'Keep the plan grounded in the user request, preserve the requested order, and explicitly call out any ambiguity before executing changes.',
  ].join('\n');
}

function dedupeModules(modules: ModuleId[]): ModuleId[] {
  return Array.from(new Set(modules));
}

function resolveIntentModules(intent: ParsedCommandIntent): {
  targetModuleId: ModuleId;
  supportingModuleIds: ModuleId[];
} {
  const primaryHint = intent.routeHints[0];
  const preferredModuleIds = dedupeModules([
    ...intent.routeHints.map((hint) => hint.moduleId),
    ...intent.candidateModules,
  ]);
  const providers = AgentRegistryService.resolveProvidersForCapabilities(intent.capabilities, {
    preferredModuleIds,
  });
  const targetModuleId =
    primaryHint?.moduleId ??
    providers[0]?.moduleId ??
    intent.candidateModules[0] ??
    'nexus';

  const baseSupportingModuleIds = dedupeModules([
    ...providers.slice(1).map((provider) => provider.moduleId).filter((moduleId): moduleId is ModuleId => moduleId !== 'nexus'),
    ...intent.candidateModules.filter((moduleId) => moduleId !== targetModuleId),
  ]);

  // Add Scout as a supporting module for knowledge-adjacent intents when it
  // isn't already the primary target. Scout enriches answers with its KB + web.
  const shouldEnrichWithScout =
    KNOWLEDGE_ADJACENT_INTENTS.has(intent.intentType) &&
    targetModuleId !== 'scout' &&
    !baseSupportingModuleIds.includes('scout');

  const supportingModuleIds = shouldEnrichWithScout
    ? dedupeModules([...baseSupportingModuleIds, 'scout'])
    : baseSupportingModuleIds;

  return { targetModuleId, supportingModuleIds };
}

function buildNode(intent: ParsedCommandIntent): NexusActionPlanNode {
  const { targetModuleId: resolvedTarget, supportingModuleIds: resolvedSupporting } = resolveIntentModules(intent);
  const registryIntent = FLOW_REGISTRY.intents.find((entry) => entry.intentType === intent.intentType);
  const targetModuleId = registryIntent?.primaryModule ?? resolvedTarget;
  const supportingModuleIds = dedupeModules([
    ...resolvedSupporting,
    ...(registryIntent?.supportingModules ?? []),
  ].filter((moduleId): moduleId is ModuleId => moduleId !== targetModuleId));
  let mappedActionType = registryIntent?.defaultActionTypes?.[0];
  if (mappedActionType) {
    const actionSpec = FLOW_REGISTRY.actions.find((action) =>
      action.actionType === mappedActionType && action.moduleId === targetModuleId,
    );
    if (!actionSpec || actionSpec.status === 'planned') {
      mappedActionType = 'propose_draft';
    }
  }
  const temporalSummary = summarizeTemporal(intent);

  if (mappedActionType === 'propose_draft') {
    return {
      id: `${intent.id}.node.propose-draft`,
      intentId: intent.id,
      intentType: intent.intentType,
      label: sentenceCase(intent.rawSegment),
      summary: `Draft proposal for ${temporalSummary}`,
      targetModuleId,
      supportingModuleIds,
      actionType: 'propose_draft',
      mutatesState: false,
      canRunInParallel: false,
      dependsOn: [...intent.dependsOn],
      payload: buildDraftPayload(intent, targetModuleId),
    };
  }

  switch (intent.intentType) {
    case 'plan_day':
      return {
        id: `${intent.id}.node.plan-day`,
        intentId: intent.id,
        intentType: intent.intentType,
        label: 'Plan the day',
        summary: `Build or revise the day plan for ${temporalSummary}`,
        targetModuleId,
        supportingModuleIds,
        actionType: mappedActionType ?? 'plan_day',
        mutatesState: mappedActionType ? !DRAFT_ACTION_TYPES.has(mappedActionType) : true,
        canRunInParallel: false,
        dependsOn: [...intent.dependsOn],
        payload: {
          date: intent.entities.dateText,
          time: intent.entities.timeText,
          sourceSegment: intent.rawSegment,
        },
      };
    case 'schedule_item':
      if (mappedActionType === 'schedule_block') {
        return {
          id: `${intent.id}.node.schedule-block`,
          intentId: intent.id,
          intentType: intent.intentType,
          label: `Schedule ${intent.entities.title ?? 'item'}`,
          summary: `Add "${intent.entities.title ?? 'item'}" to the plan for ${temporalSummary}`,
          targetModuleId,
          supportingModuleIds,
          actionType: 'schedule_block',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [...intent.dependsOn],
          payload: {
            title: intent.entities.title,
            scheduledAt: toDateTimeString(intent.entities.dateText, intent.entities.timeText),
            duration: 60,
            category: 'other',
            sourceSegment: intent.rawSegment,
          },
        };
      }
      if (mappedActionType === 'create_task') {
        return {
          id: `${intent.id}.node.create-task`,
          intentId: intent.id,
          intentType: intent.intentType,
          label: `Schedule ${intent.entities.title ?? 'item'}`,
          summary: `Add "${intent.entities.title ?? 'item'}" to the plan for ${temporalSummary}`,
          targetModuleId,
          supportingModuleIds,
          actionType: 'create_task',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [...intent.dependsOn],
          payload: {
            title: intent.entities.title,
            deadline: toDateTimeString(intent.entities.dateText, intent.entities.timeText),
            sourceSegment: intent.rawSegment,
          },
        };
      }
      return {
        id: `${intent.id}.node.schedule-item`,
        intentId: intent.id,
        intentType: intent.intentType,
        label: `Schedule ${intent.entities.title ?? 'item'}`,
        summary: `Add "${intent.entities.title ?? 'item'}" to the plan for ${temporalSummary}`,
        targetModuleId,
        supportingModuleIds,
        actionType: mappedActionType ?? 'schedule_item',
        mutatesState: true,
        canRunInParallel: false,
        dependsOn: [...intent.dependsOn],
        payload: {
          title: intent.entities.title,
          date: intent.entities.dateText,
          time: intent.entities.timeText,
          sourceSegment: intent.rawSegment,
        },
      };
    case 'recovery_day':
      if (mappedActionType === 'flatten_schedule') {
        return {
          id: `${intent.id}.node.flatten-schedule`,
          intentId: intent.id,
          intentType: intent.intentType,
          label: 'Shift the plan to recovery',
          summary: `Update the schedule to a recovery/rest posture for ${temporalSummary}`,
          targetModuleId,
          supportingModuleIds,
          actionType: 'flatten_schedule',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [...intent.dependsOn],
          payload: {
            flattenedUntil: toDateTimeString(intent.entities.dateText, intent.entities.timeText) ?? new Date().toISOString(),
            reason: intent.entities.status ?? 'rest',
            sourceSegment: intent.rawSegment,
          },
        };
      }
      if (mappedActionType === 'create_recovery_window') {
        const start = toDateTimeString(intent.entities.dateText, intent.entities.timeText) ?? new Date().toISOString();
        const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        return {
          id: `${intent.id}.node.recovery-window`,
          intentId: intent.id,
          intentType: intent.intentType,
          label: 'Shift the plan to recovery',
          summary: `Update the schedule to a recovery/rest posture for ${temporalSummary}`,
          targetModuleId,
          supportingModuleIds,
          actionType: 'create_recovery_window',
          mutatesState: true,
          canRunInParallel: false,
          dependsOn: [...intent.dependsOn],
          payload: {
            title: 'Recovery Window',
            start,
            end,
            reason: intent.entities.status ?? 'rest',
            status: 'planned',
            sourceSegment: intent.rawSegment,
          },
        };
      }
      return {
        id: `${intent.id}.node.recovery-day`,
        intentId: intent.id,
        intentType: intent.intentType,
        label: 'Shift the plan to recovery',
        summary: `Update the schedule to a recovery/rest posture for ${temporalSummary}`,
        targetModuleId,
        supportingModuleIds: dedupeModules(
          ['agnes', 'soma', ...supportingModuleIds].filter(
            (moduleId): moduleId is ModuleId => moduleId !== 'nexus' && moduleId !== targetModuleId,
          ),
        ),
        actionType: mappedActionType ?? 'recovery_day',
        mutatesState: true,
        canRunInParallel: false,
        dependsOn: [...intent.dependsOn],
        payload: {
          status: intent.entities.status ?? 'rest',
          date: intent.entities.dateText,
          time: intent.entities.timeText,
          sourceSegment: intent.rawSegment,
        },
      };
    case 'update_schedule':
      return {
        id: `${intent.id}.node.update-schedule`,
        intentId: intent.id,
        intentType: intent.intentType,
        label: 'Update the schedule',
        summary: `Revise the plan for ${temporalSummary}`,
        targetModuleId,
        supportingModuleIds,
        actionType: mappedActionType ?? 'update_schedule',
        mutatesState: true,
        canRunInParallel: false,
        dependsOn: [...intent.dependsOn],
        payload: {
          date: intent.entities.dateText,
          time: intent.entities.timeText,
          sourceSegment: intent.rawSegment,
        },
      };
    default:
      return {
        id: `${intent.id}.node.generic`,
        intentId: intent.id,
        intentType: intent.intentType,
        label: sentenceCase(intent.rawSegment),
        summary: `Handle the request in ${temporalSummary}`,
        targetModuleId,
        supportingModuleIds,
        actionType: mappedActionType ?? intent.intentType,
        mutatesState: mappedActionType ? !DRAFT_ACTION_TYPES.has(mappedActionType) : intent.mutatesState,
        canRunInParallel: false,
        dependsOn: [...intent.dependsOn],
        payload: {
          sourceSegment: intent.rawSegment,
        },
      };
  }
}

export class NexusActionPlannerService {
  static extractExecutionPacket(input: string): NexusActionPlanExecutionPacket | null {
    const startIndex = input.indexOf(ACTION_PLAN_START_MARKER);
    const endIndex = input.indexOf(ACTION_PLAN_END_MARKER);
    if (startIndex < 0 || endIndex <= startIndex) return null;

    const jsonPayload = input
      .slice(startIndex + ACTION_PLAN_START_MARKER.length, endIndex)
      .trim();

    if (!jsonPayload) return null;

    try {
      const parsed = JSON.parse(jsonPayload) as Partial<NexusActionPlanExecutionPacket>;
      if (
        parsed.type !== 'nexus_action_plan' ||
        parsed.version !== 1 ||
        typeof parsed.rawInput !== 'string' ||
        !Array.isArray(parsed.nodes)
      ) {
        return null;
      }
      return parsed as NexusActionPlanExecutionPacket;
    } catch {
      return null;
    }
  }

  static getSemanticInput(input: string): string {
    return this.extractExecutionPacket(input)?.rawInput.trim() || input;
  }

  private static analyzeActionPlan(input: BuildActionPlanInput): BuildActionPlanAnalysis {
    const parsedCommand = input.parsedCommand;
    if (!AutonomyFeatureFlags.isEnabled('parsedCommandPlanning')) {
      return { plan: null, attempted: false };
    }
    if (input.conversationDepth > 1) {
      return { plan: null, attempted: false };
    }
    if (!parsedCommand) {
      return { plan: null, attempted: false };
    }
    if (parsedCommand.requiresClarification) {
      return { plan: null, attempted: false };
    }
    if (parsedCommand.intents.length === 0) {
      return { plan: null, attempted: false };
    }

    const cacheKey = [
      input.threadId,
      input.conversationDepth,
      parsedCommand.parserVersion,
      parsedCommand.normalizedInput,
      parsedCommand.confidence,
      parsedCommand.intents.map((intent) => `${intent.intentType}:${intent.rawSegment}`).join('|'),
    ].join('|');

    const plan = OrchestrationCacheService.remember('planning-suggestion', cacheKey, () => {
      const nodes = parsedCommand.intents.map(buildNode);

      if (nodes.length === 0) {
        return null;
      }

      const primaryTargetModuleId = nodes[0]?.targetModuleId ?? 'atlas';
      const supportingTargetModuleIds = dedupeModules(
        nodes.flatMap((node) => [node.targetModuleId, ...node.supportingModuleIds]).filter((moduleId) => moduleId !== primaryTargetModuleId),
      );

      const title = nodes.length === 1
        ? nodes[0].label
        : `Coordinate ${nodes.length} ${primaryTargetModuleId === 'atlas' ? 'Atlas ' : ''}planning steps`;

      const summary = nodes
        .map((node) => node.summary)
        .slice(0, 3)
        .join('; ');

      const plan = {
        id: `${input.threadId}.action-plan.parsed-command`,
        sourceThreadId: input.threadId,
        parsedCommand,
        title,
        summary,
        primaryTargetModuleId,
        supportingTargetModuleIds,
        requiresApproval: nodes.some((node) => node.mutatesState),
        nodes,
      };
      return plan;
    });
    return { plan, attempted: true };
  }

  static buildActionPlan(input: BuildActionPlanInput): NexusActionPlan | null {
    const analysis = this.analyzeActionPlan(input);
    OrchestrationRolloutService.recordPlanningAttempt(analysis.plan !== null);
    return analysis.plan;
  }

  static shouldPreferPlanningFusion(input: BuildActionPlanInput): boolean {
    const analysis = this.analyzeActionPlan(input);
    const plan = analysis.plan;
    if (!analysis.attempted || !plan) return false;
    if (plan.nodes.length < 2) return false;

    return plan.nodes.every((node) => node.targetModuleId === plan.primaryTargetModuleId);
  }

  static buildPlanningSuggestion(input: BuildActionPlanInput): ThreadPlanningSuggestionDraft | null {
    const plan = this.buildActionPlan(input);
    if (!plan) return null;

    const sourceSignalIds = [
      `parsed-command:${plan.parsedCommand.parserVersion}`,
      ...plan.nodes.map((node) => `intent:${node.intentType}`),
      ...plan.supportingTargetModuleIds.map((moduleId) => `support:${moduleId}`),
    ];

    return {
      id: `${input.threadId}.planning.parsed-command`,
      title: plan.title,
      summary: plan.summary,
      prompt: buildPrompt(plan),
      confidence: plan.parsedCommand.confidence,
      state: 'draft',
      targetModuleId: plan.primaryTargetModuleId,
      nodeCount: plan.nodes.length,
      supportingModuleIds: plan.supportingTargetModuleIds,
      sourceSignalIds,
    };
  }
}
