import { MODULE_MANIFEST } from './module-manifest';
import { shouldGateModuleOnboarding } from './onboarding/onboarding-policy';

export const MODULES_REQUIRING_ONBOARDING = new Set(
  Object.values(MODULE_MANIFEST)
    .filter((entry) => entry.hasPage && entry.onboarding.mode !== 'optional')
    .map((entry) => entry.id)
);

export function requiresModuleOnboarding(moduleId: string): boolean {
  return shouldGateModuleOnboarding(moduleId, null);
}
