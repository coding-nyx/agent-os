import { AutopilotActionPolicyServiceJs } from '@cortex-logic';

const _service = new AutopilotActionPolicyServiceJs();

export const AutopilotActionPolicyService = {
  /**
   * Returns true if the action is allowed to execute at the given autopilot level.
   * Returns false if the action requires user approval (autopilot >= threshold).
   */
  isAllowed(actionType: string, autopilotLevel: number): boolean {
    return _service.isAllowed(actionType, autopilotLevel);
  },

  getThreshold(actionType: string): number | null {
    return _service.getThreshold(actionType);
  },
};
