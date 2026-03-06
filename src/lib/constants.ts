export const MODULES_REQUIRING_ONBOARDING = new Set(['therapy', 'trainer', 'soma', 'ledger']);

export function requiresModuleOnboarding(moduleId: string): boolean {
  return MODULES_REQUIRING_ONBOARDING.has(moduleId);
}
