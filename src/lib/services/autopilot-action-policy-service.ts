/**
 * Defines per-action autopilot risk thresholds.
 * Actions at or above their threshold require explicit user approval when autopilot >= threshold.
 * Lower threshold = higher risk = requires more user oversight.
 */

// Actions that should never fire silently above a certain autopilot level
const ACTION_RISK_THRESHOLDS: Record<string, number> = {
  // Crisis / medical — always require human awareness
  'crisis_flag': 2,
  'initiate_crisis_recovery_protocol': 2,
  'issue_clearance': 3,
  'end_recovery_plan': 3,

  // Destructive / irreversible
  'delete_goal': 4,
  'delete_habit': 4,
  'delete_task': 4,
  'complete_goal': 4,

  // Financial mutations
  'create_transaction': 3,
  'add_transaction': 3,
  'update_financial_plan': 4,

  // Identity / profile
  'update_global_identity': 3,
  'update_agnes_profile': 4,
  'update_titan_profile': 4,
};

export const AutopilotActionPolicyService = {
  /**
   * Returns true if the action is allowed to execute at the given autopilot level.
   * Returns false if the action requires user approval (autopilot >= threshold).
   */
  isAllowed(actionType: string, autopilotLevel: number): boolean {
    const threshold = ACTION_RISK_THRESHOLDS[actionType];
    if (threshold === undefined) return true; // unregistered = allowed
    return autopilotLevel < threshold;
  },

  getThreshold(actionType: string): number | null {
    return ACTION_RISK_THRESHOLDS[actionType] ?? null;
  },
};
