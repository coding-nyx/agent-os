/**
 * Human-readable labels for AGNES module actions.
 * Used to provide feedback in the UI when the AI performs "silent" actions
 * without generating public text.
 */

const ACTION_LABELS: Record<string, string> = {
  // --- Titan Actions ---
  update_titan_profile: 'Updating your training profile',
  update_routine: 'Refining your workout routine',
  commit_biomarker: 'Recording new biomarker data',
  parse_lab_report: 'Analyzing laboratory panel',
  issue_clearance: 'Evaluating medical clearance',
  analyze_medical_image: 'Processing medical report/image',
  sync_vitals: 'Synchronizing neural state vectors',
  self_clearance_check: 'Performing readiness clearance check',
  parse_health_report: 'Extracting health records',
  parse_workout_log: 'Processing training logs',
  parse_biometric_data: 'Analyzing biometric stream',
  log_sleep: 'Logging sleep architecture',
  create_cycle: 'Initializing new supplement/training cycle',
  advance_cycle_phase: 'Advancing cycle to next phase',
  complete_cycle: 'Finalizing active cycle',
  log_workout_session: 'Registering completed workout session',

  // --- Agnes Actions ---
  update_agnes_profile: 'Updating therapy intake profile',
  update_belief_graph: 'Evolving cognitive belief model',
  
  // --- Atlas Actions ---
  update_energy_wave: 'Recalculating energy wave projections',
  schedule_task: 'Optimizing task schedule',
  create_habit: 'Initializing habit tracker',
  log_habit: 'Recording habit completion',
  update_goal: 'Updating strategic goal progress',
  flatten_energy_wave: 'Applying energy conservation (flattening)',
  
  // --- Ledger Actions ---
  record_transaction: 'Logging financial transaction',
  update_budget: 'Adjusting budget allocation',
  analyze_spending: 'Analyzing spending patterns',
  
  // --- Core/System Actions ---
  suggest_field: 'Suggesting a new tracking field',
  create_field: 'Creating custom tracking field',
  delete_field: 'Removing custom tracking field',
  update_field_value: 'Updating custom field data',
};

/**
 * Returns a human-readable label for a technical action type.
 * Falls back to a capitalized version of the type if no label is found.
 */
export function getActionLabel(actionType: string): string {
  if (ACTION_LABELS[actionType]) {
    return ACTION_LABELS[actionType];
  }

  // Fallback: convert snake_case to Title Case
  return actionType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
