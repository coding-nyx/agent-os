/**
 * Shared types for Titan custom hooks.
 *
 * Kept here to break circular-import chains that would arise if each hook
 * defined its own copy of these shared primitives.
 */

export type TitanTab = 'train' | 'plan' | 'body' | 'cycles' | 'analytics' | 'recovery';

/** Gate request raised when the training-clearance or recovery system needs
 *  the user to choose between a light-recovery path and a full-training path. */
export type TrainingGateRequest = {
  onLight: () => void | Promise<void>;
  onFull: () => void | Promise<void>;
  mode: 'recovery' | 'clearance';
  message: string;
  allowOverride: boolean;
};
