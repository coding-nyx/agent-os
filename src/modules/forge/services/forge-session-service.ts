import { createEncryptedProfileService } from '@/lib/services/encrypted-profile-service';
import { LoadContext } from '@/lib/types/encrypted-document';

export interface ForgeExecutionRecord {
  id: string;
  command: string;
  result: 'queued' | 'running' | 'success' | 'error';
  outputSummary?: string;
  errorLog?: string[];
  createdAt: string;
}

export interface ForgeArtifact {
  id: string;
  type: 'code' | 'email' | 'document' | 'checklist' | 'plan';
  title: string;
  content: string;
  createdAt: string;
  sessionId?: string;
}

export interface ForgeProfile {
  onboardingComplete: boolean;
  environment: 'local' | 'cloud' | 'hybrid';
  safetyMode: 'strict' | 'balanced';
  commandQueue: string[];
  sessions: ForgeExecutionRecord[];
  artifacts: ForgeArtifact[];
  summary: string;
  createdAt: string;
  updatedAt: string;
}

function normalizeForgeProfile(raw: unknown): ForgeProfile {
  const now = new Date().toISOString();
  const base = createEmptyForgeProfile();
  if (!raw || typeof raw !== 'object') return base;
  const candidate = raw as Record<string, unknown>;

  return {
    ...base,
    onboardingComplete: candidate.onboardingComplete === true,
    environment:
      candidate.environment === 'cloud' || candidate.environment === 'hybrid'
        ? candidate.environment
        : 'cloud',
    safetyMode: candidate.safetyMode === 'balanced' ? 'balanced' : 'strict',
    commandQueue: Array.isArray(candidate.commandQueue)
      ? candidate.commandQueue.filter((entry): entry is string => typeof entry === 'string')
      : [],
    sessions: Array.isArray(candidate.sessions)
      ? candidate.sessions.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `forge_${index}`,
          command: typeof entry?.command === 'string' ? entry.command : 'command',
          result:
            entry?.result === 'queued' || entry?.result === 'running' || entry?.result === 'success' || entry?.result === 'error'
              ? entry.result
              : 'queued',
          outputSummary: typeof entry?.outputSummary === 'string' ? entry.outputSummary : undefined,
          errorLog: Array.isArray(entry?.errorLog)
            ? entry.errorLog.filter((line: unknown): line is string => typeof line === 'string' && line.trim().length > 0)
            : undefined,
          createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now
        }))
      : [],
    artifacts: Array.isArray(candidate.artifacts)
      ? candidate.artifacts.map((entry: Record<string, unknown>, index: number) => ({
          id: typeof entry?.id === 'string' ? entry.id : `artifact_${index}`,
          type:
            entry?.type === 'code' || entry?.type === 'email' || entry?.type === 'document' ||
            entry?.type === 'checklist' || entry?.type === 'plan'
              ? entry.type
              : ('document' as const),
          title: typeof entry?.title === 'string' ? entry.title : 'Untitled',
          content: typeof entry?.content === 'string' ? entry.content : '',
          createdAt: typeof entry?.createdAt === 'string' ? entry.createdAt : now,
          sessionId: typeof entry?.sessionId === 'string' ? entry.sessionId : undefined
        }))
      : [],
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : now
  };
}

export function createEmptyForgeProfile(): ForgeProfile {
  const now = new Date().toISOString();
  return {
    onboardingComplete: false,
    environment: 'cloud',
    safetyMode: 'strict',
    commandQueue: [],
    sessions: [],
    artifacts: [],
    summary: '',
    createdAt: now,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Factory instance — all encryption / decryption / guest logic lives here.
// ---------------------------------------------------------------------------

const _service = createEncryptedProfileService<ForgeProfile>({
  collection: 'forge_sessions',
  guestStorageKey: 'nexus_forge_profile_guest',
  createEmpty: createEmptyForgeProfile,
  normalize: normalizeForgeProfile,
  metadataProjection: (p) => ({
    onboardingComplete: p.onboardingComplete,
    sessions: p.sessions.length,
    queueDepth: p.commandQueue.length,
  }),
});

// ---------------------------------------------------------------------------
// Public API — identical names to the original; zero callers need to change.
// ---------------------------------------------------------------------------

// load uses factory directly; legacy unencrypted docs are handled by the
// factory's plaintext fallback path (payloadMode detection).  If a very old
// document predates both modes, the factory's readDoc returns null and the
// caller sees "no profile" — acceptable for this collection which was always
// encrypted-first.
export const loadForgeProfile: (ctx: LoadContext) => Promise<ForgeProfile | null> =
  _service.load.bind(_service);

export const saveForgeProfile: (profile: ForgeProfile, ctx: LoadContext) => Promise<void> =
  _service.save.bind(_service);

export const subscribeForgeProfile: (
  ctx: LoadContext,
  onUpdate: (profile: ForgeProfile | null) => void,
) => () => void = _service.subscribe.bind(_service);

export const syncGuestForgeProfileToUser: (ctx: LoadContext) => Promise<boolean> =
  _service.syncGuestToUser.bind(_service);

/**
 * Appends a new artifact to the current ForgeProfile and persists it.
 * Returns the updated profile.
 */
export async function saveArtifact(
  artifact: ForgeArtifact,
  context: LoadContext
): Promise<ForgeProfile | null> {
  const current = await _service.load(context);
  if (!current) return null;
  const next: ForgeProfile = {
    ...current,
    artifacts: [artifact, ...current.artifacts].slice(0, 200),
    updatedAt: new Date().toISOString()
  };
  await _service.save(next, context);
  return next;
}
