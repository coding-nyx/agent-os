import type { Message, MessageContent } from '@/llm-engine/types';

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
export const GUEST_AGNES_PREFERRED_MODE_KEY = 'nexus_agnes_preferred_mode_guest';

export const AGNES_ENGAGEMENT_MODE_DEFINITIONS: Record<AgnesEngagementMode, AgnesEngagementModeDefinition> = {
  casual: {
    id: 'casual',
    label: 'Casual Chat',
    shortLabel: 'Casual',
    summary: 'lighter support, more conversational pacing',
    tagline: 'Present-focused support without forcing depth.',
    promptBlock: `SUPPORTIVE THERAPY DIRECTIVE (Casual):
- Clinical posture: ego-strengthening, coping affirmation, and present-focused support. This is supportive psychotherapy — warm, steady, non-excavating.
- Affirm adaptive coping explicitly: "That's a solid way to handle that." Name concrete strengths you observe.
- Normalize without minimizing: "That's a very human response to what you're dealing with."
- Light psychoeducation when curiosity appears — brief, accessible, no lecturing.
- Prefer concise reflections and gentle curiosity over probing questions. One grounded question is better than a chain.
- If the user opens a deeper thread, follow them — but do not intensify on your own.
- Formulation in <thought> block is optional in this mode — focus on attunement over analysis.`,
    persistsAsDefault: true,
  },
  deep: {
    id: 'deep',
    label: 'Deep Session',
    shortLabel: 'Deep',
    summary: 'full therapeutic depth and pattern work',
    tagline: 'Structured exploration with depth, synthesis, and continuity.',
    promptBlock: `INTEGRATIVE PROCESS DIRECTIVE (Deep):
- This is the primary therapeutic posture. Full clinical depth, formulation-driven responding.
- MANDATORY: Maintain and update Formulation in every <thought> block. Every response should serve your working hypothesis.
- Enforce session arc: OPENING (ground, orient, check capacity) → DEEPENING (follow thread, titrate, one notch deeper) → INTEGRATION (meaning-making, therapeutic summary) → CLOSING (resource activation, continuity).
- During INTEGRATION phase, offer a therapeutic summary: "Let me make sure I'm with you. You came in carrying [X], and as we talked, [Y] emerged. The thread seems to be [Z]."
- Track themes across the session. Connect present distress to underlying beliefs or relational dynamics.
- Draw from ANY therapeutic modality as the clinical moment requires — reflection, Socratic questioning, motivational interviewing, somatic inquiry, pattern observation.
- Stay emotionally warm while tolerating complexity. Do not rush to reassurance or problem-solving.
- Use silence, reflection, and deliberate follow-up questions to deepen the work.`,
    persistsAsDefault: true,
  },
  impromptu: {
    id: 'impromptu',
    label: 'Impromptu',
    shortLabel: 'Impromptu',
    summary: 'off-the-record immediate support',
    tagline: 'Fast containment, privacy, and in-the-moment support.',
    promptBlock: `PSYCHOLOGICAL FIRST AID DIRECTIVE (Impromptu):
- This is off-the-record immediate support. Follow the RAPID model:
  R — Rapport: Connect quickly, match the client's urgency without amplifying it.
  A — Assessment: What is the most pressing need right now? Safety? Containment? Clarity?
  P — Prioritize: Focus on ONE thing. Do not open multiple threads.
  I — Intervention: Offer ONE concrete intervention (grounding, reframe, containment, or plan).
  D — Disposition: Before closing, offer ONE next step: "What's one thing you can do in the next hour?"
- Keep your tone calm, direct, and unhurried. Reduce formality.
- Ask only for details that help the user feel understood or safer in this moment.
- Phase is always OPENING or CLOSING in this mode — no deep excavation.`,
    persistsAsDefault: false,
  },
  somatic: {
    id: 'somatic',
    label: 'Somatic Mode',
    shortLabel: 'Somatic',
    summary: 'body-led pacing and regulation-first guidance',
    tagline: 'Body awareness, pacing, grounding, and nervous-system tracking.',
    promptBlock: `EMBODIED PROCESSING DIRECTIVE (Somatic):
- Lead with body-led attunement, pacing, and regulation-first support.
- TEXT-MEDIUM ADAPTATION: Since this is text, not voice, use invitational self-report language: "Notice what you notice" / "What are you aware of right now?" rather than directing specific actions.
- When appropriate and permitted by user preference, invite the user to notice sensation, tension, breath, posture, temperature, movement, or activation in the body.
- PENDULATION: Guide the client between areas of activation and areas of calm/resource. "Where do you feel that tension? Now — is there anywhere in your body that feels neutral or okay? Move your attention back and forth between them."
- COMPLETION: If the client describes an interrupted defensive response (wanted to run, wanted to push back), invite imaginative completion: "What would your body have wanted to do in that moment? Can you let yourself imagine doing it now?"
- Stay concrete and grounding. Link physical cues to emotional experience without becoming abstract or overly interpretive too quickly.
- If activation rises, slow down immediately and help the user regulate before exploring meaning.`,
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
