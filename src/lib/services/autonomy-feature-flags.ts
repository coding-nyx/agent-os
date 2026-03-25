export type AutonomyFeatureFlag =
  | 'anticipatoryPlanning'
  | 'parsedCommandRouting'
  | 'parsedCommandPlanning'
  | 'chatActorIdentity'
  | 'reminderOutcomeFeedback'
  | 'routineProposals'
  | 'scoutExternalSignalLoop'
  | 'scoutCrossModuleQuery';

const STORAGE_KEY = 'nexus_autonomy_feature_flags';

const DEFAULT_FLAGS: Record<AutonomyFeatureFlag, boolean> = {
  anticipatoryPlanning: true,
  parsedCommandRouting: true,
  parsedCommandPlanning: true,
  chatActorIdentity: true,
  reminderOutcomeFeedback: true,
  routineProposals: true,
  scoutExternalSignalLoop: true,
  scoutCrossModuleQuery: true,
};

let testOverrides: Partial<Record<AutonomyFeatureFlag, boolean>> | null = null;

function readStoredFlags(): Partial<Record<AutonomyFeatureFlag, boolean>> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<AutonomyFeatureFlag, boolean>>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export class AutonomyFeatureFlags {
  static isEnabled(flag: AutonomyFeatureFlag): boolean {
    if (testOverrides && flag in testOverrides) {
      return testOverrides[flag] ?? DEFAULT_FLAGS[flag];
    }

    const stored = readStoredFlags();
    if (flag in stored) {
      return stored[flag] ?? DEFAULT_FLAGS[flag];
    }

    return DEFAULT_FLAGS[flag];
  }

  static setTestOverrides(overrides: Partial<Record<AutonomyFeatureFlag, boolean>>): void {
    testOverrides = overrides;
  }

  static resetTestOverrides(): void {
    testOverrides = null;
  }
}
