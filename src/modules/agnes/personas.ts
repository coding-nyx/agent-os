/**
 * Agnes persona prompts — source of truth lives in KMP (cortex-logic).
 *
 * This file is a thin bridge that reads from PersonaPromptCatalogJs.
 * Throws at import time if the cortex bundle is missing the class —
 * this is intentional: a missing catalog means the bundle is broken,
 * not a graceful degradation scenario.
 */
import { PersonaPromptCatalogJs } from '@cortex-logic';

if (!PersonaPromptCatalogJs) {
  throw new Error('cortex-logic PersonaPromptCatalogJs is unavailable — check cortex bundle integrity');
}

const _catalog = new PersonaPromptCatalogJs();

export const AGNES_PERSONA: string = _catalog.promptFor('agnes') ?? '';

export const THERAPY_ONBOARDING_PERSONA: string = _catalog.promptFor('agnes_onboarding') ?? '';
