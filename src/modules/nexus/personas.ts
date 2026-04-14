/**
 * Orchestrator persona — single source of truth lives in KMP (cortex-logic).
 *
 * This file is a thin bridge that reads from PersonaPromptCatalogJs.
 * Throws at import time if the cortex bundle is missing the class —
 * this is intentional: a missing catalog means the bundle is broken.
 */
import { PersonaPromptCatalogJs } from '@cortex-logic';

if (!PersonaPromptCatalogJs) {
  throw new Error('cortex-logic PersonaPromptCatalogJs is unavailable — check cortex bundle integrity');
}

const _catalog = new PersonaPromptCatalogJs();

export const ORCHESTRATOR_PERSONA: string = _catalog.promptFor('orchestrator') ?? '';

export const ORCHESTRATOR_ONBOARDING_PERSONA: string = _catalog.promptFor('orchestrator_onboarding') ?? '';

export const ORCHESTRATOR_WELCOME = (name: string): string => _catalog.orchestratorWelcome(name);
