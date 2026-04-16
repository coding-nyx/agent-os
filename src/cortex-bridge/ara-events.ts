/** Custom DOM event names dispatched by the Ara runtime and its consumers. */
export const ARA_EVENTS = {
  MODEL_CHANGED: 'ara_model_changed',
  CREDENTIALS_CHANGED: 'ara_credentials_changed',
  OPEN: 'open-ara',
} as const;

/** localStorage keys owned by the Ara runtime. */
export const ARA_STORAGE_KEYS = {
  DEBUG_PROVIDER: 'ara_debug_provider',
  PREFERRED_MODEL: 'preferred_model',
} as const;
