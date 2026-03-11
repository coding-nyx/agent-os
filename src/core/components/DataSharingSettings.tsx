import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULE_MANIFEST, type ModuleId } from '@/lib/module-manifest';
import { NSV_OWNERSHIP, type NSVMetricPath } from '@/lib/services/nsv-ownership';
import { useGlobalSoul } from '@/lib/global-soul-context';
import { SurfaceCard } from '@/core/components/SurfaceCard';
import { SectionHeader } from '@/core/components/SectionHeader';
import { useAuth } from '@/lib/auth-context';
import { CoreProfileService } from '@/lib/services/core-profile-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShareLevel = 'full' | 'summary' | 'none';

interface ShareSetting {
  targetModuleId: ModuleId;
  enabled: boolean;
  level: ShareLevel;
}

interface DataCategory {
  id: string;
  domain: string;
  label: string;
  description: string;
  sensitivity: 'open' | 'sensitive' | 'protected' | 'financial';
  ownerModules: ModuleId[];
  metrics: NSVMetricPath[];
  shareTargets: ShareSetting[];
  explanations: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sensitivity badges
// ---------------------------------------------------------------------------

const SENSITIVITY_BADGES: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  open: {
    label: 'Open',
    icon: Shield,
    className: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5'
  },
  sensitive: {
    label: 'Sensitive',
    icon: AlertTriangle,
    className: 'text-amber-400 border-amber-500/20 bg-amber-500/5'
  },
  protected: {
    label: 'Protected',
    icon: Lock,
    className: 'text-rose-400 border-rose-500/20 bg-rose-500/5'
  },
  financial: {
    label: 'Financial',
    icon: Shield,
    className: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5'
  }
};

// ---------------------------------------------------------------------------
// Default data categories
// ---------------------------------------------------------------------------

