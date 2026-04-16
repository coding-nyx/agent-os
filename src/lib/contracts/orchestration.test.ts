import { describe, expect, it } from 'vitest';
import type { SpineEvent } from '@/lib/types';
import {
  adaptSpineEventToSpec,
  compareAgentPrecedence,
  compareMasterThreadMessages,
  compareMasterThreadTurns,
  getAgentPrecedenceRank,
  isAutopilotLevel,
} from './orchestration';

describe('orchestration contracts', () => {
  it('validates autopilot levels', () => {
    expect(isAutopilotLevel(0)).toBe(true);
    expect(isAutopilotLevel(5)).toBe(true);
    expect(isAutopilotLevel(6)).toBe(false);
    expect(isAutopilotLevel(2.5)).toBe(false);
  });

  it('orders agents by precedence', () => {
    expect(getAgentPrecedenceRank('agnes')).toBeLessThan(getAgentPrecedenceRank('atlas'));
    expect(compareAgentPrecedence('atlas', 'ledger')).toBeLessThan(0);
    expect(compareAgentPrecedence('ara', 'agnes')).toBeGreaterThan(0);
  });

  it('sorts master thread turns and messages deterministically', () => {
    const turns = [
      {
        id: 'thread.turn.0002',
        threadId: 'thread',
        sequence: 2,
        startedBy: 'atlas' as const,
        participantIds: ['atlas'] as const,
        createdAt: '2026-03-24T00:02:00.000Z',
        updatedAt: '2026-03-24T00:02:00.000Z',
        messageIds: ['msg-2'],
      },
      {
        id: 'thread.turn.0001',
        threadId: 'thread',
        sequence: 1,
        startedBy: 'user' as const,
        participantIds: [] as const,
        createdAt: '2026-03-24T00:01:00.000Z',
        updatedAt: '2026-03-24T00:01:00.000Z',
        messageIds: ['msg-1'],
      },
    ];

    expect([...turns].sort(compareMasterThreadTurns).map((turn) => turn.id)).toEqual([
      'thread.turn.0001',
      'thread.turn.0002',
    ]);

    const messages = [
      {
        id: 'msg-reply',
        threadId: 'thread',
        author: 'atlas' as const,
        body: 'Reply',
        createdAt: '2026-03-24T00:02:00.000Z',
        participantIds: ['atlas'],
        turnId: 'thread.turn.0002',
        turnSequence: 2,
        replyToMessageId: 'msg-root',
        replyToTurnId: 'thread.turn.0001',
        rootMessageId: 'msg-root',
        rootTurnId: 'thread.turn.0001',
      },
      {
        id: 'msg-root',
        threadId: 'thread',
        author: 'user' as const,
        body: 'Root',
        createdAt: '2026-03-24T00:01:00.000Z',
        participantIds: [],
        turnId: 'thread.turn.0001',
        turnSequence: 1,
        rootMessageId: 'msg-root',
        rootTurnId: 'thread.turn.0001',
      },
    ];

    expect([...messages].sort(compareMasterThreadMessages).map((message) => message.id)).toEqual([
      'msg-root',
      'msg-reply',
    ]);
  });

  it('adapts spine events to spec-shaped events', () => {
    const event: SpineEvent = {
      id: 'evt-1',
      type: 'VITAL_UPDATED',
      source: 'spine-cascade:ledger',
      domain: 'R',
      data: {
        intent: 'reduce friction',
        mutations: { friction: -0.2, vitality: 0.1, ignored: 'x' },
        confidence: 0.9,
        patient_scope: 'GUEST',
      },
      timestamp: 10,
      cascadeDepth: 0,
      priority: 'alert',
    };

    const adapted = adaptSpineEventToSpec(event);
    expect(adapted.header.source).toBe('LEDGER');
    expect(adapted.header.priority).toBe(2);
    expect(adapted.payload.intent).toBe('reduce friction');
    expect(adapted.payload.mutations.get('friction')).toBe(-0.2);
    expect(adapted.payload.mutations.has('ignored')).toBe(false);
    expect(adapted.logic_gates.confidence).toBe(0.9);
    expect(adapted.logic_gates.patient_scope).toBe('GUEST');
  });
});
