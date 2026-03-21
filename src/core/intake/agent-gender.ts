import type { GenderPersonality } from '@/lib/types';

export const AGENT_GENDER_OPTIONS = [
  { value: 'female', label: 'Female (she/her)' },
  { value: 'male', label: 'Male (he/him)' },
  { value: 'non-binary', label: 'Non-binary (they/them)' },
  { value: 'gnc', label: 'Gender non-conforming' },
  { value: 'gender-fluid', label: 'Gender fluid' },
  { value: 'neutral', label: 'Neutral / no preference' },
];

/**
 * Maps express onboarding agent_gender values to GenderPersonality.
 * Returns null for 'neutral' (no-preference) — callers should skip writing null values.
 */
export const AGENT_GENDER_MAP: Record<string, GenderPersonality | null> = {
  female: 'female',
  male: 'male',
  'non-binary': 'non-binary',
  gnc: 'gender-fluid',
  'gender-fluid': 'gender-fluid',
  neutral: null,
};

/** Applies a chosen agent_gender value to all slots in an agentGenders record. */
export function applyAgentGender<T extends Record<string, GenderPersonality>>(
  existing: T,
  value: string,
): T {
  const gender = AGENT_GENDER_MAP[value];
  if (!gender) return existing; // 'neutral' — leave defaults unchanged
  return Object.fromEntries(Object.keys(existing).map((k) => [k, gender])) as T;
}