function buildDefaultCategories(moduleNames: Record<string, string>): DataCategory[] {
  const name = (id: string) => moduleNames[id] || MODULE_MANIFEST[id as ModuleId]?.title || id;

  return [
    {
      id: 'sleep-recovery',
      domain: 'biological',
      label: 'Sleep & Recovery',
      description: 'Sleep quality, recovery score, and CNS fatigue levels.',
      sensitivity: 'open',
      ownerModules: ['titan'],
      metrics: ['biological.sleepQuality', 'biological.recoveryScore', 'biological.cnsFatigue'],
      shareTargets: [
        { targetModuleId: 'titan', enabled: true, level: 'full' },
        { targetModuleId: 'atlas', enabled: true, level: 'full' },
        { targetModuleId: 'ledger', enabled: false, level: 'none' }
      ],
      explanations: {
        titan: `So ${name('titan')} understands when fatigue is affecting your training`,
        atlas: `So ${name('atlas')} can schedule deep work when you're well-rested`,
        ledger: `So ${name('ledger')} can factor energy into financial decisions`
      }
    },
    {
      id: 'hormonal',
      domain: 'biological',
      label: 'Hormonal Context',
      description: 'Cycle phase, hormonal shifts, and related biological context.',
      sensitivity: 'sensitive',
      ownerModules: ['titan'],
      metrics: ['biological.hormonalContext'],
      shareTargets: [
        { targetModuleId: 'agnes', enabled: true, level: 'summary' },
        { targetModuleId: 'atlas', enabled: false, level: 'none' }
      ],
      explanations: {
        agnes: `So ${name('agnes')} can adjust therapeutic approach during hormonal shifts`,
        atlas: `So ${name('atlas')} can account for energy fluctuations`
      }
    },
    {
      id: 'resilience-stress',
      domain: 'emotional',
      label: 'Resilience & Stress',
      description: 'Emotional resilience level and current stress load.',
      sensitivity: 'open',
      ownerModules: ['agnes'],
      metrics: ['emotional.emotionalResilience', 'emotional.stressLoad'],
      shareTargets: [
        { targetModuleId: 'titan', enabled: true, level: 'full' },
        { targetModuleId: 'atlas', enabled: true, level: 'full' }
      ],
      explanations: {
        titan: `So ${name('titan')} can dial back intensity on hard days`,
        atlas: `So ${name('atlas')} can lighten your schedule when stress is high`
      }
    },
    {
      id: 'trauma',
      domain: 'emotional',
      label: 'Trauma Markers',
      description: 'Therapeutic trauma markers and trigger patterns. Highly sensitive.',
      sensitivity: 'protected',
      ownerModules: ['agnes'],
      metrics: ['emotional.traumaMarkers'],
      shareTargets: [],
      explanations: {}
    },
    {
      id: 'cognitive',
      domain: 'cognitive',
      label: 'Cognitive Load & Focus',
      description: 'Energy budget, focus score, and active task load.',
      sensitivity: 'open',
      ownerModules: ['atlas', 'scout'],
      metrics: ['cognitive.energyBudget', 'cognitive.focusScore', 'cognitive.activeLoad', 'cognitive.researchLoad'],
      shareTargets: [
        { targetModuleId: 'agnes', enabled: true, level: 'full' },
        { targetModuleId: 'titan', enabled: true, level: 'full' }
      ],
      explanations: {
        agnes: `So ${name('agnes')} understands when cognitive overload is affecting you`,
        titan: `So ${name('titan')} can coordinate training with mental load`
      }
    },
    {
      id: 'financial',
      domain: 'resource',
      label: 'Financial Data',
      description: 'Financial friction and resonance ROI metrics.',
      sensitivity: 'financial',
      ownerModules: ['ledger'],
      metrics: ['resource.financialFriction', 'resource.resonanceROI'],
      shareTargets: [
        { targetModuleId: 'agnes', enabled: true, level: 'full' },
        { targetModuleId: 'atlas', enabled: true, level: 'summary' }
      ],
      explanations: {
        agnes: `So ${name('agnes')} understands when money worries are affecting your mood`,
        atlas: `So ${name('atlas')} can factor financial stress into planning`
      }
    }
  ];
}

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, label, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative w-10 h-5 rounded-full border transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-white/20',
        disabled && 'opacity-40 cursor-not-allowed',
        checked
          ? 'bg-emerald-500/30 border-emerald-500/40'
          : 'bg-white/5 border-white/10'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200',
          checked
            ? 'left-[22px] bg-emerald-400'
            : 'left-0.5 bg-white/40'
        )}
        aria-hidden="true"
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Data Category Card
// ---------------------------------------------------------------------------

interface DataCategoryCardProps {
  category: DataCategory;
  moduleNames: Record<string, string>;
  onChange: (categoryId: string, targetModuleId: ModuleId, enabled: boolean) => void;
}

