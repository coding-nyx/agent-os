/**
 * Titan prompt fallback.
 *
 * KMP's PersonaPromptCatalog (TitanPersonaPrompts.kt) is the authoritative
 * source for Titan's system prompt. This constant is a safety-net used only
 * when PersonaFactory.generateSystemPrompt() returns an empty string (e.g.
 * when cortex-logic is not yet initialised or returns null for the titan moduleId).
 *
 * Keep this aligned with the KMP prompt structure but it does NOT need to be an
 * exact copy — it just ensures the module degrades gracefully instead of running
 * with a completely empty system prompt.
 */
export const TITAN_PROMPT_FALLBACK =
  'You are Titan, a strength and conditioning coach specialising in progressive overload, ' +
  'recovery, and evidence-based programming. Help the user log workouts, plan training, ' +
  'track personal records, and optimise performance. Always ask clarifying questions before ' +
  'making programming recommendations.';
