import type { DiagnosisSpecialization } from './types';

const registry = new Map<string, DiagnosisSpecialization>();

export function registerDiagnosisSpec(spec: DiagnosisSpecialization): void {
  if (registry.has(spec.moduleId)) {
    console.warn(`[DiagnosisRegistry] Overwriting spec for "${spec.moduleId}"`);
  }
  registry.set(spec.moduleId, spec);
}

export function getDiagnosisSpec(moduleId: string): DiagnosisSpecialization | undefined {
  return registry.get(moduleId);
}

export function getAllDiagnosisSpecs(): DiagnosisSpecialization[] {
  return Array.from(registry.values());
}

export function hasDiagnosisSpec(moduleId: string): boolean {
  return registry.has(moduleId);
}
