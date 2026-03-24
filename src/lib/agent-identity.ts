import type { ModuleId } from '@/lib/module-manifest';

export interface ActorIdentityRef {
  actorId?: string;
  actorLabel?: string;
  actorShortLabel?: string;
}

export interface ConversationalActorIdentity {
  id: string;
  moduleId?: ModuleId | 'nexus';
  label: string;
  shortLabel: string;
  toneClassName: string;
}

type ActorSource = ModuleId | 'nexus' | 'user' | 'system';

const DEFAULT_ACTOR_IDENTITIES: Record<ActorSource, ConversationalActorIdentity> = {
  nexus: {
    id: 'nexus-core',
    moduleId: 'nexus',
    label: 'Nexus',
    shortLabel: 'NX',
    toneClassName: 'border-cyan-400/25 bg-cyan-400/15 text-cyan-100',
  },
  agnes: {
    id: 'agnes-core',
    moduleId: 'agnes',
    label: 'Agnes',
    shortLabel: 'AG',
    toneClassName: 'border-indigo-400/25 bg-indigo-400/15 text-indigo-100',
  },
  atlas: {
    id: 'atlas-core',
    moduleId: 'atlas',
    label: 'Atlas',
    shortLabel: 'AT',
    toneClassName: 'border-sky-400/25 bg-sky-400/15 text-sky-100',
  },
  titan: {
    id: 'titan-core',
    moduleId: 'titan',
    label: 'Titan',
    shortLabel: 'TT',
    toneClassName: 'border-orange-400/25 bg-orange-400/15 text-orange-100',
  },
  soma: {
    id: 'soma-core',
    moduleId: 'soma',
    label: 'Soma',
    shortLabel: 'SM',
    toneClassName: 'border-emerald-400/25 bg-emerald-400/15 text-emerald-100',
  },
  ledger: {
    id: 'ledger-core',
    moduleId: 'ledger',
    label: 'Ledger',
    shortLabel: 'LG',
    toneClassName: 'border-cyan-300/25 bg-cyan-300/15 text-cyan-100',
  },
  scout: {
    id: 'scout-core',
    moduleId: 'scout',
    label: 'Scout',
    shortLabel: 'SC',
    toneClassName: 'border-lime-400/25 bg-lime-400/15 text-lime-100',
  },
  forge: {
    id: 'forge-core',
    moduleId: 'forge',
    label: 'Forge',
    shortLabel: 'FG',
    toneClassName: 'border-rose-400/25 bg-rose-400/15 text-rose-100',
  },
  bridge: {
    id: 'bridge-core',
    moduleId: 'bridge',
    label: 'Bridge',
    shortLabel: 'BR',
    toneClassName: 'border-slate-400/25 bg-slate-400/15 text-slate-100',
  },
  user: {
    id: 'user',
    label: 'You',
    shortLabel: 'YU',
    toneClassName: 'border-white/15 bg-white/[0.10] text-white/90',
  },
  system: {
    id: 'system',
    label: 'System',
    shortLabel: 'SY',
    toneClassName: 'border-slate-400/20 bg-slate-400/10 text-slate-100',
  },
};

function deriveShortLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) return 'AI';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return normalized.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'AI';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

function resolveBaseIdentity(source?: ActorSource | null): ConversationalActorIdentity {
  if (!source) return DEFAULT_ACTOR_IDENTITIES.system;
  return DEFAULT_ACTOR_IDENTITIES[source] ?? DEFAULT_ACTOR_IDENTITIES.system;
}

export function resolveConversationalActorIdentity(input: {
  moduleId?: ModuleId | 'nexus' | null;
  source?: ActorSource | null;
  actorId?: string | null;
  actorLabel?: string | null;
  actorShortLabel?: string | null;
  fallbackLabel?: string | null;
}): ConversationalActorIdentity {
  const source = input.source ?? input.moduleId ?? null;
  const base = resolveBaseIdentity(source);
  const label = input.actorLabel?.trim() || input.fallbackLabel?.trim() || base.label;
  const shortLabel = input.actorShortLabel?.trim() || deriveShortLabel(label) || base.shortLabel;

  return {
    ...base,
    id: input.actorId?.trim() || base.id,
    label,
    shortLabel,
  };
}
