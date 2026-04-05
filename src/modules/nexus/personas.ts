/**
 * Orchestrator persona — single source of truth lives in KMP (cortex-logic).
 *
 * This file is a thin bridge that reads from PersonaPromptCatalogJs so the
 * persona text is NOT duplicated in TypeScript. If the KMP export is
 * unavailable at runtime (e.g. during unit tests), a minimal fallback is used.
 */
import { PersonaPromptCatalogJs } from '@cortex-logic';

const _catalog = PersonaPromptCatalogJs ? new (PersonaPromptCatalogJs as any)() : null;

const FALLBACK_PERSONA = 'You are Nyx, the orchestrator intelligence. Respond helpfully.';
const FALLBACK_ONBOARDING = 'You are Nyx Intake, the onboarding interface. Collect the user\'s preferred name and pronouns.';

export const ORCHESTRATOR_PERSONA: string =
  _catalog?.promptFor('orchestrator') ?? FALLBACK_PERSONA;

export const ORCHESTRATOR_ONBOARDING_PERSONA: string =
  _catalog?.promptFor('orchestrator_onboarding') ?? FALLBACK_ONBOARDING;

export const ORCHESTRATOR_WELCOME = (name: string): string =>
  _catalog?.orchestratorWelcome(name) ??
  `Neural link re-established. Identity confirmed: ${name}. I am Nyx. All modules are synchronized and standing by. How shall we proceed?`;
