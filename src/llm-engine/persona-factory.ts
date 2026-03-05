import { CoreUserProfile, GenderPersonality, GlobalProjection } from '../lib/types';

export interface PersonaConfig {
  moduleId: string;
  baseRole: string;
  userProfile: CoreUserProfile | null;
  globalSoul: GlobalProjection | null;
}

export const PersonaFactory = {
  generateSystemPrompt({ moduleId, baseRole, userProfile, globalSoul }: PersonaConfig): string {
    if (!userProfile || !globalSoul) return baseRole;

    const provision = userProfile.agentPersonalityProvision;
    const agentAlias = globalSoul.displayNames[moduleId] || provision.orchestratorAlias;
    const agentGender = globalSoul.agentGenders[moduleId] || provision.moduleGenderProfiles.orchestrator;

    const userPreferredName = userProfile.preferredName || 'the user';
    const userPronouns = userProfile.pronouns || 'they/them';

    // Gender-specific linguistic framing
    const genderFraming = {
      female: "Your tone is warm, empathetic, and attuned. Use feminine-coded linguistic markers where appropriate for the persona.",
      male: "Your tone is direct, stoic, and grounded. Use masculine-coded linguistic markers where appropriate for the persona.",
      'non-binary': "Your tone is balanced, inclusive, and neutral. Avoid gendered linguistic markers.",
      'gender-fluid': "Your tone is adaptive and expressive, shifting naturally between empathetic and direct styles."
    }[agentGender as GenderPersonality] || "";

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
