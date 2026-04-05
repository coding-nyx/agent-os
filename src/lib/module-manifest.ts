import {
  Activity,
  Bell,
  Brain,
  ClipboardList,
  Code,
  HeartPulse,
  Radio,
  Search,
  Sparkles,
  Zap
} from 'lucide-react';

export const MODULE_IDS = [
  'nexus',
  'agnes',
  'titan',
  'soma',
  'ledger',
  'atlas',
  'scout',
  'forge',
  'bridge'
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleTheme =
  | 'indigo'
  | 'orange'
  | 'cyan'
  | 'emerald'
  | 'sky'
  | 'lime'
  | 'rose'
  | 'fuchsia'
  | 'slate'
  | 'violet';

export interface ModuleManifestEntry {
  id: ModuleId;
  route: string;
  title: string;
  alias: string;
  description: string;
  colorHex: string;
  themeColor: ModuleTheme;
  icon: typeof Sparkles;
  chatTheme?: ModuleTheme;
  isCore: boolean;
  hasPage: boolean;
  securityPolicy: ModuleSecurityPolicy;
  onboarding: ModuleOnboardingPolicy;
}

export interface ModuleSecurityPolicy {
  defaultLocked: boolean;
  mandatory: boolean;
}

export type ModuleOnboardingMode = 'required' | 'optional' | 'hybrid';

export interface ModuleFastTrackPolicy {
  enabled: boolean;
  confidenceThreshold: number;
}

export interface ModuleOnboardingPolicy {
  mode: ModuleOnboardingMode;
  fastTrack: ModuleFastTrackPolicy;
}

export const MODULE_MANIFEST: Record<ModuleId, ModuleManifestEntry> = {
  nexus: {
    id: 'nexus',
    route: '/nexus',
    title: 'Nyx',
    alias: 'Nyx',
    description: 'System Orchestrator',
    colorHex: '#8B5CF6',
    themeColor: 'cyan',
    icon: Sparkles,
    chatTheme: 'cyan',
    isCore: true,
    hasPage: true,
    securityPolicy: { defaultLocked: false, mandatory: false },
    onboarding: { mode: 'required', fastTrack: { enabled: false, confidenceThreshold: 0.75 } }
  },
  agnes: {
    id: 'agnes',
    route: '/agnes',
    title: 'Agnes',
    alias: 'Agnes',
    description: 'Emotional Domain',
    colorHex: '#6366F1',
    themeColor: 'indigo',
    chatTheme: 'indigo',
    icon: Brain,
    isCore: true,
    hasPage: true,
    securityPolicy: { defaultLocked: true, mandatory: true },
    onboarding: { mode: 'required', fastTrack: { enabled: true, confidenceThreshold: 0.75 } }
  },
  titan: {
    id: 'titan',
    route: '/titan',
    title: 'Titan',
    alias: 'Titan',
    description: 'Fitness coaching, biomarker tracking, and recovery management',
    colorHex: '#DC4B1E',
    themeColor: 'orange',
    chatTheme: 'orange',
    icon: Activity,
    isCore: true,
    hasPage: true,
    securityPolicy: { defaultLocked: false, mandatory: false },
    onboarding: { mode: 'hybrid', fastTrack: { enabled: true, confidenceThreshold: 0.78 } }
  },
  soma: {
    id: 'soma',
    route: '/soma',
    title: 'Soma',
    alias: 'Soma',
    description: 'Biomarker tracking and medical clearance domain',
    colorHex: '#10B981',
    themeColor: 'emerald',
    chatTheme: 'emerald',
    icon: HeartPulse,
    isCore: true,
    hasPage: true,
    securityPolicy: { defaultLocked: true, mandatory: false },
    onboarding: { mode: 'optional', fastTrack: { enabled: false, confidenceThreshold: 0.75 } }
  },
  ledger: {
    id: 'ledger',
    route: '/ledger',
    title: 'Ledger',
    alias: 'Ledger',
    description: 'Financial Planning Domain',
    colorHex: '#06B6D4',
    themeColor: 'cyan',
    chatTheme: 'cyan',
    icon: ClipboardList,
    isCore: true,
    hasPage: true,
    securityPolicy: { defaultLocked: true, mandatory: false },
    onboarding: { mode: 'required', fastTrack: { enabled: true, confidenceThreshold: 0.75 } }
  },
  atlas: {
    id: 'atlas',
    route: '/atlas',
    title: 'Atlas',
    alias: 'Atlas',
    description: 'Cognitive Domain',
    colorHex: '#0EA5E9',
    themeColor: 'sky',
    chatTheme: 'sky',
    icon: Zap,
    isCore: true,
    hasPage: true,
    securityPolicy: { defaultLocked: true, mandatory: false },
    onboarding: { mode: 'hybrid', fastTrack: { enabled: true, confidenceThreshold: 0.72 } }
  },
  scout: {
    id: 'scout',
    route: '/scout',
    title: 'Scout',
    alias: 'Scout',
    description: 'Research Extension',
    colorHex: '#84CC16',
    themeColor: 'lime',
    chatTheme: 'lime',
    icon: Search,
    isCore: false,
    hasPage: true,
    securityPolicy: { defaultLocked: true, mandatory: false },
    onboarding: { mode: 'optional', fastTrack: { enabled: false, confidenceThreshold: 0.72 } }
  },
  forge: {
    id: 'forge',
    route: '/forge',
    title: 'Forge',
    alias: 'Forge',
    description: 'Technical Extension',
    colorHex: '#F43F5E',
    themeColor: 'rose',
    icon: Code,
    isCore: false,
    hasPage: true,
    securityPolicy: { defaultLocked: false, mandatory: false },
    onboarding: { mode: 'optional', fastTrack: { enabled: false, confidenceThreshold: 0.72 } }
  },
  bridge: {
    id: 'bridge',
    route: '',
    title: 'Bridge',
    alias: 'Bridge',
    description: 'Alert Daemon',
    colorHex: '#64748B',
    themeColor: 'slate',
    icon: Bell,
    isCore: false,
    hasPage: false,
    securityPolicy: { defaultLocked: false, mandatory: false },
    onboarding: { mode: 'optional', fastTrack: { enabled: false, confidenceThreshold: 0.75 } }
  }
};

export const HUB_MODULE_ORDER: ModuleId[] = [
  'agnes',
  'titan',
  'soma',
  'ledger',
  'atlas',
  'scout',
  'forge'
];

export function buildDefaultVaultLocks(): Record<string, boolean> {
  return Object.values(MODULE_MANIFEST).reduce<Record<string, boolean>>((acc, module) => {
    if (!module.hasPage || module.id === 'bridge') return acc;
    acc[module.id] = module.securityPolicy.mandatory || module.securityPolicy.defaultLocked;
    return acc;
  }, {});
}
