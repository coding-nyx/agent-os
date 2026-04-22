/**
 * Agnes persona prompts — source of truth lives in KMP (cortex-logic).
 *
 * This file is a thin bridge that reads from PersonaPromptCatalogJs.
 * If the cortex bundle is missing the class, it falls back to empty strings
 * to allow the app to boot, though core functionality will be degraded.
 */
import { PersonaPromptCatalogJs } from '@cortex-logic';

const _catalog = PersonaPromptCatalogJs ? new (PersonaPromptCatalogJs as any)() : null;

export const AGNES_PERSONA: string = _catalog?.promptFor('agnes') ?? '';

export const THERAPY_ONBOARDING_PERSONA: string = _catalog?.promptFor('agnes_onboarding') ?? '';
