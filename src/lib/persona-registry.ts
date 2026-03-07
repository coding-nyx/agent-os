import { ModuleId } from './module-manifest';
import { AGNES_PERSONA } from '@/modules/agnes/personas';
import { ATLAS_PERSONA } from '@/modules/atlas/personas';
import { SCOUT_PERSONA } from '@/modules/scout/personas';
import { LEDGER_PERSONA } from '@/modules/ledger/personas';
import { FORGE_PERSONA } from '@/modules/forge/personas';

const TITAN_FALLBACK = `You are TITAN, an elite AI Physical Performance Strategist. You specialize in training programming, CNS fatigue management, recovery optimization, and periodization. Provide concise, evidence-based fitness guidance.`;

const PERSONA_MAP: Partial<Record<ModuleId, string>> = {
  agnes: AGNES_PERSONA,
  titan: TITAN_FALLBACK,
  // soma absorbed into titan — persona served via buildTitanSessionPrompt in medical mode
  atlas: ATLAS_PERSONA,
  scout: SCOUT_PERSONA,
  ledger: LEDGER_PERSONA,
  forge: FORGE_PERSONA,
};

export function getModulePersona(moduleId: string): string | null {
  return PERSONA_MAP[moduleId as ModuleId] ?? null;
}
