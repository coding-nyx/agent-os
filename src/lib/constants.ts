export const MODULES_REQUIRING_ONBOARDING = new Set(['agnes', 'titan', 'ledger']);

export function requiresModuleOnboarding(moduleId: string): boolean {
  return MODULES_REQUIRING_ONBOARDING.has(moduleId);
}
