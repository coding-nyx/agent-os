import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCommand } from './__test-helpers__/parse-command';
const CommandIntelligenceService = { parse: parseCommand };
import { AraActionPlannerService } from './ara-action-planner-service';
import { AgentRegistryService } from '@/lib/agents/agent-registry';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';

describe('AraActionPlannerService', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
  });

  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('builds an ordered action plan from parsed planning commands', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const plan = AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    expect(plan).not.toBeNull();
    expect(plan?.nodes).toHaveLength(3);
    expect(plan?.primaryTargetModuleId).toBe('atlas');
    expect(plan?.nodes[1]?.supportingModuleIds).toContain('soma');
    expect(plan?.nodes[1]?.supportingModuleIds).toContain('agnes');
    expect(plan?.nodes[2]?.payload.title).toBe('cooking');
  });

  it('resolves target providers through the agent registry when route hints are absent', () => {
    const plan = AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      conversationDepth: 0,
      parsedCommand: {
        rawInput: 'help me research this topic',
        normalizedInput: 'help me research this topic',
        parserVersion: 'phase1-v1',
        sourceModuleId: 'ara',
        generatedAt: '2026-03-24T00:00:00.000Z',
        timezone: 'UTC',
        confidence: 0.81,
        temporalReferences: [],
        sharedRouteHints: [],
        requiresClarification: false,
        ambiguityReasons: [],
        intents: [
          {
            id: 'intent-1',
            rawSegment: 'help me research this topic',
            intentType: 'research',
            verb: 'research',
            mutatesState: false,
            confidence: 0.81,
            capabilities: ['research'],
            candidateModules: [],
            routeHints: [],
            dependsOn: [],
            entities: {},
            temporal: [],
          },
        ],
      },
    });

    expect(plan?.nodes[0]?.targetModuleId).toBe(AgentRegistryService.resolvePrimaryProvider(['research'])?.moduleId);
  });

  it('projects a valid plan into the existing planning suggestion surface', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const suggestion = AraActionPlannerService.buildPlanningSuggestion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion?.targetModuleId).toBe('atlas');
    expect(suggestion?.nodeCount).toBe(1);
    expect(suggestion?.prompt).toContain('Create and coordinate');
    expect(suggestion?.prompt).toContain('[ARA_ACTION_PLAN]');
    expect(suggestion?.sourceSignalIds).toContain('intent:plan_day');
  });

  it('preserves grouped-plan metadata on fused planning suggestions', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const suggestion = AraActionPlannerService.buildPlanningSuggestion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    expect(suggestion?.nodeCount).toBe(3);
    expect(suggestion?.supportingModuleIds).toContain('soma');
    expect(suggestion?.supportingModuleIds).toContain('agnes');
    expect(suggestion?.prompt).toContain('"nodes"');
    expect(suggestion?.prompt).toContain('"actionType": "propose_draft"');
  });

  it('extracts the structured execution packet and recovers the semantic raw input', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const suggestion = AraActionPlannerService.buildPlanningSuggestion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    const packet = AraActionPlannerService.extractExecutionPacket(suggestion?.prompt ?? '');
    expect(packet?.rawInput).toBe('plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow');
    expect(packet?.nodes).toHaveLength(3);
    expect(AraActionPlannerService.getSemanticInput(suggestion?.prompt ?? '')).toBe(packet?.rawInput);
  });

  it('prefers fusion for multi-intent plans targeting one primary module', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    expect(AraActionPlannerService.shouldPreferPlanningFusion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 1,
    })).toBe(true);
  });

  it('does not prefer fusion for single-intent plans', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    expect(AraActionPlannerService.shouldPreferPlanningFusion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 1,
    })).toBe(false);
  });

  it('reuses the same cached plan for repeated parsed-command planning inputs', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const first = AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });
    const second = AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    });

    expect(second).toBe(first);
  });

  it('does not create a plan when the conversation is already deep', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    const plan = AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 2,
    });

    expect(plan).toBeNull();
  });

  it('suppresses parsed-command planning when the rollout flag is disabled', () => {
    AutonomyFeatureFlags.setTestOverrides({ parsedCommandPlanning: false });

    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow',
      {
        sourceModuleId: 'ara',
        now: new Date('2026-03-24T08:00:00.000Z'),
        timezone: 'UTC',
      },
    );

    expect(AraActionPlannerService.buildActionPlan({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    })).toBeNull();

    expect(AraActionPlannerService.buildPlanningSuggestion({
      threadId: 'ara.dashboard',
      parsedCommand,
      conversationDepth: 0,
    })).toBeNull();
  });
});