function DataCategoryCard({ category, moduleNames, onChange }: DataCategoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = SENSITIVITY_BADGES[category.sensitivity];
  const BadgeIcon = badge.icon;
  const isProtected = category.sensitivity === 'protected';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/20"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-bold text-white/80">{category.label}</span>
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-[0.15em]',
            badge.className
          )}>
            <BadgeIcon className="w-2.5 h-2.5" />
            {badge.label}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-4">
          <p className="text-xs text-white/50 leading-relaxed">{category.description}</p>

          <div className="flex items-center gap-2">
            <span className="text-[9px] text-white/30 uppercase tracking-[0.2em] font-bold">
              Managed by:
            </span>
            {category.ownerModules.map(id => {
              const manifest = MODULE_MANIFEST[id];
              const Icon = manifest?.icon;
              return (
                <span key={id} className="inline-flex items-center gap-1 text-[10px] text-white/50 font-bold">
                  {Icon && <Icon className="w-3 h-3" style={{ color: manifest?.colorHex }} />}
                  {moduleNames[id] || manifest?.title || id}
                </span>
              );
            })}
          </div>

          {isProtected ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 flex items-center gap-3">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <p className="text-xs text-rose-300 font-bold">
                  Only {moduleNames[category.ownerModules[0]] || category.ownerModules[0]} can see these.
                </p>
                <p className="text-[10px] text-rose-200/50 mt-0.5">
                  This data is never shared with other modules or external products.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2" role="group" aria-label={`Sharing settings for ${category.label}`}>
              {category.shareTargets.map(target => {
                const manifest = MODULE_MANIFEST[target.targetModuleId];
                const Icon = manifest?.icon;
                const targetName = moduleNames[target.targetModuleId] || manifest?.title || target.targetModuleId;
                const explanation = category.explanations[target.targetModuleId];

                return (
                  <div key={target.targetModuleId} className="rounded-xl border border-white/5 bg-white/[0.01] p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: manifest?.colorHex }} />}
                        <span className="text-xs font-bold text-white/70">
                          Share with {targetName}
                        </span>
                      </div>
                      <ToggleSwitch
                        checked={target.enabled}
                        onChange={(checked) => onChange(category.id, target.targetModuleId, checked)}
                        label={`Share ${category.label} with ${targetName}`}
                      />
                    </div>
                    {explanation && (
                      <p className="text-[10px] text-white/30 mt-2 ml-6 leading-relaxed italic">
                        {explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataSharingSettings — Main Export
// ---------------------------------------------------------------------------

export function DataSharingSettings() {
  const { globalSoul } = useGlobalSoul();
  const { user, profile } = useAuth();
  const moduleNames = globalSoul?.displayNames ?? {};

  const categories = useMemo(() => buildDefaultCategories(moduleNames), [moduleNames]);

  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean>>>(
    () => profile?.securityPreferences?.dataSharingOverrides ?? {}
  );

  const handleToggle = useCallback((categoryId: string, targetModuleId: ModuleId, enabled: boolean) => {
    setOverrides(prev => {
      const nextOverrides = {
        ...prev,
        [categoryId]: {
          ...(prev[categoryId] || {}),
          [targetModuleId]: enabled
        }
      };
      if (user?.uid) {
        CoreProfileService.updateSecurityPreferences(user.uid, {
          dataSharingOverrides: nextOverrides
        }).catch((err: unknown) => console.error('[DataSharingSettings] Failed to persist overrides:', err));
      }
      return nextOverrides;
    });
  }, [user?.uid]);

  const resolvedCategories = categories.map(cat => ({
    ...cat,
    shareTargets: cat.shareTargets.map(target => ({
      ...target,
      enabled: overrides[cat.id]?.[target.targetModuleId] ?? target.enabled
    }))
  }));

  const grouped = useMemo(() => {
    const groups: Record<string, typeof resolvedCategories> = {};
    for (const cat of resolvedCategories) {
      if (!groups[cat.domain]) groups[cat.domain] = [];
      groups[cat.domain].push(cat);
    }
    return groups;
  }, [resolvedCategories]);

  const domainLabels: Record<string, string> = {
    biological: 'Body Data',
    emotional: 'Emotional Data',
    cognitive: 'Cognitive Data',
    resource: 'Financial Data'
  };

  return (
    <section className="space-y-6" aria-label="Data sharing settings">
      <SectionHeader
        label="Privacy"
        title="Data Sharing"
        subtitle="Control what each module can see. Your modules share context to care for you as a whole person."
        accentClassName="text-violet-400"
      />

      {Object.entries(grouped).map(([domain, cats]) => (
        <div key={domain} className="space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40 italic">
            {domainLabels[domain] || domain}
          </h4>
          {cats.map(cat => (
            <DataCategoryCard
              key={cat.id}
              category={cat}
              moduleNames={moduleNames}
              onChange={handleToggle}
            />
          ))}
        </div>
      ))}

      <SurfaceCard className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-violet-400 shrink-0" />
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">
            Why sharing matters
          </h4>
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          When your modules can see each other's data, they coordinate to protect you.
          For example: if Titan knows your stress is high, it adjusts recovery recommendations.
          Turning off sharing means that module will use general defaults instead of what's
          right for <em className="text-white/60 not-italic font-bold">you</em>.
        </p>
      </SurfaceCard>
    </section>
  );
}
