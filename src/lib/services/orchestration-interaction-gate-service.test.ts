import { describe, expect, it } from 'vitest';
import { OrchestrationInteractionGateService } from './orchestration-interaction-gate-service';

describe('OrchestrationInteractionGateService', () => {
  it('returns visible proposals at manual levels', () => {
    expect(
      OrchestrationInteractionGateService.evaluate({
        autopilotLevel: 2,
        candidate: {
          kind: 'routing',
          sourceModuleId: 'agnes',
          confidence: 0.99,
          canAutoDispatch: true,
        },
      }),
    ).toMatchObject({
      mode: 'visible_proposal',
      reason: 'manual_level',
      shouldPersistDraft: true,
    });
  });

  it('requires confidence thresholds for L3 and L4', () => {
    expect(
      OrchestrationInteractionGateService.evaluate({
        autopilotLevel: 3,
        candidate: {
          kind: 'routing',
          sourceModuleId: 'nexus',
          confidence: 0.84,
          canAutoDispatch: true,
        },
      }).mode,
    ).toBe('visible_proposal');

    expect(
      OrchestrationInteractionGateService.evaluate({
        autopilotLevel: 4,
        candidate: {
          kind: 'planning',
          sourceModuleId: 'nexus',
          confidence: 0.72,
          canAutoDispatch: true,
        },
      }),
    ).toMatchObject({
      mode: 'silent_execute',
      reason: 'auto_execution',
      historyMode: 'standard',
    });
  });

  it('suppresses visible interaction drafts at ghost level when silent dispatch is available', () => {
    expect(
      OrchestrationInteractionGateService.evaluate({
        autopilotLevel: 5,
        candidate: {
          kind: 'routine',
          sourceModuleId: 'nexus',
          canAutoDispatch: true,
        },
      }),
    ).toMatchObject({
      mode: 'silent_execute',
      reason: 'ghost_mode',
      historyMode: 'silent',
      shouldPersistDraft: false,
      shouldRenderHudSignal: false,
    });
  });

  it('keeps interactions visible when silent dispatch is unavailable or explicit review is required', () => {
    expect(
      OrchestrationInteractionGateService.evaluate({
        autopilotLevel: 5,
        candidate: {
          kind: 'routing',
          sourceModuleId: 'agnes',
          canAutoDispatch: false,
        },
      }),
    ).toMatchObject({
      mode: 'visible_proposal',
      reason: 'silent_unavailable',
    });

    expect(
      OrchestrationInteractionGateService.evaluate({
        autopilotLevel: 5,
        candidate: {
          kind: 'planning',
          sourceModuleId: 'nexus',
          canAutoDispatch: true,
          requiresApproval: true,
        },
      }),
    ).toMatchObject({
      mode: 'visible_proposal',
      reason: 'explicit_gate',
    });
  });
});
