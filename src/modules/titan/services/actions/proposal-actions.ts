import { ActionHandler } from './shared';

export const proposalHandlers: Record<string, ActionHandler> = {
  propose_routine: async (context) => {
    context.emitSpineEvent('TITAN_PROPOSAL', {
      type: 'routine_proposal',
      intent: 'request_routine',
      generatedData: context.payload,
      message: context.payload.message ?? 'New routine proposal',
      actions: [
        { label: 'Save Routine', handler: 'update_routine' },
        { label: 'Cancel', handler: 'dismissProposal', variant: 'ghost' }
      ]
    });
    context.pushAssistantMessage?.(`Proposed a new routine.`);
  },

  propose_sleep_log: async (context) => {
    context.emitSpineEvent('TITAN_PROPOSAL', {
      type: 'sleep_log_proposal',
      intent: 'log_sleep',
      generatedData: context.payload,
      message: context.payload.message ?? 'Sleep log proposal',
      actions: [
        { label: 'Log Sleep', handler: 'log_sleep' },
        { label: 'Cancel', handler: 'dismissProposal', variant: 'ghost' }
      ]
    });
    context.pushAssistantMessage?.(`Proposed a new sleep log.`);
  },

  propose_workout_log: async (context) => {
    context.emitSpineEvent('TITAN_PROPOSAL', {
      type: 'workout_log_proposal',
      intent: 'log_workout_session',
      generatedData: context.payload,
      message: context.payload.message ?? 'Workout log proposal',
      actions: [
        { label: 'Log Workout', handler: 'log_workout_session' },
        { label: 'Cancel', handler: 'dismissProposal', variant: 'ghost' }
      ]
    });
    context.pushAssistantMessage?.(`Proposed a new workout log.`);
  }
};