/**
 * journal-prompts.ts
 *
 * Shared, deterministic journal-prompt lookup table used by both
 * JournalTab (UI) and the atlas_journal_generate_prompt action handler.
 *
 * Keeping this here prevents the UI from calling onSendMessage (which
 * creates a visible chat turn) just to fetch a static string.
 */

export type JournalTone =
  | 'grounding'
  | 'self-compassion'
  | 'perspective'
  | 'ambition'
  | 'reflective';

export const JOURNAL_PROMPTS: Record<JournalTone, string> = {
  grounding:
    "Take a breath. What's one thing that felt manageable today, even if small?",
  'self-compassion':
    "What's something you'd tell a close friend who had a day like yours?",
  perspective:
    'When you look back at today in a year, what will matter most?',
  ambition:
    "You brought real energy today. What's the one thing you want to build on tomorrow?",
  reflective:
    'What surprised you today — about your work, the world, or yourself?',
};

/** Return the prompt string for a given tone (defaults to 'reflective'). */
export function getJournalPrompt(tone: JournalTone = 'reflective'): string {
  return JOURNAL_PROMPTS[tone];
}

/** Ordered list of tones used for cycling on regenerate. */
export const JOURNAL_TONE_CYCLE: JournalTone[] = [
  'reflective',
  'grounding',
  'self-compassion',
  'perspective',
  'ambition',
];
