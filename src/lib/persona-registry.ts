import { ModuleId } from './module-manifest';
import { AGNES_PERSONA } from '@/modules/therapy/personas';
import { SOMA_PERSONA } from '@/modules/soma/personas';
import { ATLAS_PERSONA } from '@/modules/atlas/personas';
import { SCOUT_PERSONA } from '@/modules/scout/personas';
import { LEDGER_PERSONA } from '@/modules/ledger/personas';
import { FORGE_PERSONA } from '@/modules/forge/personas';
import { PULSE_PERSONA } from '@/modules/pulse/personas';

const TITAN_FALLBACK = `You are TITAN, an elite AI Physical Performance Strategist. You specialize in training programming, CNS fatigue management, recovery optimization, and periodization. Provide concise, evidence-based fitness guidance.`;

const PERSONA_MAP: Partial<Record<ModuleId, string>> = {
  therapy: AGNES_PERSONA,
  trainer: TITAN_FALLBACK,
  soma: SOMA_PERSONA,
  atlas: ATLAS_PERSONA,
  scout: SCOUT_PERSONA,
  ledger: LEDGER_PERSONA,
  forge: FORGE_PERSONA,
  pulse: PULSE_PERSONA,
};

export function getModulePersona(moduleId: string): string | null {
  return PERSONA_MAP[moduleId as ModuleId] ?? null;
}
