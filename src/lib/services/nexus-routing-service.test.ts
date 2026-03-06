import { describe, it, expect } from 'vitest';
import { NexusRoutingService } from './nexus-routing-service';

describe('NexusRoutingService.classifyIntent', () => {
  it('routes therapy-related keywords to therapy module', () => {
    const result = NexusRoutingService.classifyIntent('I feel anxious about my relationship');
    expect(result.target).toBe('therapy');
    expect(result.confidence).toBe(0.72);
    expect(result.reason).toContain('matched');
  });

  it('routes training keywords to trainer module', () => {
    const result = NexusRoutingService.classifyIntent('Create a new workout plan');
    expect(result.target).toBe('trainer');
  });

  it('routes financial keywords to ledger module', () => {
    const result = NexusRoutingService.classifyIntent('Help me with my budget');
    expect(result.target).toBe('ledger');
  });

  it('routes medical keywords to soma module', () => {
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
    expect(result.target).toBe('trainer');
  });

  it('defaults to orchestrator for unmatched queries', () => {
    const result = NexusRoutingService.classifyIntent('Hello, how are you?');
    expect(result.target).toBe('orchestrator');
    expect(result.confidence).toBe(0.45);
    expect(result.reason).toBe('default_orchestrator');
  });
});

describe('NexusRoutingService.getRoute', () => {
  it('returns correct route for therapy', () => {
    expect(NexusRoutingService.getRoute('therapy')).toBe('/therapy');
  });

  it('returns correct route for orchestrator', () => {
    expect(NexusRoutingService.getRoute('orchestrator')).toBe('/orchestrator');
  });

  it('returns empty string for bridge (no page)', () => {
    expect(NexusRoutingService.getRoute('bridge')).toBe('');
  });
});
