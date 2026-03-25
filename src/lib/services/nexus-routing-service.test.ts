import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { NexusRoutingService } from './nexus-routing-service';
import { CommandIntelligenceService } from './command-intelligence-service';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { AutonomyFeatureFlags } from './autonomy-feature-flags';

describe('NexusRoutingService.classifyIntent', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
  });

  afterEach(() => {
    AutonomyFeatureFlags.resetTestOverrides();
  });

  it('routes agnes-related keywords to agnes module', () => {
    const result = NexusRoutingService.classifyIntent('I feel anxious about my relationship');
    expect(result.target).toBe('agnes');
    expect(result.confidence).toBe(0.72);
    expect(result.reason).toContain('matched');
  });

  it('routes training keywords to titan module', () => {
    const result = NexusRoutingService.classifyIntent('Create a new workout plan');
    expect(result.target).toBe('titan');
  });

  it('routes financial keywords to ledger module', () => {
    const result = NexusRoutingService.classifyIntent('Help me with my budget');
    expect(result.target).toBe('ledger');
  });

  it('routes medical keywords to soma module (soma absorbed)', () => {
    const result = NexusRoutingService.classifyIntent('Can you check my bloodwork results?');
    expect(result.target).toBe('soma');
  });

  it('routes code keywords to forge module', () => {
    const result = NexusRoutingService.classifyIntent('I need to refactor this typescript module');
    expect(result.target).toBe('forge');
  });

  it('routes research keywords to scout module', () => {
    const result = NexusRoutingService.classifyIntent('Help me research this topic and verify facts');
    expect(result.target).toBe('scout');
  });

  it('is case-insensitive', () => {
    const result = NexusRoutingService.classifyIntent('WORKOUT PLAN');
    expect(result.target).toBe('titan');
  });

  it('defaults to nexus for unmatched queries', () => {
    const result = NexusRoutingService.classifyIntent('Hello, how are you?');
    expect(result.target).toBe('nexus');
    expect(result.confidence).toBe(0.45);
    expect(result.reason).toBe('default_nexus');
  });

  it('prefers shared command intelligence for planning-oriented multi-intent requests', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'plan my day tomorrow, schedule cooking at 1100 tomorrow',
      { sourceModuleId: 'agnes', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
    );

    const result = NexusRoutingService.classifyIntent(
      'plan my day tomorrow, schedule cooking at 1100 tomorrow',
      parsedCommand,
    );

    expect(result.target).toBe('atlas');
    expect(result.reason).toContain('command:');
  });

  it('keeps consultative mention language in Nexus control', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'Ask Soma whether tomorrow should be a rest day',
      { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
    );

    const result = NexusRoutingService.classifyIntent(
      'Ask Soma whether tomorrow should be a rest day',
      parsedCommand,
    );

    expect(result.target).toBe('nexus');
    expect(result.reason).toContain('mention:consult:');
  });

  it('treats ownership-transfer language as an explicit delegation signal', () => {
    const parsedCommand = CommandIntelligenceService.parse(
      'Delegate to Atlas and plan my day tomorrow',
      { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
    );

    const result = NexusRoutingService.classifyIntent(
      'Delegate to Atlas and plan my day tomorrow',
      parsedCommand,
    );

    expect(result.target).toBe('atlas');
    expect(result.reason).toContain('mention:ownership:');
  });

  it('falls back to capability registry when parsed command has capabilities but no route hints', () => {
    const result = NexusRoutingService.classifyIntent('help me research this topic', {
      rawInput: 'help me research this topic',
      normalizedInput: 'help me research this topic',
      parserVersion: 'phase1-v1',
      sourceModuleId: 'nexus',
      generatedAt: '2026-03-24T00:00:00.000Z',
      timezone: 'UTC',
      confidence: 0.79,
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
          confidence: 0.79,
          capabilities: ['research'],
          candidateModules: [],
          routeHints: [],
          dependsOn: [],
          entities: {},
          temporal: [],
        },
      ],
    });

    expect(result.target).toBe('scout');
    expect(result.reason).toContain('capability:');
  });

  it('falls back to legacy keyword/default routing when parsed-command routing is disabled', () => {
    AutonomyFeatureFlags.setTestOverrides({ parsedCommandRouting: false });

    const result = NexusRoutingService.classifyIntent('tomorrow 1100 cooking', {
      rawInput: 'tomorrow 1100 cooking',
      normalizedInput: 'tomorrow 1100 cooking',
      parserVersion: 'phase1-v1',
      sourceModuleId: 'nexus',
      generatedAt: '2026-03-24T00:00:00.000Z',
      timezone: 'UTC',
      confidence: 0.83,
      temporalReferences: [],
      sharedRouteHints: [
        { moduleId: 'atlas', confidence: 0.9, reason: 'scheduled planning item', source: 'command_intelligence' },
      ],
      requiresClarification: false,
      ambiguityReasons: [],
      intents: [],
    });

    expect(result.target).toBe('nexus');
    expect(result.reason).toBe('default_nexus');
  });
});

describe('NexusRoutingService.getRoute', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
  });

  it('returns correct route for agnes', () => {
    expect(NexusRoutingService.getRoute('agnes')).toBe('/agnes');
  });

  it('returns correct route for nexus', () => {
    expect(NexusRoutingService.getRoute('nexus')).toBe('/nexus');
  });

  it('returns empty string for bridge (no page)', () => {
    expect(NexusRoutingService.getRoute('bridge')).toBe('');
  });
});
