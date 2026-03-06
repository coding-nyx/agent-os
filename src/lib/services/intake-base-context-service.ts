import { CoreUserProfile, TrainerProfile } from '@/lib/types';
import { BaseContext } from '@/modules/therapy/types';

export interface GlobalBaseIntakeContext {
  name?: string;
  pronouns?: string;
  age?: number;
  assignedSexAtBirth?: 'female' | 'male';
  genderIdentity?: string;
  occupation?: string;
  typicalSleepHours?: number;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function compact<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')
  ) as Partial<T>;
}

function mergeContexts(...contexts: Array<Partial<GlobalBaseIntakeContext> | null | undefined>): GlobalBaseIntakeContext {
  return contexts.reduce<GlobalBaseIntakeContext>((acc, ctx) => ({ ...acc, ...(ctx || {}) }), {});
}

function fromCoreProfile(profile: CoreUserProfile | null | undefined): GlobalBaseIntakeContext {
  if (!profile) return {};
  return compact({
    name: normalizeOptionalString(profile.preferredName),
    pronouns: normalizeOptionalString(profile.pronouns),
    age: normalizeOptionalNumber(profile.age),
    assignedSexAtBirth: profile.assignedSexAtBirth,
    genderIdentity: normalizeOptionalString(profile.genderIdentity),
    occupation: normalizeOptionalString(profile.occupation),
    typicalSleepHours: normalizeOptionalNumber(profile.typicalSleepHours)
  });
}

function fromTherapyContext(context: Partial<BaseContext> | null | undefined): GlobalBaseIntakeContext {
  if (!context) return {};
  const identity = context.identity;

  const name =
    typeof identity === 'string'
      ? normalizeOptionalString(identity)
      : normalizeOptionalString(identity?.name);
  const pronouns = typeof identity === 'string' ? undefined : normalizeOptionalString(identity?.pronouns);

  return compact({
    name,
    pronouns,
    occupation: normalizeOptionalString(context.occupation),
    typicalSleepHours: normalizeOptionalNumber(context.typicalSleepHours)
  });
}

function fromTrainerProfile(profile: TrainerProfile | null | undefined): GlobalBaseIntakeContext {
  if (!profile) return {};
  return compact({
    occupation:
      normalizeOptionalString(profile.activity?.occupation),
    typicalSleepHours: normalizeOptionalNumber(profile.activity?.sleepHours)
  });
}

export const IntakeBaseContextService = {
  buildForOrchestrator(profile: CoreUserProfile | null | undefined): GlobalBaseIntakeContext {
    return fromCoreProfile(profile);
  },

  buildForTherapy(params: {
    coreProfile: CoreUserProfile | null | undefined;
    therapyContext?: Partial<BaseContext> | null;
  }): GlobalBaseIntakeContext {
    return mergeContexts(
      fromCoreProfile(params.coreProfile),
      fromTherapyContext(params.therapyContext)
    );
  },

  buildForTrainer(params: {
    coreProfile: CoreUserProfile | null | undefined;
    trainerProfile?: TrainerProfile | null;
  }): GlobalBaseIntakeContext {
    return mergeContexts(
      fromCoreProfile(params.coreProfile),
      fromTrainerProfile(params.trainerProfile)
    );
  },

  buildForLedger(params: {
    coreProfile: CoreUserProfile | null | undefined;
  }): GlobalBaseIntakeContext {
    return fromCoreProfile(params.coreProfile);
  },

  buildForSoma(params: {
    coreProfile: CoreUserProfile | null | undefined;
  }): GlobalBaseIntakeContext {
    return fromCoreProfile(params.coreProfile);
  },

  buildForAtlas(params: {
    coreProfile: CoreUserProfile | null | undefined;
  }): GlobalBaseIntakeContext {
    return fromCoreProfile(params.coreProfile);
  },

  buildForScout(params: {
    coreProfile: CoreUserProfile | null | undefined;
  }): GlobalBaseIntakeContext {
    return fromCoreProfile(params.coreProfile);
  },

  buildForForge(params: {
    coreProfile: CoreUserProfile | null | undefined;
  }): GlobalBaseIntakeContext {
    return fromCoreProfile(params.coreProfile);
  },

  buildForPulse(params: {
    coreProfile: CoreUserProfile | null | undefined;
  }): GlobalBaseIntakeContext {
    return fromCoreProfile(params.coreProfile);
  },

  toCoreProfilePatch(context: Partial<GlobalBaseIntakeContext>): Partial<CoreUserProfile> {
    return compact({
      preferredName: normalizeOptionalString(context.name),
      pronouns: normalizeOptionalString(context.pronouns),
      age: normalizeOptionalNumber(context.age),
      assignedSexAtBirth:
        context.assignedSexAtBirth === 'female' || context.assignedSexAtBirth === 'male'
          ? context.assignedSexAtBirth
          : undefined,
      genderIdentity: normalizeOptionalString(context.genderIdentity),
      occupation: normalizeOptionalString(context.occupation),
      typicalSleepHours: normalizeOptionalNumber(context.typicalSleepHours)
    });
  }
};
