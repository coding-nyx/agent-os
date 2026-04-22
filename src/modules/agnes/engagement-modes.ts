import { AraEngagementModesJs } from '@cortex-logic';
import type { Message, MessageContent } from '@/cortex-bridge/types';

const _engagementModes = AraEngagementModesJs ? new (AraEngagementModesJs as any)() : null;

export type AgnesEngagementMode = 'casual' | 'deep' | 'impromptu' | 'somatic';
export type AgnesPersistentEngagementMode = Exclude<AgnesEngagementMode, 'impromptu'>;
export type AgnesSessionPersistence = 'persistent' | 'ephemeral';

export interface AgnesEngagementModeDefinition {
  id: AgnesEngagementMode;
  label: string;
  shortLabel: string;
  summary: string;
  tagline: string;
  promptBlock: string;
  persistsAsDefault: boolean;
}

export interface AgnesPromptContinuity {
  previousMode?: AgnesEngagementMode;
  messageCount: number;
  recentTurns: string[];
}

export const DEFAULT_AGNES_ENGAGEMENT_MODE: AgnesPersistentEngagementMode = 'deep';
export const GUEST_AGNES_PREFERRED_MODE_KEY = 'ara_agnes_preferred_mode_guest';

export const AGNES_ENGAGEMENT_MODE_DEFINITIONS: Record<AgnesEngagementMode, AgnesEngagementModeDefinition> = {
  casual: {
    id: 'casual',
    label: 'Casual Chat',
    shortLabel: 'Casual',
    summary: 'lighter support, more conversational pacing',
    tagline: 'Present-focused support without forcing depth.',
    promptBlock: _engagementModes?.promptBlockFor('casual') ?? '',
    persistsAsDefault: true,
  },
  deep: {
    id: 'deep',
    label: 'Deep Session',
    shortLabel: 'Deep',
    summary: 'full therapeutic depth and pattern work',
    tagline: 'Structured exploration with depth, synthesis, and continuity.',
    promptBlock: _engagementModes?.promptBlockFor('deep') ?? '',
    persistsAsDefault: true,
  },
  impromptu: {
    id: 'impromptu',
    label: 'Impromptu',
    shortLabel: 'Impromptu',
    summary: 'off-the-record immediate support',
    tagline: 'Fast containment, privacy, and in-the-moment support.',
    promptBlock: _engagementModes?.promptBlockFor('impromptu') ?? '',
    persistsAsDefault: false,
  },
  somatic: {
    id: 'somatic',
    label: 'Somatic Mode',
    shortLabel: 'Somatic',
    summary: 'body-led pacing and regulation-first guidance',
    tagline: 'Body awareness, pacing, grounding, and nervous-system tracking.',
    promptBlock: _engagementModes?.promptBlockFor('somatic') ?? '',
    persistsAsDefault: true,
  },
};

export function isAgnesEngagementMode(value: unknown): value is AgnesEngagementMode {
  return typeof value === 'string' && value in AGNES_ENGAGEMENT_MODE_DEFINITIONS;
}

export function resolveAgnesEngagementMode(
  value: unknown,
  fallback: AgnesEngagementMode = DEFAULT_AGNES_ENGAGEMENT_MODE,
): AgnesEngagementMode {
  return isAgnesEngagementMode(value) ? value : fallback;
}

export function resolvePersistentAgnesMode(
  value: unknown,
  fallback: AgnesPersistentEngagementMode = DEFAULT_AGNES_ENGAGEMENT_MODE,
): AgnesPersistentEngagementMode {
  const resolved = resolveAgnesEngagementMode(value, fallback);
  return resolved === 'impromptu' ? fallback : resolved;
}

export function getPersistableAgnesMode(
  value: AgnesEngagementMode,
  fallback: AgnesPersistentEngagementMode = DEFAULT_AGNES_ENGAGEMENT_MODE,
): AgnesPersistentEngagementMode {
  return value === 'impromptu' ? fallback : value;
}

export function getAgnesSessionModeOptions(
  persistence: AgnesSessionPersistence,
): AgnesEngagementMode[] {
  return persistence === 'ephemeral'
    ? ['impromptu', 'casual', 'deep', 'somatic']
    : ['casual', 'deep', 'somatic'];
}

export function loadGuestAgnesPreferredMode(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): AgnesPersistentEngagementMode {
  if (!storage) return DEFAULT_AGNES_ENGAGEMENT_MODE;
  try {
    return resolvePersistentAgnesMode(storage.getItem(GUEST_AGNES_PREFERRED_MODE_KEY));
  } catch (error) {
    console.error('[AgnesModes] Failed to read guest preferred mode:', error);
    return DEFAULT_AGNES_ENGAGEMENT_MODE;
  }
}

export function saveGuestAgnesPreferredMode(
  mode: AgnesPersistentEngagementMode,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(GUEST_AGNES_PREFERRED_MODE_KEY, mode);
  } catch (error) {
    console.error('[AgnesModes] Failed to save guest preferred mode:', error);
  }
}

function contentToText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ');
}

function trimSnippet(text: string, limit = 140): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

export function buildAgnesPromptContinuity(
  messages: Array<Pick<Message, 'role' | 'content'>>,
  previousMode?: AgnesEngagementMode | null,
): AgnesPromptContinuity | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;

  const recentTurns = messages
    .slice(-4)
    .map((message) => {
      const text = trimSnippet(contentToText(message.content));
      if (!text) return null;
      return `${message.role}: ${text}`;
    })
    .filter((value): value is string => Boolean(value));

  if (recentTurns.length === 0) return undefined;

  return {
    previousMode: previousMode ?? undefined,
    messageCount: messages.length,
    recentTurns,
  };
}
