/**
 * Persona Factory — backed by cortex-logic KMP module (DefaultPersonaFactory).
 *
 * Maintains the same export shape as the prior TypeScript implementation.
 * NSV is sourced from GlobalProjection.crossFunctionalState when available.
 *
 * Uses NeuralStateVectorJs (a proper @JsExport KMP class) instead of an
 * unsafe cast, ensuring the NSV is correctly deserialised on the Kotlin side
 * before being passed into DefaultPersonaFactory.assemble().
 */
import { PersonaFactoryJs, UserIdentityJs, NeuralStateVectorJs } from '@cortex-logic';
import type { PersonaUserProfile, PersonaGlobalProjection } from './types';

export interface PersonaConfig {
  moduleId: string;
  baseRole: string;
  userProfile: PersonaUserProfile | null;
  globalSoul: PersonaGlobalProjection | null;
  /**
   * Optional per-module context passed through to KMP's DefaultPersonaFactory.
   * Module pages can include typed profile data (e.g. `titan_profile`, `atlas_profile`)
   * which KMP will deserialize into proper Kotlin data classes and use to build
   * scoped system prompts. Keys are merged with `{ baseRole }` before being
   * forwarded as the moduleContextJson string.
   */
  moduleContext?: Record<string, unknown>;
}

const _factory = new PersonaFactoryJs();

function sanitizeForPrompt(value: string, maxLen: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, maxLen);
}

function buildIdentity(userProfile: PersonaUserProfile, globalSoul: PersonaGlobalProjection, moduleId: string): UserIdentityJs {
  const provision = userProfile.agentPersonalityProvision;
  const orchestratorAlias = sanitizeForPrompt(
    globalSoul.displayNames?.[moduleId] || provision.orchestratorAlias,
    60
  );
  const agentGender = String(
    globalSoul.agentGenders?.[moduleId] || provision.agentGenders.orchestrator || 'neutral'
  );

  // Pass full per-module display names and agent genders as JSON strings
  // so KMP can build correct IDENTITY_SYNC blocks per module.
  const displayNamesJson = JSON.stringify(globalSoul.displayNames || {});
  const agentGendersJson = JSON.stringify({
    ...provision.agentGenders,
    ...(globalSoul.agentGenders || {}),
  });

  return new UserIdentityJs(
    sanitizeForPrompt(userProfile.preferredName || 'User', 50),
    sanitizeForPrompt(userProfile.pronouns || 'they/them', 30),
    null,
    userProfile.assignedSexAtBirth ?? null,
    orchestratorAlias,
    agentGender,
    displayNamesJson,
    agentGendersJson
  );
}

/**
 * Wraps the crossFunctionalState plain JS object as a NeuralStateVectorJs instance.
 * Serialises to JSON first so the Kotlin side can deserialise with proper type safety,
 * avoiding the fragility of casting a plain object to an internal Kotlin class.
 */
function toNsvJs(crossFunctionalState: unknown): NeuralStateVectorJs | null {
  if (!crossFunctionalState || typeof crossFunctionalState !== 'object') {
    return new NeuralStateVectorJs('{}');
  }
  try {
    return new NeuralStateVectorJs(JSON.stringify(crossFunctionalState));
  } catch {
    return new NeuralStateVectorJs('{}');
  }
}

export const PersonaFactory = {
  generateSystemPrompt({ moduleId, baseRole, userProfile, globalSoul, moduleContext }: PersonaConfig): string {
    if (!userProfile || !globalSoul) return baseRole || moduleId;
    const nsv = toNsvJs((globalSoul as any).crossFunctionalState);
    const identity = buildIdentity(userProfile, globalSoul, moduleId);
    // Merge baseRole into the module context so KMP has the TS-built system prompt
    // as a fallback when no typed profile data is available for this module.
    const mergedContext = { baseRole, ...(moduleContext || {}) };
    return _factory.assembleWithContext(
      moduleId,
      identity,
      nsv,
      JSON.stringify(mergedContext),
      null,
    ) || baseRole;
  }
};
