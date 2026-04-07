import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';
import type { TherapyIntakeProfile } from '@/lib/types';

export type { TherapyIntakeProfile } from '@/lib/types';

export function createEmptyAgnesProfile(): TherapyIntakeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    baseContext: {},
    createdAt: now,
    updatedAt: now
  };
}

function normalizeAgnesProfile(raw: unknown): TherapyIntakeProfile {
  const base = createEmptyAgnesProfile();
  if (!raw || typeof raw !== 'object') return base;

  const data = raw as Partial<TherapyIntakeProfile>;
  const now = new Date().toISOString();

  return {
    onboardingComplete: data.onboardingComplete === true,
    baseContext: (data.baseContext && typeof data.baseContext === 'object') ? data.baseContext : {},
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : base.createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now
  };
}

// ---------------------------------------------------------------------------
// Factory instance — all encryption / decryption / guest logic lives here.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<TherapyIntakeProfile>({
  collection: 'agnes_profiles',
  guestStorageKey: 'nexus_agnes_profile_guest',
  createEmpty: createEmptyAgnesProfile,
  normalize: normalizeAgnesProfile,
  metadataProjection: (p) => ({
    onboardingComplete: p.onboardingComplete,
  }),
});

// ---------------------------------------------------------------------------
// Public API — identical names to the original; zero callers need to change.
// ---------------------------------------------------------------------------

export const loadAgnesProfile: (ctx: LoadContext) => Promise<TherapyIntakeProfile | null> =
  _service.load.bind(_service);

export const saveAgnesProfile: (profile: TherapyIntakeProfile, ctx: LoadContext) => Promise<void> =
  _service.save.bind(_service);

export const subscribeAgnesProfile: (
  ctx: LoadContext,
  onUpdate: (profile: TherapyIntakeProfile | null) => void,
) => () => void = _service.subscribe.bind(_service);

export const syncGuestAgnesProfileToUser: (ctx: LoadContext) => Promise<boolean> =
  _service.syncGuestToUser.bind(_service);
