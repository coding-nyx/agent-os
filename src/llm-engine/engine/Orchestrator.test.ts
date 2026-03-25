import { describe, expect, it } from 'vitest';
import { Orchestrator } from './Orchestrator';

describe('Orchestrator', () => {
  it('recovers JSON action blocks without a type attribute', () => {
    const orchestrator = new Orchestrator({ isMockMode: true });

    const response = (orchestrator as any).finalizeResponse(
      'Searching now.<action>{"type":"search_memory","payload":{"query":"sleep debt"}}</action>',
      false,
    );

    expect(response.actions).toEqual([
      {
        type: 'search_memory',
        payload: { query: 'sleep debt' },
        raw: '<action>{"type":"search_memory","payload":{"query":"sleep debt"}}</action>',
      },
    ]);
    expect(response.publicText).toBe('now.');
  });

  it('recovers bracketed action blocks and keeps them out of public text', () => {
    const orchestrator = new Orchestrator({ isMockMode: true });

    const response = (orchestrator as any).finalizeResponse(
      'Routing now. [action type="delegate_to_module"]{ "moduleId": "agnes", "note": "User invoked Agnes directly" }',
      false,
    );

    expect(response.actions).toEqual([
      {
        type: 'delegate_to_module',
        payload: {
          moduleId: 'agnes',
          note: 'User invoked Agnes directly',
        },
        raw: '[action type="delegate_to_module"]{ "moduleId": "agnes", "note": "User invoked Agnes directly" }',
      },
    ]);
    expect(response.publicText).toBe('Routing now.');
  });
});
