export const MODULE_ACTION_REGISTRY = {
  therapy: [
    'update_soul_resilience',
    'request_biometric_sync',
    'compact_session_soul'
  ],
  trainer: [
    'update_trainer_profile',
    'update_routine',
    'update_cns_fatigue',
    'update_sleep_quality'
  ],
  ledger: [
    'request_diagnostic_sync',
    'flag_neural_gap'
  ],
  orchestrator: [
    'update_global_identity',
    'sync_personality_provision'
  ]
} as const;

export type ModuleActionType = keyof typeof MODULE_ACTION_REGISTRY;
