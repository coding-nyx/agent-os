import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandIntelligenceService } from './command-intelligence-service';
import { OrchestrationCacheService } from './orchestration-cache-service';
import { OrchestrationPerformanceService } from './orchestration-performance-service';
import { IntentParseError } from './intent-parse-error';

describe('CommandIntelligenceService', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
    OrchestrationPerformanceService.resetForTests();
  });

  it('parses a multi-intent planning utterance into ordered intents', () => {
    const now = new Date('2026-03-24T08:00:00.000-05:00');
    const result = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      { sourceModuleId: 'agnes', now, timezone: 'America/New_York' },
    );

    expect(result.intents).toHaveLength(3);
    expect(result.intents.map((intent) => intent.intentType)).toEqual([
      'plan_day',
      'recovery_day',
      'schedule_item',
    ]);
    expect(result.sharedRouteHints[0]?.moduleId).toBe('atlas');
    expect(result.intents[1]?.capabilities).toContain('recovery-planning');
    expect(result.intents[2]?.entities.title).toBe('cooking');
    expect(result.intents[2]?.entities.timeText).toBe('11:00');
    expect(result.temporalReferences.some((ref) => ref.relation === 'tomorrow')).toBe(true);
    expect(result.parserMode).toBe('phase1');
  });

  it('keeps emotional support requests agent-readable for non-planning flows', () => {
    const result = CommandIntelligenceService.parse('I feel anxious about my relationship', {
      sourceModuleId: 'atlas',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]?.intentType).toBe('emotional_support');
    expect(result.sharedRouteHints[0]?.moduleId).toBe('agnes');
  });

  it('captures explicitly mentioned agents separately from route hints', () => {
    const result = CommandIntelligenceService.parse('Agnes, I feel anxious about my relationship', {
      sourceModuleId: 'nexus',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.mentionedModuleIds).toEqual(['agnes']);
    expect(result.mentions?.[0]).toMatchObject({
      moduleId: 'agnes',
      disposition: 'vocative',
    });
    expect(result.sharedRouteHints[0]?.moduleId).toBe('agnes');
  });

  it('distinguishes consult and ownership mention phrasing', () => {
    const consult = CommandIntelligenceService.parse('Ask Soma whether tomorrow should be a rest day', {
      sourceModuleId: 'nexus',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });
    const ownership = CommandIntelligenceService.parse('Delegate to Atlas and plan my day tomorrow', {
      sourceModuleId: 'nexus',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(consult.mentions?.[0]).toMatchObject({
      moduleId: 'soma',
      disposition: 'consultative',
    });
    expect(ownership.mentions?.[0]).toMatchObject({
      moduleId: 'atlas',
      disposition: 'ownership',
    });
  });

  it('reuses cached parsing for identical inputs within the same day bucket', () => {
    const now = new Date('2026-03-24T08:00:00.000Z');

    const first = CommandIntelligenceService.parse('plan my day tomorrow', {
      sourceModuleId: 'nexus',
      now,
      timezone: 'UTC',
    });
    const second = CommandIntelligenceService.parse('plan my day tomorrow', {
      sourceModuleId: 'nexus',
      now,
      timezone: 'UTC',
    });

    expect(second).toBe(first);
    expect(OrchestrationPerformanceService.getMetrics('command-parse')).toMatchObject({
      cacheHits: 1,
      cacheMisses: 1,
    });
  });

  describe('parseWithLLM', () => {
    it('returns envelope with parserMode=llm when LLM succeeds', async () => {
      const mockGenerateJSON = vi.fn().mockResolvedValue({
        intents: [
          {
            rawSegment: 'schedule yoga at 08:00 tomorrow',
            intentType: 'schedule_item',
            verb: 'schedule',
            confidence: 0.92,
            mutatesState: true,
            capabilities: ['schedule-mutation'],
            candidateModules: ['atlas'],
            routeHints: [{ moduleId: 'atlas', confidence: 0.9, reason: 'scheduling', source: 'command_intelligence' }],
            entities: { title: 'yoga', timeText: '08:00', dateText: '2026-03-25' },
          },
        ],
        confidence: 0.92,
        ambiguityReasons: [],
      });

      const result = await CommandIntelligenceService.parseWithLLM(
        'schedule yoga at 08:00 tomorrow',
        {
          sourceModuleId: 'nexus',
          now: new Date('2026-03-24T08:00:00.000Z'),
          timezone: 'UTC',
          generateJSON: mockGenerateJSON,
        },
      );

      expect(result.parserMode).toBe('llm');
      expect(result.parserVersion).toBe('llm-v1');
      expect(mockGenerateJSON).toHaveBeenCalledOnce();
    });

    it('returns parserMode=llm-fallback when LLM returns empty intents', async () => {
      const mockGenerateJSON = vi.fn().mockResolvedValue({ intents: [], confidence: 0 });

      const result = await CommandIntelligenceService.parseWithLLM(
        'plan my day',
        {
          sourceModuleId: 'nexus',
          now: new Date('2026-03-24T08:00:00.000Z'),
          timezone: 'UTC',
          generateJSON: mockGenerateJSON,
        },
      );

      expect(result.parserMode).toBe('llm-fallback');
      expect(result.parserVersion).toBe('phase1-v1');
    });

    it('throws IntentParseError when LLM call fails', async () => {
      const mockGenerateJSON = vi.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(
        CommandIntelligenceService.parseWithLLM(
          'plan my day',
          {
            sourceModuleId: 'nexus',
            now: new Date('2026-03-24T08:00:00.000Z'),
            timezone: 'UTC',
            generateJSON: mockGenerateJSON,
          },
        ),
      ).rejects.toThrow(IntentParseError);

      await expect(
        CommandIntelligenceService.parseWithLLM(
          'plan my day',
          {
            sourceModuleId: 'nexus',
            now: new Date('2026-03-24T08:00:00.000Z'),
            timezone: 'UTC',
            generateJSON: mockGenerateJSON,
          },
        ),
      ).rejects.toMatchObject({ phase: 'llm' });
    });

    it('returns phase1 envelope when no generateJSON is provided', async () => {
      const result = await CommandIntelligenceService.parseWithLLM(
        'schedule workout',
        { sourceModuleId: 'nexus', now: new Date('2026-03-24T08:00:00.000Z'), timezone: 'UTC' },
      );

      expect(result.parserMode).toBe('phase1');
      expect(result.parserVersion).toBe('phase1-v1');
    });
  });
});


describe('CommandIntelligenceService', () => {
  beforeEach(() => {
    OrchestrationCacheService.resetForTests();
    OrchestrationPerformanceService.resetForTests();
  });

  it('parses a multi-intent planning utterance into ordered intents', () => {
    const now = new Date('2026-03-24T08:00:00.000-05:00');
    const result = CommandIntelligenceService.parse(
      'plan my day tomorrow, update tomorrow to rest, schedule cooking at 1100 tomorrow',
      { sourceModuleId: 'agnes', now, timezone: 'America/New_York' },
    );

    expect(result.intents).toHaveLength(3);
    expect(result.intents.map((intent) => intent.intentType)).toEqual([
      'plan_day',
      'recovery_day',
      'schedule_item',
    ]);
    expect(result.sharedRouteHints[0]?.moduleId).toBe('atlas');
    expect(result.intents[1]?.capabilities).toContain('recovery-planning');
    expect(result.intents[2]?.entities.title).toBe('cooking');
    expect(result.intents[2]?.entities.timeText).toBe('11:00');
    expect(result.temporalReferences.some((ref) => ref.relation === 'tomorrow')).toBe(true);
  });

  it('keeps emotional support requests agent-readable for non-planning flows', () => {
    const result = CommandIntelligenceService.parse('I feel anxious about my relationship', {
      sourceModuleId: 'atlas',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]?.intentType).toBe('emotional_support');
    expect(result.sharedRouteHints[0]?.moduleId).toBe('agnes');
  });

  it('captures explicitly mentioned agents separately from route hints', () => {
    const result = CommandIntelligenceService.parse('Agnes, I feel anxious about my relationship', {
      sourceModuleId: 'nexus',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(result.mentionedModuleIds).toEqual(['agnes']);
    expect(result.mentions?.[0]).toMatchObject({
      moduleId: 'agnes',
      disposition: 'vocative',
    });
    expect(result.sharedRouteHints[0]?.moduleId).toBe('agnes');
  });

  it('distinguishes consult and ownership mention phrasing', () => {
    const consult = CommandIntelligenceService.parse('Ask Soma whether tomorrow should be a rest day', {
      sourceModuleId: 'nexus',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });
    const ownership = CommandIntelligenceService.parse('Delegate to Atlas and plan my day tomorrow', {
      sourceModuleId: 'nexus',
      now: new Date('2026-03-24T08:00:00.000Z'),
      timezone: 'UTC',
    });

    expect(consult.mentions?.[0]).toMatchObject({
      moduleId: 'soma',
      disposition: 'consultative',
    });
    expect(ownership.mentions?.[0]).toMatchObject({
      moduleId: 'atlas',
      disposition: 'ownership',
    });
  });

  it('reuses cached parsing for identical inputs within the same day bucket', () => {
    const now = new Date('2026-03-24T08:00:00.000Z');

    const first = CommandIntelligenceService.parse('plan my day tomorrow', {
      sourceModuleId: 'nexus',
      now,
      timezone: 'UTC',
    });
    const second = CommandIntelligenceService.parse('plan my day tomorrow', {
      sourceModuleId: 'nexus',
      now,
      timezone: 'UTC',
    });

    expect(second).toBe(first);
    expect(OrchestrationPerformanceService.getMetrics('command-parse')).toMatchObject({
      cacheHits: 1,
      cacheMisses: 1,
    });
  });
});
