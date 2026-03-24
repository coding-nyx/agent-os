import { describe, expect, it } from 'vitest';
import { OrchestrationInteractionAutomationService } from './orchestration-interaction-automation-service';

describe('OrchestrationInteractionAutomationService', () => {
  it('does not auto-confirm interactions at manual/proposal-first levels', () => {
    expect(
      OrchestrationInteractionAutomationService.shouldAutoConfirm({
        autopilotLevel: 2,
        kind: 'routing',
        confidence: 0.99,
      }),
    ).toBe(false);
  });

  it('requires high confidence for conditional autonomy', () => {
    expect(
      OrchestrationInteractionAutomationService.shouldAutoConfirm({
        autopilotLevel: 3,
        kind: 'routing',
        confidence: 0.84,
      }),
    ).toBe(false);

    expect(
      OrchestrationInteractionAutomationService.shouldAutoConfirm({
        autopilotLevel: 3,
        kind: 'routing',
        confidence: 0.85,
      }),
    ).toBe(true);
  });

  it('auto-confirms planning interactions at supervised autonomy and ghost', () => {
    expect(
      OrchestrationInteractionAutomationService.shouldAutoConfirm({
        autopilotLevel: 4,
        kind: 'planning',
        canAutoDispatch: true,
      }),
    ).toBe(true);

    expect(
      OrchestrationInteractionAutomationService.shouldAutoConfirm({
        autopilotLevel: 5,
        kind: 'routine',
        canAutoDispatch: true,
      }),
    ).toBe(true);
  });

  it('keeps shouldAutoConfirm false when silent dispatch is unavailable', () => {
    expect(
      OrchestrationInteractionAutomationService.shouldAutoConfirm({
        autopilotLevel: 5,
        kind: 'routing',
        canAutoDispatch: false,
      }),
    ).toBe(false);
  });
});
