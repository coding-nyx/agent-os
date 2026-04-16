import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionHub, type ActionContext } from './action-hub';
import { registerCoreActions } from './core-handlers';
import { CoreProfileService } from '@/lib/services/core-profile-service';
import { Spine } from '@/lib/spine/spine-event-bus';

function makeContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    userId: 'user-1',
    isGuest: false,
    moduleId: 'ara',
    payload: {},
    emitSpineEvent: vi.fn(),
    updateGlobalSoul: vi.fn().mockResolvedValue(undefined),
    delegateToModule: vi.fn(),
    ...overrides,
  };
}

describe('core-handlers Phase 4 Ara actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerCoreActions();
  });

  it('persists orchestrator intake profile fields', async () => {
    const updateProfile = vi.spyOn(CoreProfileService, 'updateProfile').mockResolvedValue(undefined);
    const markProfileDirty = vi.fn();

    const executed = await ActionHub.execute('ara', 'update_orchestrator_intake', makeContext({
      payload: {
        preferredName: ' Alice ',
        pronouns: ' she/her ',
        age: 28,
        assignedSexAtBirth: 'female',
        occupation: ' Engineer ',
        typicalSleepHours: 7.5,
      },
      markProfileDirty,
    }));

    expect(executed).toBe(true);
    expect(updateProfile).toHaveBeenCalledWith('user-1', {
      preferredName: 'Alice',
      pronouns: 'she/her',
      age: 28,
      assignedSexAtBirth: 'female',
      occupation: 'Engineer',
      typicalSleepHours: 7.5,
    });
    expect(markProfileDirty).toHaveBeenCalledTimes(1);
  });

  it('marks onboarding complete through the Ara completion action', async () => {
    const updateProfile = vi.spyOn(CoreProfileService, 'updateProfile').mockResolvedValue(undefined);
    const markProfileDirty = vi.fn();

    const executed = await ActionHub.execute(
      'ara',
      'complete_orchestrator_onboarding',
      makeContext({ markProfileDirty }),
    );

    expect(executed).toBe(true);
    expect(updateProfile).toHaveBeenCalledWith('user-1', { onboardingComplete: true });
    expect(markProfileDirty).toHaveBeenCalledTimes(1);
  });

  it('emits join lifecycle events around query_module consultations', async () => {
    const spineEmit = vi.spyOn(Spine, 'emit');
    const pushAssistantMessage = vi.fn();
    const emitThreadArtifact = vi.fn();
    const sendMessage = vi.fn().mockResolvedValue({
      response: {
        publicText: 'Focus is compromised by overload.',
        privateText: '',
        actions: [],
      },
      updatedHistory: [],
    });

    const executed = await ActionHub.execute('ara', 'query_module', makeContext({
      payload: {
        moduleId: 'atlas',
        question: 'What is the main planning bottleneck?',
      },
      sendMessage,
      pushAssistantMessage,
      emitThreadArtifact,
    }));

    expect(executed).toBe(true);
    expect(spineEmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MODULE_DELEGATED',
      source: 'ara',
      target: 'atlas',
      data: expect.objectContaining({ reason: 'query_module' }),
    }));
    expect(spineEmit).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MODULE_DELEGATED',
      source: 'atlas',
      target: 'ara',
      data: expect.objectContaining({ reason: 'query_result' }),
    }));
    expect(pushAssistantMessage).toHaveBeenCalledWith(expect.stringContaining('Specialist Report: Atlas'));
    expect(emitThreadArtifact).toHaveBeenCalledWith(expect.objectContaining({
      targetModuleId: 'atlas',
      mode: 'state_only',
      status: 'completed',
      responseText: 'Focus is compromised by overload.',
    }));
  });
});
