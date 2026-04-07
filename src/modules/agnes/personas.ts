/**
 * Agnes persona prompts — source of truth lives in KMP (cortex-logic).
 *
 * This file is a thin bridge that reads from PersonaPromptCatalogJs so the
 * persona text is NOT duplicated in TypeScript. If the KMP export is
 * unavailable at runtime (e.g. during unit tests), a minimal fallback is used.
 */
import { PersonaPromptCatalogJs } from '@cortex-logic';

const _catalog = PersonaPromptCatalogJs ? new PersonaPromptCatalogJs() : null;

const FALLBACK_PERSONA = 'You are AGNES, a high-fidelity AI psychotherapist. Respond with clinical depth and compassion.';
const FALLBACK_ONBOARDING = 'You are AGNES in Intake Protocol mode. Gather the user\'s background, struggles, and goals through warm, conversational questioning.';

export const AGNES_PERSONA: string =
  _catalog?.promptFor('agnes') ?? FALLBACK_PERSONA;

export const THERAPY_ONBOARDING_PERSONA: string =
  _catalog?.promptFor('agnes_onboarding') ?? FALLBACK_ONBOARDING;
