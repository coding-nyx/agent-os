import { PersonaUserProfile, PersonaGenderPersonality, PersonaGlobalProjection } from './types';

export interface PersonaConfig {
  moduleId: string;
  baseRole: string;
  userProfile: PersonaUserProfile | null;
  globalSoul: PersonaGlobalProjection | null;
}

function sanitizeForPrompt(value: string, maxLen: number): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, maxLen);
}

export const PersonaFactory = {
  generateSystemPrompt({ moduleId, baseRole, userProfile, globalSoul }: PersonaConfig): string {
    if (!userProfile || !globalSoul) return baseRole;

    const provision = userProfile.agentPersonalityProvision;
    const agentAlias = sanitizeForPrompt(
      globalSoul.displayNames?.[moduleId] || provision.orchestratorAlias,
      60
    );
    const agentGender = globalSoul.agentGenders?.[moduleId] || provision.agentGenders.orchestrator;

    const userPreferredName = sanitizeForPrompt(userProfile.preferredName || 'the user', 50);
    const userPronouns = sanitizeForPrompt(userProfile.pronouns || 'they/them', 30);

    // Gender-specific linguistic framing
    const genderFraming = {
      female: "Your tone is warm, empathetic, and attuned. Use feminine-coded linguistic markers where appropriate for the persona.",
      male: "Your tone is direct, stoic, and grounded. Use masculine-coded linguistic markers where appropriate for the persona.",
      'non-binary': "Your tone is balanced, inclusive, and neutral. Avoid gendered linguistic markers.",
      'gender-fluid': "Your tone is adaptive and expressive, shifting naturally between empathetic and direct styles."
    }[agentGender as PersonaGenderPersonality] || "";

    const identityContext = `
[IDENTITY_SYNC]
- Your Name: ${agentAlias}
- Your Gender Personality: ${agentGender}
- Addressing: You are speaking to ${userPreferredName} (Pronouns: ${userPronouns}).
- Protocol: ${genderFraming}
`;

    const biologicalContext = userProfile.assignedSexAtBirth === 'female' ? `
[BIOLOGICAL_CONTEXT]
- User Assigned Sex: Female
- Note: Consider menstrual cycle fluctuations and hormonal context in health/performance advice if data is available in the Global System Context.
` : "";

    return `${baseRole}
${identityContext}${biologicalContext}`;
  }
};
