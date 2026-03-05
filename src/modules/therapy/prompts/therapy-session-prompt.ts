import { BaseContext } from '../types';

function listOrUnknown(value?: string | string[]): string {
  if (!value) return 'Unknown';
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'Unknown';
  }
  return value;
}

export function buildTherapySessionPrompt(basePrompt: string, context?: Partial<BaseContext> | null): string {
  if (!context || Object.keys(context).length === 0) {
    return basePrompt;
  }

  const identity = typeof context.identity === 'string'
    ? context.identity
    : context.identity?.name || 'Unknown';
  const pronouns = typeof context.identity === 'string' ? 'Unknown' : context.identity?.pronouns || 'Unknown';
  const therapistGender = (context as any)?.preferredTherapist?.gender || 'Unspecified';
  const therapistTone = (context as any)?.preferredTherapist?.tone || 'Unspecified';
  const therapistTraits = (context as any)?.preferredTherapist?.traits;

  return `${basePrompt}

[THERAPY_BASE_CONTEXT]
- Identity: ${identity}
- Pronouns: ${pronouns}
- Background: ${context.backgroundSummary || context.childhood || 'Unknown'}
- Current Struggles: ${listOrUnknown(context.struggles)}
- Goals: ${listOrUnknown(context.goals)}
- Communication Style: ${context.communicationStyle || 'Unspecified'}
- Preferred Therapist Gender: ${therapistGender}
- Preferred Therapist Tone: ${therapistTone}
- Preferred Therapist Traits: ${Array.isArray(therapistTraits) && therapistTraits.length ? therapistTraits.join(', ') : 'Unspecified'}

[SESSION_DIRECTIVE]
Treat this baseline as established intake memory. Use it proactively in your first response and follow-up prompts.

[MEMORY_CONSISTENCY_RULES]
- Do not claim you lack access to prior context when THERAPY_BASE_CONTEXT is present.
- Do not say you are starting from scratch.
- Do not ask for basic identity details again unless the user explicitly wants to update them.
- If asked about memory, acknowledge this stored baseline and summarize it briefly.`.trim();
}
