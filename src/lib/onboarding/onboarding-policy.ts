import { MODULE_MANIFEST, ModuleId, ModuleOnboardingMode } from '@/lib/module-manifest';

type OnboardingProfileLike = { onboardingComplete?: boolean } | null | undefined;

export function getModuleOnboardingMode(moduleId: string): ModuleOnboardingMode {
  const entry = MODULE_MANIFEST[moduleId as ModuleId];
  if (!entry) return 'optional';
  return entry.onboarding.mode;
}

export function shouldGateModuleOnboarding(moduleId: string, profile: OnboardingProfileLike): boolean {
  const mode = getModuleOnboardingMode(moduleId);
  if (mode === 'optional') return false;
  return !profile || profile.onboardingComplete !== true;
}

export function isModuleFastTrackEnabled(moduleId: string): boolean {
  const entry = MODULE_MANIFEST[moduleId as ModuleId];
  if (!entry) return false;
  return entry.onboarding.fastTrack.enabled;
}

export function getRoutedModulesByOnboardingMode(): Record<ModuleOnboardingMode, ModuleId[]> {
  const grouped: Record<ModuleOnboardingMode, ModuleId[]> = {
    required: [],
    optional: [],
    hybrid: []
  };

  for (const entry of Object.values(MODULE_MANIFEST)) {
    if (!entry.hasPage) continue;
    grouped[entry.onboarding.mode].push(entry.id);
  }

  return grouped;
}
